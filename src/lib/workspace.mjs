export const STORE_KEY = "personal-dashboard:workspace:v1";
export const DEFAULT_COLUMNS = {
  news: [
    { id: "inbox", title: "Inbox" },
    { id: "following", title: "Following" },
    { id: "read", title: "Read" },
    { id: "archived", title: "Archived" },
  ],
  ideas: [
    { id: "explore", title: "Explore" },
    { id: "build", title: "Build" },
    { id: "later", title: "Later" },
    { id: "shipped", title: "Shipped" },
  ],
  planning: [
    { id: "todo", title: "To do" },
    { id: "doing", title: "Doing" },
    { id: "done", title: "Done" },
  ],
};
export function emptyState() {
  return {
    version: 1,
    edits: {},
    custom: [],
    hidden: [],
    favorites: [],
    columns: structuredClone(DEFAULT_COLUMNS),
    order: { news: [], ideas: [], planning: [] },
    views: {},
    cachedItems: [],
    feedUrl: "",
  };
}
export function seedItems(data) {
  const stamp = "2026-09-30T00:00:00Z";
  const common = (item, section, type) => ({
    id: `${section}:${type}:${item.id}`,
    section,
    type,
    title: item.title,
    description: item.description || "",
    content: item.content || "",
    topics: item.topics || [
      item.category || item.calendar || item.group || "General",
    ],
    source: item.source || "",
    author: item.author || "",
    image: item.image || "",
    imageAlt: item.imageAlt || "",
    url: item.url || "",
    createdAt: item.createdAt || stamp,
    updatedAt: item.updatedAt || item.createdAt || stamp,
    status: "",
    done: false,
    ...(item.date ? { date: item.date } : {}),
    ...(item.time ? { time: item.time } : {}),
    nextStep: item.nextStep || "",
    group: item.group || "",
  });
  return [
    ...data.news.map((i) => ({
      ...common(i, "news", "news"),
      status: "inbox",
    })),
    ...data.ideas.map((i) => ({
      ...common(i, "ideas", "idea"),
      status: i.stage.toLowerCase(),
    })),
    ...data.todos.map((i) => ({
      ...common(i, "planning", "task"),
      status: i.done ? "done" : "todo",
      done: i.done,
    })),
    ...data.events.map((i) => ({
      ...common(i, "planning", "event"),
      status: "todo",
    })),
  ];
}
export function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
/** Comparison only: keep the original URL for opening/sharing the source. */
export function newsSourceKey(url) {
  const safe = safeUrl(url);
  if (!safe) return "";
  const parsed = new URL(safe);
  parsed.hash = "";
  if (parsed.pathname.endsWith("/"))
    parsed.pathname = parsed.pathname.slice(0, -1);
  for (const name of [...parsed.searchParams.keys()])
    if (
      /^utm_/i.test(name) ||
      ["fbclid", "gclid", "dclid", "msclkid"].includes(name.toLowerCase())
    )
      parsed.searchParams.delete(name);
  parsed.searchParams.sort();
  return parsed.href;
}
export function duplicateNewsSource(item, items) {
  const key = item.section === "news" ? newsSourceKey(item.url) : "";
  if (!key) return undefined;
  return items.find(
    (other) =>
      other.section === "news" &&
      other.id !== item.id &&
      newsSourceKey(other.url) === key,
  );
}
export function assertUniqueNewsSources(items) {
  const urls = new Map();
  // Same-ID entries are updates, including feed overlays of starter items.
  for (const item of new Map(items.map((item) => [item.id, item])).values()) {
    const key = item.section === "news" ? newsSourceKey(item.url) : "";
    if (!key) continue;
    if (urls.has(key))
      throw new Error(
        `Duplicate news source URL: "${item.title}" and "${urls.get(key).title}". Keep one news item per source link.`,
      );
    urls.set(key, item);
  }
}
export function safeImageUrl(value, base = "/") {
  if (typeof value !== "string" || !value) return "";
  if (/^https:\/\//i.test(value)) return safeUrl(value);
  // A relative path refers to a public file inside this dashboard, never another host.
  if (
    !/^(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+$/.test(value) ||
    value.split("/").includes("..")
  )
    return "";
  return base.replace(/\/$/, "") + "/" + value;
}
function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function validateItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Each feed item must be an object.");
  if (!["news", "ideas", "planning"].includes(value.section))
    throw new Error("Item section must be news, ideas, or planning.");
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > 200 ||
    ["__proto__", "constructor", "prototype"].includes(value.id)
  )
    throw new Error("Each item needs a stable ID (up to 200 characters).");
  if (
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 500
  )
    throw new Error("Each item needs a title (up to 500 characters).");
  const type =
    value.type ||
    { news: "news", ideas: "idea", planning: "task" }[value.section];
  if (
    !{ news: ["news"], ideas: ["idea"], planning: ["task", "event"] }[
      value.section
    ].includes(type)
  )
    throw new Error("Item type does not match its section.");
  if (value.image && !safeImageUrl(value.image))
    throw new Error(
      "Images must use HTTPS or a dashboard-relative path such as media/story.jpg.",
    );
  if (value.url && !safeUrl(value.url))
    throw new Error("Source links must use http or https.");
  if (value.date && !validDate(value.date))
    throw new Error("Event and due dates must be valid YYYY-MM-DD dates.");
  if (type === "event" && !value.date)
    throw new Error("Calendar events need a date.");
  if (value.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time))
    throw new Error("Event times must use HH:MM.");
  if (
    value.topics !== undefined &&
    (!Array.isArray(value.topics) ||
      value.topics.some(
        (t) => typeof t !== "string" || !t.trim() || t.length > 80,
      ))
  )
    throw new Error(
      "Topics must be an array of nonempty strings (up to 80 characters each).",
    );
  const timestamp = value.createdAt || "1970-01-01T00:00:00Z";
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp)))
    throw new Error("createdAt must be a valid date or ISO timestamp.");
  if (
    value.updatedAt &&
    (typeof value.updatedAt !== "string" ||
      Number.isNaN(Date.parse(value.updatedAt)))
  )
    throw new Error("updatedAt must be a valid date or ISO timestamp.");
  for (const key of [
    "description",
    "content",
    "source",
    "author",
    "image",
    "imageAlt",
    "nextStep",
    "group",
    "status",
  ])
    if (value[key] !== undefined && typeof value[key] !== "string")
      throw new Error(`${key} must be text.`);
  if (value.done !== undefined && typeof value.done !== "boolean")
    throw new Error("done must be a boolean.");
  return {
    id: value.id,
    section: value.section,
    type,
    title: value.title.trim(),
    description: value.description || "",
    content: value.content || "",
    topics: [...new Set(value.topics || ["General"])],
    source: value.source || "",
    author: value.author || "",
    image: value.image || "",
    imageAlt: value.imageAlt || "",
    url: value.url ? safeUrl(value.url) : "",
    status:
      value.status ||
      (type === "task" && value.done
        ? "done"
        : DEFAULT_COLUMNS[value.section][0].id),
    createdAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(value.updatedAt || timestamp).toISOString(),
    done: type === "task" && (value.status === "done" || !!value.done),
    date: value.date || "",
    time: value.time || "",
    nextStep: value.nextStep || "",
    group: value.group || "",
  };
}
function validateCollection(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.items))
    throw new Error("Use a JSON object with version: 1 and an items array.");
  if (payload.items.length > 10000)
    throw new Error("A feed can contain at most 10,000 items.");
  const items = payload.items.map(validateItem);
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("Feed item IDs must be unique across all sections.");
  return items;
}
export function validateFeed(payload) {
  const items = validateCollection(payload);
  assertUniqueNewsSources(items);
  return items;
}
export function mergeFeed(state, items, seed = []) {
  const cache = new Map(state.cachedItems.map((item) => [item.id, item]));
  const existing = new Map(
    [...seed, ...state.cachedItems, ...state.custom].map((item) => [
      item.id,
      item,
    ]),
  );
  const urls = new Map();
  const keyOf = (item) => {
    const effective = { ...item, ...state.edits[item.id] };
    return effective.section === "news" ? newsSourceKey(effective.url) : "";
  };
  function reserve(key, id) {
    if (!key) return;
    if (!urls.has(key)) urls.set(key, new Set());
    urls.get(key).add(id);
  }
  for (const item of existing.values()) reserve(keyOf(item), item.id);
  for (const item of items) {
    const key = keyOf(item);
    // Preserve the existing stable ID and its tracking, including deleted items.
    if (key && [...(urls.get(key) || [])].some((id) => id !== item.id))
      continue;
    const previous = existing.get(item.id);
    if (previous) urls.get(keyOf(previous))?.delete(item.id);
    existing.set(item.id, item);
    reserve(key, item.id);
    cache.set(item.id, item);
  }
  state.cachedItems = [...cache.values()];
  return state;
}
export function materialize(seed, state) {
  const items = new Map(
    [...seed, ...state.cachedItems, ...state.custom].map((item) => [
      item.id,
      item,
    ]),
  );
  return [...items.values()]
    .filter((item) => !state.hidden.includes(item.id))
    .map((item) => {
      const merged = {
        ...item,
        ...(Object.hasOwn(state.edits, item.id) ? state.edits[item.id] : {}),
      };
      const columns = state.columns[merged.section];
      if (!columns.some((c) => c.id === merged.status))
        merged.status = columns[0].id;
      return { ...merged, favorite: state.favorites.includes(item.id) };
    });
}
export function filterItems(
  items,
  { section, query = "", topic = "", favorites = false, subsection = "All" },
  state,
) {
  const text = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (
      item.section !== section ||
      (favorites && !item.favorite) ||
      (topic && !item.topics.includes(topic))
    )
      return false;
    if (subsection !== "All") {
      if (section === "news" && item.source !== subsection) return false;
      if (
        section === "ideas" &&
        item.status !==
          (DEFAULT_COLUMNS.ideas.find((c) => c.title === subsection)?.id ||
            subsection)
      )
        return false;
      if (
        section === "planning" &&
        subsection === "Calendar" &&
        item.type !== "event"
      )
        return false;
      if (
        section === "planning" &&
        subsection !== "Calendar" &&
        item.group !== subsection
      )
        return false;
    }
    return (
      !text ||
      [
        item.title,
        item.description,
        item.content,
        item.source,
        item.author || "",
        item.nextStep,
        ...item.topics,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(text)
    );
  });
}
export function sortItems(items, state, section, mode = "newest") {
  const copy = [...items];
  if (mode === "board") {
    const order = state.order[section];
    const ranks = new Map(order.map((id, i) => [id, i]));
    return copy.sort(
      (a, b) =>
        (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
  }
  return copy.sort((a, b) => {
    const da =
      mode === "timeline"
        ? Date.parse((a.date || a.createdAt.slice(0, 10)) + "T12:00:00Z")
        : Date.parse(a.createdAt);
    const db =
      mode === "timeline"
        ? Date.parse((b.date || b.createdAt.slice(0, 10)) + "T12:00:00Z")
        : Date.parse(b.createdAt);
    return db - da || a.id.localeCompare(b.id);
  });
}
export function moveItem(state, item, status, beforeId) {
  if (!state.columns[item.section].some((c) => c.id === status))
    throw new Error("Unknown board column.");
  state.edits[item.id] = {
    ...state.edits[item.id],
    status,
    ...(item.type === "task" ? { done: status === "done" } : {}),
  };
  const order = state.order[item.section].filter((id) => id !== item.id);
  const index = beforeId ? order.indexOf(beforeId) : -1;
  if (index < 0) order.push(item.id);
  else order.splice(index, 0, item.id);
  state.order[item.section] = order;
  return state;
}
export function validateBackup(payload) {
  if (
    !payload ||
    payload.kind !== "personal-dashboard-backup" ||
    payload.version !== 1
  )
    throw new Error(
      "This is not a dashboard backup. Use Import feed for feed JSON.",
    );
  const source = payload.state;
  if (!source || typeof source !== "object" || source.version !== 1)
    throw new Error("Invalid backup state.");
  const state = emptyState();
  for (const section of Object.keys(DEFAULT_COLUMNS)) {
    const columns = source.columns?.[section];
    if (
      !Array.isArray(columns) ||
      !columns.length ||
      columns.length > 12 ||
      columns.some(
        (c) =>
          !c ||
          typeof c.id !== "string" ||
          !c.id ||
          typeof c.title !== "string" ||
          !c.title.trim() ||
          c.title.length > 80,
      ) ||
      new Set(columns.map((c) => c.id)).size !== columns.length
    )
      throw new Error("Invalid backup columns.");
    state.columns[section] = columns.map((c) => ({ id: c.id, title: c.title }));
    const order = source.order?.[section];
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string"))
      throw new Error("Invalid backup card order.");
    state.order[section] = [...new Set(order)];
    if (
      ["feed", "board", "timeline", "calendar"].includes(
        source.views?.[section],
      ) ||
      (section !== "planning" && source.views?.[section] === "swipe")
    )
      state.views[section] = source.views[section];
  }
  for (const key of ["hidden", "favorites"]) {
    if (
      !Array.isArray(source[key]) ||
      source[key].some((id) => typeof id !== "string")
    )
      throw new Error(`Invalid backup ${key}.`);
    state[key] = [...new Set(source[key])];
  }
  state.custom = validateCollection({ version: 1, items: source.custom });
  state.cachedItems = validateCollection({
    version: 1,
    items: source.cachedItems,
  });
  if (
    !source.edits ||
    typeof source.edits !== "object" ||
    Array.isArray(source.edits)
  )
    throw new Error("Invalid backup edits.");
  for (const [id, edit] of Object.entries(source.edits)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(id) ||
      !edit ||
      typeof edit !== "object" ||
      Array.isArray(edit)
    )
      throw new Error("Invalid backup edit.");
    const allowed = {};
    for (const key of [
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
      "updatedAt",
    ]) {
      if (edit[key] !== undefined) {
        if (typeof edit[key] !== "string")
          throw new Error("Invalid edited text.");
        allowed[key] = edit[key];
      }
    }
    if (allowed.title !== undefined && !allowed.title.trim())
      throw new Error("Edited titles cannot be empty.");
    if (allowed.image && !safeImageUrl(allowed.image))
      throw new Error("Invalid edited image URL.");
    if (allowed.url && !safeUrl(allowed.url))
      throw new Error("Invalid edited URL.");
    if (allowed.date && !validDate(allowed.date))
      throw new Error("Invalid edited date.");
    if (allowed.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(allowed.time))
      throw new Error("Invalid edited time.");
    if (edit.done !== undefined) {
      if (typeof edit.done !== "boolean")
        throw new Error("Invalid completion state.");
      allowed.done = edit.done;
    }
    if (edit.topics !== undefined) {
      if (
        !Array.isArray(edit.topics) ||
        edit.topics.some((t) => typeof t !== "string" || !t.trim())
      )
        throw new Error("Invalid edited topics.");
      allowed.topics = [...edit.topics];
    }
    state.edits[id] = allowed;
  }
  if (source.feedUrl) {
    if (!safeUrl(source.feedUrl)) throw new Error("Invalid feed URL.");
    state.feedUrl = source.feedUrl;
  }
  return state;
}
