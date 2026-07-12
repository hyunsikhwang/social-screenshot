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
} from "lucide-react";

import { Platform, Theme, ScreenshotHistoryItem } from "./types";
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
    imageUrl: string;
    filename: string;
    normalizedUrl: string;
    postId: string;
  } | null>(null);

  // Copy to clipboard status
  const [copyStatus, setCopyStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");

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

      const newScreenshot = {
        imageUrl: data.image,
        filename: data.filename,
        normalizedUrl: data.normalizedUrl,
        postId: data.postId,
      };

      setActiveScreenshot(newScreenshot);

      // Add to history
      const historyItem: ScreenshotHistoryItem = {
        id: Date.now().toString(),
        url: url.trim(),
        platform: data.platform || platform,
        theme,
        timestamp: new Date().toISOString(),
        imageUrl: data.image,
        filename: data.filename,
        normalizedUrl: data.normalizedUrl,
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

  // Direct PNG Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!activeScreenshot) return;
    setCopyStatus("loading");

    try {
      const response = await fetch(activeScreenshot.imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2500);
    }
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
                        : platform === "youtube"
                        ? "https://www.youtube.com/post/Ugkx..."
                        : platform === "youtube_thumb"
                        ? "https://www.youtube.com/watch?v=dtp6b76pMak"
                        : "https://t.me/s/channel/123 (또는 t.me/channel/123)"
                    }
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl py-3 pl-4 pr-10 text-sm focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/15 transition-all font-mono"
                    required
                  />
                  <div className="absolute right-3.5 top-3.5 text-slate-400">
                    {(() => {
                      const det = detectPlatform(url);
                      const current = platform === "auto" ? det : platform;
                      if (current === "x") return <Twitter className="w-4 h-4 text-sky-500" />;
                      if (current === "youtube") return <Youtube className="w-4 h-4 text-rose-500" />;
                      if (current === "youtube_thumb") return <Image className="w-4 h-4 text-red-500" />;
                      if (current === "telegram") return <Send className="w-4 h-4 text-cyan-500" />;
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
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50/50 border border-violet-100 rounded-lg px-3 py-2 w-fit mt-1.5 animate-fade-in">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>플랫폼 감지 결과:</span>
                      <span className="font-bold underline decoration-violet-300">
                        {det === "x" && "X (Twitter)"}
                        {det === "youtube" && "YouTube 커뮤니티 포스트"}
                        {det === "youtube_thumb" && "YouTube 비디오 썸네일"}
                        {det === "telegram" && "Telegram 포스트"}
                      </span>
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
              // Direct clipboard copy
              navigator.clipboard.writeText(imgUrl);
              setCopyStatus("copied");
              setTimeout(() => setCopyStatus("idle"), 2000);
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

              {/* SCENARIO C: Active Screenshot Loaded State */}
              {!isLoading && activeScreenshot && (
                <div className="w-full h-full flex flex-col justify-center items-center" id="preview-result-state">
                  {/* Backdrop Gradient wrapper mimicking custom design container */}
                  <div
                    className={`w-full max-w-lg rounded-2xl p-6 sm:p-10 transition-all duration-500 shadow-2xl flex items-center justify-center ${activeGradientClass}`}
                    id="gradient-backdrop-canvas"
                  >
                    {/* Rounded image card reflecting final asset */}
                    <div className="relative group rounded-xl shadow-2xl border border-slate-200 bg-white select-all overflow-hidden flex items-center justify-center">
                      <img
                        src={activeScreenshot.imageUrl}
                        alt="SNS Screenshot asset"
                        className="max-h-[280px] sm:max-h-[340px] lg:max-h-[380px] w-auto h-auto block select-all cursor-zoom-in object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Downward Workspace Controls & Intended Share Actions */}
            {!isLoading && activeScreenshot && (
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-4 shrink-0" id="preview-actions-container">
                {/* General Actions: Download & Copy to Clipboard */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href={activeScreenshot.imageUrl}
                    download={activeScreenshot.filename}
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
