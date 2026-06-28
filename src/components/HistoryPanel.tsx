import React from "react";
import { Trash2, Download, Copy, ExternalLink, Calendar, Twitter, Youtube, Send, Image } from "lucide-react";
import { ScreenshotHistoryItem } from "../types";

interface HistoryPanelProps {
  history: ScreenshotHistoryItem[];
  onSelect: (item: ScreenshotHistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onCopy: (imageUrl: string) => void;
}

export default function HistoryPanel({
  history,
  onSelect,
  onDelete,
  onClearAll,
  onCopy,
}: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-sm" id="history-empty">
        <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-700">최근 생성 내역이 없습니다</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
          SNS 게시물 URL을 입력하고 스크린샷을 생성하면 여기에 자동 저장됩니다.
        </p>
      </div>
    );
  }

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "x":
        return <Twitter className="w-3.5 h-3.5 text-sky-500" />;
      case "youtube":
        return <Youtube className="w-3.5 h-3.5 text-rose-500" />;
      case "youtube_thumb":
        return <Image className="w-3.5 h-3.5 text-red-500" />;
      case "telegram":
        return <Send className="w-3.5 h-3.5 text-cyan-500" />;
      default:
        return null;
    }
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case "x":
        return "X (Twitter)";
      case "youtube":
        return "YouTube Post";
      case "youtube_thumb":
        return "YouTube Thumb";
      case "telegram":
        return "Telegram";
      default:
        return platform;
    }
  };

  return (
    <div className="space-y-4" id="history-panel-container">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700">최근 생성 기록 ({history.length})</h3>
        </div>
        <button
          id="clear-all-history-btn"
          onClick={onClearAll}
          className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 hover:bg-rose-50 px-2 py-1.5 rounded transition-colors cursor-pointer border border-transparent hover:border-rose-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          전체 삭제
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
        {history.map((item) => (
          <div
            key={item.id}
            id={`history-item-${item.id}`}
            className="bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200/80 p-3 flex gap-3 transition-all duration-200 group shadow-sm"
          >
            {/* Small image preview thumbnail */}
            <div
              className="w-16 h-16 rounded-lg bg-slate-50 overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center cursor-pointer relative"
              onClick={() => onSelect(item)}
            >
              <img
                src={item.imageUrl}
                alt="Capture Preview"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ExternalLink className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Info details */}
            <div className="flex flex-col justify-between min-w-0 flex-1">
              <div>
                <div className="flex items-center gap-1.5">
                  {getPlatformIcon(item.platform)}
                  <span className="text-[11px] font-bold text-slate-600">{getPlatformName(item.platform)}</span>
                  <span className="text-[10px] text-slate-400">•</span>
                  <span className="text-[10px] text-slate-400 truncate" title={new Date(item.timestamp).toLocaleString("ko-KR")}>
                    {new Date(item.timestamp).toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-800 font-medium truncate mt-1 select-all" title={item.url}>
                  {item.url}
                </p>
              </div>

              <div className="flex items-center gap-3 mt-1.5 border-t border-slate-100 pt-1.5">
                <button
                  id={`history-copy-btn-${item.id}`}
                  onClick={() => onCopy(item.imageUrl)}
                  className="text-[11px] text-slate-600 hover:text-slate-800 active:text-slate-900 font-bold flex items-center gap-1 min-h-[28px] px-1.5 rounded-md hover:bg-slate-100/60 transition-colors"
                  title="클립보드에 복사"
                >
                  <Copy className="w-3.5 h-3.5" />
                  복사
                </button>
                <a
                  href={item.imageUrl}
                  download={item.filename}
                  className="text-[11px] text-slate-600 hover:text-emerald-600 active:text-emerald-700 font-bold flex items-center gap-1 min-h-[28px] px-1.5 rounded-md hover:bg-slate-100/60 transition-colors"
                  title="다운로드"
                >
                  <Download className="w-3.5 h-3.5" />
                  저장
                </a>
                <button
                  id={`history-delete-btn-${item.id}`}
                  onClick={() => onDelete(item.id)}
                  className="text-[11px] text-slate-400 hover:text-rose-600 active:text-rose-700 ml-auto min-h-[28px] p-1 rounded-md hover:bg-slate-100/60 transition-colors"
                  title="기록 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
