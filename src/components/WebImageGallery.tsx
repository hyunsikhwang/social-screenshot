import React, { useState, useMemo } from "react";
import { Download, Check, Copy, CheckSquare, Square, Eye, ExternalLink, Globe, Layers, ArrowDownToLine, Sparkles, X } from "lucide-react";
import { WebImageMediaInfo } from "../types";

interface WebImageGalleryProps {
  webImageInfo: WebImageMediaInfo;
  imageUrl?: string; // Captured card screenshot URL
  postId: string;
}

export default function WebImageGallery({ webImageInfo, imageUrl, postId }: WebImageGalleryProps) {
  const [displayMode, setDisplayMode] = useState<"gallery" | "card">("gallery");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set(webImageInfo.imageUrls));
  const [isZipping, setIsZipping] = useState(false);
  const [copyIndex, setCopyIndex] = useState<number | null>(null);
  const [batchCopyDone, setBatchCopyDone] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const filteredImages = useMemo(() => {
    if (!searchFilter.trim()) return webImageInfo.imageUrls;
    const q = searchFilter.toLowerCase();
    return webImageInfo.imageUrls.filter((url) => url.toLowerCase().includes(q));
  }, [webImageInfo.imageUrls, searchFilter]);

  const allFilteredSelected = useMemo(() => {
    if (filteredImages.length === 0) return false;
    return filteredImages.every((url) => selectedUrls.has(url));
  }, [filteredImages, selectedUrls]);

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedUrls);
      filteredImages.forEach((url) => next.delete(url));
      setSelectedUrls(next);
    } else {
      const next = new Set(selectedUrls);
      filteredImages.forEach((url) => next.add(url));
      setSelectedUrls(next);
    }
  };

  const toggleSelectOne = (url: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelectedUrls(next);
  };

  const handleBatchDownloadZip = async () => {
    const urlsToDownload = Array.from(selectedUrls);
    if (urlsToDownload.length === 0) return;

    setIsZipping(true);
    try {
      const response = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: urlsToDownload,
          zipFilename: `web-images-${postId}.zip`,
          referer: webImageInfo.pageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("ZIP 파일 생성에 실패했습니다.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `web-images-${postId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(err.message || "압축파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopySelectedUrls = () => {
    const urls = Array.from(selectedUrls).join("\n");
    navigator.clipboard.writeText(urls);
    setBatchCopyDone(true);
    setTimeout(() => setBatchCopyDone(false), 3000);
  };

  return (
    <div className="w-full max-w-3xl bg-slate-950 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-2xl space-y-5 animate-fade-in" id="web-image-gallery-container">
      {/* Top Bar Navigation */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse shadow-sm shadow-amber-500/50" />
          <span className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-amber-400" />
            🖼️ img src 추출 앨범 매트릭스 ({webImageInfo.totalExtractedCount}개)
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setDisplayMode("gallery")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              displayMode === "gallery"
                ? "bg-amber-600 text-white shadow-md ring-1 ring-amber-400/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>이미지 갤러리</span>
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setDisplayMode("card")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                displayMode === "card"
                  ? "bg-cyan-600 text-white shadow-md ring-1 ring-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>포스트 카드 캡처</span>
            </button>
          )}
        </div>
      </div>

      {/* Metadata Info Box */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800/80 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-amber-400 shrink-0 px-2 py-0.5 bg-amber-950/80 border border-amber-800/60 rounded-md text-[11px]">
              {webImageInfo.siteName || "Web Site"}
            </span>
            <h3 className="font-bold text-slate-100 text-sm truncate">{webImageInfo.pageTitle}</h3>
          </div>
          <a
            href={webImageInfo.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-medium shrink-0 transition-colors"
          >
            <span>원문 바로가기</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        {webImageInfo.description && (
          <p className="text-slate-300 leading-relaxed line-clamp-2 text-xs pt-0.5">
            {webImageInfo.description}
          </p>
        )}
      </div>

      {/* Mode A: Extracted Images Selection & Batch Gallery */}
      {displayMode === "gallery" && (
        <div className="space-y-4">
          {/* Batch Selection Toolbar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold rounded-lg border border-slate-700 transition-all cursor-pointer"
              >
                {allFilteredSelected ? (
                  <>
                    <CheckSquare className="w-4 h-4 text-amber-400" />
                    <span>전체 해제</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 text-slate-400" />
                    <span>전체 선택</span>
                  </>
                )}
              </button>

              <div className="text-xs font-medium text-slate-300">
                선택됨: <span className="font-bold text-amber-400">{selectedUrls.size}</span> / {webImageInfo.totalExtractedCount}개
              </div>
            </div>

            {/* Batch Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopySelectedUrls}
                disabled={selectedUrls.size === 0}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold rounded-lg text-xs border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {batchCopyDone ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>URL 복사됨!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>선택 URL 복사</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBatchDownloadZip}
                disabled={selectedUrls.size === 0 || isZipping}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold rounded-lg text-xs shadow-lg shadow-amber-600/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                {isZipping ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>ZIP 패키징 중...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>선택 {selectedUrls.size}개 일괄 ZIP 다운로드</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search Filter Input */}
          {webImageInfo.imageUrls.length > 8 && (
            <div className="relative">
              <input
                type="text"
                placeholder="이미지 파일명 또는 URL로 검색..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          )}

          {/* Image Grid Album Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredImages.map((imgUrl, idx) => {
              const isSelected = selectedUrls.has(imgUrl);
              return (
                <div
                  key={idx}
                  onClick={() => toggleSelectOne(imgUrl)}
                  className={`relative bg-slate-900/90 border rounded-xl overflow-hidden p-2.5 space-y-2.5 flex flex-col justify-between shadow-md transition-all cursor-pointer group ${
                    isSelected
                      ? "border-amber-500/90 ring-2 ring-amber-500/30 bg-amber-950/20"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Select Checkbox Badge */}
                  <div className="absolute top-4 left-4 z-10" onClick={(e) => toggleSelectOne(imgUrl, e)}>
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all shadow-md ${
                        isSelected
                          ? "bg-amber-500 text-slate-950 font-bold"
                          : "bg-slate-900/80 text-slate-400 border border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {/* Index Badge */}
                  <div className="absolute top-4 right-4 z-10 bg-black/70 backdrop-blur-xs text-amber-300 border border-amber-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
                    #{idx + 1}
                  </div>

                  {/* Image Container */}
                  <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-800/80 group-hover:border-slate-700 transition-colors">
                    <img
                      src={imgUrl}
                      alt={`Extracted Web Image ${idx + 1}`}
                      className="w-full h-full object-contain rounded-md"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />

                    {/* Lightbox Trigger Overlay */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxUrl(imgUrl);
                      }}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white font-bold text-xs transition-opacity bg-backdrop-blur-xs"
                    >
                      <Eye className="w-4 h-4" />
                      <span>확대 보기</span>
                    </button>
                  </div>

                  {/* Action Bar */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs pt-1">
                    <a
                      href={`/api/download-image?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(`web-image-${postId}-${idx + 1}.jpg`)}&referer=${encodeURIComponent(webImageInfo.pageUrl)}`}
                      download={`web-image-${postId}-${idx + 1}.jpg`}
                      onClick={(e) => e.stopPropagation()}
                      className="py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>다운로드</span>
                    </a>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(imgUrl);
                        setCopyIndex(idx);
                        setTimeout(() => setCopyIndex(null), 3000);
                      }}
                      className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      {copyIndex === idx ? (
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
              );
            })}
          </div>
        </div>
      )}

      {/* Mode B: Post Card Capture */}
      {displayMode === "card" && imageUrl && (
        <div className="w-full rounded-xl p-4 sm:p-6 bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
          <div className="relative group rounded-xl overflow-hidden flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Web Post Card Screenshot"
              className="max-h-[360px] w-auto h-auto block select-all cursor-zoom-in object-contain rounded-xl shadow-2xl border border-slate-700"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200">원본 고화질 이미지 미리보기</span>
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-black/60 rounded-xl p-2 min-h-[300px]">
              <img src={lightboxUrl} alt="Enlarged preview" className="max-h-[70vh] object-contain rounded-lg" referrerPolicy="no-referrer" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <a
                href={`/api/download-image?url=${encodeURIComponent(lightboxUrl)}&filename=extracted-image.jpg&referer=${encodeURIComponent(webImageInfo.pageUrl)}`}
                download="extracted-image.jpg"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>원본 다운로드</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
