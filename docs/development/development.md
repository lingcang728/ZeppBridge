# Developing ZeppBridge

For people who change the code, run the checks or build installers. Start with
the [README](../../README.md) for what the app is, and the
[architecture summary](../reference/architecture.md) for how it fits together.

[简体中文](development.zh-CN.md)

## Environment

- Windows 11, macOS 11+ (Apple Silicon), or Linux with WebKitGTK 4.1
- Node.js 22+ and npm
- The stable Rust toolchain (MSVC build tools on Windows, Xcode Command Line
  Tools on macOS, the WebKitGTK development packages on Linux — CI's
  `Install Linux build dependencies` step lists them)
- Python 3 with Pillow, for `npm run icons:verify`

```bash
npm ci
```

`npm ci` also applies the repository's patch to `@vitejs/plugin-vue` (see
[Scoped external styles](#scoped-external-styles)).

## Layout

`src-tauri/` is one cargo workspace with four members:

| Crate | Path | What it is |
|---|---|---|
| `zeppbridge` | `src-tauri/src` | The Tauri app: commands and window, tray and update handling |
| `zeppbridge-core` | `src-tauri/crates/core` | Almost all logic: auth, connectors, fetch, normalize, storage, sync, export, local API |
| `zeppbridge-cli` | `src-tauri/crates/cli` | Non-interactive `status` / `sync` / `export`; exit codes are a contract |
| `zeppbridge-mcp` | `src-tauri/crates/mcp` | stdio MCP server |

`src/` is the Vue 3 frontend: `views/` → `composables/` → `lib/bridge/` →
Tauri IPC. Pages never call `invoke` or reach Zepp directly.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite only. In a browser you see the landing page; add `?app-preview=1` for the desktop shell without account data |
| `npm run tauri dev` | The desktop app in development |
| `npm run build` | `vue-tsc --noEmit && vite build` — the frontend type gate |
| `npm test` | Vitest: every `src/**/__tests__/**/*.test.ts` |
| `npm run test:functions` | `node --test` for the Pages functions, site and font scripts, and `test:dev` |
| `npm run test:dev` | Starts Vite and requests scoped external styles cold |
| `npm run i18n:check` | No hard-coded Chinese in the UI; every backend code has its copy |
| `npm run docs:check` | Links inside the repository resolve |
| `npm run version:check` | The eleven version numbers agree |
| `npm run lockfile:check` | `package-lock.json` resolves only from registry.npmjs.org |
| `npm run budget:check` | First-screen size budget (run `npm run build` first) |
| `npm run icons:verify` | Generated icons match their source |
| `npm run build:web` | Builds the website (landing page tests + `vite build --mode site`), not the desktop frontend |
| `npm run tools:package` | Packages `zeppbridge-cli` and `zeppbridge-mcp` with `SHA256SUMS` |

`dist/` is build output. After changing `src/`, rebuild; never edit a bundle by
hand.

`npm test` concentrates on one rule: **missing data is never displayed as 0**.
There are no component snapshots — they go red on every style change and stop
nothing.

`npm run budget:check` measures what must load before the first screen (entry
script, `modulepreload` chunks, entry styles), not the size of `dist`. The
ceiling is in `bundle-budget.json`; refresh it with `npm run budget:update` only
when a growth is worth it, and say why in the commit.

### Scoped external styles

Several pages use `<style scoped src="…">`. The pinned `@vitejs/plugin-vue`
needs a patch for that, kept in `scripts/dev/patch-vue-external-styles.mjs` and
applied by `postinstall`. If you installed with `--ignore-scripts`, run
`npm run postinstall` and restart the dev server. Review the patch when
upgrading the plugin and run `npm run test:dev`, because a production build does
not exercise this path.

## Rust checks

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1
```

`--workspace` is not optional; without it only the app crate is checked. Unit
tests live in each module's own `tests.rs` or `tests/` submodule; only the CLI
and MCP have crate-level integration tests. Run one test with a filter:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p zeppbridge-core --lib storage::tests::queries
```

If you work in several checkouts at once, give each its own `CARGO_TARGET_DIR`.
Two source trees sharing one target directory overwrite each other's build
fingerprints; the usual symptom is `cargo check` passing while `cargo test`
fails.

Windows-only code is checked only on Windows, and `cfg(not(windows))` code only
on Linux and macOS, so a green local run does not cover the other platforms.
CI runs the same four commands on all three.

Keep Rust tests to the ones that would catch a false success, lost data or
wrong copy.

## What CI runs

On every push and pull request a routing job picks the checks from the changed
files. Per platform they are: lockfile check, `npm ci`,
`npm run build`, and the four Rust commands. Windows also runs the bundle
budget, `i18n:check`, `npm test`, `test:functions`, `icons:verify` and the
Microsoft Store channel tests. Linux also validates the Flatpak metadata and
builds and smoke-tests the headless Docker image. A separate job checks
documentation links and version consistency.

Installers (NSIS + MSI, macOS app and dmg, Flatpak, deb, rpm, AppImage) are built
only for `v*` tags and manual runs. A `v*` tag also creates the GitHub Release;
see [releases](../releases/README.md).

## Building installers

```bash
npm run tauri build   # Windows: NSIS + MSI (targets in src-tauri/tauri.conf.json)
npm run build:mac     # macOS: frontend, gates, then tauri build --bundles app,dmg
```

Without `TAURI_SIGNING_PRIVATE_KEY` no updater artifacts are produced, which is
fine for local builds. Windows installers are not Authenticode-signed; the macOS
bundle is ad-hoc signed and not notarised (see [code signing](code-signing.md)).
Linux packages: [Linux packaging](linux-packaging.md). Microsoft Store:
[Store packaging](store-packaging.md). CLI and MCP:
`cargo build --release --manifest-path src-tauri/Cargo.toml -p zeppbridge-cli -p zeppbridge-mcp`.

`npm run package:release` is the maintainer's Windows script for a local test
build. It runs the gates, stages the CLI and MCP as sidecars, builds the NSIS
installer and a portable exe into `release\`, and needs the updater signing key
backup. Contributors don't need it.

## Adding a command

A Tauri command has to be added in four places:

1. the implementation in `src-tauri/src/commands/`;
2. its re-export in `src-tauri/src/commands/mod.rs`;
3. the `invoke_handler` list in `src-tauri/src/lib.rs`;
4. the `BridgeBackend` interface in `src/lib/bridge/types.ts` and its implementation
   in `src/lib/bridge/tauri.ts`.

The interface is complete, so missing step 4 fails `npm run build`.
`src/lib/bridge/web.ts` needs no change: in a browser every method rejects with
`DesktopUnavailableError`.

`src-tauri/src/lib.rs` is the list of commands; there is no second copy here.
Values the frontend switches on:

- `LoginState`: `idle`, `waiting`, `extracting`, `verifying`, `connected`,
  `failed`.
- `SyncOutcome`: `updated`, `no_new_data`, `partial`, `failed`, `cancelled`,
  `deferred`, `cloud_stale`. `deferred` means the startup replay of stored raw
  payloads is writing and the sync stood aside; it retries by itself and is not
  a failure. `cloud_stale` means the cloud had nothing newer than the local
  library, so nothing was fetched.

## The local REST API

Off by default. When the user turns it on, the desktop app listens on
`127.0.0.1` only — the address is a constant (`LOCAL_API_ADDRESS`) and no
setting changes it. It is read-only, sends no CORS headers and requires
`Authorization: Bearer <token>`. Routes: `/health`, `/workouts/{id}/series` and
`/v1/records` (the same `records::query_records` as
`zeppbridge-cli export --format json`; no GPS unless the request asks for
`include_gps=true`).

The headless `zeppbridge-cli serve` (`local_api/headless.rs`) runs the same
handlers for Docker and servers. It listens on `127.0.0.1` unless the user sets
`ZEPPBRIDGE_LISTEN`, and beyond loopback it refuses to start without a separate
pull token (`zeppbridge-cli pull-token`). The code is in
`src-tauri/crates/core/src/local_api/`; the contract is in
[self-hosted pull](../guides/self-hosted-pull.md) and the boundaries in
[security and privacy](../reference/security-and-privacy.md).

## Data path

1. `AuthManager` (`crates/core/src/auth/`) keeps tokens in the OS credential
   store through `keyring` (Windows Credential Manager, macOS Keychain, Linux
   Secret Service, or an opt-in file); `auth.json` holds metadata only.
2. `ZeppConnector` builds HTTPS URLs for allow-listed hosts only
   (`api-mifit*.zepp.com`, `api-mifit*.huami.com`) and classifies
   401/403/404/429/5xx. The official Open Platform channel lives in
   `crates/core/src/official/` and `sync/official.rs`.
3. `DataFetcher` keeps every response's stream, source key and raw payload.
4. The normalizer accepts only structures it recognises. Anything else stays as
   raw and is marked `unverified`. Changing derived logic means bumping
   `NORMALIZER_REVISION` in `storage/mod.rs`; at startup the library replays its
   raw payloads when the value differs.
5. The database uses WAL and `PRAGMA user_version` migrations
   (`CURRENT_SCHEMA_VERSION` in `storage/mod.rs`, steps in
   `storage/migrations.rs`). Steps are only ever appended; published DDL is
   never edited, because existing libraries were created with it. A migration
   runs only after a pre-upgrade snapshot.
6. Every write — sync, backfill, migration, restore, backup, replay, cleanup —
   takes the cross-process write lock (`storage::write_lock`). A sync holds a
   sync lease for its whole run and the write lock only around the stretches
   that write, never across network I/O. Read-only paths use
   `Database::open_read_only`.
7. Fetch, parse and write are recorded separately per stream in
   `stream_provenance`, which feeds the data health page and MCP's
   `get_data_health`.

## Sync while the window is closed

Closing the main window leaves the process in the tray; launching again wakes
it. Auto-sync runs at the interval the user picks (15, 30 or 60 minutes). While
the window is not visible, a backend alarm checks every 60 seconds and runs the
sync, backing off after failures. There is no system background service: quitting
from the tray stops syncing.

## Frontend conventions

- Missing values render as `—`, "not recorded" or an empty state, never `0`.
- Check `Date.getTime()` before formatting a time.
- Use the tokens in `src/styles/tokens.css`; components never branch on the
  theme. See the [UI guidelines](ui-guidelines.md).
- The backend never writes UI copy in the user's language. It returns stable
  codes (`err.*` for errors, `ui.*` for other text) with Chinese as a fallback;
  the interface renders from the code, and `i18n/backendText.ts` keeps a
  Chinese fallback out of other languages. New error codes need copy in
  `src/i18n/errors.ts`; `npm run i18n:check` enforces it.
- Chinese, English and Spanish copy sits next to each component in `*.i18n.ts`
  (`defineMessages(zh, en, es)`); the other ten languages are in
  `src/i18n/locales/`.

## Rules that protect user data

- Never invent data: no samples means no curve, no track means no map.
- Keep the cloud sync time and the health sample time apart; reprocessing local
  data does not change the cloud sync time.
- Never write tokens, full request headers, HAR files, precise GPS or raw health
  payloads into logs, test output or commits.
- REST is read-only and never returns credentials. The desktop app listens on
  `127.0.0.1` only, with no setting that changes it. Only the headless
  `zeppbridge-cli serve` may listen elsewhere, when the user sets the address
  explicitly, and then only with a pull token; transport encryption is left to a
  reverse proxy or a container-internal network.
- The 2.x LAN capture approach (proxy, user CA, `start_capture` and related
  commands) was removed and is not coming back.
