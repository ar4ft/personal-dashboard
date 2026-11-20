export type Video = {
  id: string; feedId: string; title: string; source: string; topics: string[]; url: string;
  src: string; poster: string; captions: string; duration: number; transcript: string; createdAt: string; pinned: boolean; ticks: boolean;
};
export const VIDEO_MANIFEST_MAX_BYTES: number;
export const VIDEO_CDN_SRC: RegExp;
export function parseVideoManifest(data: unknown, base?: string): Video[];
export function feedSection(feedId: string): "news" | "ideas" | "planning";
export function itemHref(feedId: string, base?: string): string;
export function videoHref(videoId: string, base?: string): string;
export function videoLinksByFeedId(videos: Video[], base?: string): Map<string, string>;
export function retainedVideos<T extends { pinned?: boolean; createdAt: string }>(videos: T[], days?: number, now?: number): T[];
