import { retainFocus } from "../lib/focus";
import { installNewsSwipe } from "./news-swipe";
import { installBoardDrag } from "../lib/board-drag";
import {
  STORE_KEY,
  emptyState,
  validateBackup,
  validateFeed,
  validateItem,
  materialize,
  filterItems,
  sortItems,
  moveItem,
  mergeFeed,
  safeUrl,
  safeImageUrl,
} from "../lib/workspace.mjs";
import type { Item, State, Section } from "../lib/workspace.mjs";
const host = document.querySelector<HTMLElement>("#interactive-workspace");
if (host) initialize(host);
function initialize(host: HTMLElement) {
  const section = host.dataset.section as Section,
    subsection = host.dataset.subsection || "All";
  const seed: Item[] = JSON.parse(host.dataset.seed || "[]"),
    base = host.dataset.base!.replace(/\/$/, "") + "/";
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    host.querySelector<T>(selector)!;
  const content = $("#workspace-content");
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
  const btn = (text: string, action: () => void, cls = "", label?: string) => {
    const n = el("button", cls, text);
    n.type = "button";
    if (cls) n.dataset.focusKey = cls.split(" ")[0];
    if (label) n.setAttribute("aria-label", label);
    n.addEventListener("click", action);
    return n;
  };
  let state: State = emptyState(),
    storageProblem = false;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw)
      state = validateBackup({
        kind: "personal-dashboard-backup",
        version: 1,
        state: JSON.parse(raw),
      });
    else {
      const tasks = JSON.parse(
        localStorage.getItem("personal-dashboard:tasks:v1") || "{}",
      );
      seed
        .filter((i) => i.type === "task")
        .forEach((i) => {
          const id = i.id.split(":").slice(2).join(":");
          if (typeof tasks?.[id] === "boolean")
            state.edits[i.id] = {
              done: tasks[id],
              status: tasks[id] ? "done" : "todo",
            };
        });
    }
  } catch {
    storageProblem = true;
    $("#save-status").textContent =
      "Saved workspace could not be loaded. Existing storage will not be overwritten; export changes before reloading.";
  }
  let query = "",
    topic = "",
    favorites = false,
    group = "none",
    swipe = false,
    limit = 30;
  let view =
    subsection === "Calendar" ? "calendar" : state.views[section] || "feed";
  if (view === "calendar" && section !== "planning") view = "feed";
  let currentDetail = "",
    editingId = "",
    detailOrder: string[] = [],
    busy = false;
  let calendarMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ),
    calendarDay = "";
  const announce = (message: string) => {
    $("#action-status").textContent = message;
  };
  const items = () => materialize(seed, state),
    find = (id: string) => items().find((i) => i.id === id);
  const filtered = () =>
    filterItems(
      items(),
      { section, query, topic, favorites, subsection },
      state,
    );
  function save(message = "") {
    if (!storageProblem)
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        $("#save-status").textContent =
          "Saved in this browser · export to back up";
      } catch {
        storageProblem = true;
        $("#save-status").textContent =
          "Browser storage unavailable or full. Export to keep this session’s changes.";
      }
    if (message) announce(message);
  }
  function mutate(action: () => void, message: string) {
    action();
    save(message);
    render();
  }
  function toggleFavorite(item: Item) {
    const active = state.favorites.includes(item.id);
    mutate(
      () => {
        state.favorites = active
          ? state.favorites.filter((id) => id !== item.id)
          : [...state.favorites, item.id];
      },
      active ? "Removed from favorites." : "Added to favorites.",
    );
    if (currentDetail === item.id) renderDetail();
  }
  function setColumn(item: Item, column: string, before?: string) {
    state.order[section] = sortItems(
      items().filter((i) => i.section === section),
      state,
      section,
      "board",
    ).map((i) => i.id);
    mutate(
      () => {
        moveItem(state, item, column, before);
      },
      `Moved to ${state.columns[section].find((c) => c.id === column)?.title}.`,
    );
    if (currentDetail === item.id) renderDetail();
  }
  const boardDrag = installBoardDrag(
    content,
    (id, column, before) => {
      const item = find(id);
      if (item) setColumn(item, column, before);
    },
    announce,
  );
  function columnSelect(item: Item) {
    const n = el("select");
    n.setAttribute("aria-label", `Move ${item.title} to column`);
    n.dataset.focusKey = "column";
    state.columns[section].forEach((c) => {
      const o = el("option", "", c.title);
      o.value = c.id;
      o.selected = item.status === c.id;
      n.append(o);
    });
    n.addEventListener("change", () => setColumn(item, n.value));
    return n;
  }
  function chips(item: Item) {
    const n = el("div", "topic-chips");
    item.topics.forEach((t) => n.append(el("span", "topic-chip", t)));
    return n;
  }
  function dateLabel(item: Item) {
    return new Date(
      `${item.date || item.createdAt.slice(0, 10)}T12:00:00`,
    ).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  function coverImage(item: Item) {
    const figure = el("figure", "post-media");
    const url = safeImageUrl(item.image || "", base);
    const fallback = () => {
      figure.classList.add("media-fallback");
      figure.replaceChildren(
        el("span", "media-kicker", item.source || item.topics[0] || section),
        el("span", "media-title", item.title),
        el(
          "span",
          "media-caption",
          url ? "Image unavailable" : "No image supplied",
        ),
      );
    };
    if (url) {
      const image = el("img");
      image.src = url;
      image.alt = item.imageAlt || item.title;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", fallback, { once: true });
      figure.append(image);
    } else fallback();
    return figure;
  }
  function card(item: Item, board = false) {
    const n = el("article", "item-card" + (board ? "" : " social-post"));
    n.dataset.id = item.id;
    const meta = el("div", "item-meta");
    meta.append(
      el(
        "span",
        "",
        item.source ||
          {
            news: "News",
            idea: "Project idea",
            task: "Task",
            event: "Calendar event",
          }[item.type],
      ),
      el("span", "", `${dateLabel(item)}${item.time ? " · " + item.time : ""}`),
    );
    if (board) n.append(meta);
    else {
      const identity = el("div", "post-identity");
      const name =
        item.author ||
        item.source ||
        (section === "ideas" ? "My ideas" : "My workspace");
      const avatar = el(
        "span",
        "post-avatar",
        name.replace(/^@/, "").slice(0, 2).toUpperCase(),
      );
      avatar.setAttribute("aria-hidden", "true");
      const byline = el("div", "post-byline");
      byline.append(
        el("strong", "", name),
        el(
          "span",
          "",
          `${item.source && item.source !== name ? item.source + " · " : ""}${dateLabel(item)}${item.time ? " · " + item.time : ""}`,
        ),
      );
      identity.append(avatar, byline);
      n.append(identity);
    }
    n.append(
      btn(
        item.title,
        () => openDetail(item.id),
        "item-title" + (item.done ? " card-done" : ""),
      ),
    );
    n.append(
      el(
        "p",
        "item-summary",
        item.description || item.nextStep || "Open to add notes and details.",
      ),
    );
    if (!board) {
      n.append(coverImage(item));
      const caption = el("div", "post-caption");
      if (item.content) {
        const excerpt =
          item.content.length > 280
            ? item.content.slice(0, 280).trimEnd() + "…"
            : item.content;
        caption.append(el("p", "post-excerpt", excerpt));
      }
      caption.append(
        btn(
          "Read more",
          () => openDetail(item.id),
          "read-more",
          `Read more about ${item.title}`,
        ),
      );
      const source = safeUrl(item.url);
      if (source) {
        const link = el(
          "a",
          "post-source",
          `Visit ${new URL(source).hostname.replace(/^www\./, "")}`,
        );
        link.href = source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        caption.append(link);
      }
      n.append(caption);
    }
    n.append(chips(item));
    const controls = el("div", "card-controls");
    const favorite = btn(
      item.favorite ? "★" : "☆",
      () => toggleFavorite(item),
      "favorite-button",
      `${item.favorite ? "Unfavorite" : "Favorite"} ${item.title}`,
    );
    favorite.setAttribute("aria-pressed", String(!!item.favorite));
    controls.append(
      favorite,
      btn("Edit", () => openEditor(item), "", `Edit ${item.title}`),
      columnSelect(item),
    );
    n.append(controls);
    if (board) {
      n.draggable = false;
      const handle = btn(
        "⠿",
        () => announce("Drag this handle, or use arrow keys to move the card."),
        "drag-handle",
        `Drag ${item.title}`,
      );
      handle.title =
        "Drag to move · arrow keys to move between columns or reorder";
      meta.append(handle);
    }
    return n;
  }
  function topicGroups(list: Item[]) {
    const groups = new Map<string, Item[]>();
    list.forEach((i) =>
      (i.topics.length ? i.topics : ["General"]).forEach((t) => {
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t)!.push(i);
      }),
    );
    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }
  function renderBoard(list: Item[], target: HTMLElement) {
    const board = el("div", "kanban-board");
    board.setAttribute("aria-label", "Kanban board");
    state.columns[section].forEach((c) => {
      const lane = el("section", "kanban-column");
      lane.dataset.column = c.id;
      lane.setAttribute("aria-label", `${c.title} column`);
      const entries = list.filter((i) => i.status === c.id),
        heading = el("div", "column-heading");
      heading.append(
        el("h2", "", c.title),
        el("span", "column-count", String(entries.length)),
      );
      lane.append(heading);
      if (!entries.length)
        lane.append(
          el("p", "empty-column", "Drop a card here, or use its column menu."),
        );
      entries.forEach((i) => lane.append(card(i, true)));
      board.append(lane);
    });
    target.append(board);
  }
  installNewsSwipe(host, {
    items: () => sortItems(filtered(), state, section, "newest"),
    find,
    favorite: toggleFavorite,
    move: setColumn,
    details: openDetail,
    cover: coverImage,
    columns: () => state.columns[section],
    base,
  });
  const scrollBehavior = (): ScrollBehavior =>
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
  function renderFeed(list: Item[], target: HTMLElement) {
    const feed = el("div", "feed-list" + (swipe ? " swipe-feed" : ""));
    if (swipe) {
      const controls = el("div", "feed-controls");
      controls.append(
        btn("← Previous", () =>
          feed.scrollBy({
            left: -feed.clientWidth * 0.9,
            behavior: scrollBehavior(),
          }),
        ),
        el("span", "", "Swipe or scroll sideways to browse"),
        btn("Next →", () =>
          feed.scrollBy({
            left: feed.clientWidth * 0.9,
            behavior: scrollBehavior(),
          }),
        ),
      );
      target.append(controls);
      feed.tabIndex = 0;
      feed.setAttribute("aria-label", "Swipeable feed");
      feed.addEventListener("keydown", (event) => {
        if (event.target !== feed) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          feed.scrollBy({
            left:
              feed.clientWidth * 0.9 * (event.key === "ArrowRight" ? 1 : -1),
            behavior: scrollBehavior(),
          });
        }
      });
    }
    list.forEach((i) => feed.append(card(i)));
    target.append(feed);
  }
  function renderTimeline(list: Item[], target: HTMLElement) {
    const n = el("div", "timeline-list"),
      dates = new Map<string, Item[]>();
    list.forEach((i) => {
      const key = i.date || i.createdAt.slice(0, 10);
      if (!dates.has(key)) dates.set(key, []);
      dates.get(key)!.push(i);
    });
    dates.forEach((entries, date) => {
      const block = el("section", "timeline-group");
      block.append(
        el(
          "h2",
          "timeline-heading",
          new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
            dateStyle: "long",
          }),
        ),
      );
      entries.forEach((i) => block.append(card(i)));
      n.append(block);
    });
    target.append(n);
  }
  function renderCalendar(list: Item[]) {
    const events = list.filter((i) => i.date),
      today = new Date();
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const panel = el("section", "panel workspace-calendar"),
      controls = el("div", "calendar-controls"),
      nav = el("div");
    controls.append(
      el(
        "h2",
        "",
        calendarMonth.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        }),
      ),
    );
    nav.append(
      btn(
        "←",
        () => {
          calendarMonth.setMonth(calendarMonth.getMonth() - 1);
          calendarDay = "";
          render();
        },
        "",
        "Previous month",
      ),
      btn("Today", () => {
        calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        calendarDay = key(today);
        render();
      }),
      btn(
        "→",
        () => {
          calendarMonth.setMonth(calendarMonth.getMonth() + 1);
          calendarDay = "";
          render();
        },
        "",
        "Next month",
      ),
    );
    controls.append(nav);
    panel.append(controls);
    const week = el("div", "calendar-week");
    ["M", "T", "W", "T", "F", "S", "S"].forEach((d) =>
      week.append(el("span", "", d)),
    );
    panel.append(week);
    const grid = el("div", "calendar-grid"),
      offset = (calendarMonth.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(el("span"));
    const days = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
    ).getDate();
    for (let day = 1; day <= days; day++) {
      const date = new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth(),
          day,
        ),
        value = key(date),
        hasEvents = events.some((i) => i.date === value);
      const b = btn(
        String(day),
        () => {
          calendarDay = calendarDay === value ? "" : value;
          render();
        },
        `${hasEvents ? "has-event " : ""}${value === key(today) ? "today" : ""}`,
        date.toLocaleDateString(undefined, { dateStyle: "full" }) +
          (hasEvents ? ", has events" : ""),
      );
      b.setAttribute("aria-pressed", String(calendarDay === value));
      if (value === key(today)) b.setAttribute("aria-current", "date");
      grid.append(b);
    }
    panel.append(
      grid,
      el("p", "hint", "Select a date to see events and tasks with due dates."),
    );
    const entries = events
      .filter((i) =>
        calendarDay
          ? i.date === calendarDay
          : i.date!.slice(0, 7) === key(calendarMonth).slice(0, 7),
      )
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    panel.append(
      el(
        "h3",
        "agenda-heading",
        calendarDay
          ? new Date(`${calendarDay}T12:00:00`).toLocaleDateString(undefined, {
              dateStyle: "long",
            })
          : "This month",
      ),
    );
    const agenda = el("div", "calendar-events-list");
    entries.forEach((i) => agenda.append(card(i)));
    if (!entries.length)
      agenda.append(
        el(
          "p",
          "hint",
          "No matching events or dated tasks. Add an event to make room for it.",
        ),
      );
    panel.append(agenda);
    content.append(panel);
  }
  function render() {
    if (boardDrag.isDragging()) return;
    const restoreFocus = retainFocus(content);
    const list = sortItems(
      filtered(),
      state,
      section,
      view === "board" ? "board" : view === "timeline" ? "timeline" : "newest",
    );
    $("#results-count").textContent =
      `${list.length} ${list.length === 1 ? "item" : "items"}${favorites ? " · favorites" : ""}${topic ? " · " + topic : ""}`;
    host
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((n) =>
        n.setAttribute("aria-pressed", String(n.dataset.view === view)),
      );
    $("#swipe-toggle").hidden = view !== "feed";
    $("#swipe-toggle").setAttribute("aria-pressed", String(swipe));
    $("#group-filter").closest("label")!.hidden =
      view === "calendar" || (view === "feed" && swipe);
    $("#favorites-filter").setAttribute("aria-pressed", String(favorites));
    const select = $<HTMLSelectElement>("#topic-filter");
    select.replaceChildren();
    const all = el("option", "", "All topics");
    all.value = "";
    select.append(all);
    [
      ...new Set(
        items()
          .filter((i) => i.section === section)
          .flatMap((i) => i.topics),
      ),
    ]
      .sort()
      .forEach((t) => {
        const option = el("option", "", t);
        option.value = t;
        select.append(option);
      });
    if (topic && !Array.from(select.options).some((o) => o.value === topic)) {
      const option = el("option", "", topic);
      option.value = topic;
      select.append(option);
    }
    select.value = topic;
    content.replaceChildren();
    if (view === "calendar") {
      renderCalendar(list);
      restoreFocus();
      return;
    }
    if (!list.length) {
      const empty = el("div", "empty-workspace");
      const hasFilters = Boolean(query || topic || favorites);
      const icon = el("span", "empty-icon", hasFilters ? "⌕" : "+");
      icon.setAttribute("aria-hidden", "true");
      empty.append(
        icon,
        el(
          "h3",
          "",
          hasFilters ? "No matching items" : "Your next item starts here",
        ),
        el(
          "p",
          "",
          query
            ? `Nothing matches “${query}” in this section. Try another search or clear your filters.`
            : hasFilters
              ? "Try a different topic or clear your filters to see more items."
              : "Add a story, capture an idea, or plan something you want to do.",
        ),
      );
      const actions = el("div", "empty-actions");
      if (hasFilters)
        actions.append(
          btn("Clear filters", () => {
            query = "";
            topic = "";
            favorites = false;
            limit = 30;
            $<HTMLInputElement>("#workspace-search").value = "";
            render();
            $("#workspace-search").focus({ preventScroll: true });
          }),
        );
      actions.append(btn("Add item", () => openEditor(), "primary-button"));
      empty.append(actions);
      content.append(empty);
      if (view !== "board") {
        restoreFocus();
        return;
      }
    }
    const visible = view === "board" ? list : list.slice(0, limit);
    const display = (entries: Item[], target: HTMLElement) => {
      if (view === "board") renderBoard(entries, target);
      else if (view === "timeline") renderTimeline(entries, target);
      else renderFeed(entries, target);
    };
    if (group === "topics" && !(view === "feed" && swipe))
      topicGroups(visible).forEach(([name, entries]) => {
        const wrap = el("section", "topic-board-group");
        wrap.append(el("h2", "group-heading", `${name} · ${entries.length}`));
        display(entries, wrap);
        content.append(wrap);
      });
    else display(visible, content);
    if (view !== "board" && list.length > limit)
      content.append(
        btn(
          `Load more (${list.length - limit} remaining)`,
          () => {
            const firstNew = list[limit];
            const added = Math.min(30, list.length - limit);
            limit += 30;
            render();
            content
              .querySelector<HTMLElement>(
                `[data-id="${CSS.escape(firstNew.id)}"] .item-title`,
              )
              ?.focus({ preventScroll: true });
            announce(`${added} more items loaded.`);
          },
          "load-more",
        ),
      );
    restoreFocus();
  }
  function openDetail(id: string) {
    currentDetail = id;
    detailOrder = sortItems(
      filtered(),
      state,
      section,
      view === "board" ? "board" : view === "timeline" ? "timeline" : "newest",
    ).map((i) => i.id);
    if (!detailOrder.includes(id)) detailOrder.unshift(id);
    renderDetail();
    $<HTMLDialogElement>("#detail-dialog").showModal();
    const url = new URL(location.href);
    url.searchParams.set("item", id);
    history.replaceState(null, "", url);
  }
  function renderDetail() {
    const item = find(currentDetail);
    if (!item) {
      $<HTMLDialogElement>("#detail-dialog").close();
      return;
    }
    const body = $("#detail-body");
    const restoreFocus = retainFocus(body);
    body.dataset.id = item.id;
    body.replaceChildren();
    body.append(
      el(
        "p",
        "detail-source",
        `${item.source || item.type} · ${dateLabel(item)}${item.time ? " · " + item.time : ""}`,
      ),
    );
    const title = el("h2", "detail-heading", item.title);
    title.id = "detail-title";
    body.append(title, chips(item));
    if (item.author) body.append(el("p", "detail-source", `By ${item.author}`));
    body.append(coverImage(item));
    if (item.description)
      body.append(el("p", "detail-summary", item.description));
    if (item.content) body.append(el("div", "detail-text", item.content));
    else
      body.append(
        el(
          "p",
          "detail-note",
          item.type === "news"
            ? "This feed item has no full article text yet. Open the original source to read it, or use Edit to add reading notes."
            : "Add your notes and details with Edit.",
        ),
      );
    if (item.nextStep)
      body.append(el("p", "detail-note", `Next step: ${item.nextStep}`));
    const actions = el("div", "detail-actions"),
      favorite = btn(
        item.favorite ? "★ Favorited" : "☆ Favorite",
        () => toggleFavorite(item),
        "favorite-button",
      );
    favorite.setAttribute("aria-pressed", String(!!item.favorite));
    actions.append(
      favorite,
      columnSelect(item),
      btn("Edit", () => {
        $<HTMLDialogElement>("#detail-dialog").close();
        openEditor(item);
      }),
    );
    if (item.type === "task")
      actions.append(
        btn(item.done ? "Mark incomplete" : "Mark complete", () => {
          let destination = "done";
          if (item.done) {
            let lane = state.columns.planning.find((c) => c.id !== "done");
            if (!lane) {
              lane = { id: "todo", title: "To do" };
              state.columns.planning.unshift(lane);
            }
            destination = lane.id;
          }
          setColumn(item, destination);
        }),
      );
    const url = safeUrl(item.url);
    if (url) {
      const link = el("a", "source-link", "Open original");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
    }
    actions.append(
      btn("Delete", () => {
        if (confirm(`Delete “${item.title}” from this workspace?`)) {
          $<HTMLDialogElement>("#detail-dialog").close();
          mutate(() => {
            state.hidden.push(item.id);
          }, "Item removed from this browser.");
        }
      }),
    );
    body.append(actions);
    const index = detailOrder.indexOf(item.id);
    $("#detail-position").textContent = `${index + 1} / ${detailOrder.length}`;
    $<HTMLButtonElement>("#detail-previous").disabled = index <= 0;
    $<HTMLButtonElement>("#detail-next").disabled =
      index >= detailOrder.length - 1;
    restoreFocus();
  }
  function advanceDetail(delta: number) {
    const index = detailOrder.indexOf(currentDetail) + delta;
    if (index < 0 || index >= detailOrder.length) return;
    currentDetail = detailOrder[index];
    renderDetail();
    const url = new URL(location.href);
    url.searchParams.set("item", currentDetail);
    history.replaceState(null, "", url);
    $<HTMLDialogElement>("#detail-dialog").scrollTop = 0;
  }
  $("#detail-previous").addEventListener("click", () => advanceDetail(-1));
  $("#detail-next").addEventListener("click", () => advanceDetail(1));
  $<HTMLDialogElement>("#detail-dialog").addEventListener(
    "keydown",
    (event) => {
      if ((event.target as HTMLElement).matches("input,select,textarea"))
        return;
      if (event.key === "ArrowLeft") advanceDetail(-1);
      if (event.key === "ArrowRight") advanceDetail(1);
    },
  );
  $<HTMLDialogElement>("#detail-dialog").addEventListener("close", () => {
    currentDetail = "";
    const url = new URL(location.href);
    url.searchParams.delete("item");
    history.replaceState(null, "", url);
  });
  const form = $<HTMLFormElement>("#item-form");
  const field = (name: string) =>
    form.elements.namedItem(name) as
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  function editorFields() {
    const type = field("type").value;
    $("#event-fields").hidden = type !== "task" && type !== "event";
    $("#next-step-field").hidden = type !== "idea";
    $("#task-group-field").hidden = type !== "task";
    field("date").required = type === "event";
  }
  function openEditor(item?: Item) {
    editingId = item?.id || "";
    form.reset();
    $("#form-error").textContent = "";
    $("#edit-title").textContent = item ? "Edit item" : "Add an item";
    const types =
      section === "news"
        ? ["news"]
        : section === "ideas"
          ? ["idea"]
          : ["task", "event"];
    const typeSelect = field("type") as HTMLSelectElement;
    typeSelect.replaceChildren();
    types.forEach((type) => {
      const option = el(
        "option",
        "",
        type === "event"
          ? "Calendar event"
          : type[0].toUpperCase() + type.slice(1),
      );
      option.value = type;
      typeSelect.append(option);
    });
    typeSelect.value = item?.type || types[0];
    typeSelect.disabled = !!item;
    const statusSelect = field("status") as HTMLSelectElement;
    statusSelect.replaceChildren();
    state.columns[section].forEach((c) => {
      const option = el("option", "", c.title);
      option.value = c.id;
      statusSelect.append(option);
    });
    for (const name of [
      "title",
      "description",
      "content",
      "source",
      "author",
      "image",
      "imageAlt",
      "url",
      "date",
      "time",
      "nextStep",
      "group",
    ])
      field(name).value = item ? String(item[name as keyof Item] || "") : "";
    field("topics").value = item?.topics.join(", ") || "";
    statusSelect.value = item?.status || state.columns[section][0].id;
    editorFields();
    $<HTMLDialogElement>("#edit-dialog").showModal();
    field("title").focus();
  }
  field("type").addEventListener("change", editorFields);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const previous = editingId ? find(editingId) : undefined;
    const raw: Record<string, unknown> = {
      ...previous,
      id: editingId || `${section}:local:${crypto.randomUUID()}`,
      section,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: field("type").value,
      topics: field("topics")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    for (const name of [
      "title",
      "description",
      "content",
      "source",
      "author",
      "image",
      "imageAlt",
      "url",
      "status",
      "date",
      "time",
      "nextStep",
      "group",
    ])
      raw[name] = field(name).value;
    raw.done = raw.type === "task" && raw.status === "done";
    try {
      const item = validateItem(raw);
      if (previous && !state.custom.some((i) => i.id === item.id)) {
        const patch: Partial<Item> = {
          ...state.edits[item.id],
          updatedAt: item.updatedAt,
        };
        for (const key of [
          "title",
          "description",
          "content",
          "topics",
          "source",
          "author",
          "image",
          "imageAlt",
          "url",
          "status",
          "date",
          "time",
          "nextStep",
          "group",
          "done",
        ] as const) {
          if (
            JSON.stringify(item[key] ?? "") !==
            JSON.stringify(previous[key] ?? "")
          )
            Object.assign(patch, { [key]: item[key] });
        }
        state.edits[item.id] = patch;
      } else if (previous)
        state.custom = state.custom.map((i) => (i.id === item.id ? item : i));
      else state.custom.push(item);
      save("Item saved.");
      $<HTMLDialogElement>("#edit-dialog").close();
      render();
    } catch (error) {
      $("#form-error").textContent = (error as Error).message;
    }
  });
  $("#new-item").addEventListener("click", () => openEditor());
  host
    .querySelectorAll<HTMLButtonElement>("[data-close]")
    .forEach((n) =>
      n.addEventListener("click", () =>
        $<HTMLDialogElement>(`#${n.dataset.close}`).close(),
      ),
    );
  host.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((n) =>
    n.addEventListener("click", () => {
      view = n.dataset.view!;
      state.views[section] = view;
      limit = 30;
      save();
      render();
    }),
  );
  $("#mobile-filters-toggle").addEventListener("click", () => {
    const open = $(".filter-bar").classList.toggle("filters-open");
    $("#mobile-filters-toggle").setAttribute("aria-expanded", String(open));
  });
  $("#workspace-search").addEventListener("input", () => {
    query = $<HTMLInputElement>("#workspace-search").value;
    limit = 30;
    render();
  });
  $("#topic-filter").addEventListener("change", () => {
    topic = $<HTMLSelectElement>("#topic-filter").value;
    limit = 30;
    render();
  });
  $("#group-filter").addEventListener("change", () => {
    group = $<HTMLSelectElement>("#group-filter").value;
    render();
  });
  $("#favorites-filter").addEventListener("click", () => {
    favorites = !favorites;
    limit = 30;
    render();
  });
  $("#swipe-toggle").addEventListener("click", () => {
    swipe = !swipe;
    render();
  });
  function renderColumns() {
    const list = $("#columns-list");
    list.replaceChildren();
    state.columns[section].forEach((column, index) => {
      const row = el("div", "column-editor-row"),
        input = el("input");
      input.value = column.title;
      input.maxLength = 80;
      input.setAttribute("aria-label", `Column name ${index + 1}`);
      const apply = btn("Rename", () => {
        const title = input.value.trim();
        if (!title) {
          $("#column-error").textContent = "Column names cannot be empty.";
          return;
        }
        mutate(() => {
          column.title = title;
        }, "Column renamed.");
        renderColumns();
      });
      const up = btn(
        "↑",
        () => {
          const columns = state.columns[section];
          [columns[index - 1], columns[index]] = [
            columns[index],
            columns[index - 1],
          ];
          save("Column moved.");
          render();
          renderColumns();
        },
        "",
        `Move ${column.title} left`,
      );
      up.disabled = index === 0;
      const down = btn(
        "↓",
        () => {
          const columns = state.columns[section];
          [columns[index + 1], columns[index]] = [
            columns[index],
            columns[index + 1],
          ];
          save("Column moved.");
          render();
          renderColumns();
        },
        "",
        `Move ${column.title} right`,
      );
      down.disabled = index === state.columns[section].length - 1;
      const remove = btn(
        "Remove",
        () => {
          if (
            !confirm(
              `Remove “${column.title}”? Its cards move to the first remaining column.`,
            )
          )
            return;
          const destination = state.columns[section].find(
            (c) => c.id !== column.id,
          )!;
          items()
            .filter((i) => i.section === section && i.status === column.id)
            .forEach((i) => moveItem(state, i, destination.id));
          state.columns[section] = state.columns[section].filter(
            (c) => c.id !== column.id,
          );
          save("Column removed; cards retained.");
          render();
          renderColumns();
        },
        "",
        `Remove ${column.title}`,
      );
      remove.disabled =
        state.columns[section].length === 1 || column.id === "done";
      row.append(input, apply, up, down, remove);
      list.append(row);
    });
  }
  $("#manage-board").addEventListener("click", () => {
    $("#column-error").textContent = "";
    renderColumns();
    $<HTMLDialogElement>("#columns-dialog").showModal();
  });
  $<HTMLFormElement>("#column-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      input = form.elements.namedItem("column") as HTMLInputElement;
    if (state.columns[section].length >= 12) {
      $("#column-error").textContent = "A board can have up to 12 columns.";
      return;
    }
    const title = input.value.trim();
    if (!title) return;
    state.columns[section].push({ id: crypto.randomUUID(), title });
    save("Column added.");
    input.value = "";
    render();
    renderColumns();
  });
  function downloadBackup(prefix = "dashboard-backup") {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: "personal-dashboard-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            state,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#data-settings").addEventListener("click", () => {
    (
      $<HTMLFormElement>("#feed-form").elements.namedItem(
        "feedUrl",
      ) as HTMLInputElement
    ).value = state.feedUrl;
    $<HTMLDialogElement>("#settings-dialog").showModal();
  });
  $("#export-backup").addEventListener("click", () => {
    downloadBackup();
    $("#settings-status").textContent =
      "Backup downloaded. Keep it to restore this workspace on another device.";
  });
  async function importFile(input: HTMLInputElement, backup: boolean) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a JSON file smaller than 10 MB.");
      const parsed = JSON.parse(await file.text());
      if (backup) {
        const restored = validateBackup(parsed);
        if (
          !confirm(
            "Restore this backup and replace this browser’s workspace? A recovery backup downloads first.",
          )
        )
          return;
        downloadBackup("dashboard-before-restore");
        state = restored;
        storageProblem = false;
      } else {
        const feed = validateFeed(parsed);
        if (feed.some((i) => state.custom.some((c) => c.id === i.id)))
          throw new Error("Feed IDs cannot overwrite locally created items.");
        mergeFeed(state, feed);
      }
      save(
        backup
          ? "Workspace restored."
          : "Feed imported; personal tracking preserved.",
      );
      render();
      $("#settings-status").textContent = backup
        ? "Workspace restored."
        : "Feed imported. New items are available in their sections.";
    } catch (error) {
      $("#settings-status").textContent =
        `Import failed: ${(error as Error).message}`;
    } finally {
      input.value = "";
    }
  }
  $("#feed-import").addEventListener(
    "change",
    (event) => void importFile(event.target as HTMLInputElement, false),
  );
  $("#backup-import").addEventListener(
    "change",
    (event) => void importFile(event.target as HTMLInputElement, true),
  );
  async function refreshFeeds() {
    if (busy) return;
    busy = true;
    const messages: string[] = [];
    let loaded = 0;
    for (const url of [
      base + "feed.json",
      ...(state.feedUrl ? [state.feedUrl] : []),
    ]) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          credentials: "omit",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (text.length > 10 * 1024 * 1024)
          throw new Error("Feed exceeds 10 MB.");
        const incoming = validateFeed(JSON.parse(text));
        if (incoming.some((i) => state.custom.some((c) => c.id === i.id)))
          throw new Error("Feed IDs cannot overwrite locally created items.");
        mergeFeed(state, incoming);
        loaded += incoming.length;
      } catch (error) {
        messages.push(
          `${url === base + "feed.json" ? "Repository feed" : "Public feed"}: ${(error as Error).message}`,
        );
      }
    }
    save();
    render();
    busy = false;
    const message = messages.length
      ? `Some feeds could not refresh. ${messages.join(" ")} Cached items remain available.`
      : `Feeds refreshed at ${new Date().toLocaleTimeString()}. ${loaded} items received.`;
    $("#feed-status").textContent = message;
    if (messages.length) announce(message);
    if (currentDetail) renderDetail();
  }
  $<HTMLFormElement>("#feed-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = (
      $<HTMLFormElement>("#feed-form").elements.namedItem(
        "feedUrl",
      ) as HTMLInputElement
    ).value.trim();
    if (value && !safeUrl(value)) {
      $("#feed-status").textContent = "Use a valid http or https feed URL.";
      return;
    }
    state.feedUrl = value;
    save("Feed source saved.");
    void refreshFeeds();
  });
  $("#refresh-feed").addEventListener("click", () => void refreshFeeds());
  window.addEventListener("storage", (event) => {
    if (event.key !== STORE_KEY || !event.newValue) return;
    try {
      state = validateBackup({
        kind: "personal-dashboard-backup",
        version: 1,
        state: JSON.parse(event.newValue),
      });
      render();
      if (currentDetail) renderDetail();
    } catch {
      announce(
        "Another tab saved an invalid workspace. Your current view is unchanged.",
      );
    }
  });
  render();
  const deepLink = new URL(location.href).searchParams.get("item");
  const openedInitially = !!(deepLink && find(deepLink));
  if (openedInitially) openDetail(deepLink!);
  void refreshFeeds().then(() => {
    if (deepLink && !openedInitially && !currentDetail && find(deepLink))
      openDetail(deepLink);
  });
  const interval = window.setInterval(
    () => {
      if (document.visibilityState === "visible") void refreshFeeds();
    },
    5 * 60 * 1000,
  );
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true,
  });
}
