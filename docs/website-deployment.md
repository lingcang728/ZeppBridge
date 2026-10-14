# ZeppBridge website deployment

[简体中文](website-deployment.zh-CN.md)

Opened in a browser, the build output shows the product landing page; inside the
Tauri desktop runtime it still shows the full app. The embedded demos on the page
run the current app code against separate in-memory data, so they never connect
to a real account or touch a local database.

## Local build and checks

Reuse the Python Playwright, Chromium, ffmpeg and ffprobe that are already
installed. The build scripts never install or download tools; point them at
existing installs with `LANDING_PYTHON`, `LANDING_CHROMIUM` and
`PLAYWRIGHT_BROWSERS_PATH` when needed.

`npm run build:web` runs type checks and the relevant tests, starts the app
locally, checks the demo routes, and records five complete feature flows in ten
languages and both light and dark themes. Videos are 2560 × 1600, with matching
posters and static home-page assets. The script reuses unchanged media by a
fingerprint of the source; when the app, languages, demo data or recorded flows
change, it re-records the affected versions.

The site is written to `.site-cache/site-dist`; recordings, the fingerprint
manifest and verification screenshots go to `.site-cache/media`,
`.site-cache/media/manifest.json` and `.site-cache/verification`. None of these
directories are in Git. A plain `npm run build` still produces the `dist` used by
the desktop app and does not bundle the website videos.

To preview locally, run
`npm exec vite -- preview --mode site --host 127.0.0.1 --port 1536`. Once it is
up, `npm run site:verify -- --url http://127.0.0.1:1536` checks the responsive
layout, embedded interactions, videos and forced dark mode; it also reuses
Python Pillow. `npm run site:media -- --url http://127.0.0.1:1532` refreshes the
media from a running local dev server on its own; add `--force` to re-record
everything.

The build only produces local output. It currently ships with `noindex`; decide
the search-engine indexing policy separately before going live.

## Cloudflare Pages

The repository's `Deploy website to Cloudflare Pages` workflow can be run by hand
from GitHub Actions:

1. `npm ci`
2. `npm run build:web`
3. Publish `.site-cache/site-dist` to the Cloudflare Pages project `zeppbridge`

The workflow is manual only, prepares its own recording tools and caches existing
videos; pushes to the v3 branch never publish automatically. The first full
recording takes much longer than a cached run.

Before the first deployment, add these Actions secrets to the GitHub repository:

- `CLOUDFLARE_API_TOKEN`: a token with Cloudflare Pages edit permission.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

The download section only enables downloads once it finds a complete v3 stable
release; betas and v2 are never treated as v3 stable. The Star button links
straight to the GitHub repository.
