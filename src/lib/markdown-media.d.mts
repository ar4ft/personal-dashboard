export function markdownLink(value: string, base: string): string;
export function embeddedVideo(
  value: string,
  base: string,
):
  | { kind: "file"; src: string; href: string }
  | { kind: "provider"; provider: string; src: string; href: string }
  | null;
