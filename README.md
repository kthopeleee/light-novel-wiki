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

## Project layout

```
packages/schema   # wiki data format, shared by everything
packages/viewer   # the wiki website (also reused inside the extension later)
docs/             # the published site and its data
```
