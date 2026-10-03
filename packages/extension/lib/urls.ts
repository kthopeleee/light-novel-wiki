const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|ref$|ref_src$)/i;

/** Path segments that name a section of a site rather than a particular novel. */
const GENERIC_SEGMENTS = new Set([
  "fiction",
  "novel",
  "novels",
  "series",
  "book",
  "books",
  "story",
  "stories",
  "read",
  "title",
  "works",
  "projects",
  "web-novel",
  "webnovel",
  "light-novel",
  "s",
  "n",
  "wn",
  "ln",
]);

/** One spelling per chapter page: no #fragment, no tracking parameters, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/**
 * Guesses the address every chapter of this novel starts with:
 * ".../cote/read/v1/7" → ".../cote/", ".../fiction/12345/name/chapter/9" → ".../fiction/12345/".
 */
export function proposePrefix(raw: string): string {
  const url = new URL(raw);
  const segments = url.pathname.split("/").filter(Boolean);
  const keep: string[] = [];
  for (const segment of segments) {
    keep.push(segment);
    if (!GENERIC_SEGMENTS.has(segment.toLowerCase())) break;
  }
  // If that used up the whole path, the last segment is this page itself, not the novel.
  if (keep.length === segments.length) keep.pop();
  return `${url.origin}/${keep.length ? `${keep.join("/")}/` : ""}`;
}

export function matchesPrefix(url: string, prefix: string): boolean {
  const normalized = normalizeUrl(url);
  return normalized.startsWith(prefix) || `${normalized}/` === prefix;
}

/** Of several novels, the one whose prefix fits this page most specifically. */
export function bestMatch<T extends { sitePrefix?: string }>(url: string, novels: T[]): T | undefined {
  return novels
    .filter((n) => n.sitePrefix && matchesPrefix(url, n.sitePrefix))
    .sort((a, b) => b.sitePrefix!.length - a.sitePrefix!.length)[0];
}

/**
 * The permission pattern for a site. Ports are left out because Firefox doesn't allow
 * them in match patterns; the pattern then covers every port on that host.
 */
export function sitePattern(prefixOrUrl: string): string {
  const url = new URL(prefixOrUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Sorts "chapter-2" before "chapter-10", and "v4/9" before "v4.5/1". Compares one path
 * segment at a time, so a separator never decides the order.
 */
export function naturalCompare(a: string, b: string): number {
  const as = a.split(/[/?&=#]/);
  const bs = b.split(/[/?&=#]/);
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const order = collator.compare(as[i]!, bs[i]!);
    if (order !== 0) return order;
  }
  return as.length - bs.length;
}

export const isWebPage = (url: string | undefined) => !!url && /^https?:\/\//.test(url);
