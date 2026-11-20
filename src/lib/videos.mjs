import { safeUrl, safeImageUrl } from "./workspace.mjs";

/** Video News manifest (public/videos.json). Separate from the v1 feed so feed backups stay unchanged. */
export const VIDEO_MANIFEST_MAX_BYTES = 2_000_000;
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
    const src = mediaUrl(v.src, base, "mp4");
    if (!src) throw new Error(`Video ${v.id} needs an MP4 src path or https URL.`);
    out.push({
      id: v.id,
      itemId: typeof v.itemId === "string" ? v.itemId : "",
      title: v.title,
      source: typeof v.source === "string" ? v.source : "",
      topics: Array.isArray(v.topics) ? v.topics.filter((t) => typeof t === "string" && t.length <= 80).slice(0, 4) : [],
      url: typeof v.url === "string" ? safeUrl(v.url) : "",
      src,
      poster: mediaUrl(v.poster, base, "jpg|jpeg|png|webp"),
      captions: mediaUrl(v.captions, base, "vtt"),
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      transcript: typeof v.transcript === "string" ? v.transcript.slice(0, 2000) : "",
      createdAt: typeof v.createdAt === "string" && !Number.isNaN(Date.parse(v.createdAt)) ? v.createdAt : "1970-01-01T00:00:00Z",
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
