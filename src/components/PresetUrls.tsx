import React from "react";
import { Platform } from "../types";

interface PresetUrlsProps {
  platform: Platform;
  onSelect: (url: string) => void;
}

const PRESETS: Record<Platform, { label: string; url: string }[]> = {
  auto: [
    {
      label: "SpaceX Launch (X)",
      url: "https://x.com/SpaceX/status/1801229789311094943",
    },
    {
      label: "Telegram Tips (TG)",
      url: "https://telegram.me/s/telegram/252",
    },
    {
      label: "MKBHD Video (YT-Thumb)",
      url: "https://www.youtube.com/watch?v=dtp6b76pMak",
    },
    {
      label: "MKBHD Community (YT-Post)",
      url: "https://www.youtube.com/post/UgkxvC2p1bXitU0L6P779A9S9h0zVlUuD_Oa",
    },
  ],
  x: [
    {
      label: "SpaceX Starship Launch",
      url: "https://x.com/SpaceX/status/1801229789311094943",
    },
    {
      label: "NASA Webb Telescope",
      url: "https://x.com/NASAWebb/status/1783151978377757041",
    },
  ],
  youtube: [
    {
      label: "MKBHD Community Update",
      url: "https://www.youtube.com/post/UgkxvC2p1bXitU0L6P779A9S9h0zVlUuD_Oa",
    },
    {
      label: "MrBeast Community Milestone",
      url: "https://www.youtube.com/post/UgkxXp7bEw9vKzK9Y4aB7c8D9eF0gH1iJ2kL",
    },
  ],
  youtube_thumb: [
    {
      label: "Apple Vision Pro Review (MKBHD)",
      url: "https://www.youtube.com/watch?v=dtp6b76pMak",
    },
    {
      label: "Interstellar Soundtrack Live",
      url: "https://www.youtube.com/watch?v=4y33h81xq7M",
    },
  ],
  telegram: [
    {
      label: "Telegram Tips",
      url: "https://telegram.me/s/telegram/252",
    },
    {
      label: "Duurov's Channel (Pavel Durov)",
      url: "https://telegram.me/s/durov/251",
    },
  ],
};

export default function PresetUrls({ platform, onSelect }: PresetUrlsProps) {
  const presets = PRESETS[platform];

  return (
    <div className="flex flex-wrap gap-2 items-center text-xs mt-2" id="presets-container">
      <span className="text-slate-500 font-medium">✨ 추천 예시 URL:</span>
      {presets.map((preset, idx) => (
        <button
          key={idx}
          id={`preset-btn-${platform}-${idx}`}
          type="button"
          onClick={() => onSelect(preset.url)}
          className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium py-1.5 px-3 rounded-md transition-colors border border-slate-200 cursor-pointer shadow-sm min-h-[32px] inline-flex items-center"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
