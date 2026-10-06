export type Section = "news" | "ideas" | "planning";
export type ItemType = "news" | "idea" | "task" | "event";
export type Item = {
  id: string;
  section: Section;
  type: ItemType;
  title: string;
  description: string;
  content: string;
  topics: string[];
  source: string;
  author?: string;
  image?: string;
  imageAlt?: string;
  url: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  done: boolean;
  date?: string;
  time?: string;
  nextStep?: string;
  group?: string;
  favorite?: boolean;
};
export type Column = { id: string; title: string };
export type State = {
  version: 1;
  edits: Record<string, Partial<Item>>;
  custom: Item[];
  hidden: string[];
  favorites: string[];
  columns: Record<Section, Column[]>;
  order: Record<Section, string[]>;
  views: Partial<Record<Section, string>>;
  cachedItems: Item[];
  feedUrl: string;
};
export const STORE_KEY: string;
export const DEFAULT_COLUMNS: Record<Section, Column[]>;
export function emptyState(): State;
export function seedItems(data: unknown): Item[];
export function safeUrl(url: string): string;
export function newsSourceKey(url: string): string;
export function duplicateNewsSource(
  item: Pick<Item, "id" | "section" | "url">,
  items: Item[],
): Item | undefined;
export function assertUniqueNewsSources(items: Item[]): void;
export function safeImageUrl(value: string, base?: string): string;
export function validateItem(value: unknown): Item;
export function validateFeed(payload: unknown): Item[];
export function mergeFeed(state: State, items: Item[], seed?: Item[]): State;
export function materialize(seed: Item[], state: State): Item[];
export function filterItems(
  items: Item[],
  filters: {
    section: Section;
    query?: string;
    topic?: string;
    favorites?: boolean;
    subsection?: string;
  },
  state: State,
): Item[];
export function sortItems(
  items: Item[],
  state: State,
  section: Section,
  mode?: string,
): Item[];
export function moveItem(
  state: State,
  item: Item,
  status: string,
  beforeId?: string,
): State;
export function validateBackup(payload: unknown): State;
