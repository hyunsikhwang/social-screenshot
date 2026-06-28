export type Platform = "auto" | "x" | "youtube" | "telegram" | "youtube_thumb";

export type Theme = "light" | "dark";

export interface ScreenshotConfig {
  url: string;
  platform: Platform;
  theme: Theme;
  backgroundGradient: string;
}

export interface ScreenshotHistoryItem {
  id: string;
  url: string;
  platform: Platform;
  theme: Theme;
  timestamp: string;
  imageUrl: string;
  filename: string;
  normalizedUrl: string;
}
