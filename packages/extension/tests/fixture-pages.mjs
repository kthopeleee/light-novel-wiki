// Made-up pages that look like a novel site, for unit tests and the end-to-end test server.
// All of the prose is original filler written for these tests.

const SENTENCES = [
  "Mira counted the lanterns on the bridge while the rain picked at the river.",
  "Tomas said nothing, which was how she knew he had already decided.",
  "The ferry horn sounded twice, the old signal for a crossing nobody wanted to make.",
  "She folded the map along creases that did not match the streets anymore.",
  "Somewhere below the square, a door that had been locked for years swung open.",
  "By the time the bells finished, the market had emptied of everyone but the gulls.",
  "He kept the letter in his coat, unopened, as if the words might change if he waited.",
  "The archive smelled of dust, lamp oil, and the faint sweetness of old paper.",
];

/** A paragraph of filler. The "Entry" tag makes each one unique, so tests can tell them apart. */
export function paragraph(chapter, index) {
  const parts = ["Entry " + chapter + "." + index + "."];
  for (let i = 0; i < 4; i++) parts.push(SENTENCES[(chapter * 3 + index * 5 + i) % SENTENCES.length]);
  return parts.join(" ");
}

export const NOVEL_TITLE = "The Harbor Ledger";

const chrome = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <header><nav><a href="/">Home</a> <a href="/browse">Browse</a> <a href="/login">Log in</a></nav></header>
  ${body}
  <aside><h3>Popular</h3><ul>${Array.from({ length: 8 }, (_, i) => `<li><a href="/other-${i}/">Other story ${i + 1}</a></li>`).join("")}</ul></aside>
  <footer><p>Fixture site for tests.</p></footer>
</body></html>`;

export function chapterPage(n, { base = "/harbor-ledger", paragraphs = 14 } = {}) {
  const body = `<main><article>
    <h1>Chapter ${n}: Crossing ${n}</h1>
    ${Array.from({ length: paragraphs }, (_, i) => `<p>${paragraph(n, i)}</p>`).join("\n    ")}
    <div class="chapter-nav">${n > 1 ? `<a href="${base}/chapter-${n - 1}">Previous</a>` : ""} <a href="${base}/">Index</a> <a href="${base}/chapter-${n + 1}" rel="next">Next chapter</a></div>
  </article>
  <section class="comments"><h3>Comments</h3><p>Great chapter!</p><p>Can't wait for the next one.</p></section></main>`;
  return chrome(`Chapter ${n}: Crossing ${n} - ${NOVEL_TITLE} | FixtureReads`, body);
}

export function tocPage(count, { base = "/harbor-ledger" } = {}) {
  const items = Array.from({ length: count }, (_, i) => `<li><a href="${base}/chapter-${i + 1}">Chapter ${i + 1}: Crossing ${i + 1}</a></li>`);
  const body = `<main><h1>${NOVEL_TITLE}</h1><p>A short description of the story.</p><ol class="chapters">${items.join("")}</ol></main>`;
  return chrome(`${NOVEL_TITLE} | FixtureReads`, body);
}

export function homePage() {
  return chrome("FixtureReads - Read stories online", `<main><h1>Welcome</h1><p>Pick a story.</p><a href="/harbor-ledger/">${NOVEL_TITLE}</a></main>`);
}

/**
 * A single-page-app chapter: the text arrives after a delay, and "Next" changes the
 * address with history.pushState instead of loading a new page.
 */
export function spaShell() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Loading… | SpaReads</title></head>
<body><div id="app"><p class="spinner">Loading…</p></div>
<script>
  const SENTENCES = ${JSON.stringify(SENTENCES)};
  const paragraph = ${paragraph.toString()};
  function render() {
    const n = Number(location.pathname.match(/chapter-(\\d+)/)?.[1] ?? 1);
    document.getElementById("app").innerHTML = '<p class="spinner">Loading…</p>';
    setTimeout(() => {
      document.title = "Chapter " + n + " | Night Market Notes | SpaReads";
      const ps = Array.from({ length: 12 }, (_, i) => "<p>" + paragraph(n, i) + "</p>").join("");
      document.getElementById("app").innerHTML = '<main><article><h1>Chapter ' + n + '</h1>' + ps +
        '<button id="next">Next chapter</button></article></main>';
      document.getElementById("next").onclick = () => { history.pushState({}, "", "/spa-novel/chapter-" + (n + 1)); render(); };
    }, 800);
  }
  render();
</script></body></html>`;
}
