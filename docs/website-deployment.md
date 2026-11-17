# ZeppBridge website deployment

[简体中文](website-deployment.zh-CN.md)

zeppbridge.com is the Cloudflare Pages project `zeppbridge`. Opened in a browser, the build output shows the landing page; inside the Tauri desktop runtime the same build shows the full app. The embedded demos run the current app code against in-memory data, so they never connect to a real account or touch a local database.

## Local build

The build scripts never install tools. They reuse an existing Python Playwright, Chromium, ffmpeg and ffprobe; point them at existing installs with `LANDING_PYTHON`, `LANDING_CHROMIUM` and `PLAYWRIGHT_BROWSERS_PATH` when needed.

- `npm run build:web` type-checks, runs the relevant tests, starts the app locally, checks the demo routes and records the feature flows in all 13 interface languages, light and dark. Unchanged media are reused by a fingerprint of their sources.
- Output goes to `.site-cache/site-dist`; recordings and verification screenshots go to `.site-cache/media` and `.site-cache/verification`. None of these are in Git. A plain `npm run build` still produces the desktop app's `dist` without the website videos.
- `npm run site:media` re-records media on its own (`--force` re-records everything); `npm run site:verify -- --url <preview url>` checks layout, embedded interactions, videos and dark mode against a running preview (`npm exec vite -- preview --mode site --host 127.0.0.1 --port 1536`).
- The finishing step (`scripts/site/finish-dist.mjs`) generates `/changelog`, `/letters`, `/privacy`, the 404 page and `_routes.json`. The changelog only lists versions that have a `v*` tag, so build from a full clone with tags; it stops with an error when it finds none.

The site is indexed by search engines (`robots.txt` allows crawling).

## Deploying

From a machine that is signed in to Wrangler: `npm run site:deploy` (runs the finishing step, then `wrangler pages deploy`).

Or run the **Deploy website to Cloudflare Pages** workflow by hand in GitHub Actions. It is manual only; nothing deploys on push. It runs `npm ci && npm run test:functions && npm run build:web`, applies the `zeppbridge-feedback` D1 migrations, then deploys `.site-cache/site-dist`.

## Functions, databases and secrets

`functions/` holds the Pages Functions behind `/api/*`:

| Route | Purpose |
|---|---|
| `/api/feedback` | In-app error reports (D1 `FEEDBACK_DB`) |
| `/api/letters/*` | Author letters and replies |
| `/api/release` | Download links for the latest release (`latest.json` and `SHA256SUMS.txt` of the latest GitHub Release) |
| `/api/zepp/oauth/*`, `/api/zepp/data/callback` | Relay for the Zepp official platform sign-in and data callbacks (D1 `OFFICIAL_DB`) |

`/api/*` on `zeppbridge.pages.dev` never redirects: older app versions and the callback registered with Zepp use that host.

Bindings and variables the project needs (in `wrangler.jsonc` and the Pages project settings):

- D1 `FEEDBACK_DB` (`zeppbridge-feedback`, migrations in `migrations/`) and `OFFICIAL_DB` (`zeppbridge-official`, migrations in `migrations-official/`). The workflow only applies the feedback migrations; apply `migrations-official` with an authorised Wrangler session when it changes.
- `ZEPP_CLIENT_ID`, `ZEPP_CLIENT_SECRET`, `RELAY_KEY`: the official-platform relay is disabled when any of them is missing.

GitHub Actions secrets for the workflow:

- `CLOUDFLARE_API_TOKEN`: Cloudflare Pages edit permission.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `CLOUDFLARE_D1_API_TOKEN` (optional): D1 edit permission. Without it the workflow skips the migrations and deploys anyway.
