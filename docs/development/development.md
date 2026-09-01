# ZeppBridge development and gates

This page is for people who need to change code, run tests, or produce
installers (Windows and macOS). For the product entry point start at the project
[README](../../README.md); for the connection flow see the
[connection guide](../guides/connection.md).

[简体中文](development.zh-CN.md)

## Environment and layout

- Windows 11 (the primary delivery target) or macOS 11+ (Apple Silicon)
- Node.js 18+, npm
- The Rust toolchain (MSVC build tools on Windows; Xcode Command Line Tools on
  macOS)
- Install frontend dependencies with `npm ci` using the project lockfile. The
  current gates do not depend on Playwright.

Check your tools after cloning:

```powershell
where.exe node
where.exe npm
where.exe cargo
```

Install frontend dependencies:

```powershell
npm ci
```

Cargo resolves Rust dependencies from `src-tauri/Cargo.toml`. Authentication and
real-data tests need Windows Credential Manager, network access and a real Zepp
account; this delivery ships no such live fixtures.

## Everyday commands

### Frontend

```powershell
npm run dev        # Vite only, for looking at static UI
npm run build      # vue-tsc --noEmit && vite build
npm run build:web  # vite build only, skipping vue-tsc
npm run preview    # preview dist (does not connect to account data)
npm test           # Vitest: the pure-function layer in src/lib
npm run version:check   # are the eight version numbers consistent
npm run budget:check    # first-screen size budget (build first)
npm run i18n:check      # no hardcoded Chinese; backend codes have English copy
npm run docs:check      # repo-internal documentation links resolve
npm run verify:login-probe  # real browser; not part of CI, see below
```

`npm run verify:login-probe` pulls the two scripts ZeppBridge injects into the
sign-in window straight out of `src-tauri/src/commands/login.rs` and runs them in
a real browser: an untouched page reads as idle, a typed or autofilled field does
not, and a one-time code typed inside a **cross-origin iframe** still reaches the
top frame. Those three answers are the entire basis for deciding whether the
window may be navigated away, and no Rust test can reach them — a wrong answer
puts the user back where 1.1.4 was, thrown out mid sign-in. It needs a local
Chromium (it reuses an installed Chrome or Edge), so CI does not run it; run it
whenever either script changes.

`npm test` concentrates on one rule: **missing must never be displayed as 0**. A
card reading "0 minutes of sleep" is far more dangerous than "—", because users
take it for a real reading. Component snapshots are deliberately absent — they
go red on every style tweak, get habitually `-u`'d, and end up blocking no
regression while nobody reads them.

`npm run budget:check` measures "how much must load before the first screen
appears" (entry script + `modulepreload` chunks + entry styles), not the total
size of `dist`. The baseline and ceiling live in `bundle-budget.json`; once
you have decided a growth is worth it, refresh with `npm run budget:update` and
explain why in the commit.

`dist` is build output, not source truth. After changing `src/` you must re-run
`npm run build`; never hand-edit a generated bundle.

### Tauri development and production builds

```powershell
npm run tauri dev
npm run tauri build
.\scripts\windows\start-dev.bat
.\scripts\windows\build.bat
```

`npm run package:release` runs the full `tauri build` and, on success, calls
`scripts\windows\publish-local.ps1`:

- the compilation cache is in `G:\build_cache\cargo-target` (`target-dir` in
  `~/.cargo/config.toml`) and is **not** a user entry point;
- it **overwrites** the standalone exe and the current version's NSIS / MSI into
  the project root `release\` (the installers on this machine that people
  double-click or receive);
- it deletes the **previous version's** installers from `release\` and the Cargo
  bundle directory, keeping only the current one;
- it points the desktop and Start menu shortcuts and `App Paths` at
  `release\ZeppBridge.exe`.

Day to day, only `release\ZeppBridge.exe` counts. Do not run the NSIS / MSI to
install a second copy into `LocalAppData`, or Windows search will open the old
entry point. If an installer moved your shortcuts, `npm run publish:local`
points them back. Do not delete `G:\build_cache\cargo-target`, which is only a
local cache.

### macOS builds

```bash
npm run build:mac   # scripts/macos/build-release.sh: frontend + gates + tauri build (app,dmg)
```

Without `TAURI_SIGNING_PRIVATE_KEY` the script skips updater artifacts, which
makes local build verification easy. Artifacts land in
`src-tauri/target/release/bundle/`.

Installers currently declare the `nsis` and `msi` targets in
`src-tauri/tauri.conf.json` (the macOS side is specified with
`--bundles app,dmg`). The NSIS updater artifacts and `latest.json` are signed
with the Tauri updater key and auto-update through GitHub Releases; the
installers themselves still have no Windows-trusted Authenticode certificate and
there is no clean-VM acceptance statement. The macOS bundle is ad-hoc signed
with no Apple notarisation.

### Rust checks and tests

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1
```

