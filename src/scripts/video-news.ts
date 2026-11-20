import { parseVideoManifest, itemHref, VIDEO_MANIFEST_MAX_BYTES } from "../lib/videos.mjs";
import type { Video } from "../lib/videos.mjs";

const root = document.querySelector<HTMLElement>("#video-news");
if (root) init(root);

async function init(root: HTMLElement) {
  const base = root.dataset.base || "/";
  const repo = /^[\w.-]+\/[\w.-]+$/.test(root.dataset.repo || "") ? root.dataset.repo! : "ar4ft/personal-dashboard";
  const KEEP_KEY = "personal-dashboard:video-keep-requests:v1";
  const requested = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(KEEP_KEY) || "[]"); } catch { return []; } })());
  const scroller = root.querySelector<HTMLElement>("#video-news-scroller")!;
  const status = root.querySelector<HTMLElement>("#video-news-status")!;
  const position = root.querySelector<HTMLElement>("#video-news-position")!;
  const soundBtn = root.querySelector<HTMLButtonElement>("#video-news-sound")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let muted = true;
  let videos: Video[] = [];
  try {
    const res = await fetch(base.replace(/\/$/, "") + "/videos.json", { credentials: "omit", cache: "no-cache" });
    const text = await res.text();
    if (text.length > VIDEO_MANIFEST_MAX_BYTES) throw new Error("Video manifest is too large.");
    videos = parseVideoManifest(JSON.parse(text), base);
  } catch (e) {
    status.textContent = `Videos could not load. ${(e as Error).message}`;
    return;
  }
  if (!videos.length) { status.textContent = "No videos yet. New ones arrive with each news run."; return; }
  status.textContent = "";
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => {
    const n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n;
  };
  const players: HTMLVideoElement[] = [];
  videos.forEach((v, i) => {
    const reel = el("article", "video-reel");
    reel.dataset.index = String(i);
    reel.id = v.id;
    reel.setAttribute("aria-label", `${i + 1} of ${videos.length}: ${v.title}`);
    const video = el("video", "video-reel-player");
    video.src = v.src; // assigned as a property: values were validated as dashboard paths or https URLs
    if (v.poster) video.poster = v.poster;
    video.muted = true; video.loop = true; video.playsInline = true;
    video.preload = i < 2 ? "metadata" : "none";
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-label", `Video: ${v.title}`);
    if (v.captions) {
      const track = el("track"); track.kind = "captions"; track.srclang = "en"; track.label = "English"; track.src = v.captions;
      video.append(track);
    }
    video.addEventListener("click", () => toggleSound());
    const progress = el("div", "video-reel-progress"); const bar = el("span"); progress.append(bar);
    video.addEventListener("timeupdate", () => { bar.style.width = `${(video.currentTime / (video.duration || 1)) * 100}%`; });
    const info = el("div", "video-reel-info");
    const meta = el("p", "video-reel-meta", [v.source === "Twitter / X" ? "X" : v.source, ...v.topics.slice(0, 2)].filter(Boolean).join(" · "));
    const title = el("h2", "video-reel-title", v.title);
    info.append(meta, title);
    const links = el("div", "video-reel-links");
    if (v.url) {
      const a = el("a", "video-reel-link", "Read the story ↗"); a.href = v.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      links.append(a);
    }
    const inDash = itemHref(v.feedId, base);
    if (inDash) { const d = el("a", "video-reel-link", "In dashboard"); d.href = inDash; links.append(d); }
    const keep = el("button", "video-reel-keep");
    keep.type = "button";
    const paintKeep = () => {
      if (v.pinned) { keep.textContent = "📌 Kept forever"; keep.disabled = true; keep.title = "Pinned in videos.json: never removed by the 60-day cleanup."; }
      else if (requested.has(v.id)) { keep.textContent = "📌 Keep requested"; keep.title = "Waiting for the next curation run to pin it. Tap to open the request again."; }
      else { keep.textContent = "📌 Keep forever"; keep.title = "Videos are kept 60 days. Pin this one to keep it forever."; }
      keep.setAttribute("aria-label", `${keep.textContent.replace("📌 ", "")}: ${v.title}`);
    };
    keep.addEventListener("click", () => {
      if (v.pinned) return;
      requested.add(v.id);
      try { localStorage.setItem(KEEP_KEY, JSON.stringify([...requested])); } catch {}
      paintKeep();
      // The pin must reach the retention step on the curation box: a GitHub issue from the owner's account is the sync path.
      const q = new URLSearchParams({ title: `Keep video: ${v.id}`, body: `Please keep this video forever (pinned: true).\n\n${v.title}\n${v.feedId}`, labels: "keep-video" });
      window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
    });
    paintKeep();
    links.append(keep);
    info.append(links);
    if (v.transcript) { const t = el("p", "visually-hidden", v.transcript); info.append(t); }
    reel.append(video, progress, info);
    scroller.append(reel);
    players.push(video);
  });
  function toggleSound() {
    muted = !muted;
    players.forEach((p) => (p.muted = muted));
    soundBtn.setAttribute("aria-pressed", String(!muted));
    soundBtn.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
    const current = players.find((p) => !p.paused);
    if (current && !muted) current.play().catch(() => {});
  }
  soundBtn.addEventListener("click", toggleSound);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const video = e.target.querySelector("video")!;
      const i = Number((e.target as HTMLElement).dataset.index);
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        position.textContent = `${i + 1} / ${videos.length}`;
        const next = players[i + 1]; if (next && next.preload === "none") next.preload = "metadata";
        if (!reduced) video.play().catch(() => { video.muted = true; muted = true; video.play().catch(() => {}); });
      } else { video.pause(); }
    }
  }, { root: scroller, threshold: [0, 0.6, 1] });
  scroller.querySelectorAll(".video-reel").forEach((r) => io.observe(r));
  const target = decodeURIComponent(location.hash.slice(1));
  if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
  scroller.addEventListener("keydown", (e) => {
    if (e.key === "m") toggleSound();
    if (e.key === " ") { e.preventDefault(); const p = players.find((x) => !x.paused) || players[0]; if (p.paused) p.play(); else p.pause(); }
  });
}
