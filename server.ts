import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Set Playwright browser directory to a project-specific shared folder if it exists.
// This resolves the permissions and executable path issue for sandbox runners (e.g. on mobile/shared preview).
const localBrowsersPath = path.join(process.cwd(), ".playwright-browsers");
if (fs.existsSync(localBrowsersPath)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsersPath;
}

import express from "express";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { chromium } from "playwright-core";

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

// Helper to launch Chromium and dynamically install it if missing
async function launchBrowser(args: string[] = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]) {
  try {
    return await chromium.launch({
      headless: true,
      args,
    });
  } catch (error: any) {
    const errorMsg = String(error.message || error);
    if (
      errorMsg.includes("Executable doesn't exist") || 
      errorMsg.includes("playwright install") || 
      errorMsg.includes("Looks like Playwright was just installed")
    ) {
      console.log("Playwright browser executable is missing. Attempting dynamic installation of chromium...");
      try {
        execSync("npx playwright-core install chromium", { stdio: "inherit" });
        console.log("Playwright chromium installed successfully. Retrying browser launch...");
        return await chromium.launch({
          headless: true,
          args,
        });
      } catch (installError) {
        console.error("Failed to dynamically install Playwright chromium:", installError);
        throw error;
      }
    }
    throw error;
  }
}

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
    const allowedHosts = [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
      "mobile.x.com",
      "m.x.com",
      "m.twitter.com"
    ];
    const isAllowedHost = allowedHosts.includes(host) || 
                          host.endsWith(".x.com") || 
                          host.endsWith(".twitter.com");
    if (!isAllowedHost) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex(part => part.toLowerCase() === "status");
    if (statusIndex === -1 || statusIndex + 1 >= parts.length) {
      const match = parsed.pathname.match(/\/status\/(\d+)/i);
      if (match) {
        const postId = match[1];
        return `https://x.com/i/status/${postId}`;
      }
      return null;
    }

    const postId = parts[statusIndex + 1];
    if (!/^\d+$/.test(postId)) return null;

    const username = statusIndex > 0 ? parts[statusIndex - 1] : "i";
    return `https://x.com/${username}/status/${postId}`;
  } catch (e) {
    return null;
  }
}

