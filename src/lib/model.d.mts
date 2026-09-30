export type SectionConfig = { title: string; eyebrow: string; description: string; filters: string[] };
export const sections: Record<string, SectionConfig>;
export function slug(value: string): string;
export function route(base: string, path?: string): string;
export function select<T, K extends keyof T>(items: T[], field: K, filter: T[K] | 'All'): T[];