`--workspace` is not optional: the repository is one cargo workspace whose
members are `zeppbridge` (the Tauri app), `zeppbridge-core` (the shared core),
`zeppbridge-cli` and `zeppbridge-mcp`. Leaving it out checks only the app.

Building the two companion programs and packaging them for distribution:

```powershell
cargo build --release --manifest-path src-tauri/Cargo.toml -p zeppbridge-cli -p zeppbridge-mcp
npm run tools:package   # produces release\zeppbridge-tools-<version>-<platform>.zip (with SHA256SUMS)
```

Rust library tests keep only the gates that would stop a false success, data
loss or wrong copy: credentials never hitting disk, host validation, sync
outcomes, never fabricating REM, retention-day boundaries, de-duplication, and
sign-in cookie parsing. Do not pile on redundant cases for the sake of a count.
The current number is whatever `cargo test` prints.

## The current command contract

Tauri commands are registered in `src-tauri/src/lib.rs` and wrapped for the
frontend in `src/lib/bridge/` (re-exported through `useTauriApi`):

| command | Purpose | Key boundary |
| --- | --- | --- |
| `start_web_login` | Open the Zepp sign-in window and start polling | Returns `LoginStatus`; event `login://status` |
| `cancel_web_login` | Close the sign-in window and invalidate the epoch | State returns to `idle` |
| `get_login_status` | Read the current sign-in state | `{ state, message, page_url, code }` |
| `save_auth` | Save auth metadata and the token | The token goes to Windows Credential Manager; the host is re-validated by the connector |
| `verify_auth` | A real heart-rate request over the last two hours | Accepts only structured JSON and explicit success codes; 401/403 requires re-authentication |
| `clear_auth` | Invalidate the sign-in session and clear credentials | The health database is kept |
| `import_from_har` | Extract credentials from a HAR the user exported | Must contain an `api-mifit*` request carrying `apptoken`; then takes the same save path as `save_auth` |
| `manual_auth` | Enter token / user id / region host by hand | A wrapper over `save_auth`, with identical boundaries |
| `start_initial_sync` / `start_history_sync` | Fetch the 1–365 days the user chose | Defaults to 30 days; emits progress events and can be cancelled |
| `start_incremental_sync` | Incremental with a 30-day overlap (`contract::INCREMENTAL_SYNC_DAYS`) | Only for verified connections; triggered by the top bar, auto-sync or the tray |
| `cancel_sync` | Cancel an in-flight sync | Atomic flag; stops at the next window |
| `set_user_prefs` | Save retention days and history backfill days | 1–365 |
| `get_app_status` | Connection, cloud sync outcome, per-stream sample times | A failed startup recovery keeps an actionable warning |
| `get_health_overview` | Read the local overview | Returns `null` fields when there is no data; never fills in fake zeros |
| `get_recent_sleep` / `get_recent_workouts` | Read recent records | The limit is clamped to `1–500` in the backend |
| `get_sleep_detail` / `get_workout_detail` | Read one record by stable ID | Returns `null` when not found; generates no estimated fields |
| `get_workout_series` | Read decoded run samples/route/pauses | Empty arrays when there are no points; nothing is invented |
| `get_heart_rate_series` / `get_training_load_series` | Time-series points for the overview charts | Read hourly / daily from the local database; no samples means an empty array |
| `get_metric_series` | The per-day curves for `/body` and `/training` | Answers only metric names on the `SERIES_METRICS` allow-list, skipping others; returns `days_with_data` and never pads missing days with 0 |
| `get_training_balance` | 7-day / 28-day load and the acute:chronic ratio | The same function as the `training_load_balance` export; the ratio is `null` when the chronic window is under 21 days |
| `get_heart_rate_zones` | Every state of the heart-rate zone selector | All bases are measured and carry their source and measurement date; `report` is `null` until an algorithm is chosen |
| `set_heart_rate_zone_preference` | Record the chosen algorithm and basis | All four slots may be `null` — "not decided yet" has to be storable |
| `get_device_profile` / `get_device_profiles` | Read recognised device profiles | From `catalog.json` compiled into the binary; an unrecognised device is never guessed |
| `get_storage_estimate` | Estimate local database size and reclaimable space | Read-only, computed per day |
| `reprocess_local_data` | Replay local raw with the current parser | No network, and the cloud sync time is unchanged; returns per-stream replay counts |
| `get_export_json` | Produce the export JSON string | Reads local data only, per `ExportSelection` |
| `save_json_export` | Save the export to a file | The path is checked by `validate_export_path(.., "json")` |
| `save_csv_export` | Save a long-format summary CSV | Reuses the same normalised JSON and converts it; `record_count` is the number of data rows; excludes per-point series and tracks |
| `save_gpx_export` | Save a GPX 1.1 track | Only workouts with a decoded route become tracks; with no points at all it errors rather than writing an empty file; heart rate is written only when timestamps match exactly |
| `publish_ai_export` | Update the local `exports/zeppbridge-ai-feed.json` | Fixed path, atomic write |
| `prepare_ai_handoff` | Build the redacted package for an external AI | Reuses the same export builder, then redacts recursively; over 2 MiB it writes a desktop file instead; precise tracks require an explicit opt-in |
| `get_local_api_status` | Read the local REST API state and fixed address | A port conflict does not stop the desktop app from starting |
| `cleanup_old_data` | Clean up old data by day count | `1–365` days; spans canonical tables and reclaims unreferenced raw |
| `open_data_folder` | Open the `data/` folder beside the install directory | No longer uses `%APPDATA%` |
| `is_portable_update` / `launch_migrated_install` | Detect a non-installed entry point and launch `%LOCALAPPDATA%\ZeppBridge\ZeppBridge.exe` after an update | Windows only; errors rather than exiting silently when no installed build is found |
| `retry_failed_backfill_chunks` | Re-queue failed backfill chunks | Touches `failed` rows only; written and empty-from-cloud chunks are untouched |
| `set_tray_locale` | Correct the native tray menu language | Called by the frontend once the interface language is known |