// Helper to extract post ID from X url
function extractXPostId(url: string): string | null {
  if (!url) return null;
  let candidate = url.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex(part => part.toLowerCase() === "status");
    if (statusIndex !== -1 && statusIndex + 1 < parts.length) {
      const postId = parts[statusIndex + 1];
      if (/^\d+$/.test(postId)) return postId;
    }
    const match = parsed.pathname.match(/\/status\/(\d+)/i);
    if (match) return match[1];
    
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return last;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Unified fallback capture using Microlink API (for when local headless Chromium cannot launch)
async function captureViaMicrolink(targetUrl: string, elementSelector: string, theme: "light" | "dark"): Promise<Buffer> {
  console.log(`[Microlink Fallback] Running capture for: ${targetUrl}, selector: ${elementSelector}, theme: ${theme}`);
  
  const params = new URLSearchParams({
    url: targetUrl,
    screenshot: "true",
    "screenshot.colorScheme": theme,
    "screenshot.type": "png",
    "screenshot.viewport.deviceScaleFactor": "2",
  });

  if (elementSelector) {
    params.append("screenshot.element", elementSelector);
  }

  // Optimize waiting conditions depending on platform url
  if (targetUrl.includes("x.com") || targetUrl.includes("twitter.com")) {
    params.append("screenshot.waitFor", "article");
  } else if (targetUrl.includes("t.me")) {
    params.append("screenshot.waitFor", ".tgme_widget_message");
  } else if (targetUrl.includes("render-youtube-thumb")) {
    params.append("screenshot.waitFor", "#youtube-thumb-card");
  }

  const apiUrl = `https://api.microlink.io/?${params.toString()}`;
  console.log(`[Microlink Fallback] API Request URL: ${apiUrl}`);

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Microlink API failed: HTTP ${response.status}`);
  }

  const json: any = await response.json();
  if (json.status !== "success" || !json.data?.screenshot?.url) {
    throw new Error(`Microlink returned unexpected response payload: ${JSON.stringify(json)}`);
  }

  const imgUrl = json.data.screenshot.url;
  console.log(`[Microlink Fallback] Successfully captured! Downloading from: ${imgUrl}`);

  const imgResponse = await fetch(imgUrl);
  if (!imgResponse.ok) {
    throw new Error(`Failed to download screenshot from Microlink CDN: HTTP ${imgResponse.status}`);
  }

  const arrayBuffer = await imgResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Playwright Capture Functions
async function captureXPost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  try {
    const pageColor = theme === "light" ? "#ffffff" : "#0f1115";
    
    const browser = await launchBrowser(["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]);

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
  } catch (error) {
    console.warn("[captureXPost] Playwright failed, falling back to Microlink:", error);
    return await captureViaMicrolink(postUrl, "article", theme);
  }
}

async function captureYoutubePost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  try {
    const browser = await launchBrowser(["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 3,
      colorScheme: theme,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      locale: "ko-KR",
    });

    const page = await context.newPage();

    // Normalize mobile youtube domain to standard desktop youtube domain
    let targetUrl = postUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    try {
      const parsed = new URL(targetUrl);
      if (parsed.hostname.toLowerCase() === "m.youtube.com") {
        parsed.hostname = "www.youtube.com";
        targetUrl = parsed.toString();
      }
    } catch (e) {
      // Ignore
    }

    try {
      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  } catch (error) {
    console.warn("[captureYoutubePost] Playwright failed, falling back to Microlink:", error);
    return await captureViaMicrolink(postUrl, "ytd-backstage-post-renderer, ytd-post-renderer, #content", theme);
  }
}

async function captureTelegramPost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  try {
    const browser = await launchBrowser(["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 3,
      locale: "ko-KR",
    });

    const page = await context.newPage();

    // Ensure protocol is present and normalize mobile/alternative telegram domains
    let url = postUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    url = url.replace(/telegram\.(me|dog)/i, "t.me");

    // Handle t.me link redirection to public preview (s/)
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
  } catch (error) {
    console.warn("[captureTelegramPost] Playwright failed, falling back to Microlink:", error);
    return await captureViaMicrolink(postUrl, ".tgme_widget_message", theme);
  }
}

// HTML Escaper
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Youtube Video ID Extractor
function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;
  const candidate = url.trim();

  // 1. youtu.be/videoId
  let match = candidate.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (match) return match[1];

  // 2. youtube.com/watch?v=videoId (including mobile m.youtube.com)
  match = candidate.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.)?youtube\.com\/watch\?([^#]+)/i);
  if (match) {
    try {
      let urlWithProto = candidate;
      if (!/^https?:\/\//i.test(urlWithProto)) {
        urlWithProto = `https://${urlWithProto}`;
      }
      const urlObj = new URL(urlWithProto);
      const vid = urlObj.searchParams.get("v");
      if (vid) return vid;
    } catch (e) {
      // Fallback
    }
  }

  // 3. youtube.com/shorts/videoId (including mobile)
  match = candidate.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i);
  if (match) return match[1];

  // 4. youtube.com/embed/videoId (including mobile)
  match = candidate.match(/(?:https?:\/\/)?(?:www\.)?(?:m\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i);
  if (match) return match[1];

  return null;
}

