import React from "react";
import { Twitter, Youtube, Send, Image } from "lucide-react";
import { Platform } from "../types";

interface PlatformTabsProps {
  activePlatform: Platform;
  onChange: (platform: Platform) => void;
}

export default function PlatformTabs({ activePlatform, onChange }: PlatformTabsProps) {
  const tabs = [
    {
      id: "x" as Platform,
      name: "X (Twitter)",
      icon: Twitter,
      color: "hover:text-sky-600 hover:border-sky-300",
      activeBg: "bg-sky-50 text-sky-600 border-sky-400/80 shadow-sm",
      inactiveBg: "text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-800",
    },
    {
      id: "youtube" as Platform,
      name: "YouTube Post",
      icon: Youtube,
      color: "hover:text-rose-600 hover:border-rose-300",
      activeBg: "bg-rose-50 text-rose-600 border-rose-400/80 shadow-sm",
      inactiveBg: "text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-800",
    },
    {
      id: "youtube_thumb" as Platform,
      name: "YouTube Thumb",
      icon: Image,
      color: "hover:text-red-600 hover:border-red-300",
      activeBg: "bg-red-50 text-red-600 border-red-400/80 shadow-sm",
      inactiveBg: "text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-800",
    },
    {
      id: "telegram" as Platform,
      name: "Telegram",
      icon: Send,
      color: "hover:text-cyan-600 hover:border-cyan-300",
      activeBg: "bg-cyan-50 text-cyan-600 border-cyan-400/80 shadow-sm",
      inactiveBg: "text-slate-500 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-800",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full" id="platform-tabs-container">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activePlatform === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-btn-${tab.id}`}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-2 sm:px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all duration-300 ${
              isActive ? tab.activeBg : tab.inactiveBg
            } ${tab.color} cursor-pointer`}
          >
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="truncate">{tab.name}</span>
          </button>
        );
      })}
    </div>
  );
}
