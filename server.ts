import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const getFfmpegBin = (): string => {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  if (fs.existsSync("/usr/bin/ffmpeg")) {
    return "/usr/bin/ffmpeg";
  }
  if (fs.existsSync("/usr/local/bin/ffmpeg")) {
    return "/usr/local/bin/ffmpeg";
  }
  return "ffmpeg";
};

// Resolve and configure the path for Playwright browsers.
const projectRoot = process.cwd();
const builtBrowsersPath = path.join(projectRoot, "dist", ".playwright-browsers");
const fallbackBrowsersPath = "/tmp/.playwright-browsers";

let browsersPath = fallbackBrowsersPath;

if (
  fs.existsSync(builtBrowsersPath) &&
  (fs.existsSync(path.join(builtBrowsersPath, "chromium-1228")) ||
   fs.existsSync(path.join(builtBrowsersPath, "chromium_headless_shell-1228")))
) {
  browsersPath = builtBrowsersPath;
  console.log(`[Playwright Config] Using built-in browser cache in dist: ${browsersPath}`);
} else {
  browsersPath = fallbackBrowsersPath;
  console.log(`[Playwright Config] Built-in browser cache not found or incomplete. Using writable tmp path: ${browsersPath}`);
  
  // Ensure browsers are prepopulated in the writable /tmp directory
  try {
    fs.mkdirSync(browsersPath, { recursive: true });
    
    // Check if we already have chromium or chromium_headless_shell in our writable path
    const hasChromium = fs.existsSync(path.join(browsersPath, "chromium-1228")) || 
                       fs.existsSync(path.join(browsersPath, "chromium_headless_shell-1228"));
                       
    if (!hasChromium) {
      console.log("[Playwright Config] Writable browser cache is empty. Searching for pre-installed global cache...");
      const homeDir = process.env.HOME || "/root";
      const globalCachePath1 = path.join(homeDir, ".cache", "ms-playwright");
      const globalCachePath2 = "/home/node/.cache/ms-playwright";
      
      let sourcePath = "";
      if (fs.existsSync(globalCachePath1) && (fs.existsSync(path.join(globalCachePath1, "chromium-1228")) || fs.existsSync(path.join(globalCachePath1, "chromium_headless_shell-1228")))) {
        sourcePath = globalCachePath1;
      } else if (fs.existsSync(globalCachePath2) && (fs.existsSync(path.join(globalCachePath2, "chromium-1228")) || fs.existsSync(path.join(globalCachePath2, "chromium_headless_shell-1228")))) {
        sourcePath = globalCachePath2;
      }
      
      if (sourcePath) {
        console.log(`[Playwright Config] Pre-installed global cache found at: ${sourcePath}. Copying to writable cache...`);
        try {
          // Use cp command for extremely fast recursive copy
          execSync(`cp -rp ${sourcePath}/* ${browsersPath}/`, { stdio: "inherit" });
          console.log("[Playwright Config] Fast copy completed successfully!");
        } catch (copyErr) {
          console.warn("[Playwright Config] Failed to copy pre-installed cache:", copyErr);
        }
      } else {
        console.log("[Playwright Config] No pre-installed global cache found. Will download dynamically on first launch.");
      }
    } else {
      console.log("[Playwright Config] Writable browser cache is already populated.");
    }
  } catch (err) {
    console.error("[Playwright Config] Error during initialization of writable browser cache:", err);
  }
}

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
console.log(`[Playwright Config] Active PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

import express from "express";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

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
async function launchBrowser(args: string[] = []) {
  const { chromium } = await import("playwright-core");
  const baseArgs = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const finalArgs = args.length > 0 ? args : baseArgs;

  // Always append critical performance & memory-saving flags for Cloud Run / serverless compatibility
  const optimizedArgs = Array.from(new Set([
    ...finalArgs,
    "--disable-setuid-sandbox",
    "--no-zygote",
    "--no-first-run",
    "--disable-accelerated-2d-canvas",
    "--disable-extensions",
    "--mute-audio"
  ]));

  try {
    return await chromium.launch({
      headless: true,
      args: optimizedArgs,
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
        const envConfig = { ...process.env, HOME: "/tmp", PLAYWRIGHT_BROWSERS_PATH: browsersPath };
        execSync("node node_modules/playwright-core/cli.js install chromium", { stdio: "inherit", env: envConfig });
        console.log("Playwright chromium installed successfully. Retrying browser launch...");
        return await chromium.launch({
          headless: true,
          args: optimizedArgs,
        });
      } catch (installError) {
        console.error("Failed to dynamically install Playwright chromium:", installError);
        throw error;
      }
    }

    // Check if launch error is due to missing shared system libraries
    if (
      errorMsg.includes("shared library") || 
      errorMsg.includes("shared libraries") || 
      errorMsg.includes("cannot open shared object file") ||
      errorMsg.includes("Target page, context or browser has been closed") ||
      errorMsg.includes("error while loading")
    ) {
      console.log("[Playwright Config] Missing shared libraries or browser launch failed. Attempting dynamic system dependencies installation...");
      try {
        // Run apt-get update & install-deps to auto-resolve missing OS libraries dynamically
        execSync("apt-get update && node node_modules/playwright-core/cli.js install-deps chromium", { stdio: "inherit" });
        console.log("[Playwright Config] Browser system dependencies installed. Retrying launch...");
        return await chromium.launch({
          headless: true,
          args: optimizedArgs,
        });
      } catch (depsError) {
        console.error("[Playwright Config] Failed to dynamically install system dependencies:", depsError);
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

// Temporary in-memory cache for render endpoints to avoid HTTP 414 (Request-URI Too Large) when sending URLs to Microlink
interface RenderData {
  channelName?: string;
  desc?: string;
  avatar?: string;
  theme?: string;
  publishedTime?: string;
  voteCount?: string;
  postImages?: string[];
  videoId?: string;
  title?: string;
  createdAt: number;
}

const renderDataStore = new Map<string, RenderData>();

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of renderDataStore.entries()) {
    if (now - data.createdAt > 15 * 60 * 1000) {
      renderDataStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Unified fallback capture using Microlink API (for when local headless Chromium cannot launch)
async function captureViaMicrolink(targetUrl: string, elementSelector: string, theme: "light" | "dark"): Promise<Buffer> {
  console.log(`[Microlink Fallback] Running capture for: ${targetUrl}, selector: ${elementSelector}, theme: ${theme}`);
  
  // Force Microlink to completely bypass its server-side screenshot cache
  // Also append a cache-buster timestamp parameter to the destination URL
  let targetUrlWithBuster = targetUrl;
  try {
    const urlObj = new URL(targetUrl);
    urlObj.searchParams.set("_cb", Date.now().toString());
    targetUrlWithBuster = urlObj.toString();
  } catch (e) {
    targetUrlWithBuster = `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}_cb=${Date.now()}`;
  }

  const params = new URLSearchParams({
    url: targetUrlWithBuster,
    screenshot: "true",
    "screenshot.colorScheme": theme,
    "screenshot.type": "png",
    "viewport.deviceScaleFactor": "2",
    "screenshot.omitBackground": "true",
    force: "true", // Crucial: forces Microlink to ignore cached screenshots of the page
  });

  if (elementSelector) {
    params.append("element", elementSelector);
  }

  // Optimize waiting conditions and viewports depending on platform url
  if (targetUrl.includes("x.com") || targetUrl.includes("twitter.com")) {
    params.append("screenshot.waitFor", "article");
    params.append("screenshot.delay", "4000");
    params.append("viewport.width", "1280");
    params.append("viewport.height", "1000");

    const isDark = theme === "dark";
    const xBgColor = isDark ? "#000000" : "#ffffff";
    const xBorderColor = isDark ? "#2f3336" : "#eff3f4";

    const xCss = `
      header[role="banner"],
      [data-testid="SideNav_AccountSidebar_Button"],
      nav[role="navigation"],
      div[data-testid="sidebarColumn"],
      div[data-testid="BottomBar"],
      #layers,
      div[id="layers"],
      #layers *,
      div[id="layers"] *,
      div[role="dialog"],
      div[role="dialog"] *,
      div[role="alertdialog"],
      div[role="alertdialog"] *,
      div[data-testid="sheetDialog"],
      div[data-testid="sheetDialog"] *,
      div[data-testid="mask"],
      div[data-testid="mask"] *,
      div[data-testid="loginSheet"],
      div[data-testid="loginSheet"] *,
      div[data-testid="InAppBrowserPrompt"],
      div[data-testid="InAppBrowserPrompt"] *,
      [data-testid*="sheet"],
      [data-testid*="sheet"] *,
      [data-testid*="dialog"],
      [data-testid*="dialog"] *,
      [data-testid*="modal"],
      [data-testid*="modal"] *,
      [data-testid*="prompt"],
      [data-testid*="prompt"] *,
      [data-testid*="AppPromote"],
      [data-testid*="AppPromote"] *,
      [data-testid*="app_installation"],
      [data-testid*="app_installation"] *,
      [data-testid*="open_in_app"],
      [data-testid*="open_in_app"] *,
      [data-testid*="banner"],
      [data-testid*="banner"] *,
      [data-testid*="Banner"],
      [data-testid*="Banner"] *,
      div[role="progressbar"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        max-height: 0 !important;
        position: absolute !important;
        top: -9999px !important;
        left: -9999px !important;
        z-index: -99999 !important;
      }
      main[role="main"] > div > div > div > div:first-child {
        display: none !important;
      }
      main[role="main"] {
        align-items: center !important;
        justify-content: center !important;
        background: ${xBgColor} !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      div[data-testid="primaryColumn"] {
        max-width: 600px !important;
        width: 100% !important;
        margin: 0 auto !important;
        border: none !important;
        background: ${xBgColor} !important;
      }
      html, body {
        background-color: ${xBgColor} !important;
        background: ${xBgColor} !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      article {
        border: 1px solid ${xBorderColor} !important;
        border-radius: 16px !important;
        margin: 12px !important;
        padding: 16px !important;
        background: ${xBgColor} !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, ${isDark ? "0.4" : "0.04"}) !important;
      }
    `.replace(/\s+/g, " ").trim();

    params.append("styles", xCss);
  } else if (targetUrl.includes("t.me") || targetUrl.includes("telegram.me")) {
    params.append("screenshot.waitFor", ".tgme_widget_message");
    params.append("screenshot.delay", "3000");
    // Force mobile-sized viewport in Microlink fallback for Telegram to get perfect crops without margins
    params.append("viewport.width", "564");
    params.append("screenshot.fullPage", "true");
    params.append("screenshot.omitBackground", "true");

    const bgColor = theme === "dark" ? "#0b1630" : "#ffffff";
    const textColor = theme === "dark" ? "#f8fafc" : "#0f172a";
    const authorColor = theme === "dark" ? "#38bdf8" : "#0284c7";
    const metaColor = theme === "dark" ? "#94a3b8" : "#64748b";
    const borderColor = theme === "dark" ? "#1e293b" : "#e2e8f0";
    const shadowOpacity = theme === "dark" ? "0.3" : "0.06";

    const microlinkCss = `
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

      html, body, .tgme_widget_message_page {
        background: transparent !important;
        background-image: none !important;
        color: ${textColor} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      .tgme_widget_message_page > :not(.tgme_widget_message_wrap) {
        display: none !important;
      }
      body, body *, .tgme_widget_message, .tgme_widget_message_text, .tgme_widget_message_author, .tgme_widget_message_meta {
        font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important;
        letter-spacing: -0.3px !important;
      }
      .tgme_widget_message_wrap {
        display: block !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        padding: 12px !important;
        margin: 0 !important;
        background: transparent !important;
        box-sizing: border-box !important;
      }
      .tgme_widget_message_wrap > :not(.tgme_widget_message) {
        display: none !important;
      }
      .tgme_widget_message {
        max-width: 540px !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
        background: ${bgColor} !important;
        border-radius: 12px !important;
        border: 1px solid ${borderColor} !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, ${shadowOpacity}) !important;
        flex: none !important;
        flex-grow: 0 !important;
        flex-shrink: 0 !important;
      }
      .tgme_widget_message_bubble {
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        background: ${bgColor} !important;
      }
      .tgme_widget_message_text {
        color: ${textColor} !important;
      }
      .tgme_widget_message_author, .tgme_widget_message_author * {
        color: ${authorColor} !important;
        font-weight: 600 !important;
      }
      .tgme_widget_message_meta, .tgme_widget_message_meta * {
        color: ${metaColor} !important;
      }
      .tgme_widget_message_inline_button_wrap, .tgme_widget_message_inline_button, .tgme_widget_login, .tgme_widget_message_popup {
        display: none !important;
      }
    `.replace(/\s+/g, " ").trim();

    params.append("styles", microlinkCss);
  } else if ((targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be")) && !targetUrl.includes("render-youtube-thumb")) {
    // Wait for ytd-backstage-post-renderer to fully load in Microlink's browser
    params.append("screenshot.waitFor", "ytd-backstage-post-renderer");
    params.append("screenshot.delay", "5000"); // Allow extra time for client-side API requests and custom font loading
    
    // Desktop size viewport
    params.append("viewport.width", "1280");
    params.append("viewport.height", "1400");
    
    // Inject custom CSS to isolate the post-card and apply fonts
    const youtubeCss = `
      @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');

      ytd-masthead, #masthead-container, #guide, ytd-mini-guide-renderer, #comments, #sections, #sidebar, #meta, ytd-backstage-post-thread-renderer > :not(ytd-backstage-post-renderer), #footer {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
      }
      ytd-app #page-manager.ytd-app {
        margin-top: 0 !important;
        margin-left: 0 !important;
      }
      body, html {
        background: transparent !important;
        background-color: transparent !important;
        font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important;
      }
      * {
        font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important;
      }
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
    `.replace(/\s+/g, " ").trim();
    
    params.append("styles", youtubeCss);
  } else if (targetUrl.includes("render-youtube-thumb")) {
    params.append("screenshot.waitFor", ".card");
    params.append("screenshot.delay", "2000");
  }

  const apiUrl = `https://api.microlink.io/?${params.toString()}`;
  console.log(`[Microlink Fallback] API Request URL: ${apiUrl}`);

  let response = await fetch(apiUrl);
  
  // If the initial request fails (e.g., selector not found because of a login wall or consent screen)
  if (!response.ok && (params.has("screenshot.waitFor") || params.has("element"))) {
    console.warn(`[Microlink Fallback] Initial request failed with HTTP ${response.status}. Retrying without selector constraints but keeping styles...`);
    const retryParams = new URLSearchParams(params);
    retryParams.delete("screenshot.waitFor");
    retryParams.delete("element");
    
    const retryApiUrl = `https://api.microlink.io/?${retryParams.toString()}`;
    const retryResponse = await fetch(retryApiUrl);
    if (retryResponse.ok) {
      response = retryResponse;
    }
  }

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch (e) {
      errorBody = "Could not read error body";
    }
    console.error(`[Microlink Fallback] Failed with HTTP ${response.status}. Body: ${errorBody}`);
    
    let errorMessage = `Microlink API failed: HTTP ${response.status}`;
    try {
      const parsedError = JSON.parse(errorBody);
      if (parsedError.message) {
        errorMessage = `${parsedError.message} (HTTP ${response.status})`;
      } else if (parsedError.data && typeof parsedError.data === "object") {
        const details = Object.entries(parsedError.data)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        errorMessage = `${parsedError.code || "Error"}: ${details} (HTTP ${response.status})`;
      } else if (parsedError.code) {
        errorMessage = `${parsedError.code} (HTTP ${response.status})`;
      }
    } catch (e) {
      // Not JSON
    }
    throw new Error(errorMessage);
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
    
    const browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 1280, height: 2400 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      locale: "ko-KR",
      bypassCSP: true,
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
        
        /* Hide banners, sidebars, layers that can float or overlap */
        header[role="banner"],
        [data-testid="SideNav_AccountSidebar_Button"],
        nav[role="navigation"],
        div[data-testid="sidebarColumn"],
        div[data-testid="BottomBar"],
        #layers,
        div[id="layers"],
        #layers *,
        div[id="layers"] *,
        div[role="dialog"],
        div[role="dialog"] *,
        div[role="alertdialog"],
        div[role="alertdialog"] *,
        div[data-testid="sheetDialog"],
        div[data-testid="sheetDialog"] *,
        div[data-testid="mask"],
        div[data-testid="mask"] *,
        div[data-testid="loginSheet"],
        div[data-testid="loginSheet"] *,
        div[data-testid="InAppBrowserPrompt"],
        div[data-testid="InAppBrowserPrompt"] *,
        [data-testid*="sheet"],
        [data-testid*="sheet"] *,
        [data-testid*="dialog"],
        [data-testid*="dialog"] *,
        [data-testid*="modal"],
        [data-testid*="modal"] *,
        [data-testid*="prompt"],
        [data-testid*="prompt"] *,
        [data-testid*="AppPromote"],
        [data-testid*="AppPromote"] *,
        [data-testid*="app_installation"],
        [data-testid*="app_installation"] *,
        [data-testid*="open_in_app"],
        [data-testid*="open_in_app"] *,
        [data-testid*="banner"],
        [data-testid*="banner"] *,
        [data-testid*="Banner"],
        [data-testid*="Banner"] *,
        div[role="progressbar"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          max-height: 0 !important;
          position: absolute !important;
          top: -9999px !important;
          left: -9999px !important;
          z-index: -99999 !important;
        }
        
        article, article * {
          font-family: 'Pretendard', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif !important;
        }
      `.trim();

      try {
        await page.addStyleTag({ content: cssContent });
      } catch (e) {
        await page.addStyleTag({
          content: `
            html, body { background: ${pageColor} !important; }
            header[role="banner"], div[data-testid="sidebarColumn"], div[data-testid="BottomBar"], #layers { display: none !important; }
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

      await page.evaluate(() => {
        const popupSelectors = [
          '#layers',
          'div[id="layers"]',
          'div[role="dialog"]',
          'div[role="alertdialog"]',
          '[data-testid="sheetDialog"]',
          '[data-testid="mask"]',
          '[data-testid="loginSheet"]',
          '[data-testid="InAppBrowserPrompt"]',
          '[data-testid="BottomBar"]',
          '[data-testid*="sheet"]',
          '[data-testid*="dialog"]',
          '[data-testid*="modal"]',
          '[data-testid*="prompt"]',
          '[data-testid*="AppPromote"]',
          '[data-testid*="app_installation"]',
          '[data-testid*="open_in_app"]',
        ];
        popupSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });
      });

      await page.waitForTimeout(500);
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

