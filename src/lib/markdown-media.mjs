import { safeUrl, safeImageUrl } from "./workspace.mjs";

/** Markdown links use the same URL rules as source links and dashboard assets. */
export function markdownLink(value, base) {
  return safeUrl(value) || safeImageUrl(value, base);
}
/** Embeds never accept arbitrary frame URLs or scripts supplied by a feed. */
export function embeddedVideo(value, base) {
  const safe = safeImageUrl(value, base);
  if (!safe) return null;
  const url = new URL(safe, "https://dashboard.invalid");
  let id;
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ].includes(url.hostname)
  ) {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)\/?$/)?.[1];
  }
  if (id && /^[\w-]{11}$/.test(id))
    return {
      kind: "provider",
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      href: safe,
    };
  if (
    ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)
  ) {
    id = url.pathname.match(/^\/(?:video\/)?(\d{3,12})\/?$/)?.[1];
    if (id)
      return {
        kind: "provider",
        provider: "Vimeo",
        src: `https://player.vimeo.com/video/${id}?dnt=1`,
        href: safe,
      };
  }
  if (/\.(mp4|webm|ogv|ogg)$/i.test(url.pathname))
    return { kind: "file", src: safe, href: safe };
  return null;
}
