import React, { useState, useEffect } from "react";
import {
  Camera,
  Twitter,
  Youtube,
  Send,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Sun,
  Moon,
  Palette,
  Check,
  AlertCircle,
  History,
  Sparkles,
  Share2,
  Image,
  Video,
  Film,
} from "lucide-react";

import { Platform, Theme, ScreenshotHistoryItem, VideoMediaInfo, ImageMediaInfo } from "./types";
import PlatformTabs from "./components/PlatformTabs";
import PresetUrls from "./components/PresetUrls";
import HistoryPanel from "./components/HistoryPanel";

// Gradient configurations for the backdrop preview
const GRADIENTS = [
  { id: "none", name: "없음 (Clean RAW)", class: "bg-slate-950/20 border border-slate-800" },
  { id: "silver", name: "Classic Silver", class: "bg-gradient-to-tr from-zinc-300 via-slate-200 to-neutral-300" },
  { id: "charcoal", name: "Cool Charcoal", class: "bg-gradient-to-tr from-slate-800 via-zinc-700 to-slate-900" },
  { id: "cloud", name: "Soft Cloud", class: "bg-gradient-to-tr from-neutral-100 via-slate-100 to-zinc-200" },
  { id: "midnight", name: "Midnight Gray", class: "bg-gradient-to-tr from-slate-950 via-slate-900 to-zinc-800" },
  { id: "deep", name: "Deep Space", class: "bg-gradient-to-tr from-slate-900 via-slate-850 to-slate-700" },
  { id: "aurora", name: "Aurora Teal", class: "bg-gradient-to-tr from-teal-400 via-emerald-400 to-cyan-500" },
];

// Helper to detect platform from URL
const detectPlatform = (urlStr: string): Platform | null => {
  const clean = urlStr.toLowerCase().trim();
  if (!clean) return null;
  if (clean.includes("x.com") || clean.includes("twitter.com")) {
    return "x";
  }
  if (clean.includes("youtube.com") || clean.includes("youtu.be")) {
    if (clean.includes("/post/") || clean.includes("/community") || clean.includes("/backstage")) {
      return "youtube";
    }
    return "youtube_thumb";
  }
  if (clean.includes("t.me") || clean.includes("telegram.me") || clean.includes("telegram.dog")) {
    return "telegram";
  }
  return null;
};

// Helper to convert SVG data URL (base64) to PNG data URL client-side
const convertSvgToPng = (svgDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // Decode SVG content from the data URL safely
      let svgText = "";
      if (svgDataUrl.startsWith("data:image/svg+xml;base64,")) {
        const base64Str = svgDataUrl.substring("data:image/svg+xml;base64,".length);
        // Safe UTF-8 decoding from base64 to avoid corrupting Korean characters
        const binStr = atob(base64Str);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        svgText = new TextDecoder("utf-8").decode(bytes);
      } else if (svgDataUrl.startsWith("data:image/svg+xml,")) {
        svgText = decodeURIComponent(svgDataUrl.substring("data:image/svg+xml,".length));
      } else {
        svgText = svgDataUrl;
      }

      // XML 파싱 에러의 주범인 &nbsp; 를 완벽 방지하기 위해 &#160; 또는 일반 공백으로 치환
      svgText = svgText.replace(/&nbsp;/g, "&#160;");

      // Extract explicit design height and width attributes from the SVG text as a solid fallback
      let width = 600;
      let height = 400;
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        
        // 파싱 에러 검사 및 특수 유니코드 대체
        const parserError = doc.querySelector("parsererror");
        if (parserError) {
          console.warn("SVG XML Parsing Error detected, attempting to sanitize & rebuild:", parserError.textContent);
          svgText = svgText
            .replace(/&middot;/g, "&#183;")
            .replace(/&lsquo;/g, "&#8216;")
            .replace(/&rsquo;/g, "&#8217;")
            .replace(/&ldquo;/g, "&#8220;")
            .replace(/&rdquo;/g, "&#8221;");
        }

        const svgElement = doc.querySelector("svg");
        if (svgElement) {
          width = parseFloat(svgElement.getAttribute("width") || "600");
          height = parseFloat(svgElement.getAttribute("height") || "400");
        }
      } catch (e) {
        console.warn("Failed to parse SVG dimensions for fallback rendering:", e);
      }

      const img = new Image();
      // IMPORTANT: DO NOT set crossOrigin under any circumstances for data URLs as it triggers browser CORS loading errors.
      
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = 2; // High-DPI scale for ultra-crisp output matching natural rendering quality!
          
          const finalWidth = img.naturalWidth || width || img.width || 600;
          const finalHeight = img.naturalHeight || height || img.height || 400;

          canvas.width = finalWidth * scale;
          canvas.height = finalHeight * scale;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context is null"));
            return;
          }

          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

          const pngDataUrl = canvas.toDataURL("image/png");
          resolve(pngDataUrl);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = (err) => {
        console.error("Failed to load SVG data URL as Image client-side:", err);
        reject(new Error("Failed to load SVG as an image on client-side"));
      };

      // Safely encode the SVG to clean Base64 with UTF-8 support
      const utf8Bytes = new TextEncoder().encode(svgText);
      let binary = "";
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const safeBase64 = btoa(binary);
      img.src = `data:image/svg+xml;base64,${safeBase64}`;
    } catch (err) {
      reject(err);
    }
  });
};

