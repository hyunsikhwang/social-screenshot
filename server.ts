import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { chromium } from "playwright";

// Safely resolve filename and dirname without TDZ or ESM/CJS conflicts
let resolvedFilename = "";
let resolvedDirname = "";

try {
  resolvedFilename = fileURLToPath(import.meta.url);
  resolvedDirname = path.dirname(resolvedFilename);
} catch {
  resolvedFilename = typeof eval !== "undefined" ? eval("__filename") : "";
  resolvedDirname = typeof eval !== "undefined" ? eval("__dirname") : "";
}

const __filename = resolvedFilename;
const __dirname = resolvedDirname;

// Helper function to normalize X.com/Twitter URL
function normalizeXPostUrl(url: string): string | null {
  if (!url) return null;
  let candidate = url.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"];
    if (!allowedHosts.includes(host)) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3) return null;

    const username = parts[0];
    const marker = parts[1].toLowerCase();
    const postId = parts[2];

    if (marker !== "status") return null;
    if (!/^\d+$/.test(postId)) return null;

    return `https://x.com/${username}/status/${postId}`;
  } catch (e) {
    return null;
  }
}

// Helper to extract post ID from X url
function extractXPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 1) return null;
    const postId = parts[parts.length - 1];
    if (/^\d+$/.test(postId)) return postId;
    return null;
  } catch (e) {
    return null;
  }
}

// Playwright Capture Functions
async function captureXPost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  const pageColor = theme === "light" ? "#ffffff" : "#0f1115";
  
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 2400 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: "ko-KR",
  });

  // Bypass Content Security Policy (CSP) for document requests on x.com
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() === "document" && request.url().includes("x.com/")) {
      try {
        const response = await route.fetch();
        const headers = { ...response.headers() };
        delete headers["content-security-policy"];
        delete headers["content-security-policy-report-only"];
        const body = await response.body();
        await route.fulfill({ response, headers, body });
        return;
      } catch (e) {
        // Fallback if fetch fails
      }
    }
    await route.continue();
  });

  const page = await context.newPage();

  try {
    const postId = extractXPostId(postUrl);
    if (!postId) {
      throw new Error("게시물 ID를 추출할 수 없습니다.");
    }

    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1000);

    // Dismiss overlays
    const dismissSelectors = [
      "button:has-text('Not now')",
      "button:has-text('나중에')",
      "button[aria-label='닫기']",
      "div[role='button'][aria-label='닫기']",
    ];

    for (const selector of dismissSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click({ timeout: 2000 });
          await page.waitForTimeout(200);
        }
      } catch (e) {
        // Ignore
      }
    }

    // Inject fonts & styles
    const cssContent = `
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
      html, body {
        background: ${pageColor} !important;
      }
      article, article * {
        font-family: 'Pretendard', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif !important;
      }
    `;

    try {
      await page.addStyleTag({ content: cssContent });
    } catch (e) {
      await page.addStyleTag({
        content: `
          html, body { background: ${pageColor} !important; }
          article, article * { font-family: sans-serif !important; }
        `
      });
    }

    let tweet = page.locator(`article:has(a[href*="/status/${postId}"])`).first();
    try {
      await tweet.waitFor({ timeout: 15000 });
    } catch (e) {
      // Fallback: first article on the page
      tweet = page.locator("article").first();
      await tweet.waitFor({ timeout: 15000 });
    }

    // Expand "Show more" buttons
    const expandShowMoreSelectors = [
      "div[role='button']:has-text('Show more')",
      "span:has-text('Show more')",
      "div[role='button']:has-text('더 보기')",
      "span:has-text('더 보기')",
      "div[role='button']:has-text('더보기')",
      "span:has-text('더보기')",
    ];

    for (let i = 0; i < 8; i++) {
      let clicked = false;
      for (const selector of expandShowMoreSelectors) {
        const targets = tweet.locator(selector);
        const count = await targets.count();
        for (let idx = 0; idx < Math.min(count, 6); idx++) {
          const node = targets.nth(idx);
          try {
            if (await node.isVisible({ timeout: 200 })) {
              await node.click({ timeout: 2000 });
              await page.waitForTimeout(150);
              clicked = true;
            }
          } catch (e) {
            // Ignore
          }
        }
      }
      if (!clicked) break;
    }

    await tweet.scrollIntoViewIfNeeded({ timeout: 3000 });
    await page.waitForTimeout(500);

    const box = await tweet.boundingBox();
    if (box && box.height > 0) {
      const desiredH = Math.floor(box.height) + 240;
      const adjustedH = Math.max(1600, Math.min(desiredH, 14000));
      await page.setViewportSize({ width: 1280, height: adjustedH });
      await page.waitForTimeout(400);
      await tweet.scrollIntoViewIfNeeded({ timeout: 3000 });
    }

    // Wait for height to stabilize
    let stable = 0;
    let prevH = -1;
    for (let i = 0; i < 36; i++) {
      const curBox = await tweet.boundingBox();
      if (curBox && curBox.height > 160) {
        const currH = Math.floor(curBox.height);
        if (Math.abs(currH - prevH) <= 1) {
          stable++;
        } else {
          stable = 0;
        }
        prevH = currH;
        if (stable >= 3) break;
      }
      await page.waitForTimeout(250);
    }

    await page.waitForTimeout(800);
    const screenshotBuffer = await tweet.screenshot({ type: "png" });
    return screenshotBuffer;
  } finally {
    await browser.close();
  }
}

