/** Shared vertical swipe reader: snap scrolling, gestures, and keyboard. */
export type SwipeScroller = {
  getIndex: () => number;
  setIndex: (value: number) => void;
  getInteracted: () => boolean;
  markInteracted: () => void;
  go: (target: number) => void;
  sync: () => void;
  scrollToIndex: (target: number, behavior?: ScrollBehavior) => void;
};

type Options = {
  dialog: HTMLElement;
  scroller: HTMLElement;
  counter?: HTMLElement | null;
  previous?: HTMLButtonElement | null;
  next?: HTMLButtonElement | null;
  count: () => number;
  emptyLabel?: string;
  itemSelector?: string;
  ensureVisible?: (index: number) => void;
  onNearEnd?: (index: number) => void;
  onSync?: (index: number) => void;
  onEscape?: () => void;
};

export function installSwipeScroller(options: Options): SwipeScroller {
  const {
    dialog,
    scroller,
    counter,
    previous,
    next,
    count,
    emptyLabel = "No stories",
    itemSelector = ".news-reel",
    ensureVisible,
    onNearEnd,
    onSync,
    onEscape,
  } = options;
  let index = 0,
    interacted = false,
    frame = 0;
  const reducedMotion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function sync() {
    const n = count();
    scroller.querySelectorAll<HTMLElement>(itemSelector).forEach((reel, i) => {
      reel.inert = i !== index;
    });
    if (counter) counter.textContent = n ? `${index + 1} / ${n}` : emptyLabel;
    if (previous) previous.disabled = index === 0 || !n;
    if (next) next.disabled = index >= n - 1 || !n;
    onSync?.(index);
  }

  function go(target: number) {
    const n = count();
    if (!n) return;
    target = Math.max(0, Math.min(n - 1, target));
    ensureVisible?.(target);
    scroller.scrollTo({
      top: target * scroller.clientHeight,
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  }

  function scrollToIndex(target: number, behavior: ScrollBehavior = "instant") {
    const n = count();
    if (!n) {
      index = 0;
      sync();
      return;
    }
    index = Math.max(0, Math.min(n - 1, target));
    ensureVisible?.(index);
    scroller.scrollTo({ top: index * scroller.clientHeight, behavior });
    sync();
  }

  const resize = new ResizeObserver(() => {
    if (!dialog.hidden)
      scroller.scrollTo({
        top: index * scroller.clientHeight,
        behavior: "instant",
      });
  });
  resize.observe(scroller);

  scroller.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const n = count();
        index = Math.max(
          0,
          Math.min(
            Math.max(n, 1) - 1,
            Math.round(scroller.scrollTop / scroller.clientHeight),
          ),
        );
        onNearEnd?.(index);
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

  previous?.addEventListener("click", () => {
    interacted = true;
    go(index - 1);
  });
  next?.addEventListener("click", () => {
    interacted = true;
    go(index + 1);
  });
  scroller.addEventListener(
    "wheel",
    () => {
      interacted = true;
    },
    { passive: true },
  );
  scroller.addEventListener(
    "pointerdown",
    () => {
      interacted = true;
    },
    { passive: true },
  );
  dialog.addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).closest("input,select,textarea")) return;
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (
      ["ArrowDown", "PageDown", "ArrowUp", "PageUp", "Home", "End"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      interacted = true;
      go(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? count() - 1
            : index + (["ArrowDown", "PageDown"].includes(event.key) ? 1 : -1),
      );
    }
  });

  return {
    getIndex: () => index,
    setIndex: (value) => {
      index = value;
    },
    getInteracted: () => interacted,
    markInteracted: () => {
      interacted = true;
    },
    go,
    sync,
    scrollToIndex,
  };
}
