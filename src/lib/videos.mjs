import { safeUrl, safeImageUrl } from "./workspace.mjs";

/** Video News manifest (public/videos.json). Separate from the v1 feed so feed backups stay unchanged. */
export const VIDEO_MANIFEST_MAX_BYTES = 2_000_000;
/** External MP4 hosting: the media repo served by jsDelivr, pinned to a commit SHA (see docs/video-news.md). */
export const VIDEO_CDN_SRC = /^https:\/\/cdn\.jsdelivr\.net\/gh\/ar4ft\/dashboard-videos@[0-9a-f]{40}\/[a-z0-9-]+\.mp4$/;
const MEDIA_PATH = /^(?:https:\/\/.*|(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+)$/;

function mediaUrl(value, base, ext) {
  if (typeof value !== "string" || !MEDIA_PATH.test(value)) return "";
  if (ext && !new RegExp(`\\.(${ext})(?:$|\\?)`, "i").test(value)) return "";
  return safeImageUrl(value, base);
}

/** Returns sanitized, newest-first videos; throws on a structurally invalid manifest. */
export function parseVideoManifest(data, base = "/") {
  if (!data || typeof data !== "object" || data.version !== 1 || !Array.isArray(data.videos))
    throw new Error("Video manifest needs version 1 and a videos array.");
  const seen = new Set();
  const out = [];
  for (const v of data.videos) {
    if (!v || typeof v !== "object") throw new Error("Each video must be an object.");
    if (typeof v.id !== "string" || !/^video:[a-z0-9-]{1,120}$/.test(v.id)) throw new Error(`Invalid video id: ${v.id}`);
    if (seen.has(v.id)) throw new Error(`Duplicate video id: ${v.id}`);
    seen.add(v.id);
    if (typeof v.title !== "string" || !v.title.trim() || v.title.length > 500) throw new Error(`Video ${v.id} needs a title.`);
    if (typeof v.feedId !== "string" && typeof v.itemId !== "string") throw new Error(`Video ${v.id} needs the feedId of its feed item.`);
    const src = mediaUrl(v.src, base, "mp4");
    if (!src) throw new Error(`Video ${v.id} needs an MP4 src path or https URL.`);
    if (/^https:/i.test(v.src) && !VIDEO_CDN_SRC.test(v.src))
      throw new Error(`Video ${v.id}: external src must be a SHA-pinned jsDelivr URL from ar4ft/dashboard-videos.`);
    out.push({
      id: v.id,
      feedId: typeof v.feedId === "string" ? v.feedId : typeof v.itemId === "string" ? v.itemId : "",
      title: v.title,
      source: typeof v.source === "string" ? v.source : "",
      topics: Array.isArray(v.topics) ? v.topics.filter((t) => typeof t === "string" && t.length <= 80).slice(0, 4) : [],
      url: typeof v.url === "string" ? safeUrl(v.url) : "",
      src,
      poster: mediaUrl(v.poster, base, "jpg|jpeg|png|webp"),
      captions: mediaUrl(v.captions, base, "vtt"),
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      pinned: v.pinned === true,
      ticks: v.ticks === true,
      transcript: typeof v.transcript === "string" ? v.transcript.slice(0, 2000) : "",
      createdAt: typeof v.createdAt === "string" && !Number.isNaN(Date.parse(v.createdAt)) ? v.createdAt : "1970-01-01T00:00:00Z",
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Section page that holds a feed item, derived from its ID prefix. */
export function feedSection(feedId) {
  return /^ideas:/.test(feedId) ? "ideas" : /^(calendar|planning|todo):/.test(feedId) ? "planning" : "news";
}
/** Dashboard deep link for the item a video is about (the existing ?item= details link). */
export function itemHref(feedId, base = "/") {
  return feedId ? `${base.replace(/\/$/, "")}/${feedSection(feedId)}/?item=${encodeURIComponent(feedId)}` : "";
}
/** Link to one video on the Video news page. */
export function videoHref(videoId, base = "/") {
  return `${base.replace(/\/$/, "")}/videos/#${encodeURIComponent(videoId)}`;
}
/** Map feed item ID -> video page link, for "Watch video" links on News cards. */
export function videoLinksByFeedId(videos, base = "/") {
  const map = new Map();
  for (const v of videos) if (v.feedId && !map.has(v.feedId)) map.set(v.feedId, videoHref(v.id, base));
  return map;
}
/** Retention: keep everything newer than `days`, and pinned videos forever. */
export function retainedVideos(videos, days = 60, now = Date.now()) {
  const cutoff = now - days * 86400000;
  return videos.filter((v) => v.pinned === true || Date.parse(v.createdAt) >= cutoff);
}