async function captureYoutubePost(postUrl: string, theme: "light" | "dark" = "light", hostUrl?: string): Promise<Buffer> {
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
    const browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 3,
      colorScheme: theme,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      locale: "ko-KR",
      bypassCSP: true,
    });

    // Bypass YouTube / Google Consent Screen by injecting consent cookies
    await context.addCookies([
      { name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/" },
      { name: "CONSENT", value: "YES+", domain: ".youtube.com", path: "/" }
    ]);

    const page = await context.newPage();

    try {
      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      } catch (e) {
        // Ignore navigation timeout if some parts loaded
      }

      const cssContent = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');

ytd-masthead, #masthead-container { display: none !important; visibility: hidden !important; height: 0 !important; }
ytd-app #page-manager.ytd-app { margin-top: 0 !important; }
* { font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important; }

ytd-backstage-post-renderer {
  background-color: ${theme === "dark" ? "#181818" : "#ffffff"} !important;
  border-radius: 24px !important;
  border: 1px solid ${theme === "dark" ? "#333333" : "#e2e8f0"} !important;
  padding: 24px 24px 48px 24px !important;
  margin: 20px auto !important;
  display: block !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, ${theme === "dark" ? "0.3" : "0.05"}) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  height: auto !important;
  min-height: min-content !important;
}
ytd-backstage-post-renderer, ytd-backstage-post-renderer * {
  color: ${theme === "dark" ? "#ffffff" : "#0f172a"} !important;
  --yt-spec-text-primary: ${theme === "dark" ? "#ffffff" : "#0f172a"} !important;
  --yt-spec-text-secondary: ${theme === "dark" ? "#dddddd" : "#475569"} !important;
  text-align: left !important;
}
ytd-backstage-post-renderer a, ytd-backstage-post-renderer span[class*="hashtag"] {
  color: #3ea6ff !important;
  text-decoration: none !important;
}

