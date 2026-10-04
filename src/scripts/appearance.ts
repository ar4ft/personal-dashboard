export {};
const key = "personal-dashboard:appearance";
const media = matchMedia("(prefers-color-scheme: dark)");
let mode = "auto";
try {
  const saved = localStorage.getItem(key);
  if (saved && ["auto", "light", "dark"].includes(saved)) mode = saved;
} catch {}
function apply() {
  document.documentElement.dataset.theme =
    mode === "auto" ? (media.matches ? "dark" : "light") : mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      document.documentElement.dataset.theme === "dark" ? "#102c32" : "#126773",
    );
  document
    .querySelectorAll<HTMLElement>("[data-theme-mode]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeMode === mode),
      ),
    );
}
document.querySelectorAll<HTMLElement>("[data-theme-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    mode = button.dataset.themeMode!;
    try {
      localStorage.setItem(key, mode);
    } catch {}
    apply();
  }),
);
media.addEventListener("change", () => {
  if (mode === "auto") apply();
});
apply();