async function captureYoutubePost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 3,
    colorScheme: theme,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    locale: "ko-KR",
  });

  const page = await context.newPage();

  try {
    try {
      await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      // Ignore navigation timeout if some parts loaded
    }

    const cssContent = `
      ytd-masthead, #masthead-container { display: none !important; visibility: hidden !important; height: 0 !important; }
      ytd-app #page-manager.ytd-app { margin-top: 0 !important; }
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
      * { font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important; }
      
      ytd-backstage-post-renderer {
        background-color: ${theme === "dark" ? "#181818" : "#ffffff"} !important;
        border-radius: 24px !important;
        border: 1px solid ${theme === "dark" ? "#333333" : "#e2e8f0"} !important;
        padding: 24px !important;
        margin: 20px auto !important;
        display: block !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, ${theme === "dark" ? "0.3" : "0.05"}) !important;
      }
      ytd-backstage-post-renderer, ytd-backstage-post-renderer * {
        color: ${theme === "dark" ? "#ffffff" : "#0f172a"} !important;
        --yt-spec-text-primary: ${theme === "dark" ? "#ffffff" : "#0f172a"} !important;
        --yt-spec-text-secondary: ${theme === "dark" ? "#dddddd" : "#475569"} !important;
      }
      ytd-backstage-post-renderer a, ytd-backstage-post-renderer span[class*="hashtag"] {
        color: #3ea6ff !important;
        text-decoration: none !important;
      }
    `;

    await page.addStyleTag({ content: cssContent });

    try {
      await page.evaluate("document.fonts.ready");
    } catch (e) {
      await page.waitForTimeout(2000);
    }

    // Dismiss cookie reject popup if visible
    try {
      const rejectButton = page.locator('button[aria-label*="Reject"], button[aria-label*="거부"], button[aria-label*="동의 안 함"]').first();
      if (await rejectButton.isVisible({ timeout: 2000 })) {
        await rejectButton.click();
      }
    } catch (e) {
      // Ignore
    }

    const selector = "ytd-backstage-post-renderer";
    const postLocator = page.locator(selector).first();
    await postLocator.waitFor({ timeout: 20000 });

    // Expand "Read more" / "자세히 알아보기" / "더 보기" button
    try {
      // YouTube's "Read more" is typically a span/button with ID "more" or class "more-button" or "expand"
      const specificSelectors = [
        "#more",
        ".more-button",
        "#expand",
        "button[id='more']",
        "span[id='more']",
        "a[id='more']"
      ];
      
      for (const sel of specificSelectors) {
        const el = postLocator.locator(sel);
        const count = await el.count();
        for (let idx = 0; idx < count; idx++) {
          const item = el.nth(idx);
          try {
            if (await item.isVisible({ timeout: 500 })) {
              await item.click({ timeout: 2000 });
              await page.waitForTimeout(500);
            }
          } catch (e) {
            // Ignore
          }
        }
      }

      // Also search by text content (e.g. "자세히 알아보기", "자세히 보기", "더 보기", "더보기", etc.)
      const expandTexts = [
        /자세히\s*알아보기/,
        /자세히\s*보기/,
        /더\s*보기/,
        /더보기/,
        /Read\s*more/,
        /Show\s*more/
      ];

      for (const rx of expandTexts) {
        const el = postLocator.locator('*').filter({ hasText: rx });
        const count = await el.count();
        for (let idx = 0; idx < count; idx++) {
          const item = el.nth(idx);
          try {
            if (await item.isVisible({ timeout: 500 })) {
              await item.click({ timeout: 2000 });
              await page.waitForTimeout(500);
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    } catch (e) {
      console.error("Error expanding YouTube post:", e);
    }

    await postLocator.scrollIntoViewIfNeeded({ timeout: 3000 });
    await page.waitForTimeout(800);

    const screenshotBuffer = await postLocator.screenshot({
      type: "png",
      omitBackground: true,
    });
    return screenshotBuffer;
  } finally {
    await browser.close();
  }
}

async function captureTelegramPost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 3,
    locale: "ko-KR",
  });

  const page = await context.newPage();

  // Handle t.me link redirection to public preview (s/)
  let url = postUrl.trim();
  if (url.includes("t.me/") && !url.includes("t.me/s/")) {
    const parts = url.split("t.me/");
    if (parts.length === 2) {
      url = `https://t.me/s/${parts[1]}`;
    }
  }

  const bgColor = theme === "dark" ? "#0b1630" : "#ffffff";
  const textColor = theme === "dark" ? "#ffffff" : "#0f172a";

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const cssContent = `
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

      html,
      body,
      .tgme_page,
      .tgme_background_wrap,
      .tgme_container,
      .tgme_channel_history,
      .tgme_channel_history_wrap,
      .tgme_widget_message_wrap {
          background: ${bgColor} !important;
          background-image: none !important;
          color: ${textColor} !important;
      }

      body,
      .tgme_page,
      .tgme_channel_info_header_title,
      .tgme_widget_message_author,
      .tgme_widget_message_link,
      .tgme_widget_message_text,
      .tgme_widget_message_wrap,
      .tgme_widget_message_wrap * {
          font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important;
          font-weight: 300 !important;
          letter-spacing: -0.3px !important;
          line-height: 1.6 !important;
      }
    `;

    await page.addStyleTag({ content: cssContent });

    const urlParts = url.split("/");
    const postIdentifier = urlParts.slice(-2).join("/"); // e.g., "banjang9/3895"
    const selector = `[data-post="${postIdentifier}"]`;

    await page.waitForSelector(selector, { timeout: 15000 });

    const element = page.locator(selector);
    await element.evaluate((el, { bgColor, theme }) => {
      // @ts-ignore
      el.style.background = bgColor;
      // @ts-ignore
      el.style.backgroundImage = "none";
      // @ts-ignore
      el.style.borderRadius = "16px";
      // @ts-ignore
      el.style.padding = "24px";
      // @ts-ignore
      el.style.border = theme === 'dark' ? "1px solid #1f2937" : "1px solid #e4e4e7";
      // @ts-ignore
      el.style.boxShadow = "0 10px 30px rgba(0, 0, 0, " + (theme === 'dark' ? '0.3' : '0.05') + ")";
    }, { bgColor, theme });

    let fontsReady = false;
    try {
      fontsReady = await page.evaluate(async () => {
        if (!document.fonts || !document.fonts.ready) return false;
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
          return true;
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
      fontsReady = false;
    }

    await page.waitForTimeout(fontsReady ? 1000 : 3000);

    const boundingBox = await element.boundingBox();
    const elementHeight = (!boundingBox || boundingBox.height === 0) ? 2000 : Math.ceil(boundingBox.height);

    await page.setViewportSize({
      width: 1920,
      height: elementHeight + 300,
    });

    await element.evaluate((el) => {
      const safetyMargin = 8;
      const header = document.querySelector(".tgme_header");
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const elementTop = el.getBoundingClientRect().top + window.scrollY;
      const targetTop = Math.max(0, elementTop - headerHeight - safetyMargin);

      window.scrollTo({
        top: targetTop,
        behavior: "auto",
      });
    });

    await page.waitForTimeout(1500);
    const screenshotBuffer = await element.screenshot({ type: "png" });
    return screenshotBuffer;
  } finally {
    await browser.close();
  }
}

// Start Server Setup
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Endpoints
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Unified Screenshot Endpoint
  app.post("/api/screenshot", async (req, res) => {
    const { url, platform, theme } = req.body;

    if (!url || !platform) {
      return res.status(400).json({ error: "URL과 Platform은 필수 항목입니다." });
    }

    const selectedTheme = theme === "dark" ? "dark" : "light";
    console.log(`[Screenshot Request] URL: ${url} | Platform: ${platform} | Theme: ${selectedTheme}`);

    try {
      let buffer: Buffer;

      if (platform === "x") {
        const normalized = normalizeXPostUrl(url);
        if (!normalized) {
          return res.status(400).json({ error: "올바른 X 게시물 URL 형식이 아닙니다." });
        }
        buffer = await captureXPost(normalized, selectedTheme);
      } else if (platform === "youtube") {
        buffer = await captureYoutubePost(url, selectedTheme);
      } else if (platform === "telegram") {
        buffer = await captureTelegramPost(url, selectedTheme);
      } else {
        return res.status(400).json({ error: "지원하지 않는 플랫폼입니다." });
      }

      const base64Image = buffer.toString("base64");
      const postId = platform === "x" ? (extractXPostId(url) || "post") : "post";

      res.json({
        success: true,
        image: `data:image/png;base64,${base64Image}`,
        filename: `${platform}-post-${postId}.png`,
        postId,
        normalizedUrl: platform === "x" ? normalizeXPostUrl(url) : url
      });
    } catch (err: any) {
      console.error("[Screenshot Error]", err);
      res.status(500).json({
        success: false,
        error: err.message || "스크린샷을 캡처하는 중 에러가 발생했습니다."
      });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
