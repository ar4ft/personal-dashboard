import { safeUrl } from "../lib/workspace.mjs";
import type { Item, Column } from "../lib/workspace.mjs";
type Options = {
  items: () => Item[];
  find: (id: string) => Item | undefined;
  favorite: (item: Item) => void;
  move: (item: Item, column: string) => void;
  details: (id: string) => void;
  cover: (item: Item) => HTMLElement;
  columns: () => Column[];
  base: string;
};
/** Native vertical scroll snapping supports touch gestures without blocking scrolling. */
export function installNewsSwipe(host: HTMLElement, options: Options) {
  const launch = host.querySelector<HTMLButtonElement>("#news-swipe-launch");
  const dialog = host.querySelector<HTMLDialogElement>("#news-swipe-dialog");
  if (!launch || !dialog) return;
  const scroller = dialog.querySelector<HTMLElement>("#news-swipe-scroller")!;
  const counter = dialog.querySelector<HTMLElement>("#news-swipe-position")!;
  const message = dialog.querySelector<HTMLElement>("#news-swipe-status")!;
  const previous = dialog.querySelector<HTMLButtonElement>(
    "#news-swipe-previous",
  )!;
  const next = dialog.querySelector<HTMLButtonElement>("#news-swipe-next")!;
  let stories: Item[] = [],
    index = 0,
    rendered = 0,
    resize: ResizeObserver | undefined,
    frame = 0;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls = "",
    text = "",
  ) => {
    const n = document.createElement(tag);
    n.className = cls;
    n.textContent = text;
    return n;
  };
  const button = (
    text: string,
    action: () => void,
    label: string,
    cls = "",
  ) => {
    const n = el("button", cls, text);
    n.type = "button";
    n.setAttribute("aria-label", label);
    n.addEventListener("click", action);
    return n;
  };
  const reducedMotion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  function sync() {
    scroller.querySelectorAll<HTMLElement>(".news-reel").forEach((reel, i) => {
      reel.inert = i !== index;
      const item = options.find(reel.dataset.id!);
      if (!item) return;
      const favorite = reel.querySelector<HTMLButtonElement>(".reel-favorite")!;
      favorite.setAttribute("aria-pressed", String(!!item.favorite));
      favorite.textContent = item.favorite ? "★" : "☆";
      favorite.setAttribute(
        "aria-label",
        `${item.favorite ? "Unfavorite" : "Favorite"} ${item.title}`,
      );
      const select = reel.querySelector<HTMLSelectElement>(".reel-column")!;
      select.value = item.status;
    });
    counter.textContent = stories.length
      ? `${index + 1} / ${stories.length}`
      : "No stories";
    previous.disabled = index === 0 || !stories.length;
    next.disabled = index >= stories.length - 1 || !stories.length;
  }
  function appendBatch(count = 20) {
    const end = Math.min(stories.length, rendered + count);
    for (let i = rendered; i < end; i++) {
      const snapshot = stories[i],
        item = options.find(snapshot.id) || snapshot;
      const reel = el("article", "news-reel");
      reel.dataset.id = item.id;
      reel.setAttribute("aria-label", `Story ${i + 1}: ${item.title}`);
      const cover = options.cover(item);
      cover.classList.add("reel-media");
      const originalImage = cover.querySelector("img");
      if (originalImage) {
        originalImage.classList.add("reel-cover");
        const backdrop = originalImage.cloneNode(true) as HTMLImageElement;
        backdrop.className = "reel-backdrop";
        backdrop.alt = "";
        backdrop.setAttribute("aria-hidden", "true");
        cover.prepend(backdrop);
      }
      reel.append(cover, el("div", "reel-shade"));
      const body = el("div", "reel-body");
      const author = el("div", "reel-author");
      const name = item.author || item.source || "News";
      author.append(el("strong", "", name));
      reel.append(el("span", "reel-source-clipping", item.source || "News"));
      const stamp = el(
        "p",
        "reel-date",
        `${item.source && item.source !== name ? item.source + " · " : ""}${new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      );
      const topics = el("div", "reel-topics");
      item.topics.forEach((topic) =>
        topics.append(el("span", "", `#${topic.replace(/\s+/g, "")}`)),
      );
      body.append(
        author,
        stamp,
        el("h2", "reel-title", item.title),
        el(
          "p",
          "reel-description",
          item.description ||
            item.content.slice(0, 240) ||
            "Open the story for more details.",
        ),
        topics,
      );
      body.append(
        button(
          "Read story",
          () => options.details(item.id),
          `Read ${item.title}`,
          "reel-read",
        ),
      );
      const source = safeUrl(item.url);
      if (source) {
        const link = el("a", "reel-source", "Original source");
        link.href = source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        body.append(link);
      }
      const actions = el("div", "reel-actions");
      const favorite = button(
        "☆",
        () => {
          const current = options.find(item.id);
          if (current) {
            options.favorite(current);
            sync();
          }
        },
        `Favorite ${item.title}`,
        "reel-favorite",
      );
      const favoriteWrap = el("div", "reel-action");
      favoriteWrap.append(favorite, el("span", "", "Save"));
      const followWrap = el("div", "reel-action");
      followWrap.append(
        button(
          "▤",
          () => {
            const current = options.find(item.id);
            if (!current) return;
            const follow =
              options.columns().find((c) => c.id === "following") ||
              options.columns()[0];
            options.move(current, follow.id);
            message.textContent = `Saved to ${follow.title}.`;
            sync();
          },
          `Track ${item.title} on the board`,
          "reel-track",
        ),
        el("span", "", "Track"),
      );
      const shareWrap = el("div", "reel-action");
      const shareButton = button(
        "",
        () => void share(item),
        `Share ${item.title}`,
        "reel-share",
      );
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.7");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", "M12 16V3m-5 5 5-5 5 5M4 13v7h16v-7");
      svg.append(path);
      shareButton.append(svg);
      shareWrap.append(shareButton, el("span", "", "Share"));
      const select = el("select", "reel-column");
      select.setAttribute("aria-label", `Move ${item.title} to column`);
      options.columns().forEach((c) => {
        const option = el("option", "", c.title);
        option.value = c.id;
        select.append(option);
      });
      select.value = item.status;
      select.addEventListener("change", () => {
        const current = options.find(item.id);
        if (current) {
          options.move(current, select.value);
          message.textContent = "Board position saved.";
          sync();
        }
      });
      body.append(select);
      actions.append(favoriteWrap, followWrap, shareWrap);
      reel.append(body, actions);
      scroller.append(reel);
    }
    rendered = end;
  }
  async function share(item: Item) {
    const url = new URL(
      `${options.base}news/?item=${encodeURIComponent(item.id)}`,
      location.origin,
    ).href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.title,
          text: item.description,
          url,
        });
        message.textContent = "Story shared.";
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        message.textContent = "Story link copied.";
      } else message.textContent = url;
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        message.textContent = `Share this link: ${url}`;
    }
  }
  function go(target: number) {
    if (!stories.length) return;
    target = Math.max(0, Math.min(stories.length - 1, target));
    if (target >= rendered) appendBatch(target - rendered + 20);
    scroller.scrollTo({
      top: target * scroller.clientHeight,
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  }
  launch.addEventListener("click", () => {
    stories = options.items();
    index = 0;
    rendered = 0;
    scroller.replaceChildren();
    message.textContent = "Swipe up for the next story.";
    appendBatch();
    if (!stories.length) {
      const empty = el("div", "reels-empty");
      empty.append(
        el("h2", "", "No matching news"),
        el("p", "", "Close this view and adjust your search or topic filter."),
      );
      scroller.append(empty);
    }
    dialog.showModal();
    document.body.classList.add("news-swipe-open");
    scroller.scrollTop = 0;
    sync();
    resize = new ResizeObserver(() => {
      if (dialog.open) {
        scroller.scrollTop = index * scroller.clientHeight;
      }
    });
    resize.observe(scroller);
  });
  scroller.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        index = Math.max(
          0,
          Math.min(
            stories.length - 1,
            Math.round(scroller.scrollTop / scroller.clientHeight),
          ),
        );
        if (index >= rendered - 3 && rendered < stories.length) appendBatch();
        message.textContent = "";
        sync();
      });
    },
    { passive: true },
  );
  let touchStart: { y: number; index: number } | undefined;
  scroller.addEventListener(
    "touchstart",
    (event) => {
      touchStart =
        event.touches.length === 1
          ? { y: event.touches[0].clientY, index }
          : undefined;
    },
    { passive: true },
  );
  scroller.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart || !event.changedTouches.length) return;
      const gesture = touchStart;
      touchStart = undefined;
      const distance = gesture.y - event.changedTouches[0].clientY;
      if (Math.abs(distance) >= 65)
        requestAnimationFrame(() =>
          go(gesture.index + (distance > 0 ? 1 : -1)),
        );
    },
    { passive: true },
  );
  scroller.addEventListener(
    "touchcancel",
    () => {
      touchStart = undefined;
    },
    { passive: true },
  );
  previous.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  dialog.addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).closest("input,select,textarea")) return;
    if (
      ["ArrowDown", "PageDown", "ArrowUp", "PageUp", "Home", "End"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      go(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? stories.length - 1
            : index + (["ArrowDown", "PageDown"].includes(event.key) ? 1 : -1),
      );
    }
  });
  dialog.addEventListener("close", () => {
    resize?.disconnect();
    cancelAnimationFrame(frame);
    document.body.classList.remove("news-swipe-open");
  });
  host.querySelector("#detail-dialog")?.addEventListener("close", sync);
  host.querySelector("#edit-dialog")?.addEventListener("close", sync);
  return { sync };
}
