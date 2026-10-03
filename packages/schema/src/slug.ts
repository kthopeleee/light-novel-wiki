// Kept apart from index.ts so code that only needs ids (like the browser extension's
// background script) doesn't pull in the whole schema library.

/** Turns a name into an id: "Ms. Lune" → "ms-lune". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "entry";
}

/** An id for `name` that isn't already taken, e.g. "alice-kim-2". */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
