import { Marked } from "marked";
import DOMPurify from "dompurify";
import { safeImageUrl } from "./workspace.mjs";
import { embeddedVideo, markdownLink } from "./markdown-media.mjs";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
// Raw HTML remains visible text. Only markup produced from Markdown is rendered.
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: { html: ({ text }) => escape(text) },
});
let serial = 0;
let mermaidLoader: Promise<typeof import("mermaid").default> | undefined;
function loadMermaid() {
  return (mermaidLoader ||= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        theme: "neutral",
        fontFamily: "system-ui, sans-serif",
        suppressErrorRendering: true,
        maxTextSize: 50000,
        maxEdges: 500,
      });
      return mermaid;
    })
    .catch((error) => {
      mermaidLoader = undefined;
      throw error;
    }));
}
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
) => {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
};
function externalLink(url: string, title: string) {
  const link = el("a", "", title);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}
function videoFigure(
  video: NonNullable<ReturnType<typeof embeddedVideo>>,
  title: string,
) {
  const figure = el("figure", "markdown-video");
  if (video.kind === "file") {
    const player = el("video");
    player.src = video.src;
    player.controls = true;
    player.playsInline = true;
    player.preload = "none";
    player.setAttribute("aria-label", title || "Video");
    player.append(externalLink(video.href, "Open video"));
    figure.append(player);
  } else {
    const slot = el("div", "markdown-video-slot");
    const play = el(
      "button",
      "markdown-video-play",
      `▶ Play ${title || video.provider + " video"}`,
    );
    play.type = "button";
    const note = el(
      "p",
      "markdown-media-note",
      `Loads from ${video.provider} when you press Play.`,
    );
    play.addEventListener(
      "click",
      () => {
        const frame = el("iframe");
        frame.src = video.src;
        frame.title = title || `${video.provider} video`;
        frame.allow = "fullscreen; picture-in-picture; encrypted-media";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-presentation",
        );
        slot.replaceChildren(frame);
      },
      { once: true },
    );
    slot.append(play, note);
    figure.append(slot);
  }
  const caption = el("figcaption");
  caption.append(
    externalLink(video.href, title ? `Open video: ${title}` : "Open video"),
  );
  figure.append(caption);
  return figure;
}
async function diagram(
  figure: HTMLElement,
  canvas: HTMLElement,
  source: string,
  status: HTMLElement,
) {
  try {
    // Untrusted diagram directives must not override rendering/security settings.
    if (/%%\s*\{|^\s*---(?:\r?\n)/.test(source))
      throw new Error("Diagram configuration directives are not supported.");
    const mermaid = await loadMermaid();
    if (!figure.isConnected) return;
    const { svg } = await mermaid.render(`detail-diagram-${++serial}`, source);
    if (!figure.isConnected) return;
    const fragment = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["foreignObject", "a"],
      RETURN_DOM_FRAGMENT: true,
    });
    const image = fragment.querySelector("svg");
    if (!image) throw new Error("No diagram was produced.");
    image.setAttribute("role", "img");
    image.setAttribute(
      "aria-label",
      "Mermaid diagram; its text source is available below.",
    );
    canvas.replaceChildren(fragment);
    status.remove();
    figure.dataset.diagramState = "ready";
  } catch (error) {
    if (!figure.isConnected) return;
    figure.dataset.diagramState = "error";
    status.textContent = `This diagram could not be rendered. ${String((error as Error).message).slice(0, 200)} The source is available below.`;
    figure.querySelector<HTMLDetailsElement>("details")!.open = true;
  }
}
/** Render sanitized Markdown and add explicitly supported media through DOM APIs. */
export function renderMarkdown(source: string, base: string) {
  const root = el("div", "detail-text markdown-content");
  try {
    const html = marked.parse(source, { async: false });
    root.append(
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
          "del",
          "a",
          "blockquote",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "hr",
          "pre",
          "code",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
          "input",
          "img",
        ],
        ALLOWED_ATTR: [
          "href",
          "src",
          "alt",
          "title",
          "class",
          "start",
          "align",
          "type",
          "checked",
          "disabled",
        ],
        RETURN_DOM_FRAGMENT: true,
      }),
    );
  } catch {
    root.textContent = source;
    root.classList.add("markdown-plain-fallback");
    return root;
  }
  const headings = new Map<string, HTMLElement>();
  const slug = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/\s+/g, "-");
  root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6").forEach((heading) => {
    const key = slug(heading.textContent || "");
    if (!headings.has(key)) headings.set(key, heading);
  });
  root.querySelectorAll("a").forEach((link) => {
    const raw = link.getAttribute("href") || "";
    if (raw.startsWith("#")) {
      let key = "";
      try {
        key = slug(decodeURIComponent(raw.slice(1)));
      } catch {}
      const target = headings.get(key);
      if (target) {
        // Scroll the modal heading without changing the dashboard detail permalink.
        link.addEventListener("click", (event) => {
          event.preventDefault();
          target.scrollIntoView({ block: "start", behavior: "instant" });
        });
        return;
      }
    }
    const safe = markdownLink(raw, base);
    if (!safe) {
      link.replaceWith(...link.childNodes);
      return;
    }
    link.href = safe;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const paragraph = link.parentElement;
    const video = embeddedVideo(raw, base);
    if (
      video &&
      paragraph?.tagName === "P" &&
      paragraph.children.length === 1 &&
      paragraph.textContent?.trim() === link.textContent?.trim()
    ) {
      paragraph.replaceWith(videoFigure(video, link.textContent || "Video"));
    }
  });
  root.querySelectorAll("img").forEach((image) => {
    const raw = image.getAttribute("src") || "";
    const video = embeddedVideo(raw, base);
    const paragraph = image.parentElement;
    const standalone =
      paragraph?.tagName === "P" &&
      paragraph.children.length === 1 &&
      !paragraph.textContent?.trim();
    if (video) {
      (standalone ? paragraph! : image).replaceWith(
        videoFigure(video, image.alt),
      );
      return;
    }
    const safe = safeImageUrl(raw, base);
    if (!safe) {
      image.replaceWith(
        el("span", "markdown-media-note", image.alt || "Image unavailable"),
      );
      return;
    }
    image.src = safe;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () =>
        image.replaceWith(
          el(
            "p",
            "markdown-media-note",
            `Image unavailable${image.alt ? ": " + image.alt : ""}.`,
          ),
        ),
      { once: true },
    );
  });
  root.querySelectorAll("input").forEach((input) => {
    input.type = "checkbox";
    input.disabled = true;
    input.tabIndex = -1;
  });
  root.querySelectorAll("table").forEach((table) => {
    const wrap = el("div", "markdown-table");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute(
      "aria-label",
      "Markdown table; scroll sideways if needed",
    );
    table.replaceWith(wrap);
    wrap.append(table);
  });
  root
    .querySelectorAll<HTMLElement>("pre > code.language-mermaid")
    .forEach((code) => {
      const figure = el("figure", "markdown-diagram");
      figure.dataset.diagramState = "loading";
      const canvas = el("div", "markdown-diagram-canvas");
      const status = el("p", "markdown-media-note", "Rendering diagram…");
      status.setAttribute("role", "status");
      const details = el("details");
      details.append(el("summary", "", "Mermaid source"));
      const source = code.textContent || "";
      code.parentElement!.replaceWith(figure);
      const pre = el("pre");
      pre.append(code);
      details.append(pre);
      figure.append(canvas, status, details);
      // Start after the caller attaches the detail body, including immediate failures.
      queueMicrotask(() => { void diagram(figure, canvas, source, status); });
    });
  return root;
}
