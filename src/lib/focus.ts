/** Restore a control after its DOM is rebuilt, without moving the reader's scroll position. */
export function retainFocus(root: HTMLElement) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active))
    return () => {};
  const item = active.closest<HTMLElement>("[data-id]")?.dataset.id;
  const key = active.dataset.focusKey;
  const id = active.id;
  const label = active.getAttribute("aria-label");
  const text = active.textContent;
  const tag = active.tagName.toLowerCase();
  return () => {
    const container = item
      ? root.querySelector<HTMLElement>(`[data-id="${CSS.escape(item)}"]`) ||
        (root.dataset.id === item ? root : null)
      : root;
    if (!container) {
      if (root.id === "workspace-content")
        document
          .querySelector<HTMLInputElement>("#workspace-search")
          ?.focus({ preventScroll: true });
      return;
    }
    const replacement = key
      ? container.querySelector<HTMLElement>(
          `[data-focus-key="${CSS.escape(key)}"]`,
        )
      : id
        ? container.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
        : label
          ? container.querySelector<HTMLElement>(
              `${tag}[aria-label="${CSS.escape(label)}"]`,
            )
          : [...container.querySelectorAll<HTMLElement>(tag)].find(
              (node) => node.textContent === text,
            );
    if (replacement && !replacement.matches(":disabled"))
      replacement.focus({ preventScroll: true });
    // Filtering away a focused card should return the reader to a useful control.
    else if (root.id === "workspace-content")
      document
        .querySelector<HTMLInputElement>("#workspace-search")
        ?.focus({ preventScroll: true });
  };
}