/* Force-expand text containers and formatters to prevent truncation */
#content, #content-text, #text, .content, .text, ytd-text-expander, yt-formatted-string {
  max-height: none !important;
  -webkit-line-clamp: none !important;
  line-clamp: none !important;
  display: block !important;
  overflow: visible !important;
  text-align: left !important;
}`.trim();

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
        // Wait 2500ms to let Polymer custom elements fully upgrade and register JS event listeners
        await page.waitForTimeout(2500);

        // 1. Run a native shadow-piercing clicker and styles injector directly in the browser context.
        // This is extremely reliable as it handles Polymer shadow roots, forces full text styles, and clicks buttons.
        await page.evaluate(() => {
          function forceExpandAndStyleRecursive(root: any) {
            if (!root) return;

            // Force-expand any text-expanders directly
            const expanders = root.querySelectorAll("ytd-text-expander, [class*='expander']");
            expanders.forEach((el: any) => {
              try {
                el.removeAttribute("collapsed");
                el.removeAttribute("is-collapsed");
                el.setAttribute("expanded", "");
                el.setAttribute("is-expanded", "");
                el.expanded = true;
                el.isExpanded = true;

                // Inject overriding styles inside the expander's shadow root
                if (el.shadowRoot) {
                  const styleId = "force-expand-shadow-style";
                  if (!el.shadowRoot.getElementById(styleId)) {
                    const style = document.createElement("style");
                    style.id = styleId;
                    style.textContent = `
                      #content, #content-text, #text, .content, .text, ytd-text-expander, yt-formatted-string {
                        max-height: none !important;
                        -webkit-line-clamp: none !important;
                        line-clamp: none !important;
                        display: block !important;
                        overflow: visible !important;
                        text-align: left !important;
                      }
                      #more, #expand, .more-button {
                        display: none !important;
                      }
                    `;
                    el.shadowRoot.appendChild(style);
                  }
                }

                const button = el.querySelector("#more, #expand, button, paper-button");
                if (button) {
                  (button as HTMLElement).click();
                }
              } catch (e) {}
            });

            const targets = root.querySelectorAll("#more, .more-button, #expand, [id='more'], [id='expand']");
            targets.forEach((el: any) => {
              if (el) {
                try {
                  (el as HTMLElement).click();
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } catch (e) {}
              }
            });

            const textRegex = /자세히\s*알아보기|자세히\s*보기|더\s*보기|더보기|Read\s*more|Show\s*more/i;
            const allEls = root.querySelectorAll("span, a, button, tp-yt-paper-button, [role='button']");
            allEls.forEach((el: any) => {
              if (el && el.textContent && textRegex.test(el.textContent)) {
                try {
                  (el as HTMLElement).click();
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } catch (e) {}
              }
            });

            // Also search and expand yt-formatted-string
            const formatted = root.querySelectorAll("yt-formatted-string");
            formatted.forEach((el: any) => {
              try {
                el.setAttribute("is-expanded", "");
                el.setAttribute("expanded", "");
                (el as any).isExpanded = true;
                (el as any).expanded = true;

                if (el.shadowRoot) {
                  const styleId = "force-expand-shadow-style";
                  if (!el.shadowRoot.getElementById(styleId)) {
                    const style = document.createElement("style");
                    style.id = styleId;
                    style.textContent = `
                      #text, #content, .text {
                        max-height: none !important;
                        -webkit-line-clamp: none !important;
                        line-clamp: none !important;
                        display: inline !important;
                        overflow: visible !important;
                        text-align: left !important;
                      }
                    `;
                    el.shadowRoot.appendChild(style);
                  }
                }
              } catch (e) {}
            });

            const children = root.querySelectorAll("*");
            children.forEach((child: any) => {
              if (child.shadowRoot) {
                forceExpandAndStyleRecursive(child.shadowRoot);
              }
            });
          }
          forceExpandAndStyleRecursive(document);
        });

        // 2. Playwright-level specific selectors with force clicks on leaf nodes
        const specificSelectors = [
          "span#more",
          "a#more",
          "button#more",
          "tp-yt-paper-button#more",
          "span.more-button",
          "a.more-button",
          "button.more-button"
        ];
        
        for (const sel of specificSelectors) {
          const el = postLocator.locator(sel);
          const count = await el.count();
          for (let idx = 0; idx < count; idx++) {
            const item = el.nth(idx);
            try {
              await item.click({ timeout: 1000, force: true });
              await page.waitForTimeout(150);
            } catch (e) {
              // Ignore
            }
          }
        }

        // Also search and click by text content on small leaf-like tags only (span, a, button, tp-yt-paper-button)
        const expandTexts = [
          /자세히\s*알아보기/,
          /자세히\s*보기/,
          /더\s*보기/,
          /더보기/,
          /Read\s*more/,
          /Show\s*more/
        ];

        for (const rx of expandTexts) {
          const el = postLocator.locator('span, a, button, tp-yt-paper-button, [role="button"]').filter({ hasText: rx });
          const count = await el.count();
          for (let idx = 0; idx < count; idx++) {
            const item = el.nth(idx);
            try {
              await item.click({ timeout: 1000, force: true });
              await page.waitForTimeout(150);
            } catch (e) {
              // Ignore
            }
          }
        }
      } catch (e) {
        console.error("Error expanding YouTube post:", e);
      }

      await postLocator.scrollIntoViewIfNeeded({ timeout: 3000 });
      await page.waitForTimeout(500);

      // Adjust viewport size dynamically based on the post's expanded bounding box
      const box = await postLocator.boundingBox();
      if (box && box.height > 0) {
        const desiredH = Math.floor(box.height) + 300;
        const adjustedH = Math.max(1200, Math.min(desiredH, 8000));
        await page.setViewportSize({ width: 1920, height: adjustedH });
        await page.waitForTimeout(400);
        await postLocator.scrollIntoViewIfNeeded({ timeout: 3000 });
      }

      // Wait for height to stabilize to prevent cut-off issues
      let stable = 0;
      let prevH = -1;
      for (let i = 0; i < 20; i++) {
        const curBox = await postLocator.boundingBox();
        if (curBox && curBox.height > 100) {
          const currH = Math.floor(curBox.height);
          if (Math.abs(currH - prevH) <= 1) {
            stable++;
          } else {
            stable = 0;
          }
          prevH = currH;
          if (stable >= 3) break;
        }
        await page.waitForTimeout(150);
      }

      await page.waitForTimeout(400);

      const screenshotBuffer = await postLocator.screenshot({
        type: "png",
        omitBackground: true,
      });
      return screenshotBuffer;
    } finally {
      await browser.close();
    }
  } catch (error: any) {
    console.warn("[captureYoutubePost] Playwright failed, trying metadata extraction & dynamic render fallback:", error);
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch YouTube post page: HTTP ${response.status}`);
      }
      const html = await response.text();

      // Extract OG tags as initial values
      let ogTitle = html.match(/<meta[^>]*property=["\x27]og:title["\x27][^>]*content=["\x27]([^"\x27]*)["\x27]/i)?.[1] ||
                    html.match(/<meta[^>]*content=["\x27]([^"\x27]*)["\x27][^>]*property=["\x27]og:title["\x27]/i)?.[1] ||
                    "YouTube Creator";

      let ogDesc = html.match(/<meta[^>]*property=["\x27]og:description["\x27][^>]*content=["\x27]([^"\x27]*)["\x27]/i)?.[1] ||
                   html.match(/<meta[^>]*content=["\x27]([^"\x27]*)["\x27][^>]*property=["\x27]og:description["\x27]/i)?.[1] ||
                   "";

      let ogImage = html.match(/<meta[^>]*property=["\x27]og:image["\x27][^>]*content=["\x27]([^"\x27]*)["\x27]/i)?.[1] ||
                    html.match(/<meta[^>]*content=["\x27]([^"\x27]*)["\x27][^>]*property=["\x27]og:image["\x27]/i)?.[1] ||
                    "";

      // HTML Unescape helper
      const unescapeHtml = (str: string) => {
        return str
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, "\"")
          .replace(/&#39;/g, "'")
          .replace(/&#039;/g, "'");
      };

      ogDesc = unescapeHtml(ogDesc);

      // Clean up ogTitle
      let channelName = ogTitle;
      const cleanPatterns = [
        /\s*さんからの投稿\s*/i,
        /\s*님의\s+포스트\s*/i,
        /Post\s+from\s+/i,
        /\s*-\s*YouTube/i
      ];
      for (const pattern of cleanPatterns) {
        channelName = channelName.replace(pattern, "");
      }
      channelName = channelName.trim();

      const ogImageFromMeta = ogImage;
      let postImages: string[] = [];

      // Attempt to extract rich, non-truncated content from ytInitialData
      let publishedTime = "";
      let voteCount = "";
      let parsedSuccessfully = false;

      const ytInitialDataMatch = html.match(/var\s+ytInitialData\s*=\s*({.+?});/);
      if (ytInitialDataMatch) {
        try {
          const data = JSON.parse(ytInitialDataMatch[1]);
          let post = null;
          try {
            const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
            if (tabs) {
              for (const tab of tabs) {
                const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents;
                if (contents) {
                  for (const section of contents) {
                    const items = section?.itemSectionRenderer?.contents;
                    if (items) {
                      for (const item of items) {
                        if (item?.backstagePostThreadRenderer?.post?.backstagePostRenderer) {
                          post = item.backstagePostThreadRenderer.post.backstagePostRenderer;
                          break;
                        }
                      }
                    }
                    if (post) break;
                  }
                }
                if (post) break;
              }
            }
          } catch (err) {
            console.warn("[ytInitialData] Error navigating tabs:", err);
          }

          if (post) {
            if (post.authorText?.runs?.[0]?.text) {
              channelName = post.authorText.runs[0].text;
            }
            if (post.publishedTimeText?.runs?.[0]?.text) {
              publishedTime = post.publishedTimeText.runs[0].text;
            }
            if (post.authorThumbnail?.thumbnails?.length > 0) {
              const thumbs = post.authorThumbnail.thumbnails;
              const highest = thumbs[thumbs.length - 1];
              let thumbUrl = highest.url;
              if (thumbUrl.startsWith("//")) {
                thumbUrl = "https:" + thumbUrl;
              }
              ogImage = thumbUrl;
            }
            if (post.voteCount?.simpleText) {
              voteCount = post.voteCount.simpleText;
            } else if (post.voteCount?.accessibility?.accessibilityData?.label) {
              voteCount = post.voteCount.accessibility.accessibilityData.label;
            }
            if (post.contentText?.runs) {
              let textContent = "";
              for (const run of post.contentText.runs) {
                if (run.text) {
                  textContent += run.text;
                }
              }
              if (textContent.trim()) {
                ogDesc = textContent;
                parsedSuccessfully = true;
                console.log("[captureYoutubePost Fallback] Successfully parsed full YouTube post text from ytInitialData! Length:", ogDesc.length);
              }
            }

            // Extract images from backstage post attachment
            if (post.attachment) {
              // 1. Single Image
              const singleImage = post.attachment?.backstageImageRenderer?.image?.thumbnails;
              if (singleImage && singleImage.length > 0) {
                const imgUrl = singleImage[singleImage.length - 1].url;
                postImages.push(imgUrl.startsWith("//") ? "https:" + imgUrl : imgUrl);
              }
              // 2. Multi-image
              const multiImages = post.attachment?.postMultiImageRenderer?.images;
              if (Array.isArray(multiImages)) {
                for (const imgItem of multiImages) {
                  const thumbs = imgItem?.backstageImageRenderer?.image?.thumbnails;
                  if (thumbs && thumbs.length > 0) {
                    const imgUrl = thumbs[thumbs.length - 1].url;
                    postImages.push(imgUrl.startsWith("//") ? "https:" + imgUrl : imgUrl);
                  }
                }
              }
            }
          }
        } catch (jsonErr) {
          console.warn("[captureYoutubePost Fallback] Failed to parse ytInitialData JSON:", jsonErr);
        }
      }

      // Note: Do NOT use ogImageFromMeta as postImages fallback because YouTube's og:image meta tag is the channel profile avatar, not a post image.

      console.log(`[captureYoutubePost Fallback] Redirecting to Microlink with dynamic page rendering... Images found: ${postImages.length}`);
      const finalHost = hostUrl || "https://ais-dev-errgpu747quwousyeut56p-220065767305.asia-northeast1.run.app";
      
      const renderId = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      renderDataStore.set(renderId, {
        channelName,
        desc: ogDesc,
        avatar: ogImage,
        theme,
        publishedTime,
        voteCount,
        postImages,
        createdAt: Date.now()
      });

      const renderUrl = `${finalHost}/api/render-youtube-post?id=${renderId}`;
      return await captureViaMicrolink(renderUrl, "#youtube-post-card", theme);
    } catch (fallbackErr: any) {
      console.error("[captureYoutubePost] Meta extraction fallback also failed:", fallbackErr);
      throw new Error(`Playwright failed: ${error.message || error}. Fallback failed: ${fallbackErr.message || fallbackErr}`);
    }
  }
}

async function generateYoutubeSvg(
  channelName: string,
  desc: string,
  avatarUrl: string,
  publishedTime: string,
  voteCount: string,
  theme: "light" | "dark"
): Promise<Buffer> {
  const isDark = theme === "dark";
  const subTextColor = isDark ? "#aaaaaa" : "#606060";

  let avatarBase64 = "";
  if (avatarUrl) {
    try {
      const response = await fetch(avatarUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mime = response.headers.get("content-type") || "image/jpeg";
        avatarBase64 = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } catch (err) {
      console.warn("Failed to fetch avatar for SVG embedding:", err);
    }
  }

  const linkify = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      const escapedUrl = url
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      return `<a href="${escapedUrl}" style="color: #3ea6ff; text-decoration: none;" target="_blank">${escapedUrl}</a>`;
    });
  };

  // Safe estimate of content height taking newlines and wide characters into account
  const lines = desc.split("\n");
  let totalLineCount = 0;
  for (const line of lines) {
    let visualLength = 0;
    for (let i = 0; i < line.length; i++) {
      const charCode = line.charCodeAt(i);
      // CJK/Hangul characters are wider (typically 1.75 - 2 times standard latin characters)
      if (charCode > 127) {
        visualLength += 1.75;
      } else {
        visualLength += 1.0;
      }
    }
    // Available line width is 552px (600px - 48px padding).
    // At 14px font-size, a standard latin line holds around 68 visual units.
    const wrapCount = Math.max(1, Math.ceil(visualLength / 68));
    totalLineCount += wrapCount;
  }
  // Add a small buffer line for safety
  totalLineCount += 0.5;

  const estimatedTextHeight = Math.max(3, totalLineCount) * 21;
  // Non-text vertical base height is exactly 155px (top-bottom padding, avatar, header, margins, and footer)
  const calculatedHeight = 155 + estimatedTextHeight;
  const finalHeight = Math.max(260, Math.min(calculatedHeight, 1500));

  const svgContent = `
    <svg width="600" height="${finalHeight}" viewBox="0 0 600 ${finalHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <foreignObject width="600" height="${finalHeight}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          font-family: 'Pretendard', system-ui, -apple-system, sans-serif;
          background-color: ${isDark ? "#1f1f1f" : "#ffffff"};
          color: ${isDark ? "#f1f1f1" : "#0f0f0f"};
          border: 1px solid ${isDark ? "#3f3f3f" : "#e5e5e5"};
          border-radius: 16px;
          padding: 24px;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
        ">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            ${avatarBase64 ? `
              <img src="${avatarBase64}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; object-fit: cover;" />
            ` : `
              <div style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px;">
                ${(channelName || "Y").charAt(0).toUpperCase()}
              </div>
            `}
            <div style="display: flex; flex-direction: column;">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 14px; font-weight: 700; color: ${isDark ? "#f1f1f1" : "#0f0f0f"};">${escapeHtml(channelName)}</span>
                ${publishedTime ? `
                  <span style="font-size: 10px; color: ${subTextColor};">•</span>
                  <span style="font-size: 12px; color: ${subTextColor};">${escapeHtml(publishedTime)}</span>
                ` : ""}
              </div>
              <span style="font-size: 11px; color: ${subTextColor};">YouTube Community Post</span>
            </div>
          </div>
          <div style="font-size: 14px; line-height: 1.5; color: ${isDark ? "#f1f1f1" : "#0f0f0f"}; white-space: pre-wrap; word-break: break-word; margin-bottom: 20px;">
            ${linkify(escapeHtml(desc))}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid ${isDark ? "#3f3f3f" : "#e5e5e5"}; padding-top: 14px; font-size: 12px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="display: flex; align-items: center; gap: 6px; color: ${isDark ? "#f1f1f1" : "#0f0f0f"};">
                <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                <span>${escapeHtml(voteCount || "0")}</span>
              </div>
              <div style="color: ${subTextColor}; display: flex; align-items: center;">
                <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
              </div>
              <div style="color: ${subTextColor}; display: flex; align-items: center;">
                <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11.1z"/></svg>
              </div>
            </div>
            <span style="color: ${subTextColor};">youtube.com</span>
          </div>
        </div>
      </foreignObject>
    </svg>
  `.trim();

  return Buffer.from(svgContent, "utf-8");
}

async function captureTelegramPost(postUrl: string, theme: "light" | "dark" = "light"): Promise<Buffer> {
  // 1. URL 객체를 사용해 안전하게 경로 파싱하기
  let parsedUrl: URL;
  try {
    let normalizedInput = postUrl.trim();
    if (!/^https?:\/\//i.test(normalizedInput)) {
      normalizedInput = `https://${normalizedInput}`;
    }
    parsedUrl = new URL(normalizedInput);
  } catch (e) {
    throw new Error("올바른 URL 형식이 아닙니다.");
  }

  // 2. 경로에서 빈 세그먼트 제거하고 텔레그램 포스트 ID 및 채널 정보 가져오기
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const filteredSegments = pathSegments.filter(s => s.toLowerCase() !== "s");
  if (filteredSegments.length < 2) {
    throw new Error("올바른 텔레그램 포스트 URL 형식이 아닙니다.");
  }
  const channelName = filteredSegments[filteredSegments.length - 2];
  const postId = filteredSegments[filteredSegments.length - 1];
  const postIdentifier = `${channelName}/${postId}`; // 예: "easynoscamai/1492"

  // 텔레그램 포스트 단일 임베드 URL로 표준화 (불필요한 타임라인/헤더/사이드바 등 완전 제거)
  const embedUrl = `https://telegram.me/${postIdentifier}?embed=1${theme === "dark" ? "&dark=1" : ""}`;

  try {
    const browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 564, height: 900 },
      deviceScaleFactor: 3,
      locale: "ko-KR",
      bypassCSP: true,
    });

    const page = await context.newPage();

    const bgColor = theme === "dark" ? "#0b1630" : "#ffffff";
    const textColor = theme === "dark" ? "#ffffff" : "#0f172a";

    try {
      await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      const cssContent = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

html,
body,
.tgme_widget_message_page {
    background: transparent !important;
    background-image: none !important;
    color: ${textColor} !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
}

.tgme_widget_message_page > :not(.tgme_widget_message_wrap) {
    display: none !important;
}

.tgme_widget_message_wrap > :not(.tgme_widget_message) {
    display: none !important;
}

body,
body *,
.tgme_widget_message,
.tgme_widget_message_text,
.tgme_widget_message_author,
.tgme_widget_message_meta {
    font-family: 'Pretendard', 'Noto Sans KR', sans-serif !important;
    letter-spacing: -0.3px !important;
}

.tgme_widget_message_wrap {
    padding: 12px !important;
    margin: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    background: transparent !important;
    box-sizing: border-box !important;
    display: block !important;
}

/* 텔레그램 카드 자체의 스타일링을 콤팩트하고 고급스럽게 정의 */
.tgme_widget_message {
    max-width: 540px !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 auto !important;
    box-sizing: border-box !important;
    background: ${bgColor} !important;
    border-radius: 12px !important;
    border: ${theme === 'dark' ? "1px solid #1e293b" : "1px solid #e2e8f0"} !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, ${theme === 'dark' ? '0.3' : '0.06'}) !important;
}

.tgme_widget_message_bubble {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
}

.tgme_widget_message_inline_button_wrap,
.tgme_widget_message_inline_button,
.tgme_widget_login,
.tgme_widget_message_popup {
    display: none !important;
}

/* 가독성을 높이기 위한 다크/라이트 텍스트 및 요소 색상 최적화 */
.tgme_widget_message_text {
    color: ${theme === 'dark' ? '#f8fafc' : '#0f172a'} !important;
}
.tgme_widget_message_author, 
.tgme_widget_message_author * {
    color: ${theme === 'dark' ? '#38bdf8' : '#0284c7'} !important;
    font-weight: 600 !important;
}
.tgme_widget_message_meta,
.tgme_widget_message_meta * {
    color: ${theme === 'dark' ? '#94a3b8' : '#64748b'} !important;
}`.trim();

      await page.addStyleTag({ content: cssContent });

      const selector = `.tgme_widget_message`;

      await page.waitForSelector(selector, { timeout: 15000 });

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

      const cardLocator = page.locator(".tgme_widget_message").first();
      await cardLocator.waitFor({ state: "visible", timeout: 15000 });

      // 뷰포트 너비를 564px로 잡고 카드가 안정적으로 로딩될 때까지 짧게 대기합니다.
      await page.setViewportSize({
        width: 564,
        height: 1200,
      });

      await page.waitForTimeout(1000);

      // 텔레그램 카드 메시지 엘리먼트 자체를 완벽하고 정밀하게 크롭하여 캡처합니다.
      // 이렇게 하면 상하좌우 그 어떤 불필요한 공백이나 오차도 근본적으로 존재하지 않고 포스트만 정확하게 잘려나옵니다.
      const screenshotBuffer = await cardLocator.screenshot({
        type: "png",
        omitBackground: true,
      });

      return screenshotBuffer;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.warn("[captureTelegramPost] Playwright failed, falling back to Microlink:", error);
    // 폴백 시에도 여백이 전혀 없는 완벽한 크롭을 위해 .tgme_widget_message 카드 자체를 크롭 영역으로 넘깁니다.
    return await captureViaMicrolink(embedUrl, ".tgme_widget_message", theme);
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
    const browser = await launchBrowser();

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
    const renderId = Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    renderDataStore.set(renderId, {
      videoId,
      title,
      theme,
      createdAt: Date.now()
    });

    const renderUrl = `${finalHost}/api/render-youtube-thumb?id=${renderId}`;
    
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
    const id = req.query.id as string;
    const cached = id ? renderDataStore.get(id) : null;

    const videoId = cached?.videoId || req.query.videoId as string || "dQw4w9WgXcQ";
    const title = cached?.title || req.query.title as string || "YouTube Video";
    const theme = (cached?.theme || req.query.theme as string || "light") as "light" | "dark";

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

  // Dynamic YouTube Community Post HTML serve endpoint (for Microlink fallback)
  app.get("/api/render-youtube-post", (req, res) => {
    const id = req.query.id as string;
    const cached = id ? renderDataStore.get(id) : null;

    const channelName = cached?.channelName || req.query.channelName as string || "YouTube Creator";
    const desc = (cached?.desc || req.query.desc as string || "").trim();
    const avatar = cached?.avatar || req.query.avatar as string || "";
    const theme = (cached?.theme || req.query.theme as string || "light") as "light" | "dark";
    const publishedTime = cached?.publishedTime || req.query.publishedTime as string || "";
    const voteCount = cached?.voteCount || req.query.voteCount as string || "";
    
    let postImages: string[] = [];
    if (cached?.postImages) {
      postImages = cached.postImages;
    } else {
      const rawPostImages = req.query.postImage;
      postImages = rawPostImages ? (Array.isArray(rawPostImages) ? rawPostImages as string[] : [rawPostImages as string]) : [];
    }

    const isDark = theme === "dark";
    const bgColor = isDark ? "#1f1f1f" : "#ffffff";
    const textColor = isDark ? "#f1f1f1" : "#0f0f0f";
    const subTextColor = isDark ? "#aaaaaa" : "#606060";
    const borderColor = isDark ? "#3f3f3f" : "#e5e5e5";

    const linkify = (text: string) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.replace(urlRegex, (url) => {
        return `<a href="${url}" style="color: #3ea6ff; text-decoration: none;" target="_blank">${url}</a>`;
      });
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
          
          body {
            margin: 0;
            padding: 40px;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: 'Pretendard', 'Noto Sans KR', sans-serif;
          }

          .card {
            width: 580px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-radius: 20px;
            padding: 20px 24px 14px 24px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, ${isDark ? "0.4" : "0.08"});
            box-sizing: border-box;
          }

          .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
          }

          .avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid ${borderColor};
          }

          .creator-info {
            display: flex;
            flex-direction: column;
          }

          .creator-title-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
          }

          .creator-name {
            font-size: 16px;
            font-weight: 700;
            color: ${textColor};
          }

          .published-bullet {
            font-size: 11px;
            color: ${subTextColor};
          }

          .published-time {
            font-size: 13px;
            color: ${subTextColor};
            font-weight: 400;
          }

          .post-badge {
            font-size: 12px;
            color: ${subTextColor};
            margin-top: 2px;
          }

          .content {
            font-size: 15px;
            line-height: 1.6;
            color: ${textColor};
            white-space: pre-wrap;
            word-break: break-word;
          }

          /* Post Images Styling */
          .post-images-container {
            margin-top: 16px;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid ${borderColor};
            box-sizing: border-box;
          }

          .post-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }

          /* Single image layout */
          .single-image {
            max-height: 480px;
          }
          .single-image .post-image {
            max-height: 480px;
            object-fit: contain;
            background: ${isDark ? "#0f0f0f" : "#f9f9f9"};
          }

          /* Multi images layout */
          .multi-images {
            display: grid;
            gap: 4px;
            height: 320px;
            background: ${isDark ? "#0f0f0f" : "#f9f9f9"};
          }

          .grid-2 {
            grid-template-columns: 1fr 1fr;
          }

          .grid-3 {
            grid-template-columns: 2fr 1fr;
          }
          .grid-3 .post-image-wrapper:nth-child(2) {
            grid-column: 2;
            grid-row: 1;
          }
          .grid-3 .post-image-wrapper:nth-child(3) {
            grid-column: 2;
            grid-row: 2;
          }

          .grid-4 {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
          }

          .post-image-wrapper {
            position: relative;
            overflow: hidden;
            height: 100%;
          }

          .more-images-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: 700;
          }

          .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid ${borderColor};
            padding-top: 12px;
            margin-top: 16px;
          }

          .actions {
            display: flex;
            align-items: center;
            gap: 18px;
          }

          .action-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            color: ${textColor};
            font-size: 13px;
            font-weight: 500;
          }

          .action-icon {
            width: 18px;
            height: 18px;
            color: ${isDark ? "#ffffff" : "#606060"};
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
        <div class="card" id="youtube-post-card">
          <div class="header">
            ${avatar ? `<img class="avatar" src="${avatar}" />` : `<div class="avatar" style="background:#ef4444;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:18px;">YT</div>`}
            <div class="creator-info">
              <div class="creator-title-row">
                <span class="creator-name">${escapeHtml(channelName)}</span>
                ${publishedTime ? `<span class="published-bullet">•</span><span class="published-time">${escapeHtml(publishedTime)}</span>` : ""}
              </div>
              <span class="post-badge">YouTube Community Post</span>
            </div>
          </div>
          <div class="content">${linkify(escapeHtml(desc))}</div>
          
          <!-- Render post images beautifully -->
          ${postImages.length === 1 ? `
            <div class="post-images-container single-image">
              <img src="${postImages[0]}" class="post-image" />
            </div>
          ` : ""}

          ${postImages.length > 1 ? `
            <div class="post-images-container multi-images grid-${Math.min(postImages.length, 4)}">
              ${postImages.slice(0, 4).map((img, idx) => `
                <div class="post-image-wrapper">
                  <img src="${img}" class="post-image" />
                  ${postImages.length > 4 && idx === 3 ? `
                    <div class="more-images-overlay">+${postImages.length - 4}</div>
                  ` : ""}
                </div>
              `).join("")}
            </div>
          ` : ""}

          <div class="footer">
            <div class="actions">
              <div class="action-btn">
                <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                <span>${escapeHtml(voteCount || "0")}</span>
              </div>
              <div class="action-btn">
                <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
              </div>
              <div class="action-btn">
                <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11.1z"/></svg>
              </div>
            </div>
            <span class="domain">youtube.com</span>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(htmlContent);
  });

  // Helper to extract video media from X post
  async function extractXVideoMedia(
    postUrl: string,
    theme: "light" | "dark" = "light"
  ) {
    const normalizedUrl = normalizeXPostUrl(postUrl);
    if (!normalizedUrl) {
      throw new Error("올바른 X(트위터) 게시물 URL 형식이 아닙니다.");
    }

    const postId = extractXPostId(postUrl);
    if (!postId) {
      throw new Error("X 게시물 ID를 추출할 수 없습니다.");
    }

    let videoData: any = null;

    // 1. Try api.vxtwitter.com
    try {
      const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${postId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      if (vxRes.ok) {
        const data = await vxRes.json() as any;
        if (data && data.media_extended && Array.isArray(data.media_extended)) {
          const videoMedia = data.media_extended.find((m: any) => m.type === "video" || m.type === "animated_gif");
          if (videoMedia && videoMedia.url) {
            videoData = {
              videoUrl: videoMedia.url,
              thumbnailUrl: videoMedia.thumbnail_url || data.mediaURLs?.[0] || "",
              durationMs: videoMedia.duration_millis || 0,
              width: videoMedia.size?.width,
              height: videoMedia.size?.height,
              tweetText: data.text || "",
              authorName: data.user_name || "X User",
              authorHandle: data.user_screen_name || "i",
              authorAvatar: data.user_profile_image_url || "",
              likes: data.likes || 0,
              retweets: data.retweets || 0,
              replies: data.replies || 0,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[extractXVideoMedia] vxtwitter fetch failed:", e);
    }

    // 2. Fallback to api.fxtwitter.com
    if (!videoData) {
      try {
        const fxRes = await fetch(`https://api.fxtwitter.com/status/${postId}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        if (fxRes.ok) {
          const fxJson = await fxRes.json() as any;
          const tweet = fxJson?.tweet;
          if (tweet && tweet.media?.videos && tweet.media.videos.length > 0) {
            const vid = tweet.media.videos[0];
            videoData = {
              videoUrl: vid.url,
              thumbnailUrl: vid.thumbnail_url || "",
              durationMs: (vid.duration || 0) * 1000,
              width: vid.width,
              height: vid.height,
              tweetText: tweet.text || "",
              authorName: tweet.author?.name || "X User",
              authorHandle: tweet.author?.screen_name || "i",
              authorAvatar: tweet.author?.avatar_url || "",
              likes: tweet.likes || 0,
              retweets: tweet.retweets || 0,
              replies: tweet.replies || 0,
            };
          }
        }
      } catch (e) {
        console.warn("[extractXVideoMedia] fxtwitter fetch failed:", e);
      }
    }

    if (!videoData || !videoData.videoUrl) {
      throw new Error("해당 X 게시글에서 동영상 미디어를 추출할 수 없습니다. 동영상이 포함된 X 게시글 링크인지 확인해주세요.");
    }

    // Format duration
    let durationFormatted = "";
    if (videoData.durationMs) {
      const totalSecs = Math.floor(videoData.durationMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      durationFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    // Format resolution
    let resolution = "";
    if (videoData.width && videoData.height) {
      resolution = `${videoData.width} x ${videoData.height}`;
      if (videoData.width >= 3840 || videoData.height >= 2160) {
        resolution += " (4K UHD)";
      } else if (videoData.width >= 1920 || videoData.height >= 1080) {
        resolution += " (Full HD)";
      } else if (videoData.width >= 1280 || videoData.height >= 720) {
        resolution += " (HD)";
      }
    }

    const finalVideoInfo = {
      ...videoData,
      durationFormatted,
      resolution,
    };

    // Capture screenshot of post for card view
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = await captureXPost(normalizedUrl, theme);
    } catch (e) {
      console.warn("captureXPost failed for video post:", e);
      screenshotBuffer = Buffer.from("");
    }

    return { videoInfo: finalVideoInfo, screenshotBuffer, normalizedUrl, postId };
  }

  // Telegram Video Extraction Helper
  function parseTelegramUrl(postUrl: string) {
    const match = postUrl.match(/(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([a-zA-Z0-9_]+)\/(\d+)/i);
    if (!match) return null;
    return { channel: match[1], postId: match[2] };
  }

  async function extractTelegramVideoMedia(
    postUrl: string,
    theme: "light" | "dark" = "light"
  ) {
    const parsed = parseTelegramUrl(postUrl);
    if (!parsed) {
      throw new Error("올바른 텔레그램 게시물 URL 형식이 아닙니다. (예: https://t.me/channel/123)");
    }

    const { channel, postId } = parsed;
    const embedUrl = `https://t.me/${channel}/${postId}?embed=1`;
    const normalizedUrl = `https://t.me/${channel}/${postId}`;

    let videoData: any = null;

    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const html = await res.text();

        // 1. Extract Video Source
        let videoUrl = "";
        const videoSrcMatch = html.match(/<video[^>]*src=["']([^"']+)["']/i) ||
                              html.match(/<source[^>]*src=["']([^"']+)["']/i) ||
                              html.match(/tgme_widget_message_video_player[\s\S]*?src=["']([^"']+)["']/i);
        
        if (videoSrcMatch) {
          videoUrl = videoSrcMatch[1];
        } else {
          // Fallback: Check https://t.me/s/channel/postId
          const sUrl = `https://t.me/s/${channel}/${postId}`;
          const sRes = await fetch(sUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (sRes.ok) {
            const sHtml = await sRes.text();
            const sVideoMatch = sHtml.match(/<video[^>]*src=["']([^"']+)["']/i) || sHtml.match(/<source[^>]*src=["']([^"']+)["']/i);
            if (sVideoMatch) {
              videoUrl = sVideoMatch[1];
            }
          }
        }

        if (videoUrl) {
          if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;

          // Thumbnail
          let thumbnailUrl = "";
          const thumbMatch = html.match(/tgme_widget_message_video_thumb[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/i) ||
                             html.match(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/i);
          if (thumbMatch) {
            thumbnailUrl = thumbMatch[1];
            if (thumbnailUrl.startsWith("//")) thumbnailUrl = "https:" + thumbnailUrl;
          }

          // Post Text
          let tweetText = "";
          const textMatch = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          if (textMatch) {
            tweetText = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
          }

          // Author
          let authorName = channel;
          const authorMatch = html.match(/<div class="tgme_widget_message_author_name"[^>]*>([\s\S]*?)<\/div>/i) ||
                              html.match(/<span class="tgme_widget_message_owner_name"[^>]*>([\s\S]*?)<\/span>/i);
          if (authorMatch) {
            authorName = authorMatch[1].replace(/<[^>]+>/g, "").trim() || channel;
          }

          let authorAvatar = "";
          const avatarImgMatch = html.match(/<img class="tgme_widget_message_user_photo"[^>]+src=["']([^"']+)["']/i);
          const avatarStyleMatch = html.match(/class="tgme_widget_message_user_photo[^"]*"[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/i);
          if (avatarImgMatch) {
            authorAvatar = avatarImgMatch[1];
          } else if (avatarStyleMatch) {
            authorAvatar = avatarStyleMatch[1];
          }

          let views = 0;
          const viewsMatch = html.match(/<span class="tgme_widget_message_views"[^>]*>([^<]+)<\/span>/i);
          if (viewsMatch) {
            const vStr = viewsMatch[1].trim().toUpperCase();
            if (vStr.endsWith("K")) views = Math.round(parseFloat(vStr) * 1000);
            else if (vStr.endsWith("M")) views = Math.round(parseFloat(vStr) * 1000000);
            else views = parseInt(vStr.replace(/,/g, ""), 10) || 0;
          }

          videoData = {
            videoUrl,
            thumbnailUrl,
            tweetText,
            authorName,
            authorHandle: channel,
            authorAvatar,
            views,
          };
        }
      }
    } catch (e) {
      console.warn("[extractTelegramVideoMedia] fetch failed:", e);
    }

    if (!videoData || !videoData.videoUrl) {
      throw new Error("해당 텔레그램 게시글에서 동영상 미디어를 추출할 수 없습니다. 동영상이 포함된 텔레그램 게시글 링크인지 확인해주세요.");
    }

    const finalVideoInfo = {
      ...videoData,
    };

    // Capture screenshot of post for card view
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = await captureTelegramPost(embedUrl, theme);
    } catch (e) {
      console.warn("captureTelegramPost failed for video post:", e);
      screenshotBuffer = Buffer.from("");
    }

    return { videoInfo: finalVideoInfo, screenshotBuffer, normalizedUrl, postId: `${channel}_${postId}` };
  }

  // Telegram Image Extraction Helper
  async function extractTelegramImageMedia(
    postUrl: string,
    theme: "light" | "dark" = "light"
  ) {
    const parsed = parseTelegramUrl(postUrl);
    if (!parsed) {
      throw new Error("올바른 텔레그램 게시물 URL 형식이 아닙니다. (예: https://t.me/channel/123)");
    }

    const { channel, postId } = parsed;
    const embedUrl = `https://t.me/${channel}/${postId}?embed=1`;
    const normalizedUrl = `https://t.me/${channel}/${postId}`;

    let imageData: any = null;

    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const html = await res.text();

        // 1. Extract Images
        const imageUrls: string[] = [];
        const bgMatches = [...html.matchAll(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi)];

        for (const m of bgMatches) {
          let imgUrl = m[1];
          if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;

          // Ignore emojis, user avatars, system icons
          if (
            imgUrl.includes("/emoji/") ||
            imgUrl.includes("user_photo") ||
            imgUrl.includes("icon-") ||
            imgUrl.includes("telegram.org/img/")
          ) {
            continue;
          }

          if (!imageUrls.includes(imgUrl)) {
            imageUrls.push(imgUrl);
          }
        }

        // Fallback: Check t.me/s/channel/postId
        if (imageUrls.length === 0) {
          const sUrl = `https://t.me/s/${channel}/${postId}`;
          const sRes = await fetch(sUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (sRes.ok) {
            const sHtml = await sRes.text();
            const sBgMatches = [...sHtml.matchAll(/background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/gi)];
            for (const m of sBgMatches) {
              let imgUrl = m[1];
              if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
              if (
                imgUrl.includes("/emoji/") ||
                imgUrl.includes("user_photo") ||
                imgUrl.includes("icon-") ||
                imgUrl.includes("telegram.org/img/")
              ) {
                continue;
              }
              if (!imageUrls.includes(imgUrl)) {
                imageUrls.push(imgUrl);
              }
            }
          }
        }

        if (imageUrls.length > 0) {
          // Post Text
          let tweetText = "";
          const textMatch = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          if (textMatch) {
            tweetText = textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
          }

          // Author
          let authorName = channel;
          const authorMatch = html.match(/<div class="tgme_widget_message_author_name"[^>]*>([\s\S]*?)<\/div>/i) ||
                              html.match(/<span class="tgme_widget_message_owner_name"[^>]*>([\s\S]*?)<\/span>/i);
          if (authorMatch) {
            authorName = authorMatch[1].replace(/<[^>]+>/g, "").trim() || channel;
          }

          let authorAvatar = "";
          const avatarImgMatch = html.match(/<img class="tgme_widget_message_user_photo"[^>]+src=["']([^"']+)["']/i);
          const avatarStyleMatch = html.match(/class="tgme_widget_message_user_photo[^"]*"[^>]*style=["'][^"']*background-image:\s*url\((?:["'])?([^"'\)]+)(?:["'])?\)/i);
          if (avatarImgMatch) {
            authorAvatar = avatarImgMatch[1];
          } else if (avatarStyleMatch) {
            authorAvatar = avatarStyleMatch[1];
          }

          let views = 0;
          const viewsMatch = html.match(/<span class="tgme_widget_message_views"[^>]*>([^<]+)<\/span>/i);
          if (viewsMatch) {
            const vStr = viewsMatch[1].trim().toUpperCase();
            if (vStr.endsWith("K")) views = Math.round(parseFloat(vStr) * 1000);
            else if (vStr.endsWith("M")) views = Math.round(parseFloat(vStr) * 1000000);
            else views = parseInt(vStr.replace(/,/g, ""), 10) || 0;
          }

          imageData = {
            imageUrls,
            primaryImageUrl: imageUrls[0],
            tweetText,
            authorName,
            authorHandle: channel,
            authorAvatar,
            views,
          };
        }
      }
    } catch (e) {
      console.warn("[extractTelegramImageMedia] fetch failed:", e);
    }

    if (!imageData || !imageData.imageUrls || imageData.imageUrls.length === 0) {
      throw new Error("해당 텔레그램 게시글에서 첨부 이미지를 추출할 수 없습니다. 이미지가 포함된 텔레그램 게시글 링크인지 확인해주세요.");
    }

    // Capture screenshot of post for card view
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = await captureTelegramPost(embedUrl, theme);
    } catch (e) {
      console.warn("captureTelegramPost failed for image post:", e);
      screenshotBuffer = Buffer.from("");
    }

    return { imageInfo: imageData, screenshotBuffer, normalizedUrl, postId: `${channel}_${postId}` };
  }

  // Animated GIF Conversion Endpoint using pre-downloaded video & native ffmpeg
  app.post("/api/convert-to-gif", async (req, res) => {
    const { videoUrl, startTime = 0, duration = 5, scale = 480, fps = 10 } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: "videoUrl은 필수 항목입니다." });
    }

    const isFullDuration = duration === "full" || duration === "all" || duration === 0 || duration === "0";
    const clampedStart = Math.max(0, Number(startTime) || 0);
    const clampedDuration = isFullDuration ? 0 : Math.min(60, Math.max(1, Number(duration) || 5)); // 1 ~ 60 secs max
    const clampedScale = Math.min(800, Math.max(240, Number(scale) || 480));
    const clampedFps = Math.min(20, Math.max(5, Number(fps) || 10));

    const tmpInput = path.join("/tmp", `x_vid_in_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
    const tmpOutput = path.join("/tmp", `x_vid_out_${Date.now()}_${Math.random().toString(36).substring(7)}.gif`);

    try {
      // 1. Download video stream directly to file with zero V8 heap overhead
      console.log(`[GIF Conversion] Downloading video stream from: ${videoUrl}`);
      const vidRes = await fetch(videoUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://x.com/",
        },
      });

      if (!vidRes.ok) {
        throw new Error(`동영상 파일 다운로드 실패 (HTTP ${vidRes.status})`);
      }

      if (!vidRes.body) {
        throw new Error("동영상 데이터 스트림을 수신하지 못했습니다.");
      }

      const fileStream = fs.createWriteStream(tmpInput);
      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb(vidRes.body as any);

      await new Promise<void>((resolve, reject) => {
        nodeStream.pipe(fileStream);
        nodeStream.on("error", (e) => reject(new Error(`스트림 수신 오류: ${e.message}`)));
        fileStream.on("finish", () => resolve());
        fileStream.on("error", (e) => reject(new Error(`파일 저장 오류: ${e.message}`)));
      });

      const inputStat = fs.statSync(tmpInput);
      if (!inputStat || inputStat.size === 0) {
        throw new Error("다운로드한 동영상 파일 크기가 0 bytes 입니다.");
      }
      console.log(`[GIF Conversion] Video downloaded successfully (${(inputStat.size / (1024 * 1024)).toFixed(2)} MB)`);

      // 2. Locate ffmpeg binary safely using static/installed binary
      const { spawn } = await import("child_process");
      const ffmpegBin = getFfmpegBin();

      const ffmpegArgs = [
        "-y",
        "-ss", String(clampedStart),
        ...(isFullDuration ? [] : ["-t", String(clampedDuration)]),
        "-i", tmpInput,
        "-vf", `fps=${clampedFps},scale=${clampedScale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse`,
        tmpOutput
      ];

      console.log(`[GIF Conversion] Executing ${ffmpegBin} with args:`, ffmpegArgs.join(" "));

      await new Promise<void>((resolve, reject) => {
        const ff = spawn(ffmpegBin, ffmpegArgs);
        let errLog = "";

        ff.stderr.on("data", (d) => {
          errLog += d.toString();
        });

        ff.on("close", (code) => {
          if (code === 0 && fs.existsSync(tmpOutput)) {
            resolve();
          } else {
            reject(new Error(`ffmpeg 변환 실패 (code ${code}): ${errLog.slice(-300)}`));
          }
        });

        ff.on("error", (e) => reject(e));
      });

      const gifBuffer = fs.readFileSync(tmpOutput);
      const gifFileId = `x_gif_${Date.now()}_${Math.random().toString(36).substring(7)}.gif`;
      const storeDir = path.join("/tmp", "gif_store");
      fs.mkdirSync(storeDir, { recursive: true });
      fs.writeFileSync(path.join(storeDir, gifFileId), gifBuffer);

      // Clean up temporary processing files
      if (fs.existsSync(tmpInput)) fs.unlink(tmpInput, () => {});
      if (fs.existsSync(tmpOutput)) fs.unlink(tmpOutput, () => {});

      const sizeInMb = (gifBuffer.length / (1024 * 1024)).toFixed(2);
      const gifUrlPath = `/api/get-gif/${gifFileId}`;
      const base64Gif = gifBuffer.length < 15 * 1024 * 1024
        ? `data:image/gif;base64,${gifBuffer.toString("base64")}`
        : gifUrlPath;

      res.json({
        success: true,
        gifUrl: gifUrlPath,
        gifDataUrl: base64Gif,
        filename: `x-video-${Date.now()}.gif`,
        sizeMb: `${sizeInMb} MB`,
        sizeBytes: gifBuffer.length,
        durationSec: clampedDuration,
        scale: clampedScale,
        fps: clampedFps
      });
    } catch (e: any) {
      console.error("[GIF Conversion Error]", e);
      if (fs.existsSync(tmpInput)) fs.unlink(tmpInput, () => {});
      if (fs.existsSync(tmpOutput)) fs.unlink(tmpOutput, () => {});

      res.status(500).json({
        success: false,
        error: e.message || "Animated GIF 변환 중 오류가 발생했습니다."
      });
    }
  });

  // Serve generated Animated GIF file endpoint
  app.get("/api/get-gif/:fileId", (req, res) => {
    const { fileId } = req.params;
    const safeFile = path.basename(fileId);
    const filePath = path.join("/tmp", "gif_store", safeFile);

    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(filePath);
    } else {
      res.status(404).send("GIF 파일을 찾을 수 없습니다.");
    }
  });

  // Video Proxy Stream Endpoint for HTML5 Video Player
  app.get("/api/stream-video", async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).send("videoUrl parameter is required");
    }

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range as string;
      }

      const response = await fetch(videoUrl, { headers });

      if (!response.ok && response.status !== 206) {
        return res.status(response.status).send("Failed to stream video source");
      }

      res.status(response.status);

      const forwardHeaders = ["content-type", "content-length", "content-range", "accept-ranges"];
      forwardHeaders.forEach((h) => {
        const val = response.headers.get(h);
        if (val) res.setHeader(h, val);
      });

      if (!res.getHeader("content-type")) {
        res.setHeader("Content-Type", "video/mp4");
      }
      res.setHeader("Accept-Ranges", "bytes");

      if (response.body) {
        const { Readable } = await import("stream");
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (e: any) {
      console.error("[Video Proxy Stream Error]", e);
      if (!res.headersSent) {
        res.status(500).send("Video streaming error: " + e.message);
      }
    }
  });

  // Direct MP4 Video Download Proxy Endpoint
  app.get("/api/download-video", async (req, res) => {
    const videoUrl = req.query.url as string;
    const filename = (req.query.filename as string) || "x-video.mp4";

    if (!videoUrl) {
      return res.status(400).send("Video URL is required");
    }

    try {
      const response = await fetch(videoUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });

      if (!response.ok) {
        return res.status(response.status).send("Failed to stream video file");
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (e: any) {
      console.error("Failed to proxy video download:", e);
      res.status(500).send("Error downloading video file");
    }
  });

  // Direct Image Download Proxy Endpoint
  app.get("/api/download-image", async (req, res) => {
    const imageUrl = req.query.url as string;
    const filename = (req.query.filename as string) || "telegram-image.jpg";

    if (!imageUrl) {
      return res.status(400).send("Image URL is required");
    }

    try {
      const response = await fetch(imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });

      if (!response.ok) {
        return res.status(response.status).send("Failed to stream image file");
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (e: any) {
      console.error("Failed to proxy image download:", e);
      res.status(500).send("Error downloading image file");
    }
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
      let videoInfo: any = undefined;
      let imageInfo: any = undefined;

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
      const hostUrl = `${protocol}://${host}`;

      if (targetPlatform === "x_video") {
        const result = await extractXVideoMedia(url, selectedTheme);
        buffer = result.screenshotBuffer;
        videoInfo = result.videoInfo;
        finalUrl = result.normalizedUrl;
        finalPostId = result.postId;
      } else if (targetPlatform === "telegram_video") {
        const result = await extractTelegramVideoMedia(url, selectedTheme);
        buffer = result.screenshotBuffer;
        videoInfo = result.videoInfo;
        finalUrl = result.normalizedUrl;
        finalPostId = result.postId;
      } else if (targetPlatform === "telegram_image") {
        const result = await extractTelegramImageMedia(url, selectedTheme);
        buffer = result.screenshotBuffer;
        imageInfo = result.imageInfo;
        finalUrl = result.normalizedUrl;
        finalPostId = result.postId;
      } else if (targetPlatform === "x") {
        const normalized = normalizeXPostUrl(url);
        if (!normalized) {
          return res.status(400).json({ error: "올바른 X 게시물 URL 형식이 아닙니다." });
        }
        buffer = await captureXPost(normalized, selectedTheme);
        finalUrl = normalized;
        finalPostId = extractXPostId(url) || "post";
      } else if (targetPlatform === "youtube") {
        buffer = await captureYoutubePost(url, selectedTheme, hostUrl);
      } else if (targetPlatform === "telegram") {
        buffer = await captureTelegramPost(url, selectedTheme);
      } else if (targetPlatform === "youtube_thumb") {
        const result = await captureYoutubeThumbnail(url, selectedTheme, hostUrl);
        buffer = result.buffer;
        finalUrl = result.watchUrl;
        finalPostId = result.videoId;
        title = result.title;
      } else {
        return res.status(400).json({ error: "지원하지 않는 플랫폼입니다." });
      }

      const isSvg = buffer.length > 0 && (buffer.toString("utf-8").trim().startsWith("<svg") || buffer.toString("utf-8").trim().startsWith("<?xml"));
      const mimeType = isSvg ? "image/svg+xml" : "image/png";
      const base64Image = buffer.length > 0 ? buffer.toString("base64") : "";

      res.json({
        success: true,
        image: base64Image ? `data:${mimeType};base64,${base64Image}` : undefined,
        filename: `${targetPlatform}-post-${finalPostId}.${isSvg ? "svg" : "png"}`,
        postId: finalPostId,
        normalizedUrl: finalUrl,
        title: title || undefined,
        platform: targetPlatform,
        videoInfo,
        imageInfo
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
