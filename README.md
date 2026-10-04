# Light Novel Wiki

Turns a light novel you're reading into a wiki: characters, arcs, relationships,
timeline, spoilers, and more. See [PROMPT.md](PROMPT.md) for the full plan.

## Run the wiki site locally

Requires Node 22.12 or newer.

```sh
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Where the data lives

GitHub Pages serves the `docs/` folder. The wiki data sits inside it:

```
docs/
  data/
    index.json          # list of novels on the home page
    novels/<id>.json    # one file per novel's wiki
  index.html, assets/   # the built site (from `npm run build`)
```

The two novels there now are made-up samples. Delete them once real wikis exist.
The format is defined in [packages/schema/src/index.ts](packages/schema/src/index.ts).

Check that every data file matches the format:

```sh
npm run validate
```

## Publishing

The site is published from the `docs/` folder on the `main` branch. After changing
the site's code, run `npm run build` and commit the updated `docs/` folder. Changes to
wiki data (including edits made on the site) go live about a minute after they're pushed.

## Browser extension

The extension saves the chapters you read, on the sites you choose, into a library on
your computer. Chapter text never leaves your browser.

Build it for both browsers:

```sh
npm run build:extension
```

**Chrome:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
and pick `packages/extension/.output/chrome-mv3`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**,
and pick `packages/extension/.output/firefox-mv3/manifest.json`. Firefox removes temporary
add-ons when it restarts; a permanent install needs the add-on signed by Mozilla.

Three ways to get chapters into the library:

- **Save as you read.** Open a chapter, click the 📖 toolbar button, and choose **Start saving**.
  The browser asks for access to that one site. After that, every chapter you open there is saved.
- **Collect all chapters.** For stories their authors publish for free (Royal Road, Scribble Hub, …):
  on a novel you're saving, click **Collect all chapters…**. It downloads one chapter every 1.5 seconds
  from the chapter list, or by following "Next chapter" links. Sites that load chapters with JavaScript
  can't be collected this way; use save-as-you-read there.
- **Import an ebook.** On the **Library** page, choose a DRM-free EPUB or a PDF with real text.

The **Library** page lists everything saved.

Run its tests with `npm test`.

## Project layout

```
packages/schema     # wiki data format, shared by everything
packages/viewer     # the wiki website
packages/extension  # the browser extension (Chrome and Firefox)
docs/               # the published site and its data
```