`LoginStatus.state` may only be: `idle`, `waiting`, `extracting`, `verifying`,
`connected`, `failed`.

`SyncReport.outcome` may only be: `updated`, `no_new_data`, `partial`, `failed`,
`cancelled`, `deferred`. `deferred` is not a failure — the startup replay of raw
payloads is writing in bulk, this sync stands aside, the frontend retries a
minute later, and the banner is neutral grey rather than red.

Deleted and never to be registered again: `start_capture`,
`get_capture_status`, `complete_capture_user_id`, `reuse_saved_auth`,
`stop_capture`.

## The local REST API

`src-tauri/src/local_api.rs` binds `127.0.0.1:43921` when the desktop process
starts. Two read-only GET routes are exposed today:

| Route | Description |
| --- | --- |
| `/health` | Service state and app version |
| `/workouts/{id}/series` | Reuses `Database::get_workout_series()` and returns normalised `WorkoutSeries` JSON; an unknown ID returns 404 |

The API does not listen on `0.0.0.0`, offers no CORS, responds with
`Cache-Control: no-store`, and neither reads nor returns authentication data. If
the port is taken the desktop app still starts, and Settings surfaces the error
through `get_local_api_status`. Tests must cover the routes, 404/405, encoded
IDs, the generic 500, and the no-CORS boundary.

## The current data path

1. `AuthManager` validates the user ID, token and region address, reading the
   token from the system credential store.
2. After web sign-in extracts credentials from cookies, it runs the same
   heart-rate probe as `verify_auth` against allow-listed region hosts.
