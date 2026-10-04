// Reads a DRM-free EPUB: unzips it, follows its reading order (the "spine"), and names
// each section from the book's own table of contents.
import { strFromU8, unzipSync } from "fflate";
import { htmlToText } from "../extract";
import { ImportError, MIN_SECTION_CHARS, type ImportedBook } from "./book";

/** Font obfuscation isn't DRM; the text itself is still readable. */
const FONT_OBFUSCATION = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);

type ManifestItem = { path: string; mediaType: string; properties: string };

export function parseEpub(bytes: Uint8Array): ImportedBook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError("That file isn't a readable EPUB: it couldn't be unzipped.");
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : undefined);

  const encryption = read("META-INF/encryption.xml");
  if (encryption && isDrmProtected(encryption)) {
    throw new ImportError(
      "This EPUB is copy-protected (DRM), so its text can't be read. The extension can only import DRM-free EPUBs.",
    );
  }

  const container = read("META-INF/container.xml");
  const opfPath = container && byName(parseXml(container), "rootfile")[0]?.getAttribute("full-path");
  const opfText = opfPath ? read(opfPath) : undefined;
  if (!opfPath || !opfText) throw new ImportError("That EPUB is missing its table of contents file, so it can't be read.");
  const opf = parseXml(opfText);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, ManifestItem>();
  for (const item of byName(opf, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      path: resolvePath(opfDir, href),
      mediaType: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? "",
    });
  }

  const tocLabels = readTocLabels(opf, manifest, read);
  const navPaths = new Set([...manifest.values()].filter((m) => m.properties.split(/\s+/).includes("nav")).map((m) => m.path));

  const chapters: ImportedBook["chapters"] = [];
  for (const ref of byName(opf, "itemref")) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (!item || navPaths.has(item.path) || !/html/.test(item.mediaType)) continue;
    const source = read(item.path);
    if (!source) continue;
    const doc = new DOMParser().parseFromString(source, "text/html");
    const { text } = htmlToText(doc.body?.innerHTML ?? "");
    if (text.length < MIN_SECTION_CHARS) continue;
    const heading = doc.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
    chapters.push({ title: tocLabels.get(item.path) ?? (heading || `Section ${chapters.length + 1}`), text });
  }
  if (chapters.length === 0) throw new ImportError("That EPUB doesn't seem to contain any text.");

  const meta = (name: string) => byName(opf, name)[0]?.textContent?.replace(/\s+/g, " ").trim() || undefined;
  return { title: meta("title") ?? "Untitled book", author: meta("creator"), chapters };
}

/** Maps each section's file to its name in the book's table of contents (EPUB 3 nav or EPUB 2 NCX). */
function readTocLabels(
  opf: Document,
  manifest: Map<string, ManifestItem>,
  read: (path: string) => string | undefined,
): Map<string, string> {
  const labels = new Map<string, string>();
  const add = (baseDir: string, href: string | null | undefined, label: string | null | undefined) => {
    const name = label?.replace(/\s+/g, " ").trim();
    if (!href || !name) return;
    const path = resolvePath(baseDir, href.split("#")[0]!);
    if (!labels.has(path)) labels.set(path, name);
  };
  const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "");

  const nav = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("nav"));
  const navText = nav && read(nav.path);
  if (nav && navText) {
    const doc = new DOMParser().parseFromString(navText, "text/html");
    const toc = [...doc.querySelectorAll("nav")].find((n) => n.getAttribute("epub:type") === "toc") ?? doc.querySelector("nav");
    toc?.querySelectorAll("a[href]").forEach((a) => add(dirOf(nav.path), a.getAttribute("href"), a.textContent));
  }

  const ncxId = byName(opf, "spine")[0]?.getAttribute("toc");
  const ncx = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((m) => m.mediaType === "application/x-dtbncx+xml");
  const ncxText = ncx && read(ncx.path);
  if (ncx && ncxText) {
    for (const point of byName(parseXml(ncxText), "navPoint")) {
      const label = byName(point, "text")[0]?.textContent;
      const src = byName(point, "content")[0]?.getAttribute("src");
      add(dirOf(ncx.path), src, label);
    }
  }
  return labels;
}

function isDrmProtected(encryptionXml: string): boolean {
  const methods = byName(parseXml(encryptionXml), "EncryptionMethod");
  return [...methods].some((m) => !FONT_OBFUSCATION.has(m.getAttribute("Algorithm") ?? ""));
}

/**
 * Elements by local name, ignoring namespaces ("dc:title" → "title"). Used instead of
 * getElementsByTagNameNS("*", …), which not every DOM implementation supports.
 */
function byName(root: Document | Element, name: string): Element[] {
  return [...root.getElementsByTagName("*")].filter((el) => el.localName === name);
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

/** "OEBPS/" + "../Text/ch%201.xhtml" → "Text/ch 1.xhtml" */
function resolvePath(baseDir: string, href: string): string {
  const url = new URL(href, `https://book.invalid/${baseDir}`);
  return decodeURIComponent(url.pathname.slice(1));
}