// Playwright Capture for YouTube Thumbnail Custom Card
async function captureYoutubeThumbnail(
  videoUrl: string,
  theme: "light" | "dark" = "light",
  hostUrl?: string
): Promise<{ buffer: Buffer; title: string; watchUrl: string; videoId: string }> {
  const videoId = extractYoutubeVideoId(videoUrl);
  if (!videoId) {
    throw new Error("올바른 유튜브 영상 URL 형식이 아닙니다.");
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // oEmbed to get the beautiful title
  let title = "YouTube Video";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json() as any;
      if (data && data.title) {
        title = data.title;
      }
    }
  } catch (e) {
    console.error("Failed to fetch youtube title via oembed", e);
  }

  // Choose the best quality thumbnail
  let thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const res = await fetch(thumbUrl, { method: "HEAD" });
    if (res.status !== 200) {
      thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch (e) {
    thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  try {
    const browser = await launchBrowser(["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]);

    const context = await browser.newContext({
      viewport: { width: 1000, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      locale: "ko-KR",
    });

    const page = await context.newPage();

    const isDark = theme === "dark";
    const bgColor = isDark ? "#121212" : "#ffffff";
    const textColor = isDark ? "#f3f4f6" : "#111827";
    const subTextColor = isDark ? "#9ca3af" : "#4b5563";
    const borderColor = isDark ? "#2d2d2d" : "#e5e7eb";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          
          body {
            margin: 0;
            padding: 40px;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          }

          .card {
            width: 580px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-radius: 24px;
            padding: 24px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, ${isDark ? "0.4" : "0.08"});
            box-sizing: border-box;
            overflow: hidden;
          }

          .thumbnail-container {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 16px;
            overflow: hidden;
            background-color: #000;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          }

          .thumbnail-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .play-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 64px;
            height: 44px;
            background: rgba(229, 9, 20, 0.95);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 6px 20px rgba(229, 9, 20, 0.4);
          }

          .play-triangle {
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-left: 14px solid #ffffff;
            border-bottom: 8px solid transparent;
            margin-left: 3px;
          }

          .info-section {
            margin-top: 20px;
          }

          .platform-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${isDark ? "#2a0f10" : "#fff1f2"};
            color: #ef4444;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            border: 1px solid ${isDark ? "#4c1d1d" : "#fecaca"};
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .title {
            font-size: 18px;
            font-weight: 850;
            color: ${textColor};
            line-height: 1.45;
            margin: 0 0 12px 0;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid ${borderColor};
            padding-top: 12px;
            margin-top: 12px;
          }

          .author-info {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .author-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
          }

          .author-name {
            font-size: 12px;
            font-weight: 600;
            color: ${subTextColor};
          }

          .domain {
            font-size: 11px;
            font-weight: 500;
            color: ${subTextColor};
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="card" id="youtube-thumb-card">
          <div class="thumbnail-container">
            <img class="thumbnail-image" src="${thumbUrl}" />
            <div class="play-overlay">
              <div class="play-triangle"></div>
            </div>
          </div>
          <div class="info-section">
            <div class="platform-badge">
              <svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.388.553a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.553 9.388.553 9.388.553s7.518 0 9.388-.553a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              YouTube Video
            </div>
            <h1 class="title">${escapeHtml(title)}</h1>
            <div class="footer">
              <div class="author-info">
                <div class="author-avatar">YT</div>
                <span class="author-name">Creator Media</span>
              </div>
              <span class="domain">youtube.com</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(htmlContent);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const cardElement = page.locator("#youtube-thumb-card");
    const buffer = await cardElement.screenshot({ type: "png", omitBackground: true });

    await browser.close();

    return { buffer, title, watchUrl, videoId };
  } catch (error) {
    console.warn("[captureYoutubeThumbnail] Playwright failed, falling back to Microlink with dynamic page rendering:", error);
    
    // Construct public render url using the supplied hostUrl or a reliable default
    const finalHost = hostUrl || "https://ais-dev-errgpu747quwousyeut56p-220065767305.asia-northeast1.run.app";
    const renderUrl = `${finalHost}/api/render-youtube-thumb?videoId=${videoId}&title=${encodeURIComponent(title)}&theme=${theme}`;
    
    const buffer = await captureViaMicrolink(renderUrl, "#youtube-thumb-card", theme);
    return { buffer, title, watchUrl, videoId };
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

  // Dynamic YouTube Thumbnail HTML serve endpoint (for Microlink fallback)
  app.get("/api/render-youtube-thumb", (req, res) => {
    const videoId = req.query.videoId as string || "dQw4w9WgXcQ";
    const title = req.query.title as string || "YouTube Video";
    const theme = req.query.theme as string || "light";

    const isDark = theme === "dark";
    const bgColor = isDark ? "#121212" : "#ffffff";
    const textColor = isDark ? "#f3f4f6" : "#111827";
    const subTextColor = isDark ? "#9ca3af" : "#4b5563";
    const borderColor = isDark ? "#2d2d2d" : "#e5e7eb";

    const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          
          body {
            margin: 0;
            padding: 40px;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          }

          .card {
            width: 580px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-radius: 24px;
            padding: 24px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, ${isDark ? "0.4" : "0.08"});
            box-sizing: border-box;
            overflow: hidden;
          }

          .thumbnail-container {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 16px;
            overflow: hidden;
            background-color: #000;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          }

          .thumbnail-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .play-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 64px;
            height: 44px;
            background: rgba(229, 9, 20, 0.95);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 6px 20px rgba(229, 9, 20, 0.4);
          }

          .play-triangle {
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-left: 14px solid #ffffff;
            border-bottom: 8px solid transparent;
            margin-left: 3px;
          }

          .info-section {
            margin-top: 20px;
          }

          .platform-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${isDark ? "#2a0f10" : "#fff1f2"};
            color: #ef4444;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            border: 1px solid ${isDark ? "#4c1d1d" : "#fecaca"};
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .title {
            font-size: 18px;
            font-weight: 850;
            color: ${textColor};
            line-height: 1.45;
            margin: 0 0 12px 0;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid ${borderColor};
            padding-top: 12px;
            margin-top: 12px;
          }

          .author-info {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .author-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
          }

          .author-name {
            font-size: 12px;
            font-weight: 600;
            color: ${subTextColor};
          }

          .domain {
            font-size: 11px;
            font-weight: 500;
            color: ${subTextColor};
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="card" id="youtube-thumb-card">
          <div class="thumbnail-container">
            <img class="thumbnail-image" src="${thumbUrl}" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${videoId}/hqdefault.jpg';" />
            <div class="play-overlay">
              <div class="play-triangle"></div>
            </div>
          </div>
          <div class="info-section">
            <div class="platform-badge">
              <svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.388.553a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.553 9.388.553 9.388.553s7.518 0 9.388-.553a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              YouTube Video
            </div>
            <h1 class="title">${escapeHtml(title)}</h1>
            <div class="footer">
              <div class="author-info">
                <div class="author-avatar">YT</div>
                <span class="author-name">Creator Media</span>
              </div>
              <span class="domain">youtube.com</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(htmlContent);
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
      let targetPlatform = platform;
      if (platform === "auto") {
        const lowercaseUrl = url.toLowerCase().trim();
        if (lowercaseUrl.includes("x.com") || lowercaseUrl.includes("twitter.com")) {
          targetPlatform = "x";
        } else if (lowercaseUrl.includes("t.me") || lowercaseUrl.includes("telegram.me") || lowercaseUrl.includes("telegram.dog")) {
          targetPlatform = "telegram";
        } else if (lowercaseUrl.includes("youtube.com") || lowercaseUrl.includes("youtu.be")) {
          if (lowercaseUrl.includes("/post/") || lowercaseUrl.includes("/community") || lowercaseUrl.includes("/backstage")) {
            targetPlatform = "youtube";
          } else {
            targetPlatform = "youtube_thumb";
          }
        } else {
          return res.status(400).json({ error: "자동 감지할 수 없는 URL 형식입니다. 올바른 소셜 미디어 주소를 입력하거나 플랫폼을 명시해주세요." });
        }
      }

      let buffer: Buffer;
      let finalUrl = url;
      let finalPostId = "post";
      let title = "";

      if (targetPlatform === "x") {
        const normalized = normalizeXPostUrl(url);
        if (!normalized) {
          return res.status(400).json({ error: "올바른 X 게시물 URL 형식이 아닙니다." });
        }
        buffer = await captureXPost(normalized, selectedTheme);
        finalUrl = normalized;
        finalPostId = extractXPostId(url) || "post";
      } else if (targetPlatform === "youtube") {
        buffer = await captureYoutubePost(url, selectedTheme);
      } else if (targetPlatform === "telegram") {
        buffer = await captureTelegramPost(url, selectedTheme);
      } else if (targetPlatform === "youtube_thumb") {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
        const hostUrl = `${protocol}://${host}`;

        const result = await captureYoutubeThumbnail(url, selectedTheme, hostUrl);
        buffer = result.buffer;
        finalUrl = result.watchUrl;
        finalPostId = result.videoId;
        title = result.title;
      } else {
        return res.status(400).json({ error: "지원하지 않는 플랫폼입니다." });
      }

      const base64Image = buffer.toString("base64");

      res.json({
        success: true,
        image: `data:image/png;base64,${base64Image}`,
        filename: `${targetPlatform}-post-${finalPostId}.png`,
        postId: finalPostId,
        normalizedUrl: finalUrl,
        title: title || undefined,
        platform: targetPlatform
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
