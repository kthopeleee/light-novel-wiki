# Light Novel Wiki Generator Prompt

```
Build a system that turns a light novel I'm reading (on a website or as a PDF)
into a full wiki.

PARTS
1. Browser extension for Chrome and Firefox (WXT, TypeScript, Manifest V3)
2. Wiki generator with a switchable AI provider (free local model by default)
3. Wiki website: public wikis on GitHub Pages; private wikis viewable inside
   the extension. Wiki data stored in GitHub repos.

1. EXTENSION
- On a novel's page, a "Turn into wiki" button in the toolbar popup.
  Primary test site: https://novels-reader.pages.dev/
- Collects every chapter on its own: find the chapter list or follow
  "next chapter" links, fetch each with a polite delay (1–2 s), and extract
  the chapter text (Mozilla Readability as the generic fallback). If a site
  blocks or rate-limits, slow down, retry, and tell me.
- Shows progress (e.g. "chapter 37 / 512"), supports pause/resume, and caches
  fetched chapters locally (IndexedDB) so a failure doesn't restart from zero.
  Chapter text stays on my computer only.
- PDFs: works on an open PDF tab or an uploaded PDF file; split into chapters
  using the PDF's bookmarks or chapter headings. Scanned PDFs are out of scope.

2. AI PROVIDERS (switchable in settings)
The pipeline is provider-independent: same prompts, same JSON schema, one
adapter per provider. No account, login, or API key is required unless I
choose a provider that needs one.

a) Local — Ollama (DEFAULT, free, open source, no login, no key)
   - Talks to Ollama at http://localhost:11434 (URL editable).
   - My Mac is an M2 with 8 GB RAM and ~8 GB free disk, so default to a small
     open-source model (~3–4B parameters, 4-bit) that fits alongside the
     browser. Pick and test the best current option at build time; the model
     name is editable in settings.
   - Keep the context window modest (about 8K tokens) and process 1–2
     chapters per request so it fits in memory.
   - Ollama blocks browser extensions by default (CORS). Include a "Test
     connection" button that detects this and shows exactly how to fix it
     (setting OLLAMA_ORIGINS to allow chrome-extension:// and moz-extension://),
     plus a README section on installing Ollama and downloading the model.
   - Show an estimated run time before starting (e.g. "about 6 hours").
     It's fine if it runs overnight.

b) Gemini free tier (optional, free, needs a free Google AI Studio key)
   - Respect rate limits: back off on 429s and, when the daily quota runs
     out, pause and continue automatically the next day.
   - Show estimated requests and days before starting.
   - Settings note: on the free tier, Google may use submitted content to
     improve its products.

c) Claude API (optional, paid, needs an API key)
   - Model claude-haiku-4-5 through the Message Batches API (50% off), with
     prompt caching for the shared instructions.
   - Show the estimated cost before starting and require confirmation.
     Hard cap: $5 per novel (configurable); never exceed it.

For every provider:
- Request JSON output matching the schema; validate it and retry once on
  invalid JSON.
- Save progress after every chunk so a crash, sleep, or closed browser
  resumes where it left off.
- Record which provider and model generated each wiki, and let me
  regenerate a novel's wiki with a different provider.

3. WIKI GENERATION
- Map step: for each chunk, extract characters (with aliases), events,
  locations, factions, items/skills, terms, and a short summary per chapter,
  as structured JSON.
- Reduce step: merge duplicate characters/aliases, group chapters into arcs
  with chapter ranges, and write the plot summary, ending, timeline, and
  genre tags. With small local models, do this in stages (e.g. merge per
  arc, then merge arcs) so each step fits the context window.
- Write everything in your own words. Never copy passages from the novel
  into the wiki.
- "Update wiki" processes only new chapters and merges them in.
- Let me edit any wiki entry by hand afterward to fix AI mistakes.

4. WIKI CONTENT (per novel)
- Overview: title, author, genre tags, spoiler-free premise
- Characters: name, aliases, role, description, relationships, affiliations,
  first appearance (chapter), fate/status
- Plot summary
- Arcs: name, chapter range, summary
- Major spoilers and ending
- Locations, factions/organizations, items/skills, glossary, timeline,
  relationship map
- All spoiler content hidden behind click-to-reveal.

5. STORAGE + WEBSITE
- Each novel has a Public / Private setting.
  - Public: wiki JSON committed to a public repo and shown on the GitHub
    Pages site.
  - Private: wiki JSON committed to a private repo and viewable only through
    a wiki viewer built into the extension (reads the private repo with my
    GitHub token).
  - Switching a novel's setting moves its data between repos.
- The public site and the in-extension viewer share the same viewer code:
  home page listing my novels → each novel's wiki with the sections above,
  plus search.
- Only generated wiki data goes to GitHub. Never commit raw chapter text.
- Each novel's data is fully separate (two "Alice Kim"s in different novels
  never mix).

SETTINGS PAGE
- AI provider (default: Local/Ollama), model name, Ollama URL.
- API key fields appear only for the provider that needs one.
- GitHub token and public/private repo names.

Start by proposing the architecture, repo layout, and the JSON schema for a
novel's wiki. Then build in this order:
1. Schema + wiki viewer with sample data
2. Chapter collector for novels-reader.pages.dev
3. Generation pipeline with the Local (Ollama) provider
4. GitHub commit + public/private repos
5. Gemini and Claude providers
6. PDF support
7. "Update wiki" for new chapters
```
