import {
  STORE_KEY,
  emptyState,
  validateBackup,
  materialize,
  sortItems,
  mergeFeed,
  validateFeed,
} from "../lib/workspace.mjs";
import type { Item, State } from "../lib/workspace.mjs";
const host = document.querySelector<HTMLElement>("[data-overview-seed]");
if (host) {
  const seed: Item[] = JSON.parse(host.dataset.overviewSeed!);
  const base = host.dataset.base!.replace(/\/$/, "") + "/";
  let state: State = emptyState();
  let storageOK = true;
  const load = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw)
        state = validateBackup({
          kind: "personal-dashboard-backup",
          version: 1,
          state: JSON.parse(raw),
        });
      else {
        const old = JSON.parse(
          localStorage.getItem("personal-dashboard:tasks:v1") || "{}",
        );
        seed
          .filter((i) => i.type === "task")
          .forEach((i) => {
            const id = i.id.split(":").slice(2).join(":");
            if (typeof old?.[id] === "boolean")
              state.edits[i.id] = {
                done: old[id],
                status: old[id] ? "done" : "todo",
              };
          });
      }
    } catch {
      storageOK = false;
    }
  };
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
  const persist = () => {
    if (storageOK)
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        storageOK = false;
      }
  };
  function render() {
    const all = materialize(seed, state);
    const news = sortItems(
      all.filter((i) => i.section === "news"),
      state,
      "news",
    ).slice(0, 3);
    const newsList = document.querySelector(".news-list")!;
    newsList.replaceChildren();
    news.forEach((item, index) => {
      const link = el("a", "news-item");
      link.href = base + "news/?item=" + encodeURIComponent(item.id);
      const body = el("div"),
        meta = el("div", "meta");
      meta.append(
        el("span", "", item.source || "News"),
        el("span", "", item.topics[0] || "General"),
      );
      body.append(
        meta,
        el("h3", "", item.title),
        el("p", "", item.description),
        el("small", "", `${item.favorite ? "★ Favorite · " : ""}View details`),
      );
      link.append(
        el("span", "story-number", String(index + 1).padStart(2, "0")),
        body,
      );
      newsList.append(link);
    });
    const ideas = sortItems(
        all.filter((i) => i.section === "ideas"),
        state,
        "ideas",
      ).slice(0, 3),
      ideaList = document.querySelector(".idea-grid")!;
    ideaList.replaceChildren();
    ideas.forEach((item) => {
      const card = el("article", "idea-card"),
        top = el("div", "card-top");
      const column = state.columns.ideas.find((c) => c.id === item.status);
      top.append(
        el("span", "badge explore", column?.title || "Idea"),
        el("span", "muted", item.topics[0] || "General"),
      );
      const title = el("h3"),
        link = el("a", "", item.title);
      link.href = base + "ideas/?item=" + encodeURIComponent(item.id);
      title.append(link);
      card.append(top, title, el("p", "", item.description));
      if (item.nextStep) {
        const next = el("div", "next-step");
        next.append(
          el("small", "", "NEXT SMALL STEP"),
          el("p", "", item.nextStep),
        );
        card.append(next);
      }
      ideaList.append(card);
    });
    const tasks = all
      .filter((i) => i.type === "task" && (i.group === "Today" || !i.group))
      .slice(0, 3);
    const todos = document.querySelector(".todo-list")!;
    todos.replaceChildren();
    tasks.forEach((item) => {
      const label = el("label", "todo-row"),
        input = el("input");
      input.type = "checkbox";
      input.dataset.taskId = item.id;
      input.checked = item.done;
      input.addEventListener("change", () => {
        let lane = state.columns.planning.find((c) => c.id !== "done");
        if (!input.checked && !lane) {
          lane = { id: "todo", title: "To do" };
          state.columns.planning.unshift(lane);
        }
        state.edits[item.id] = {
          ...state.edits[item.id],
          done: input.checked,
          status: input.checked ? "done" : lane!.id,
        };
        persist();
        const note = document.querySelector("#task-storage-note");
        if (!storageOK && note)
          note.textContent =
            "Storage is unavailable. Export changes from a section before leaving.";
      });
      label.append(
        input,
        el("span", "", item.title),
        el("small", "", item.group || "Task"),
      );
      todos.append(label);
    });
    const summary = document.querySelectorAll(".summary p");
    if (summary.length === 3) {
      summary[0].textContent = `${all.filter((i) => i.section === "news").length} items on your radar`;
      summary[1].textContent = `${all.filter((i) => i.section === "ideas").length} possibilities on the board`;
      summary[2].textContent = `${all.filter((i) => i.type === "task").length} tasks · ${all.filter((i) => i.type === "event").length} events`;
    }
  }
  load();
  render();
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY) {
      load();
      render();
    }
  });
  void (async () => {
    for (const url of [
      base + "feed.json",
      ...(state.feedUrl ? [state.feedUrl] : []),
    ]) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) continue;
        const text = await response.text();
        if (text.length > 10 * 1024 * 1024) continue;
        const incoming = validateFeed(JSON.parse(text));
        if (incoming.some((i) => state.custom.some((c) => c.id === i.id)))
          continue;
        mergeFeed(state, incoming);
        persist();
        render();
      } catch {
        /* Existing cached items remain visible when a source cannot be fetched. */
      }
    }
  })();
}
