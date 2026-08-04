import React from "react";
import { Twitter, Youtube, Send, Image, Sparkles, Video, Globe } from "lucide-react";
import { Platform } from "../types";

interface PlatformTabsProps {
  activePlatform: Platform;
  onChange: (platform: Platform) => void;
}

export default function PlatformTabs({ activePlatform, onChange }: PlatformTabsProps) {
  const tabs = [
    {
      id: "auto" as Platform,
      name: "자동 감지",
      icon: Sparkles,
      color: "hover:text-violet-600 hover:border-violet-300",
      activeBg: "bg-violet-50 text-violet-700 border-violet-400/90 shadow-sm ring-1 ring-violet-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "x" as Platform,
      name: "X (트위터)",
      icon: Twitter,
      color: "hover:text-sky-600 hover:border-sky-300",
      activeBg: "bg-sky-50 text-sky-700 border-sky-400/90 shadow-sm ring-1 ring-sky-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "x_video" as Platform,
      name: "X 동영상 추출",
      icon: Video,
      color: "hover:text-indigo-600 hover:border-indigo-300",
      activeBg: "bg-indigo-50 text-indigo-700 border-indigo-400/90 shadow-sm ring-1 ring-indigo-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "youtube" as Platform,
      name: "YouTube 커뮤니티",
      icon: Youtube,
      color: "hover:text-rose-600 hover:border-rose-300",
      activeBg: "bg-rose-50 text-rose-700 border-rose-400/90 shadow-sm ring-1 ring-rose-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "youtube_thumb" as Platform,
      name: "YouTube 썸네일",
      icon: Image,
      color: "hover:text-red-600 hover:border-red-300",
      activeBg: "bg-red-50 text-red-700 border-red-400/90 shadow-sm ring-1 ring-red-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "telegram" as Platform,
      name: "Telegram 포스트",
      icon: Send,
      color: "hover:text-cyan-600 hover:border-cyan-300",
      activeBg: "bg-cyan-50 text-cyan-700 border-cyan-400/90 shadow-sm ring-1 ring-cyan-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "telegram_video" as Platform,
      name: "TG 동영상 추출",
      icon: Video,
      color: "hover:text-teal-600 hover:border-teal-300",
      activeBg: "bg-teal-50 text-teal-700 border-teal-400/90 shadow-sm ring-1 ring-teal-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "telegram_image" as Platform,
      name: "TG 이미지 추출",
      icon: Image,
      color: "hover:text-emerald-600 hover:border-emerald-300",
      activeBg: "bg-emerald-50 text-emerald-700 border-emerald-400/90 shadow-sm ring-1 ring-emerald-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
    {
      id: "web_image" as Platform,
      name: "웹/블로그 이미지 추출",
      icon: Globe,
      color: "hover:text-amber-600 hover:border-amber-300",
      activeBg: "bg-amber-50 text-amber-700 border-amber-400/90 shadow-sm ring-1 ring-amber-400/20",
      inactiveBg: "text-slate-600 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-2 sm:gap-2.5 w-full" id="platform-tabs-container">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activePlatform === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-btn-${tab.id}`}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 min-w-[130px] sm:min-w-[145px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all duration-200 ${
              isActive ? tab.activeBg : tab.inactiveBg
            } ${tab.color} cursor-pointer whitespace-nowrap shadow-2xs`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{tab.name}</span>
          </button>
        );
      })}
    </div>
  );
}