3. `ZeppConnector` builds HTTPS origins only, allowing hosts of the form
   `api-mifit*.zepp.com` / `api-mifit*.huami.com`, with a 30-second HTTP client
   timeout and classified handling of 401/403/404/429/5xx.
4. `DataFetcher` keeps the stream, source key and raw payload for every
   response. The connector retries within a bounded budget, but there is no
   general cursor pagination; the workout endpoint uses track-ID semantics, and
   the current window helper still takes a conservative range.
5. `Normalizer` accepts only structured arrays/objects it recognises, and can
   decode the Base64 `band_data` sleep and per-minute heart-rate structures
   verified against current real fixtures. Encodings it cannot recognise stay as
   raw only, marked `unverified`.
6. `Database` uses WAL, foreign keys and schema migrations (`PRAGMA
   user_version`, currently **16**; migration steps may only be appended, never
   edit published DDL — existing databases were created with the DDL of their
   time). Expression unique indexes handle `NULL device_id`, and canonical rows
   keep `raw_record_id`. Migrations start only after the cross-process write
   lock is held and a pre-upgrade backup exists.
7. `SyncManager` uses a run lock against in-process concurrency and additionally
   takes the cross-process write lock, so the desktop app and the CLI never
   write the same database at once. A core stream failure sets `success=false`,
   optional streams show `unavailable`/`unverified`, and retention runs after a
   success (skipped while long-term archiving is on).
8. The fetch, parse and write stages are recorded separately in
   `stream_provenance`, with stable machine-readable failure classes, feeding
   the data health page and MCP's `get_data_health`.

## Frontend conventions

- Pages call commands through `tauriApi` / `backend` and never reach Zepp
  directly.
- Empty values render as `—`, "not recorded", or an explicit empty state. Never
  turn missing data into `0`.
- Check `Date.getTime()` before formatting a time. Errors should keep actionable
  information rather than silently swallowing a string.
- Use the design tokens in `App.vue`'s `:root` (the single source of truth; the
  interface is dark only, with no light branch), `focus-visible`, semantic
  elements, ARIA and a 44px minimum touch target. The mobile breakpoint is
  currently 760px. See the [UI guidelines](ui-guidelines.md).
- Backend prose is never rendered raw: the interface renders from the stable
  code and falls back to the backend original only when it does not recognise
  the code — and `i18n/backendText.ts` blocks a Chinese original from reaching an
  English interface even then.

## Recommended acceptance order

1. `npm run build`
2. `npm test`
3. `npm run version:check`, `npm run budget:check`, `npm run i18n:check`,
   `npm run docs:check`
4. `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
5. `cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets`
6. `cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets -- -D warnings`
7. `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked --jobs 1`
8. `npm run package:release` (or `cmd.exe /d /c scripts\windows\build.bat`), then
   confirm `release\ZeppBridge.exe` and the current version's NSIS/MSI are
   updated and the previous version's installers are gone.
9. Double-click the desktop or Start menu ZeppBridge shortcut and confirm it
   opens `release\ZeppBridge.exe`; then confirm the product name/identifier,
   startup recovery, and the web sign-in command on the Settings page.

Steps 8–9 are the delivery surface users actually open, and source-level checks
cannot substitute for them. Real Zepp web sign-in, and multi-region /
multi-device data, still need verifying per environment.

## Change boundaries

- REST is limited to the local read-only routes above and must never be extended
  to LAN listening or to returning credentials.
- Do not revive LAN MITM, user CAs, Wi-Fi proxy instructions, or commands of the
  `start_capture` family.
- The app syncs once at launch; closing the main window leaves the process in
  the tray, checking every 15 minutes. Launching again wakes the existing
  process rather than creating a second tray icon. Syncing stops only after you
  quit from the tray or end the process; there is no system-level background
  service.
- GPS/routes, per-point training samples and uncovered proprietary metrics stay
  `unverified` until a lawful, redacted real response is obtained.
- Never write tokens, full request headers, HAR files, precise GPS or raw health
  payloads into logs, test output or commits.

Architectural boundaries are in the
[architecture summary](../reference/architecture.md); security boundaries are in
[security and privacy](../reference/security-and-privacy.md).
