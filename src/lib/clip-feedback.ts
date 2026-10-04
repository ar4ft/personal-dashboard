let timer: ReturnType<typeof setTimeout> | undefined;
/** Brief feedback for the reading-to-board action; the existing status region announces it. */
export function showClipFeedback(message: string) {
  document.querySelector(".bookmark-feedback")?.remove();
  clearTimeout(timer);
  const note = document.createElement("div");
  note.className = "bookmark-feedback";
  note.dataset.state = "shown";
  note.setAttribute("aria-hidden", "true");
  note.textContent = message;
  // A modal's top layer must also own its feedback, otherwise the note sits behind it.
  const dialogs = [
    ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
  ];
  (dialogs.at(-1) || document.body).append(note);
  if (
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    navigator.vibrate
  )
    navigator.vibrate(12);
  timer = setTimeout(() => note.remove(), 2200);
}
