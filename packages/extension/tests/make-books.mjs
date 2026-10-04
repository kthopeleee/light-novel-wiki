// Builds small made-up EPUB and PDF files for tests. All text is original filler.
import { strToU8, zipSync } from "fflate";
import { paragraph } from "./fixture-pages.mjs";

export const CHAPTER_NAMES = ["The First Crossing", "The Second Crossing", "The Third Crossing"];

const xhtml = (title, body) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body>${body}</body></html>`;

const chapterBody = (n) =>
  `<h1>Chapter ${n}</h1>${Array.from({ length: 6 }, (_, i) => `<p>${paragraph(n, i)}</p>`).join("")}`;

/**
 * @param {{ version?: 2 | 3; drm?: boolean; fontObfuscationOnly?: boolean; labels?: boolean }} [options]
 * version 3 has a nav document, version 2 an NCX file. `labels: false` leaves the table of
 * contents out, so titles must come from headings. Chapter files have a space in their
 * names to check that %20 in links is handled.
 */
export function makeEpub({ version = 3, drm = false, fontObfuscationOnly = false, labels = true } = {}) {
  const n = CHAPTER_NAMES.length;
  const files = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    "OEBPS/Text/cover.xhtml": strToU8(xhtml("Cover", `<img src="../Images/cover.jpg" alt="Cover"/>`)),
    "OEBPS/Text/copyright.xhtml": strToU8(xhtml("Copyright", "<p>Copyright notice for a made-up test book.</p>")),
  };
  for (let i = 1; i <= n; i++) files[`OEBPS/Text/chapter ${i}.xhtml`] = strToU8(xhtml(`Chapter ${i}`, chapterBody(i)));

  const chapterItems = CHAPTER_NAMES.map(
    (_, i) => `<item id="ch${i + 1}" href="Text/chapter%20${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
  ).join("");
  const spineChapters = CHAPTER_NAMES.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join("");
  let tocItem = "";
  let spineToc = "";
  let navRef = "";

  if (labels && version === 3) {
    const links = CHAPTER_NAMES.map((name, i) => `<li><a href="Text/chapter%20${i + 1}.xhtml">${name}</a></li>`).join("");
    files["OEBPS/nav.xhtml"] = strToU8(xhtml("Contents", `<nav epub:type="toc"><h1>Contents</h1><ol>${links}</ol></nav>`));
    tocItem = `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`;
    navRef = `<itemref idref="nav"/>`; // in the spine on purpose: it must be skipped
  }
  if (labels && version === 2) {
    const points = CHAPTER_NAMES.map(
      (name, i) =>
        `<navPoint id="p${i + 1}" playOrder="${i + 1}"><navLabel><text>${name}</text></navLabel><content src="Text/chapter%20${i + 1}.xhtml#start"/></navPoint>`,
    ).join("");
    files["OEBPS/toc.ncx"] = strToU8(
      `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${points}</navMap></ncx>`,
    );
    tocItem = `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;
    spineToc = ` toc="ncx"`;
  }

  files["OEBPS/content.opf"] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test-book</dc:identifier><dc:title>The Harbor Ledger</dc:title><dc:creator>Sample Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/><item id="copyright" href="Text/copyright.xhtml" media-type="application/xhtml+xml"/>${chapterItems}${tocItem}</manifest><spine${spineToc}><itemref idref="cover"/>${navRef}<itemref idref="copyright"/>${spineChapters}</spine></package>`,
  );

  if (drm || fontObfuscationOnly) {
    const algorithm = drm ? "http://www.w3.org/2001/04/xmlenc#aes128-cbc" : "http://www.idpf.org/2008/embedding";
    files["META-INF/encryption.xml"] = strToU8(
      `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="OEBPS/Text/chapter 1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`,
    );
  }
  return zipSync(files);
}

/** Wraps text into lines short enough to fit a PDF page. */
export function wrap(text, width = 80) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Lines of filler for one PDF page of chapter `n`. */
export const pdfPageLines = (n, from = 0, count = 4) =>
  Array.from({ length: count }, (_, i) => wrap(paragraph(n, from + i))).flat();

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/**
 * A minimal text PDF: one Helvetica text block per page, optional bookmarks
 * (`outline: [{ title, page }]`, page is 0-based) and title/author metadata.
 * @param {{ pages: string[][]; title?: string; author?: string; outline?: { title: string; page: number }[] }} options
 */
export function makePdf({ pages, title, author, outline = [] }) {
  const objects = [];
  const reserve = () => objects.push(null);
  const set = (num, body) => {
    objects[num - 1] = body;
  };
  const catalog = reserve();
  const pagesNum = reserve();
  const font = reserve();
  set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageNums = pages.map((lines) => {
    const ops = lines.map((l, i) => `${i ? "T* " : ""}(${esc(l)}) Tj`).join(" ");
    const content = lines.length ? `BT /F1 11 Tf 14 TL 72 740 Td ${ops} ET` : "q Q";
    const contentNum = reserve();
    set(contentNum, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageNum = reserve();
    set(
      pageNum,
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    return pageNum;
  });
  set(pagesNum, `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`);

  let outlines = "";
  if (outline.length) {
    const root = reserve();
    const items = outline.map(() => reserve());
    outline.forEach((item, i) => {
      const prev = i > 0 ? ` /Prev ${items[i - 1]} 0 R` : "";
      const next = i < items.length - 1 ? ` /Next ${items[i + 1]} 0 R` : "";
      set(items[i], `<< /Title (${esc(item.title)}) /Parent ${root} 0 R /Dest [${pageNums[item.page]} 0 R /Fit]${prev}${next} >>`);
    });
    set(root, `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items.at(-1)} 0 R /Count ${items.length} >>`);
    outlines = ` /Outlines ${root} 0 R /PageMode /UseOutlines`;
  }
  set(catalog, `<< /Type /Catalog /Pages ${pagesNum} 0 R${outlines} >>`);
  const info = reserve();
  set(info, `<< ${title ? `/Title (${esc(title)})` : ""} ${author ? `/Author (${esc(author)})` : ""} >>`);

  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
