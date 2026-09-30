/** Pointer dragging works from card titles on desktop and from grab handles on touch. */
export function installBoardDrag(
  root: HTMLElement,
  move: (id: string, column: string, before?: string) => void,
  announce: (text: string) => void,
) {
  let active:
    | {
        id: string;
        pointer: number;
        node: HTMLElement;
        x: number;
        y: number;
        offsetX: number;
        offsetY: number;
        moved: boolean;
        ghost?: HTMLElement;
        column?: string;
        before?: string;
        lane?: HTMLElement;
        lastX: number;
        lastY: number;
      }
    | undefined;
  let suppressClick = false,
    frame = 0;
  const clearIndicators = () =>
    root
      .querySelectorAll(".drag-over,.drop-before,.drop-after")
      .forEach((n) =>
        n.classList.remove("drag-over", "drop-before", "drop-after"),
      );
  function targetAt(x: number, y: number) {
    if (!active) return;
    clearIndicators();
    active.column = undefined;
    active.before = undefined;
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    const lane = target?.closest<HTMLElement>(".kanban-column");
    if (!lane || !root.contains(lane)) return;
    active.lane = lane;
    active.column = lane.dataset.column;
    lane.classList.add("drag-over");
    const cards = Array.from(
      lane.querySelectorAll<HTMLElement>(".item-card"),
    ).filter((card) => card.dataset.id !== active!.id);
    const before = cards.find(
      (card) =>
        y <
        card.getBoundingClientRect().top +
          card.getBoundingClientRect().height / 2,
    );
    if (before) {
      active.before = before.dataset.id;
      before.classList.add("drop-before");
    } else cards.at(-1)?.classList.add("drop-after");
  }
  function autoScroll() {
    if (!active?.moved) return;
    const lane =
      active.lane || active.node.closest<HTMLElement>(".kanban-column");
    const board = lane?.closest<HTMLElement>(".kanban-board");
    if (board) {
      const rect = board.getBoundingClientRect();
      const speed =
        active.lastX < rect.left + 45
          ? -12
          : active.lastX > rect.right - 45
            ? 12
            : 0;
      if (speed) board.scrollLeft += speed;
    }
    const speed =
      active.lastY < 70 ? -10 : active.lastY > innerHeight - 70 ? 10 : 0;
    if (speed) window.scrollBy(0, speed);
    targetAt(active.lastX, active.lastY);
    frame = requestAnimationFrame(autoScroll);
  }
  function cleanup() {
    if (!active) return;
    active.ghost?.remove();
    active.node.classList.remove("dragging");
    if (active.node.hasPointerCapture(active.pointer))
      active.node.releasePointerCapture(active.pointer);
    active = undefined;
    cancelAnimationFrame(frame);
    clearIndicators();
    document.body.classList.remove("board-is-dragging");
  }
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || active) return;
    suppressClick = false;
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>(".kanban-column .item-card");
    if (!node) return;
    const handle = target.closest(".drag-handle");
    if (
      target.closest(".card-controls") ||
      target.closest("input,select,textarea,a") ||
      (target.closest("button") && !handle && !target.closest(".item-title"))
    )
      return;
    // Let touch users scroll naturally everywhere except the explicit grab handle.
    if (event.pointerType !== "mouse" && !handle) return;
    const rect = node.getBoundingClientRect();
    active = {
      id: node.dataset.id!,
      pointer: event.pointerId,
      node,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
      lastX: event.clientX,
      lastY: event.clientY,
    };
  });
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!active || event.pointerId !== active.pointer) return;
      active.lastX = event.clientX;
      active.lastY = event.clientY;
      if (
        !active.moved &&
        Math.hypot(event.clientX - active.x, event.clientY - active.y) < 7
      )
        return;
      event.preventDefault();
      if (!active.moved) {
        active.node.setPointerCapture(event.pointerId);
        active.moved = true;
        suppressClick = true;
        active.node.classList.add("dragging");
        document.body.classList.add("board-is-dragging");
        const ghost = active.node.cloneNode(true) as HTMLElement;
        ghost.classList.add("drag-ghost");
        ghost.removeAttribute("data-id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.style.width = active.node.getBoundingClientRect().width + "px";
        document.body.append(ghost);
        active.ghost = ghost;
        announce(
          "Dragging card. Release over a column or between cards. Press Escape to cancel.",
        );
        frame = requestAnimationFrame(autoScroll);
      }
      active.ghost!.style.left = event.clientX - active.offsetX + "px";
      active.ghost!.style.top = event.clientY - active.offsetY + "px";
      targetAt(event.clientX, event.clientY);
    },
    { passive: false },
  );
  window.addEventListener("pointerup", (event) => {
    if (!active || active.pointer !== event.pointerId) return;
    if (active.moved) {
      event.preventDefault();
      targetAt(event.clientX, event.clientY);
      const { id, column, before } = active;
      cleanup();
      if (column) move(id, column, before);
      else announce("Drop cancelled. Card stayed in its column.");
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    } else cleanup();
  });
  window.addEventListener("pointercancel", () => {
    cleanup();
    suppressClick = false;
    announce("Drag cancelled.");
  });
  root.addEventListener(
    "click",
    (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    },
    { capture: true },
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) {
      event.preventDefault();
      const moved = active.moved;
      cleanup();
      suppressClick = moved;
      announce("Drag cancelled.");
    }
  });
  window.addEventListener("blur", () => {
    cleanup();
    suppressClick = false;
  });
  // Grab handles also support moving without a pointing device.
  root.addEventListener("keydown", (event) => {
    const handle = (event.target as HTMLElement).closest(".drag-handle");
    if (!handle) return;
    const node = handle.closest<HTMLElement>(".item-card")!,
      lane = node.closest<HTMLElement>(".kanban-column")!,
      board = lane.closest(".kanban-board")!;
    const lanes = Array.from(
        board.querySelectorAll<HTMLElement>(".kanban-column"),
      ),
      index = lanes.indexOf(lane);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const destination = lanes[index + (event.key === "ArrowRight" ? 1 : -1)];
      if (!destination) return;
      event.preventDefault();
      move(node.dataset.id!, destination.dataset.column!);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const cards = Array.from(
          lane.querySelectorAll<HTMLElement>(".item-card"),
        ),
        position = cards.indexOf(node),
        up = event.key === "ArrowUp";
      if ((up && position === 0) || (!up && position === cards.length - 1))
        return;
      event.preventDefault();
      move(
        node.dataset.id!,
        lane.dataset.column!,
        up ? cards[position - 1].dataset.id : cards[position + 2]?.dataset.id,
      );
    } else return;
    const next = Array.from(root.querySelectorAll<HTMLElement>(".item-card"))
      .find((n) => n.dataset.id === node.dataset.id)
      ?.querySelector<HTMLButtonElement>(".drag-handle");
    next?.focus();
    next?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  return { isDragging: () => !!active?.moved };
}