export default function App() {
  // Input Form States
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("auto");
  const [theme, setTheme] = useState<Theme>("light");
  const [selectedGradient, setSelectedGradient] = useState("silver");

  // Status and Result States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Current Screenshot result
  const [activeScreenshot, setActiveScreenshot] = useState<{
    imageUrl?: string;
    filename: string;
    normalizedUrl: string;
    postId: string;
    platform?: Platform;
    videoInfo?: VideoMediaInfo;
    imageInfo?: ImageMediaInfo;
  } | null>(null);

  // Copy to clipboard status
  const [copyStatus, setCopyStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");

  // Display Modes
  const [videoDisplayMode, setVideoDisplayMode] = useState<"gif" | "player">("gif");
  const [imageDisplayMode, setImageDisplayMode] = useState<"gallery" | "card">("gallery");
  const [imageCopyIndex, setImageCopyIndex] = useState<number | null>(null);

  // GIF Conversion States
  const [gifStartTime, setGifStartTime] = useState<number>(0);
  const [gifDuration, setGifDuration] = useState<number | "full">(5);
  const [gifScale, setGifScale] = useState<number>(480);
  const [gifFps, setGifFps] = useState<number>(10);
  const [gifConverting, setGifConverting] = useState<boolean>(false);
  const [gifResult, setGifResult] = useState<{
    gifUrl?: string;
    gifDataUrl: string;
    filename: string;
    sizeMb: string;
  } | null>(null);
  const [gifCopyStatus, setGifCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleConvertToGif = async (overrideParams?: {
    videoUrl?: string;
    startTime?: number;
    duration?: number | "full";
    scale?: number;
    fps?: number;
  }) => {
    const targetVideoUrl = overrideParams?.videoUrl || activeScreenshot?.videoInfo?.videoUrl;
    if (!targetVideoUrl) return;

    setGifConverting(true);
    setGifCopyStatus("idle");

    const reqStartTime = overrideParams?.startTime ?? gifStartTime;
    const reqDuration = overrideParams?.duration ?? gifDuration;
    const reqScale = overrideParams?.scale ?? gifScale;
    const reqFps = overrideParams?.fps ?? gifFps;

    try {
      const res = await fetch("/api/convert-to-gif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: targetVideoUrl,
          startTime: reqStartTime,
          duration: reqDuration,
          scale: reqScale,
          fps: reqFps,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "GIF 변환에 실패했습니다.");
      }

      setGifResult({
        gifUrl: data.gifUrl,
        gifDataUrl: data.gifDataUrl,
        filename: `video-${activeScreenshot?.postId || Date.now()}.gif`,
        sizeMb: data.sizeMb,
      });
    } catch (e: any) {
      console.error("GIF conversion failed:", e);
    } finally {
      setGifConverting(false);
    }
  };

  // Auto convert to Animated GIF when video media is loaded
  useEffect(() => {
    if (activeScreenshot?.videoInfo?.videoUrl) {
      setVideoDisplayMode("gif");
      const vUrl = activeScreenshot.videoInfo.videoUrl;
      const totalSecs = Math.max(1, Math.floor((activeScreenshot.videoInfo.durationMs || 10000) / 1000));
      const fullDuration = Math.min(30, totalSecs); // 전체 재생 길이 (최대 30초)
      const scale = 480; // 중간 수준 해상도 (480p)
      const fps = 10;   // 중간 수준 프레임 (10 FPS)

      setGifDuration(fullDuration);
      setGifStartTime(0);
      setGifScale(scale);
      setGifFps(fps);

      handleConvertToGif({
        videoUrl: vUrl,
        startTime: 0,
        duration: fullDuration,
        scale,
        fps,
      });
    } else {
      setGifResult(null);
    }
  }, [activeScreenshot?.videoInfo?.videoUrl]);

  const handleCopyGifToClipboard = async () => {
    const srcUrl = gifResult?.gifUrl || gifResult?.gifDataUrl;
    if (!srcUrl) return;
    try {
      const res = await fetch(srcUrl);
      const blob = await res.blob();
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      } catch (err) {
        // Fallback to canvas PNG blob copy
        const img = new Image();
        img.src = srcUrl;
        await new Promise((resolve) => { img.onload = resolve; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        await new Promise<void>((resolve) => {
          canvas.toBlob(async (pngBlob) => {
            if (pngBlob) {
              await navigator.clipboard.write([
                new ClipboardItem({ "image/png": pngBlob }),
              ]);
            }
            resolve();
          }, "image/png");
        });
      }
      setGifCopyStatus("copied");
      setTimeout(() => setGifCopyStatus("idle"), 3000);
    } catch (e) {
      console.error("Copy GIF failed:", e);
      setGifCopyStatus("error");
      setTimeout(() => setGifCopyStatus("idle"), 3000);
    }
  };

  // History State
  const [history, setHistory] = useState<ScreenshotHistoryItem[]>([]);

  // Load history from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("screenshot_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load screenshot history", e);
    }
  }, []);

  // Save history to local storage when changed
  const saveHistory = (newHistory: ScreenshotHistoryItem[]) => {
    let currentHistory = [...newHistory];
    setHistory(currentHistory);
    
    // Attempt saving to localStorage with fallback for quota issues
    while (currentHistory.length > 0) {
      try {
        localStorage.setItem("screenshot_history", JSON.stringify(currentHistory));
        break; // Successfully saved!
      } catch (e: any) {
        // If quota exceeded, discard the oldest item and try again
        const isQuotaError = e.name === "QuotaExceededError" || 
                             e.name === "NS_ERROR_DOM_QUOTA_REACHED" || 
                             e.code === 22 || 
                             e.code === 1014;
        if (isQuotaError) {
          console.warn("Local storage quota exceeded. Pruning oldest screenshot history item.");
          currentHistory.pop(); // Remove the oldest item (last item in list)
          setHistory(currentHistory); // Update state to match what was actually saved
        } else {
          console.error("Failed to save screenshot history due to another error", e);
          break;
        }
      }
    }

    if (currentHistory.length === 0 && newHistory.length > 0) {
      try {
        localStorage.removeItem("screenshot_history");
      } catch (e) {}
    }
  };

  // Loading screen log steps simulator
  const loadingSteps = [
    "입력된 URL 및 파라미터 유효성 검사 중...",
    "서버 백엔드에서 Headless Chromium 브라우저 구동 중...",
    "소셜 미디어 대상 게시글 페이지에 접속하는 중 (우회 라우트 설정)...",
    "웹 레이아웃 로딩 및 Pretendard / Noto Sans 폰트 엔진 주입 완료...",
    "미디어 에셋 및 웹 컴포넌트 렌더링 동적 크기 안정화 대기 중...",
    "고해상도 2배수 픽셀(DPR 2) 스크린샷 캡처 및 PNG 이미지 버퍼 디코딩 중...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Handle capturing
  const handleCapture = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError("올바른 소셜 미디어 게시글 링크를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopyStatus("idle");
    setGifResult(null);
    setGifStartTime(0);

    // Smooth scroll to preview workspace on mobile/tablet so user sees live logs & result
    setTimeout(() => {
      const previewPanel = document.getElementById("preview-workspace-panel");
      if (previewPanel) {
        previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);

    try {
      const response = await fetch("/api/screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          platform,
          theme,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "스크린샷 캡처에 실패했습니다.");
      }

      let imageUrl = data.image || data.videoInfo?.thumbnailUrl || "";
      let filename = data.filename;

      if (imageUrl && (imageUrl.startsWith("data:image/svg+xml") || filename.endsWith(".svg"))) {
        console.log("SVG detected from server. Converting to high-DPI PNG on client-side...");
        try {
          imageUrl = await convertSvgToPng(imageUrl);
          filename = filename.replace(/\.svg$/, ".png");
        } catch (convErr) {
          console.error("Failed to convert SVG to PNG client-side:", convErr);
        }
      }

      const newScreenshot = {
        imageUrl,
        filename,
        normalizedUrl: data.normalizedUrl,
        postId: data.postId,
        platform: data.platform || platform,
        videoInfo: data.videoInfo,
        imageInfo: data.imageInfo,
      };

      setActiveScreenshot(newScreenshot);

      // Add to history
      const historyItem: ScreenshotHistoryItem = {
        id: Date.now().toString(),
        url: url.trim(),
        platform: data.platform || platform,
        theme,
        timestamp: new Date().toISOString(),
        imageUrl: imageUrl || data.videoInfo?.thumbnailUrl || data.imageInfo?.primaryImageUrl || "",
        filename,
        normalizedUrl: data.normalizedUrl,
        videoInfo: data.videoInfo,
        imageInfo: data.imageInfo,
      };

      const updatedHistory = [historyItem, ...history.filter((h) => h.url !== url.trim())].slice(0, 6);
      saveHistory(updatedHistory);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "서버와 통신하는 중 예상치 못한 에러가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // Select item from history
  const handleSelectHistory = (item: ScreenshotHistoryItem) => {
    setUrl(item.url);
    setPlatform(item.platform);
    setTheme(item.theme);
    setActiveScreenshot({
      imageUrl: item.imageUrl,
      filename: item.filename,
      normalizedUrl: item.normalizedUrl,
      postId: item.filename.replace(`${item.platform}-post-`, "").replace(".png", ""),
      videoInfo: item.videoInfo,
    });
    setError(null);
    setCopyStatus("idle");
  };

  // Delete single history item
  const handleDeleteHistory = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    saveHistory(updated);
  };

  // Clear all history items
  const handleClearAllHistory = () => {
    if (window.confirm("모든 캡처 이력을 삭제하시겠습니까?")) {
      saveHistory([]);
    }
  };

  // Download with on-the-fly client-side conversion as a bulletproof failsafe!
  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!activeScreenshot) return;

    if (activeScreenshot.imageUrl.startsWith("data:image/svg+xml") || activeScreenshot.filename.endsWith(".svg")) {
      e.preventDefault();
      try {
        console.log("[Failsafe Download] Actively converting SVG to high-DPI PNG on-the-fly...");
        const pngUrl = await convertSvgToPng(activeScreenshot.imageUrl);
        const cleanFilename = activeScreenshot.filename.replace(/\.svg$/, ".png");
        
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = cleanFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Update active screenshot state so future clicks don't need re-conversion
        setActiveScreenshot((prev) =>
          prev ? { ...prev, imageUrl: pngUrl, filename: cleanFilename } : null
        );
      } catch (err) {
        console.error("[Failsafe Download] Conversion failed, fallback to native SVG download:", err);
        const link = document.createElement("a");
        link.href = activeScreenshot.imageUrl;
        link.download = activeScreenshot.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

// Direct PNG Copy to Clipboard for any image URL (with Canvas drawing fallback)
  const copyImageToClipboard = async (imageUrl: string) => {
    setCopyStatus("loading");
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";
      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: blob,
        }),
      ]);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch (err) {
      console.warn("Clipboard copy via Fetch Blob failed, trying canvas rendering fallback...", err);
      try {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(async (b) => {
                if (b) {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({
                        ["image/png"]: b,
                      }),
                    ]);
                    setCopyStatus("copied");
                    setTimeout(() => setCopyStatus("idle"), 2500);
                  } catch (e2) {
                    console.error("Canvas fallback clipboard copy failed:", e2);
                    setCopyStatus("error");
                    setTimeout(() => setCopyStatus("idle"), 2500);
                  }
                } else {
                  setCopyStatus("error");
                  setTimeout(() => setCopyStatus("idle"), 2500);
                }
              }, "image/png");
            } else {
              setCopyStatus("error");
              setTimeout(() => setCopyStatus("idle"), 2500);
            }
          } catch (e1) {
            console.error("Canvas context setup failed:", e1);
            setCopyStatus("error");
            setTimeout(() => setCopyStatus("idle"), 2500);
          }
        };
        img.onerror = () => {
          console.error("Image loading failed for clipboard fallback");
          setCopyStatus("error");
          setTimeout(() => setCopyStatus("idle"), 2500);
        };
        img.src = imageUrl;
      } catch (fallbackErr) {
        console.error("All copy strategies exhausted:", fallbackErr);
        setCopyStatus("error");
        setTimeout(() => setCopyStatus("idle"), 2500);
      }
    }
  };

  // Direct PNG Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!activeScreenshot) return;
    await copyImageToClipboard(activeScreenshot.imageUrl);
  };

  // Intent share URL builders
  const getXRepostUrl = () => {
    if (!activeScreenshot) return "";
    return `https://x.com/intent/retweet?tweet_id=${activeScreenshot.postId}`;
  };

  const getXQuoteUrl = () => {
    if (!activeScreenshot) return "";
    let text = "멋진 스크린샷 카드로 캡처했습니다. 📸✨";
    if (platform === "youtube") {
      text = "YouTube 커뮤니티 포스트를 멋진 스크린샷 카드로 생성했습니다. 📸✨";
    } else if (platform === "youtube_thumb") {
      text = "YouTube 비디오 썸네일을 멋진 스크린샷 카드로 생성했습니다. 📸✨";
    } else if (platform === "telegram") {
      text = "Telegram 포스트를 멋진 스크린샷 카드로 생성했습니다. 📸✨";
    }
    return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(
      activeScreenshot.normalizedUrl
    )}`;
  };

  // Auto-detect platform when pasting URL
  const handleUrlChange = (val: string) => {
    setUrl(val);
    if (platform !== "auto") {
      const detected = detectPlatform(val);
      if (detected) {
        setPlatform(detected);
      }
    }
  };

  const activeGradientClass = GRADIENTS.find((g) => g.id === selectedGradient)?.class || GRADIENTS[0].class;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-slate-200 selection:text-slate-900">
      {/* Sleek Top Banner */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 rounded-xl shadow-sm border border-slate-700">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display tracking-tight text-slate-900 flex items-center gap-2">
                Social Screenshot Studio
                <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-mono font-medium">
                  v2.0
                </span>
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                소셜 미디어 포스트를 깔끔한 고해상도 디자인 에셋으로 변환하세요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono font-semibold text-slate-500 hidden sm:inline">Playwright Server Active</span>
            <span className="text-xs font-mono font-semibold text-slate-500 inline sm:hidden">Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Controls & Input Panel */}
        <section className="col-span-1 lg:col-span-5 flex flex-col gap-6" id="controls-panel">
          
          {/* Main Form Box */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-600" />
                스크린샷 생성기
              </h2>
              <p className="text-xs text-slate-500">
                원하는 소셜 미디어 플랫폼과 주소를 입력해주세요.
              </p>
            </div>

            <form onSubmit={handleCapture} className="space-y-6">
              {/* Platform Switcher */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  1. 플랫폼 선택
                </label>
                <PlatformTabs activePlatform={platform} onChange={setPlatform} />
              </div>

              {/* URL Input Box */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  2. 포스트 URL 주소
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder={
                      platform === "auto"
                        ? "여기에 소셜 미디어 링크를 붙여넣으세요 (자동 감지)"
                        : platform === "x"
                        ? "https://x.com/username/status/1234567890"
                        : platform === "x_video"
                        ? "https://x.com/username/status/1234567890 (X 동영상)"
                        : platform === "youtube"
                        ? "https://www.youtube.com/post/Ugkx..."
                        : platform === "youtube_thumb"
                        ? "https://www.youtube.com/watch?v=dtp6b76pMak"
                        : platform === "telegram_video"
                        ? "https://t.me/telegram/220 (Telegram 동영상)"
                        : platform === "telegram_image"
                        ? "https://t.me/telegram/200 (Telegram 이미지)"
                        : "https://telegram.me/s/channel/123 (또는 telegram.me/channel/123)"
                    }
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl py-3 pl-4 pr-10 text-sm focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/15 transition-all font-mono"
                    required
                  />
                  <div className="absolute right-3.5 top-3.5 text-slate-400">
                    {(() => {
                      const det = detectPlatform(url);
                      const current = platform === "auto" ? det : platform;
                      if (current === "x" || current === "x_video") return <Twitter className="w-4 h-4 text-sky-500" />;
                      if (current === "youtube") return <Youtube className="w-4 h-4 text-rose-500" />;
                      if (current === "youtube_thumb") return <Image className="w-4 h-4 text-red-500" />;
                      if (current === "telegram" || current === "telegram_video") return <Send className="w-4 h-4 text-cyan-500" />;
                      if (current === "telegram_image") return <Image className="w-4 h-4 text-emerald-500" />;
                      return <Sparkles className="w-4 h-4 text-violet-500 animate-pulse" />;
                    })()}
                  </div>
                </div>

                {/* Real-time platform auto-detection feedback pill */}
                {(() => {
                  if (platform !== "auto") return null;
                  const det = detectPlatform(url);
                  if (!det) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-50/80 border border-violet-200/80 rounded-xl px-3 py-2 w-fit mt-1.5 animate-fade-in shadow-xs">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                        <span>플랫폼 감지 결과:</span>
                        <span className="font-bold underline decoration-violet-300">
                          {det === "x" && "X (Twitter)"}
                          {det === "youtube" && "YouTube 커뮤니티 포스트"}
                          {det === "youtube_thumb" && "YouTube 비디오 썸네일"}
                          {det === "telegram" && "Telegram 포스트"}
                        </span>
                      </div>
                      {det === "x" && (
                        <button
                          type="button"
                          id="quick-x-video-btn"
                          onClick={() => setPlatform("x_video")}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100/70 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer shadow-2xs"
                        >
                          <Video className="w-3 h-3 text-indigo-600" />
                          <span>🎬 X 동영상만 추출하기 ➔</span>
                        </button>
                      )}
                      {det === "telegram" && (
                        <>
                          <button
                            type="button"
                            id="quick-telegram-video-btn"
                            onClick={() => setPlatform("telegram_video")}
                            className="flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-teal-100/70 hover:bg-teal-100 border border-teal-300 rounded-lg px-2.5 py-1 transition-all cursor-pointer shadow-2xs"
                          >
                            <Video className="w-3 h-3 text-teal-600" />
                            <span>🎬 TG 동영상 추출 ➔</span>
                          </button>
                          <button
                            type="button"
                            id="quick-telegram-image-btn"
                            onClick={() => setPlatform("telegram_image")}
                            className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100/70 hover:bg-emerald-100 border border-emerald-300 rounded-lg px-2.5 py-1 transition-all cursor-pointer shadow-2xs"
                          >
                            <Image className="w-3 h-3 text-emerald-600" />
                            <span>🖼️ TG 이미지 추출 ➔</span>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Direct Presets Helper */}
                <PresetUrls platform={platform} onSelect={handleUrlChange} />
              </div>

              {/* Layout Customization (Theme & Background) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Captured Theme Scheme */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    3. 브라우저 테마
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="theme-light-btn"
                      onClick={() => setTheme("light")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        theme === "light"
                          ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                          : "text-slate-500 border-slate-200 hover:bg-slate-50 bg-white"
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      밝은 모드
                    </button>
                    <button
                      type="button"
                      id="theme-dark-btn"
                      onClick={() => setTheme("dark")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        theme === "dark"
                          ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                          : "text-slate-500 border-slate-200 hover:bg-slate-50 bg-white"
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      어두운 모드
                    </button>
                  </div>
                </div>

                {/* Frame Canvas Background */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    4. 액자 배경 선택
                  </label>
                  <div className="relative">
                    <select
                      id="bg-gradient-select"
                      value={selectedGradient}
                      onChange={(e) => setSelectedGradient(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-slate-500 cursor-pointer appearance-none shadow-xs"
                    >
                      {GRADIENTS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3.5 top-3.5 text-slate-400 pointer-events-none">
                      <Palette className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Trigger Button */}
              <button
                type="submit"
                id="capture-submit-btn"
                disabled={isLoading}
                className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold py-3.5 px-4 rounded-xl shadow-sm disabled:opacity-50 disabled:shadow-none hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    렌더링 및 캡처 진행 중...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    스크린샷 이미지 생성하기
                  </>
                )}
              </button>
            </form>

            {/* Error Message Box */}
            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-4 flex gap-3 text-xs" id="error-container">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <div className="space-y-1">
                  <p className="font-bold">스크린샷 생성 오류</p>
                  <p className="leading-relaxed text-slate-600">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* History Management */}
          <HistoryPanel
            history={history}
            onSelect={handleSelectHistory}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearAllHistory}
            onCopy={(imgUrl) => {
              setActiveScreenshot((prev) =>
                prev ? { ...prev, imageUrl: imgUrl } : { imageUrl: imgUrl, filename: "captured.png", normalizedUrl: "", postId: "" }
              );
              // Direct image binary copy
              copyImageToClipboard(imgUrl);
            }}
          />
        </section>

        {/* Right Side: Visual Canvas Workspace Panel */}
        <section className="col-span-1 lg:col-span-7 flex flex-col gap-6" id="preview-workspace-panel">
          
          <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col h-full min-h-[420px] sm:min-h-[580px] shadow-sm relative">
            
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 shrink-0">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-600" />
                캔버스 프리뷰 워크스페이스
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <span>PREVIEW</span>
                <span>•</span>
                <span>PNG HIGH-DPI</span>
              </div>
            </div>

            {/* Live Interactive Workspace Box */}
            <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-2xl p-4 sm:p-8 overflow-hidden border border-slate-150 relative">
              
              {/* Ambient backdrop subtle background glow */}
              <div className="absolute inset-0 bg-radial from-slate-500/5 via-transparent to-transparent pointer-events-none" />

              {/* SCENARIO A: No Image, Idle State */}
              {!isLoading && !activeScreenshot && (
                <div className="text-center max-w-[340px] py-10" id="preview-idle-state">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-600 shadow-sm animate-pulse">
                    <Camera className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">포스트 링크를 입력하세요</h4>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    X(트위터), 유튜브 커뮤니티, 혹은 텔레그램 채널의 공유 가능한 링크 주소를 왼쪽에 복사해 넣으면, 깨끗하고 미려한 디자인 스크린샷 카드가 완성됩니다.
                  </p>
                </div>
              )}

              {/* SCENARIO B: Rendering / Loading State */}
              {isLoading && (
                <div className="w-full max-w-md flex flex-col items-center justify-center py-10" id="preview-loading-state">
                  {/* Glowing spinner */}
                  <div className="relative mb-8">
                    <div className="w-16 h-16 rounded-full border-4 border-slate-500/20 border-t-slate-700 animate-spin" />
                    <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-slate-300/15 border-b-slate-400 animate-pulse" />
                  </div>

                  {/* Progressive Simulation Logger */}
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-slate-300 space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1.5 mb-1.5 font-bold uppercase tracking-wider">
                      <span>Server Terminal Log</span>
                      <span className="animate-pulse">● Running</span>
                    </div>

                    {loadingSteps.map((step, idx) => {
                      const isPast = idx < loadingStep;
                      const isCurrent = idx === loadingStep;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2.5 transition-opacity duration-300 ${
                            isPast ? "text-slate-500" : isCurrent ? "text-slate-300 font-semibold" : "text-slate-700"
                          }`}
                        >
                          <span className="shrink-0">{isPast ? "✓" : isCurrent ? "▶" : "•"}</span>
                          <span>{step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SCENARIO C: Active Screenshot or Video Loaded State */}
              {!isLoading && activeScreenshot && (
                <div className="w-full h-full flex flex-col justify-center items-center py-2" id="preview-result-state">
                  {activeScreenshot.imageInfo ? (
                    /* Image Extraction Display (Telegram Images) */
                    <div className="w-full max-w-xl bg-slate-950 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-2xl space-y-4 animate-fade-in">
                      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-white tracking-wide">
                            🖼️ 텔레그램 첨부 이미지 추출 완료 ({activeScreenshot.imageInfo.imageUrls.length}개)
                          </span>
                        </div>
                        {/* Tab Switcher: Extracted Images Gallery vs Post Card View */}
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[11px]">
                          <button
                            type="button"
                            onClick={() => setImageDisplayMode("gallery")}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              imageDisplayMode === "gallery"
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Image className="w-3 h-3" />
                            <span>추출 이미지 갤러리</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setImageDisplayMode("card")}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              imageDisplayMode === "card"
                                ? "bg-cyan-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Camera className="w-3 h-3" />
                            <span>포스트 카드 캡처</span>
                          </button>
                        </div>
                      </div>

                      {/* Mode A: Extracted Images Gallery */}
                      {imageDisplayMode === "gallery" && (
                        <div className="space-y-4">
                          <div className={`grid gap-3 ${activeScreenshot.imageInfo.imageUrls.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                            {activeScreenshot.imageInfo.imageUrls.map((imgUrl, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden p-2.5 space-y-2 flex flex-col justify-between shadow-lg group"
                              >
                                <div className="relative rounded-lg overflow-hidden bg-black aspect-auto min-h-[160px] max-h-[300px] flex items-center justify-center">
                                  <img
                                    src={imgUrl}
                                    alt={`Extracted TG image ${idx + 1}`}
                                    className="w-full h-full object-contain rounded-md"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-xs text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
                                    IMG #{idx + 1}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 text-xs pt-1">
                                  <a
                                    href={`/api/download-image?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(`telegram-image-${activeScreenshot.postId}-${idx + 1}.jpg`)}`}
                                    download={`telegram-image-${activeScreenshot.postId}-${idx + 1}.jpg`}
                                    className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>다운로드</span>
                                  </a>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(imgUrl);
                                      setImageCopyIndex(idx);
                                      setTimeout(() => setImageCopyIndex(null), 3000);
                                    }}
                                    className="py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
                                  >
                                    {imageCopyIndex === idx ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>복사됨!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>URL 복사</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mode B: Post Card Capture */}
                      {imageDisplayMode === "card" && activeScreenshot.imageUrl && (
                        <div
                          className={`w-full rounded-xl p-4 sm:p-6 transition-all duration-500 shadow-2xl flex items-center justify-center ${activeGradientClass}`}
                          id="gradient-backdrop-canvas"
                        >
                          <div className="relative group rounded-xl select-all overflow-hidden flex items-center justify-center">
                            <img
                              src={activeScreenshot.imageUrl}
                              alt="Telegram Post Card Screenshot"
                              className="max-h-[300px] sm:max-h-[380px] w-auto h-auto block select-all cursor-zoom-in object-contain rounded-xl shadow-2xl border border-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      )}

                      {/* Author & Post Text Meta Box */}
                      <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            {activeScreenshot.imageInfo.authorAvatar && (
                              <img
                                src={activeScreenshot.imageInfo.authorAvatar}
                                alt="Author Avatar"
                                className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                              />
                            )}
                            <span className="font-bold text-slate-200">{activeScreenshot.imageInfo.authorName}</span>
                            <span className="text-slate-400">@{activeScreenshot.imageInfo.authorHandle}</span>
                          </div>
                          {activeScreenshot.imageInfo.views ? (
                            <span className="text-slate-400 font-mono text-[11px]">
                              👁️ {activeScreenshot.imageInfo.views.toLocaleString()} 회
                            </span>
                          ) : null}
                        </div>
                        {activeScreenshot.imageInfo.tweetText && (
                          <p className="text-slate-300 leading-relaxed text-xs pt-1 select-all">
                            {activeScreenshot.imageInfo.tweetText}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : activeScreenshot.videoInfo ? (
                    /* Video Extraction Display */
                    <div className="w-full max-w-xl bg-slate-950 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-2xl space-y-4 animate-fade-in">
                      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse" />
                          <span className="text-xs font-bold text-white tracking-wide">🎬 동영상 미디어 추출 완료</span>
                        </div>
                        {/* Tab Switcher: GIF Canvas vs MP4 Player */}
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[11px]">
                          <button
                            type="button"
                            onClick={() => setVideoDisplayMode("gif")}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              videoDisplayMode === "gif"
                                ? "bg-pink-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Film className="w-3 h-3" />
                            <span>Animated GIF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setVideoDisplayMode("player")}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              videoDisplayMode === "player"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            <Video className="w-3 h-3" />
                            <span>비디오 플레이어</span>
                          </button>
                        </div>
                      </div>

                      {/* Display Mode A: Animated GIF Canvas Preview */}
                      {videoDisplayMode === "gif" && (
                        <div className="space-y-3">
                          {gifConverting ? (
                            <div className="aspect-video w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-3 shadow-inner">
                              <div className="w-12 h-12 rounded-full border-3 border-pink-500/20 border-t-pink-500 animate-spin flex items-center justify-center">
                                <Film className="w-5 h-5 text-pink-400" />
                              </div>
                              <div>
                                <h5 className="text-sm font-bold text-slate-100">🎬 Animated GIF 생성 중...</h5>
                                <p className="text-xs text-slate-400 mt-1">
                                  {gifDuration === "full" ? "전체 재생 길이 (Full)" : `${gifDuration}초 구간`} • {gifScale}p 해상도 • {gifFps} FPS (고품질 랜초스 필터)
                                </p>
                              </div>
                            </div>
                          ) : gifResult ? (
                            <div className="space-y-3">
                              <div className="relative rounded-xl overflow-hidden bg-black border border-pink-500/40 flex items-center justify-center shadow-2xl group select-all min-h-[220px]">
                                <img
                                  src={gifResult.gifUrl || gifResult.gifDataUrl}
                                  alt="Animated GIF Preview"
                                  className="max-h-[320px] w-auto h-auto object-contain rounded-lg"
                                />
                                <div className="absolute top-2.5 right-2.5 bg-black/80 backdrop-blur-xs text-pink-300 border border-pink-500/40 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold shadow-sm">
                                  GIF • {gifResult.sizeMb}
                                </div>
                              </div>

                              {/* Canvas Quick Actions for GIF */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  id="canvas-copy-gif-btn"
                                  onClick={handleCopyGifToClipboard}
                                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md ${
                                    gifCopyStatus === "copied"
                                      ? "bg-emerald-600 text-white"
                                      : "bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20"
                                  }`}
                                >
                                  {gifCopyStatus === "copied" ? (
                                    <>
                                      <Check className="w-4 h-4 text-emerald-200" />
                                      <span>클립보드 복사 완료! 붙여넣기(Ctrl+V) 하세요 📋</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      <span>📋 클립보드에 GIF 복사 (Copy)</span>
                                    </>
                                  )}
                                </button>

                                <a
                                  href={gifResult.gifUrl || gifResult.gifDataUrl}
                                  download={gifResult.filename}
                                  id="canvas-download-gif-btn"
                                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                                >
                                  <Download className="w-4 h-4 text-pink-300" />
                                  <span>📥 Animated GIF 다운로드 (.gif)</span>
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-video w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-2">
                              <Film className="w-8 h-8 text-slate-600" />
                              <button
                                type="button"
                                onClick={() => handleConvertToGif()}
                                className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-xl text-xs shadow-md transition-colors cursor-pointer"
                              >
                                🎬 Animated GIF 생성하기
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display Mode B: Interactive HTML5 Video Player */}
                      {videoDisplayMode === "player" && (
                        <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800/80 aspect-video flex items-center justify-center shadow-inner">
                          <video
                            src={`/api/stream-video?url=${encodeURIComponent(activeScreenshot.videoInfo.videoUrl)}`}
                            poster={activeScreenshot.videoInfo.thumbnailUrl}
                            controls
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="w-full h-full object-contain"
                          >
                            브라우저가 동영상 재생을 지원하지 않습니다.
                          </video>
                        </div>
                      )}

                      {/* Author & Tweet Meta Box */}
                      <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            {activeScreenshot.videoInfo.authorAvatar && (
                              <img
                                src={activeScreenshot.videoInfo.authorAvatar}
                                alt="Author Avatar"
                                className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                              />
                            )}
                            <span className="font-bold text-slate-200">{activeScreenshot.videoInfo.authorName}</span>
                            <span className="text-slate-400">@{activeScreenshot.videoInfo.authorHandle}</span>
                          </div>
                          {activeScreenshot.videoInfo.durationFormatted && (
                            <span className="text-slate-400 font-mono text-[11px]">
                              ⏱️ {activeScreenshot.videoInfo.durationFormatted}
                            </span>
                          )}
                        </div>
                        {activeScreenshot.videoInfo.tweetText && (
                          <p className="text-slate-300 leading-relaxed text-xs pt-1 select-all">
                            {activeScreenshot.videoInfo.tweetText}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Standard Image Screenshot Canvas */
                    <div
                      className={`w-full max-w-lg rounded-2xl p-6 sm:p-10 transition-all duration-500 shadow-2xl flex items-center justify-center ${activeGradientClass}`}
                      id="gradient-backdrop-canvas"
                    >
                      <div className="relative group rounded-xl select-all overflow-hidden flex items-center justify-center">
                        <img
                          src={activeScreenshot.imageUrl}
                          alt="SNS Screenshot asset"
                          className="max-h-[280px] sm:max-h-[340px] lg:max-h-[380px] w-auto h-auto block select-all cursor-zoom-in object-contain rounded-xl shadow-2xl border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Downward Workspace Controls & Intended Share Actions */}
            {!isLoading && activeScreenshot && (
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-4 shrink-0" id="preview-actions-container">
                {activeScreenshot.imageInfo ? (
                  /* Image Action Controls */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <a
                        href={`/api/download-image?url=${encodeURIComponent(activeScreenshot.imageInfo.primaryImageUrl)}&filename=${encodeURIComponent(`telegram-image-${activeScreenshot.postId}.jpg`)}`}
                        download={`telegram-image-${activeScreenshot.postId}.jpg`}
                        id="download-primary-image-btn"
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 text-xs tracking-wide transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        🖼️ 메인 이미지 (HD) 고화질 다운로드
                      </a>

                      <button
                        id="copy-primary-image-url-btn"
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeScreenshot.imageInfo!.primaryImageUrl);
                          setCopyStatus("copied");
                          setTimeout(() => setCopyStatus("idle"), 3000);
                        }}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl border border-slate-700 text-xs tracking-wide transition-all cursor-pointer shadow-sm"
                      >
                        {copyStatus === "copied" ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            이미지 직링크 복사 완료! 🔗
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            🔗 메인 이미지 원본 URL 직링크 복사
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : activeScreenshot.videoInfo ? (
                  /* Video Action Controls & Animated GIF Converter */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <a
                        href={`/api/download-video?url=${encodeURIComponent(activeScreenshot.videoInfo.videoUrl)}&filename=${encodeURIComponent(`video-${activeScreenshot.postId}.mp4`)}`}
                        download={`video-${activeScreenshot.postId}.mp4`}
                        id="download-video-mp4-btn"
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs tracking-wide transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        🎬 동영상 (MP4) 고화질 다운로드
                      </a>

                      <button
                        id="copy-video-url-btn"
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeScreenshot.videoInfo!.videoUrl);
                          setCopyStatus("copied");
                          setTimeout(() => setCopyStatus("idle"), 3000);
                        }}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl border border-slate-700 text-xs tracking-wide transition-all cursor-pointer shadow-sm"
                      >
                        {copyStatus === "copied" ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            MP4 직링크 복사 완료! 🔗
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            🔗 동영상 MP4 직링크 복사
                          </>
                        )}
                      </button>
                    </div>

                    {/* Interactive Animated GIF Conversion Section */}
                    <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 border border-indigo-700/60 rounded-2xl p-4 text-white shadow-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-pink-400 animate-pulse" />
                          <h4 className="text-xs font-bold tracking-wide text-indigo-100">✨ Animated GIF 변환 & 클립보드 바로 복사</h4>
                        </div>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-2 py-0.5 rounded-full font-semibold">GIF 변환기</span>
                      </div>

                      {/* GIF Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {/* Duration Selection */}
                        <div>
                          <label className="block text-[11px] font-semibold text-indigo-200 mb-1">
                            ⏱️ 재생 길이 (구간)
                          </label>
                          <div className="grid grid-cols-5 gap-1">
                            {[
                              { label: "3초", val: 3 },
                              { label: "5초", val: 5 },
                              { label: "10초", val: 10 },
                              { label: "15초", val: 15 },
                              { label: "Full (전체)", val: "full" },
                            ].map((opt) => (
                              <button
                                key={String(opt.val)}
                                type="button"
                                onClick={() => setGifDuration(opt.val as number | "full")}
                                className={`py-1.5 px-0.5 rounded-lg text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer text-center ${
                                  gifDuration === opt.val
                                    ? "bg-pink-600 border-pink-400 text-white shadow-xs"
                                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Resolution / Scale Selection */}
                        <div>
                          <label className="block text-[11px] font-semibold text-indigo-200 mb-1">
                            📐 해상도 (크기)
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { label: "360p", val: 360 },
                              { label: "480p", val: 480 },
                              { label: "600p", val: 600 },
                            ].map((res) => (
                              <button
                                key={res.val}
                                type="button"
                                onClick={() => setGifScale(res.val)}
                                className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  gifScale === res.val
                                    ? "bg-indigo-600 border-indigo-400 text-white shadow-xs"
                                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {res.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* FPS Selection */}
                        <div>
                          <label className="block text-[11px] font-semibold text-indigo-200 mb-1">
                            🎞️ 프레임 (FPS)
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { label: "8 fps", val: 8 },
                              { label: "10 fps", val: 10 },
                              { label: "15 fps", val: 15 },
                            ].map((f) => (
                              <button
                                key={f.val}
                                type="button"
                                onClick={() => setGifFps(f.val)}
                                className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  gifFps === f.val
                                    ? "bg-purple-600 border-purple-400 text-white shadow-xs"
                                    : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Start Time slider */}
                      <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs">
                        <span className="text-slate-300 text-[11px]">시작 시점 (초):</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max={Math.max(0, Math.floor((activeScreenshot.videoInfo.durationMs || 60000) / 1000) - gifDuration)}
                            value={gifStartTime}
                            onChange={(e) => setGifStartTime(Number(e.target.value))}
                            className="w-28 sm:w-36 accent-pink-500 cursor-pointer"
                          />
                          <span className="font-mono text-pink-300 font-bold w-12 text-right">{gifStartTime}초 시작</span>
                        </div>
                      </div>

                      {/* Convert Action Button */}
                      <button
                        type="button"
                        id="convert-to-gif-btn"
                        onClick={handleConvertToGif}
                        disabled={gifConverting}
                        className="w-full py-3 px-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-pink-600/20 text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {gifConverting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-pink-200" />
                            <span>High-Quality Animated GIF 변환 중... (약 2~3초)</span>
                          </>
                        ) : (
                          <>
                            <Film className="w-4 h-4 text-pink-200" />
                            <span>🎬 Animated GIF 로 변환하기</span>
                          </>
                        )}
                      </button>

                      {/* Generated GIF Result & Copy & Paste Controls */}
                      {gifResult && (
                        <div className="bg-slate-950/95 border border-pink-500/50 rounded-xl p-3.5 space-y-3 animate-fade-in shadow-2xl">
                          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                            <span className="font-bold text-pink-300 flex items-center gap-1.5">
                              <Check className="w-4 h-4 text-emerald-400" />
                              Animated GIF 생성 완료!
                            </span>
                            <span className="bg-pink-950 text-pink-300 border border-pink-800/60 px-2 py-0.5 rounded-md font-mono text-[11px]">
                              용량: {gifResult.sizeMb}
                            </span>
                          </div>

                          {/* GIF Image Preview */}
                          <div className="flex justify-center bg-black/80 rounded-lg p-2 border border-slate-800">
                            <img
                              src={gifResult.gifUrl || gifResult.gifDataUrl}
                              alt="Generated Animated GIF"
                              className="max-h-56 w-auto object-contain rounded-lg shadow-md"
                            />
                          </div>

                          {/* Copy & Paste & Download Action Buttons */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              id="copy-gif-btn"
                              onClick={handleCopyGifToClipboard}
                              className={`py-2.5 px-3 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md ${
                                gifCopyStatus === "copied"
                                  ? "bg-emerald-600 text-white"
                                  : gifCopyStatus === "error"
                                  ? "bg-rose-600 text-white"
                                  : "bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20"
                              }`}
                            >
                              {gifCopyStatus === "copied" ? (
                                <>
                                  <Check className="w-4 h-4 text-emerald-200" />
                                  <span>클립보드 복사 완료! 붙여넣기(Ctrl+V) 하세요 📋</span>
                                </>
                              ) : gifCopyStatus === "error" ? (
                                <>
                                  <AlertCircle className="w-4 h-4" />
                                  <span>복사 실패 (수동 저장 권장)</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" />
                                  <span>📋 클립보드에 GIF 복사 (Copy)</span>
                                </>
                              )}
                            </button>

                            <a
                              href={gifResult.gifUrl || gifResult.gifDataUrl}
                              download={gifResult.filename}
                              id="download-gif-file-btn"
                              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            >
                              <Download className="w-4 h-4 text-indigo-300" />
                              <span>📥 Animated GIF 다운로드 (.gif)</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Collapsible section to view & save Tweet screenshot card */}
                    {activeScreenshot.imageUrl && (
                      <details className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs" id="tweet-card-accordion">
                        <summary className="font-bold text-slate-700 cursor-pointer flex items-center justify-between select-none">
                          <span>🖼️ X 게시물 스크린샷 카드도 함께 저장하기 (PNG)</span>
                          <span className="text-slate-400 text-[10px] bg-slate-200/60 px-2 py-0.5 rounded-full font-normal">펼치기 / 접기</span>
                        </summary>
                        <div className="mt-3 flex flex-col items-center gap-3 pt-3 border-t border-slate-200/80">
                          <img
                            src={activeScreenshot.imageUrl}
                            alt="Tweet card preview"
                            className="max-h-[220px] w-auto rounded-lg border border-slate-200 shadow-sm"
                          />
                          <div className="flex gap-2 w-full max-w-xs">
                            <a
                              href={activeScreenshot.imageUrl}
                              download={activeScreenshot.filename}
                              className="flex-1 py-2 text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors"
                            >
                              📥 카드 저장 (PNG)
                            </a>
                            <button
                              type="button"
                              onClick={handleCopyToClipboard}
                              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors"
                            >
                              📋 클립보드 복사
                            </button>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  /* Standard Image Screenshot Actions */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <a
                      href={activeScreenshot.imageUrl}
                      download={activeScreenshot.filename}
                      onClick={handleDownload}
                      id="download-clean-png-btn"
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/15 text-xs tracking-wide transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      📥 이미지 저장 (Download Clean PNG)
                    </a>

                    <button
                      id="copy-to-clipboard-btn"
                      onClick={handleCopyToClipboard}
                      disabled={copyStatus === "loading"}
                      className={`flex items-center justify-center gap-2 py-3 px-4 text-white font-bold rounded-xl shadow-md text-xs tracking-wide transition-all cursor-pointer ${
                        copyStatus === "copied"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : copyStatus === "error"
                          ? "bg-rose-600 hover:bg-rose-700"
                          : "bg-slate-700 hover:bg-slate-800 shadow-slate-700/15"
                      }`}
                    >
                      {copyStatus === "loading" ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          복사하는 중...
                        </>
                      ) : copyStatus === "copied" ? (
                        <>
                          <Check className="w-4 h-4" />
                          클립보드에 복사 완료! 📋
                        </>
                      ) : copyStatus === "error" ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          복사 실패 (수동 저장 권장)
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          📋 클립보드에 이미지 복사 (Copy)
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* X Integration Sharing Intensifiers */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4.5 space-y-3" id="x-share-intents-box">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Twitter className="w-4 h-4 text-sky-500" />
                      X (Twitter) 즉시 연동 공유
                    </div>
                    <span className="text-[10px] bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      {platform === "x" ? "X Post" : platform === "youtube" ? "YouTube Post" : platform === "youtube_thumb" ? "YouTube Thumbnail" : "Telegram"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    💡 X(트위터)의 특성상 이미지 자동 첨부는 지원되지 않습니다. <strong>위의 클립보드 이미지 복사 버튼</strong>을 먼저 누른 다음, 아래 공유 버튼을 통해 열리는 작성 화면에서 <strong>Ctrl+V (붙여넣기)</strong> 하시면 이미지가 바로 입력됩니다!
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {platform === "x" && (
                      <a
                        href={getXRepostUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        id="x-instant-repost-btn"
                        className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
                      >
                        <Twitter className="w-3.5 h-3.5 text-sky-500" />
                        🔁 X에서 즉시 Repost
                      </a>
                    )}
                    <a
                      href={getXQuoteUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      id="x-quote-share-btn"
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-850 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-sm ${
                        platform === "x" ? "col-span-1" : "col-span-2"
                      }`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      🐦 X(Twitter)에 포스트 공유하기
                    </a>
                  </div>
                </div>
                
                {/* General Share Tips */}
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-center text-[11px] text-slate-500" id="share-tips-box">
                  💡 클립보드에 복사된 이미지는 카카오톡, Telegram, Slack, Notion 등 어디서나 <strong>붙여넣기(Ctrl+V)</strong>로 즉시 공유 가능합니다.
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-slate-200 bg-white text-center py-6 text-xs text-slate-500 select-none">
        <p>© 2026 Social Screenshot Studio. Created with high-fidelity Playwright core headless drivers.</p>
        <p className="mt-1 font-mono text-[10px]">Optimized for Pretendard Korean, Noto Sans CJK rendering.</p>
      </footer>
    </div>
  );
}
