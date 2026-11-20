import { parseVideoManifest, itemHref, VIDEO_MANIFEST_MAX_BYTES } from "../lib/videos.mjs";
import type { Video } from "../lib/videos.mjs";
import { installSwipeScroller } from "./swipe-scroller";

const root = document.querySelector<HTMLElement>("#video-news");
if (root) void init(root);

async function init(root: HTMLElement) {
  const base = root.dataset.base || "/";
  const repo = /^[\w.-]+\/[\w.-]+$/.test(root.dataset.repo || "")
    ? root.dataset.repo!
    : "ar4ft/personal-dashboard";
  const KEEP_KEY = "personal-dashboard:video-keep-requests:v1";
  const requested = new Set<string>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(KEEP_KEY) || "[]");
      } catch {
        return [];
      }
    })(),
  );
  const feed = root.querySelector<HTMLElement>("#video-news-feed")!;
  const cards = root.querySelector<HTMLElement>("#video-news-cards")!;
  const countEl = root.querySelector<HTMLElement>("#video-news-count")!;
  const status = root.querySelector<HTMLElement>("#video-news-status")!;
  const openBtn = root.querySelector<HTMLButtonElement>("#video-news-fullscreen")!;
  const dialog = root.querySelector<HTMLElement>("#news-swipe-dialog")!;
  const scroller = dialog.querySelector<HTMLElement>("#news-swipe-scroller")!;
  const counter = dialog.querySelector<HTMLElement>("#news-swipe-position")!;
  const message = dialog.querySelector<HTMLElement>("#news-swipe-status")!;
  const previous = dialog.querySelector<HTMLButtonElement>("#news-swipe-previous")!;
  const next = dialog.querySelector<HTMLButtonElement>("#news-swipe-next")!;
  const soundBtn = dialog.querySelector<HTMLButtonElement>("#video-news-sound")!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>("#video-news-close")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let muted = true;
  let videos: Video[] = [];
  let lastFocus: HTMLElement | null = null;

  try {
    const res = await fetch(base.replace(/\/$/, "") + "/videos.json", {
      credentials: "omit",
      cache: "no-cache",
    });
    const text = await res.text();
    if (text.length > VIDEO_MANIFEST_MAX_BYTES)
      throw new Error("Video manifest is too large.");
    videos = parseVideoManifest(JSON.parse(text), base);
  } catch (e) {
    status.textContent = `Videos could not load. ${(e as Error).message}`;
    openBtn.disabled = true;
    return;
  }
  if (!videos.length) {
    status.textContent = "No videos yet. New ones arrive with each news run.";
    openBtn.disabled = true;
    return;
  }
  status.textContent = "";
  countEl.textContent = `${videos.length} ${videos.length === 1 ? "video" : "videos"}`;

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls = "",
    text = "",
  ) => {
    const n = document.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  const players: HTMLVideoElement[] = [];
  let rendered = 0;

  function hashId() {
    try {
      return decodeURIComponent(location.hash.slice(1));
    } catch {
      return location.hash.slice(1);
    }
  }

  function setHash(id: string | null) {
    if (id) {
      const next = `#${encodeURIComponent(id)}`;
      if (location.hash !== next) history.replaceState(null, "", next);
    } else if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function paintSound() {
    soundBtn.setAttribute("aria-pressed", String(!muted));
    soundBtn.setAttribute("aria-label", muted ? "Sound off" : "Sound on");
    soundBtn.textContent = muted ? "🔇" : "🔊";
  }

  function applyMute() {
    players.forEach((p) => (p.muted = muted));
    paintSound();
  }

  function toggleSound() {
    muted = !muted;
    applyMute();
    const current = players[swipe.getIndex()];
    if (current && !muted) current.play().catch(() => {});
  }

  function preloadAround(index: number) {
    players.forEach((video, i) => {
      if (i === index || i === index + 1) {
        if (video.preload === "none") video.preload = "metadata";
      }
    });
  }

  function syncPlayback(index: number) {
    preloadAround(index);
    players.forEach((video, i) => {
      if (i === index) {
        if (reduced) {
          video.pause();
          return;
        }
        video.muted = muted;
        video.play().catch(() => {
          video.muted = true;
          muted = true;
          applyMute();
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }
    });
    const current = videos[index];
    if (current && !dialog.hidden) setHash(current.id);
  }

  function paintKeep(keep: HTMLButtonElement, v: Video) {
    const label = keep.parentElement?.querySelector("span");
    keep.textContent = "📌";
    if (v.pinned) {
      keep.disabled = true;
      keep.title =
        "Pinned in videos.json: never removed by the 60-day cleanup.";
      keep.setAttribute("aria-label", `Kept forever: ${v.title}`);
      if (label) label.textContent = "Kept";
    } else if (requested.has(v.id)) {
      keep.disabled = false;
      keep.title =
        "Waiting for the next curation run to pin it. Tap to open the request again.";
      keep.setAttribute("aria-label", `Keep requested: ${v.title}`);
      if (label) label.textContent = "Requested";
    } else {
      keep.disabled = false;
      keep.title = "Videos are kept 60 days. Pin this one to keep it forever.";
      keep.setAttribute("aria-label", `Keep forever: ${v.title}`);
      if (label) label.textContent = "Keep";
    }
  }

  function actionLink(
    href: string,
    icon: string,
    label: string,
    name: string,
    cls: string,
    external = false,
  ) {
    const wrap = el("div", "reel-action");
    const a = el("a", cls, icon);
    a.href = href;
    a.setAttribute("aria-label", `${label}: ${name}`);
    if (external) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    wrap.append(a, el("span", "", label));
    return wrap;
  }

  function appendBatch(count = 20) {
    const end = Math.min(videos.length, rendered + count);
    for (let i = rendered; i < end; i++) {
      const v = videos[i];
      const reel = el("article", "news-reel video-reel");
      reel.dataset.id = v.id;
      reel.setAttribute("aria-label", `Video ${i + 1}: ${v.title}`);
      const media = el("figure", "reel-media");
      const video = el("video", "reel-cover reel-inline-video");
      video.src = v.src;
      if (v.poster) video.poster = v.poster;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-label", `Video: ${v.title}`);
      if (v.captions) {
        const track = el("track");
        track.kind = "captions";
        track.srclang = "en";
        track.label = "English";
        track.src = v.captions;
        video.append(track);
      }
      video.addEventListener("click", (event) => {
        event.preventDefault();
        toggleSound();
      });
      media.append(video);
      const progress = el("div", "video-reel-progress");
      const bar = el("span");
      progress.append(bar);
      video.addEventListener("timeupdate", () => {
        bar.style.width = `${(video.currentTime / (video.duration || 1)) * 100}%`;
      });
      const sourceName = v.source === "Twitter / X" ? "X" : v.source || "Video";
      const inDash = itemHref(v.feedId, base);
      const body = el("div", "reel-body");
      body.append(
        el(
          "p",
          "reel-date",
          `${sourceName} · ${new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${i + 1} / ${videos.length}`,
        ),
        el("h2", "reel-title", v.title),
      );
      if (v.transcript) body.append(el("p", "visually-hidden", v.transcript));

      const actions = el("div", "reel-actions");
      if (v.url)
        actions.append(
          actionLink(v.url, "↗", "Story", v.title, "reel-source", true),
        );
      if (inDash)
        actions.append(
          actionLink(inDash, "▤", "Dashboard", v.title, "reel-source reel-dash"),
        );
      const keepWrap = el("div", "reel-action");
      const keep = el("button", "reel-keep");
      keep.type = "button";
      keepWrap.append(keep, el("span", "", "Keep"));
      keep.addEventListener("click", () => {
        if (v.pinned) return;
        requested.add(v.id);
        try {
          localStorage.setItem(KEEP_KEY, JSON.stringify([...requested]));
        } catch {}
        paintKeep(keep, v);
        const q = new URLSearchParams({
          title: `Keep video: ${v.id}`,
          body: `Please keep this video forever (pinned: true).\n\n${v.title}\n${v.feedId}`,
          labels: "keep-video",
        });
        window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
      });
      paintKeep(keep, v);
      actions.append(keepWrap);

      reel.append(media, progress, body, actions);
      scroller.append(reel);
      players.push(video);
    }
    rendered = end;
  }

  videos.forEach((v) => {
    const card = el("button", "video-card");
    card.type = "button";
    card.dataset.id = v.id;
    card.setAttribute("aria-label", `Watch ${v.title} full screen`);
    if (v.poster) {
      const img = el("img", "video-card-poster");
      img.src = v.poster;
      img.alt = "";
      img.loading = "lazy";
      card.append(img);
    } else {
      card.append(el("div", "video-card-poster video-card-fallback"));
    }
    const meta = el("div", "video-card-body");
    meta.append(
      el(
        "p",
        "video-card-meta",
        [v.source === "Twitter / X" ? "X" : v.source, ...v.topics.slice(0, 2)]
          .filter(Boolean)
          .join(" · "),
      ),
      el("h2", "video-card-title", v.title),
    );
    card.append(meta);
    card.addEventListener("click", () => openReader(v.id, card));
    cards.append(card);
  });

    const swipe = installSwipeScroller({
    dialog,
    scroller,
    counter,
    previous,
    next,
    count: () => videos.length,
    emptyLabel: "No videos",
    ensureVisible: (target) => {
      if (target >= rendered) appendBatch(target - rendered + 20);
    },
    onNearEnd: (index) => {
      message.textContent = "";
      if (index >= rendered - 3 && rendered < videos.length) appendBatch();
    },
    onSync: (index) => {
      if (!dialog.hidden) syncPlayback(index);
    },
    onEscape: () => closeReader(),
  });

  function openReader(id?: string, from?: HTMLElement) {
    if (!videos.length) return;
    lastFocus = from || openBtn;
    const found = id ? videos.findIndex((v) => v.id === id) : swipe.getIndex();
    const target = found < 0 ? 0 : found;
    dialog.hidden = false;
    feed.hidden = true;
    document.body.classList.add("news-swipe-open");
    swipe.scrollToIndex(target, "instant");
    syncPlayback(swipe.getIndex());
    scroller.focus({ preventScroll: true });
  }

  function closeReader() {
    if (dialog.hidden) return;
    players.forEach((p) => p.pause());
    dialog.hidden = true;
    feed.hidden = false;
    document.body.classList.remove("news-swipe-open");
    setHash(null);
    (lastFocus || openBtn).focus();
  }

  openBtn.addEventListener("click", () => openReader(videos[0]?.id, openBtn));
  closeBtn.addEventListener("click", () => closeReader());
  soundBtn.addEventListener("click", toggleSound);
  paintSound();
  document.addEventListener("keydown", (event) => {
    if (dialog.hidden || event.key !== "Escape") return;
    if ((event.target as HTMLElement).closest("input,select,textarea")) return;
    event.preventDefault();
    closeReader();
  });

  scroller.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleSound();
    }
    if (e.key === " ") {
      e.preventDefault();
      const p = players[swipe.getIndex()];
      if (!p) return;
      if (p.paused) p.play().catch(() => {});
      else p.pause();
    }
  });

  const start = hashId();
  if (start && videos.some((v) => v.id === start)) openReader(start, openBtn);
  window.addEventListener("hashchange", () => {
    const id = hashId();
    if (id && videos.some((v) => v.id === id)) openReader(id);
    else closeReader();
  });
}
