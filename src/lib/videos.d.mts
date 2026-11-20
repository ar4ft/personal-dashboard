export type Video = {
  id: string; itemId: string; title: string; source: string; topics: string[]; url: string;
  src: string; poster: string; captions: string; duration: number; transcript: string; createdAt: string;
};
export const VIDEO_MANIFEST_MAX_BYTES: number;
export function parseVideoManifest(data: unknown, base?: string): Video[];
