export type Platform = "auto" | "x" | "x_video" | "youtube" | "telegram" | "telegram_video" | "telegram_image" | "youtube_thumb" | "web_image";

export type Theme = "light" | "dark";

export interface VideoMediaInfo {
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs?: number;
  durationFormatted?: string;
  resolution?: string;
  width?: number;
  height?: number;
  tweetText?: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  likes?: number;
  retweets?: number;
  views?: number;
}

export interface ImageMediaInfo {
  imageUrls: string[];
  primaryImageUrl: string;
  tweetText?: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  views?: number;
}

export interface WebImageMediaInfo {
  pageTitle: string;
  siteName?: string;
  pageUrl: string;
  description?: string;
  imageUrls: string[];
  totalExtractedCount: number;
}

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
  videoInfo?: VideoMediaInfo;
  imageInfo?: ImageMediaInfo;
  webImageInfo?: WebImageMediaInfo;
}
