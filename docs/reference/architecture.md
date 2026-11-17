# ZeppBridge architecture summary

This page describes the product boundaries and current implementation of [v3.1.1](https://github.com/lingcang728/ZeppBridge/releases).
For the usage entry point see the project [README](../../README.md); for
engineering gates see the [development guide](../development/development.md);
for what each capability's status is, see [capability maturity](capability-maturity.md).

[简体中文](architecture.zh-CN.md)

## Product boundaries

ZeppBridge is a desktop application that stores Zepp health data locally. It
ships for Windows (x64), macOS (Apple Silicon) and Linux (x86_64: deb, rpm,
AppImage, Flatpak), plus a headless CLI / MCP tools package and a Docker
recipe. Windows is the primary verified platform; macOS and Linux are previews
covered by CI compilation, clippy and tests (see
[capability maturity](capability-maturity.md#platforms)).

```text
Official Zepp authorization ──► relay (zeppbridge.com) ──► api-open.zepp.com ─┐
Advanced data: sign-in window ─► session cookies ─► region probe ─► api-mifit ─┤
Imports: GPX / FIT / Strava / Apple Health / unstrap ──────────────────────────┤
                                                                               ▼
                                            Raw provenance → Normalizer → SQLite
                                                                               │
                                     ┌──────────────────────┬──────────────────┴───┐
                                Tauri IPC               local REST            CLI / MCP
                                Vue interface        127.0.0.1:43921       stdio / process
```

Health data is written locally. Syncing reaches Zepp through one or both
channels: the **official channel** (Zepp Open Platform OAuth, see
[official API facts](official-api-facts.md)) and the **Advanced data** channel
(the Zepp account's own app API). The app does not automatically fuse different
device sources, and it never generates estimated values for missing routes,
curves or metrics.

All four outlets (desktop interface, local REST, CLI, MCP) are adapters over
`zeppbridge-core`: the data model, SQLite schema and migrations, normalisation,
query semantics, exports, insights and write coordination are implemented once,
in core. The definitions of units, timezones, sources and missing values live in
`core::contract`, so that every outlet gives the same answer to "what unit is
this number".

## Current implementation

### Connecting, authentication and syncing

- **Official authorization** opens the Zepp authorization page in the system
  browser. The relay on Cloudflare adds the App Secret for the token exchange
  and refresh; the desktop app carries neither the App ID nor the secret and
  claims its tokens from the relay once (`official/`). The official channel only
  polls over REST; ZeppBridge accepts no pushes from Zepp.
- **Advanced data** uses in-app web sign-in: a separate `zepp-login` window
  opens `watchface.zepp.com` (falling back to `user.huami.com` after a timeout),
  and may navigate only to HTTPS pages on `zepp.com` / `huami.com`. Third-party
  sign-in hosts (Google, Apple, WeChat, Xiaomi, Facebook, the Amazfit account
  site) are blocked; the account's email or phone number and password are
  needed.
- The backend polls the sign-in window's cookies, parses `hm-user-login-info` or
  `userid` + `apptoken`, then verifies against an allowed region host using a
  recent heart-rate request.
- The frontend calls only `start_web_login` / `cancel_web_login` /
  `get_login_status` and listens to `login://status`. The payload is
  `{ state, message, page_url, code }`.
- Tokens use the platform credential store: Windows Credential Manager, the
  macOS Keychain or the Linux Secret Service. macOS and Linux can explicitly
  choose file storage, and on Linux (including containers) the Advanced data
  token can also come from an environment variable; see the
  [credential boundaries](security-and-privacy.md#credentials). `auth.json`
  keeps only non-sensitive metadata.
- A saved credential restores straight to "configured" after a restart, and
  `verify_auth` runs at launch. Only an explicit 401/403 or `needs_reauth`
  requires reconnecting.
- History backfill covers the 1–3650 days you choose (default 180). Incremental
  syncs carry a 30-day overlap window
  (`zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`, surfaced to the UI as
  `AppStatus.incremental_sync_days`). Automatic sync runs every 15, 30 or 60
  minutes (default 15) and re-fetches only the last `QUICK_SYNC_DAYS` (3) days,
  falling back to the full window whenever no fully successful full-window sync
  has happened in the past `FULL_WINDOW_REFRESH_HOURS` (24) hours; manual,
  launch, tray and CLI syncs always use the full window
  (`AppStatus.auto_sync_days` tells the UI which). A single sync controller
  serves the top-bar "Sync now", Settings, launch sync, automatic sync, the
  concurrency lock and page refreshes.
- With both channels connected, the Advanced data channel runs as before and
  the official channel adds sleep and hourly steps; with only official
  authorization, everything the official channel offers comes from it. See
  [official API facts §2](official-api-facts.md#2-what-zeppbridge-actually-fetches).
- Sync outcomes distinguish `updated`, `no_new_data`, `partial` and `failed`.
  The cloud fetch time and each stream's newest sample time are stored and shown
  separately. A local re-parse never changes the cloud sync time.

### SQLite and data semantics

- SQLite runs with migrations, WAL, foreign keys and a 30-second busy timeout.
  Raw payloads carry a hash and source key, and canonical rows point back
  through `raw_record_id`. Rows record which channel (`provider`) they came from.
- Runs (Zepp `type=1`) fetch `/v1/sport/run/detail.json` by `trackid` + `source`
  after the history summary, then delta-decode into `workout_samples` /
  `route_points` / `workout_pauses`. With no points, no track or curve is drawn.
- The metric/daily unique indexes use `COALESCE` for empty device IDs, avoiding
  `NULL` duplicates.
- Retention is user-selectable between 1 and 365 days, defaulting to 365.
  Cleanup is driven by the health record's own timestamp and reclaims
  unreferenced raw rows. A newly created library has long-term archiving on, so
  nothing is pruned automatically.
- The `user_fused`, `device` and `unknown` sources are preserved. Nothing is
  silently fused when the source is ambiguous.
- Payloads whose encoding is not verified are kept as raw only. The one decoded
  part of `band_data` is the verified per-minute layout (1440 minutes × 8
  bytes), from which hourly steps are read (`storage/hourly_steps.rs`). No
  simulated curve or map is drawn where there is no real sample or route.
- The live schema version is `PRAGMA user_version = CURRENT_SCHEMA_VERSION`
  (`storage/mod.rs`, currently 52). Migration steps live in
  `storage/migrations.rs`. Derived columns are backfilled by a local replay
  triggered by a `NORMALIZER_REVISION` change, with no network access needed.
  Notable steps:

  | Version | Change |
  | --- | --- |
  | v10–v16 | Running power and posture, per-stream provenance, user naming of unknown workout codes and device assignment, the history coverage ledger, compressed raw payloads |
  | v31, v34 | Provider column and raw objects for the two channels; official sleep |
  | v35, v37 | Training-plan publishing and multi-window pushes |
  | v36 | AI exchanges; new libraries default to long-term archiving |
  | v42–v45 | Local journal data: shoes, annotations, injuries, races, personal records, letters, prompt history |
  | v46, v50, v51 | Imports (GPX, FIT, Strava bundle, Apple Health; unstrap backups) |
  | v47–v49 | Hidden devices, nap stages, the ledger of MCP writes |
  | v52 | Per-set strength training detail |

- A consistency backup is created automatically before every schema migration;
  the migration does not proceed if the backup or its integrity check fails. The
  migration itself starts only after acquiring the cross-process write lock.
- While a replay is running, `storage::replay_in_progress()` is true, and a
  cloud sync started then stands aside with a `deferred` result and retries
  automatically a minute later, rather than racing for the SQLite write lock.

### Data provenance and health

- The **fetch, parse and write** stages are recorded separately per stream, each
  with a status, the last successful time, and a stable machine-readable failure
  class (`network` / `auth` / `not_available` / `unrecognized_payload` /
  `storage` / `busy` / `cancelled` / `unknown`). They are separate because the
  fix for each is different: a failed fetch means checking the network or
  reconnecting, a failed parse means the normalizer does not recognise that
  shape, and a failed write is a local problem.
- Coverage is explained according to each stream's cadence rather than flattened
  into one completeness percentage: continuous/daily/nightly streams talk about
  "gaps", while per-event/occasional streams talk about "observations counted".
- The data health page (`/health-check`) shows those facts and offers repair
  actions you can run directly.

### Long-term archive and complete history

- Retention (1–365 days) and the history backfill window (up to ten years) are
  two independent settings. With long-term archiving on, a successful sync no
  longer prunes history by the retention window.
- Full history backfill runs on the Advanced data channel, splits the range into
  calendar months and records each chunk in the coverage ledger. A chunk ends in
  one of five states: **pending**, **written**, **the cloud explicitly returned
  nothing**, **partial**, and **failed but retryable**. It can be paused,
  cancelled and continued after a restart; repeated runs create no duplicates.
- The interface does not flatten those states into a progress bar. Only when
  every chunk in the ledger has a conclusion is "a complete local copy" used as
  wording; otherwise it is "a local copy of the range that synced successfully".
- A backfill reaching outside the retention window with archiving off is blocked
  up front, so fetched history is never deleted by the next successful sync.
- The size estimate is measured per stream: stored payload bytes divided by days
  observed. Streams with fewer than seven days of samples are labelled "not
  enough samples, not counted".

### Backup and restore

- Snapshots use the SQLite Backup API rather than copying the live `zepp.db` /
  WAL / SHM.
- Each snapshot carries a manifest: creation time, app version, schema version,
  normalizer revision, coverage range, per-table row counts, byte size and
  SHA-256. `integrity_check` runs immediately afterwards, and a failed check
  deletes the half-finished file.
- Pre-migration backups are kept on a rolling basis, five at a time, and
  manually created or user-pinned snapshots are never deleted.
- A restore can only be queued: the file replacement runs at the next launch,
  before any database connection is opened. The preview is given at queue time,
  spelling out the per-table row difference between the snapshot and the
  current database. The current database is saved as a rollback point first,
  and any failed step returns to it. An older schema migrates forward after
  restoring, the same schema restores directly, and a newer schema is refused
  without touching the current database.

### Cross-process write coordination

- Syncing, history backfill, schema migration, restore, backup, re-parsing,
  cleanup, CLI edits and MCP write tools all acquire the cross-process write lock
  first, so the desktop app, the CLI and MCP never write the same database
  simultaneously.
- A sync or history backfill holds a separate **sync lease** for its whole run
  (so two syncs never overlap across processes) but takes the write lock only
  for the short stretches where it actually writes. While it waits on the
  network, saving a setting or a journal entry goes through; those quick writes
  wait a few seconds for a sync's write window instead of failing at once.
- The lock is held by the operating system (exclusive share-mode file open on
  Windows, `flock` on Unix-likes), so the kernel releases it when a process
  crashes and no lock file ever has to be deleted by hand.
- Read-only queries take no write lock. Read-only connections use
  `PRAGMA query_only`, so writes are refused at the SQLite layer.

### Deterministic insights

- Post-run insights and the local weekly report produce **facts and evidence
  only**: the comparison against your own baseline, the definition of the
  baseline window, the sample count and the confidence. The backend generates no
  natural-language conclusions and no medical advice.
- The baseline is this person's own history, not a population standard. With
  insufficient samples it returns "not enough evidence" and says why.
- An AI client interprets those facts; it does not rewrite them.

### Desktop interface

- The main navigation is Overview, Send to AI (`/ai`) and Settings. The top bar
  carries connection status, a global sync and the letters button.
- Themes: dark, light and follow system (Settings › Display and language).
  Interface scale is adjustable (80%–125%, also Ctrl + / Ctrl - / Ctrl 0), and
  so are visual effects (Auto / Full / Low; Auto means Low on Linux, on slower
  machines and on low battery).
- The interface offers **thirteen language and region options**: Simplified
  Chinese, English, Spanish, Dutch, Brazilian Portuguese, European Portuguese,
  German, Russian, Hindi, French, Italian, Polish and Traditional Chinese. On
  first launch it follows the first supported system language, falling back to
  English; Settings switches it at any time, and the choice is stored in
  `localStorage['zeppbridge-locale']`. Dates, weekday names and number grouping
  follow the language too (`i18n/intlLocale()`).
  - Chinese, English and Spanish copy lives with its module
    (`defineMessages(zh, en, es?, moduleId?)`, with a matching `*.i18n.ts` for
    large pages). The other ten options use language packs in
    `src/i18n/locales/<locale>.ts`, loaded on demand and matched by `moduleId`.
    Missing translations fall back to English; Traditional Chinese falls back to
    Simplified Chinese.
  - `defineMessages` uses `NoInfer` to pin the shape to the Chinese half, so a
    missing English key, an extra key or a mismatched parameter fails to compile.
  - **The backend does not produce copy per locale.** The four outlets (GUI,
    CLI, MCP, export) must answer the same question the same way, so the backend
    emits stable codes (`recordsUnitCode`, `HealthAction.code`,
    `SyncProgress.code`, `InsightFact.reason_code`, `err.*`, `ui.*` …) while
    keeping the Chinese original for the CLI. The interface renders its own
    wording from the code and falls back to the original only when it does not
    recognise it. The `note` / `detail_note` / `reason` fields in exported JSON
    are never translated: they are a contract external scripts read.
  - How the i18n checks work is in the
    [development guide](../development/development.md).
- Overview opens with the metrics you pinned, then the modules for the focus
  areas you chose on first launch (heart rate, steps, sleep, body, training);
  the others fold away. Sync time and heart-rate sample time are kept visibly
  separate.
- Secondary pages are reached from Overview cards: `/recent`, `/heart`,
  `/activity`, `/sleep` and `/sleep/:sleepId`, `/workouts` and
  `/workouts/:workoutId`, body status `/body`, training status `/training`,
  `/rings`, `/devices/:deviceKey` and `/health-check`. The journal (`/journal`:
  shoes, races, injuries, eras and life events), letters (`/letters`) and the
  AI pages (`/ai/plan`, `/ai/memory`, task history) have their own entries. All
  of them only render what is already in the local database, stating honestly
  "M of N days have records"; days without data break the curve rather than
  being interpolated.
- Sleep detail shows the real total duration, score and stage proportions;
  workout detail shows distance, calories, heart rate, training load, splits and
  the route when it was decoded, computing pace only when both distance and
  duration are valid.
- Send to AI (`/ai`) builds one redacted package per analysis task and hands it
  to an allow-listed AI site. Exports: JSON / CSV / GPX / FIT from
  `zeppbridge-cli export`, FIT also from the workout detail page, "take
  everything with you" (one JSON) from Settings, an unstrap-format zip from the
  Beta lab, and `export_data` over MCP.
- Settings is a deck of ten cards: Account and devices, Sync,
  Archive and storage, Your data, AI tools, Display and language, Beta lab,
  Guide, Privacy and security, and Advanced and maintenance.
- Status colours mean green success, grey neutral, yellow needs attention, red
  failure. Category colours mark data categories such as heart rate, sleep and
  workouts. The brand accent is the olive green `#7DA33E`. The full palette and
  page structure are in the [UI guidelines](../development/ui-guidelines.md).

## Verified and unverified

Syncing and installer smoke tests have been completed with an owner-authorised
account. The public repository keeps only redacted, reproducible engineering
evidence: no accounts, devices or personal health samples.

The current evidence does not extrapolate to:

- compatibility with every Zepp region, account, device and firmware;
- any browser session reliably yielding parseable cookies;
- run detail returning a decodable delta string on all regions and firmware;
- per-point samples existing for every activity type;
- signed installers or whole-database encryption;
- macOS and Linux on real hardware: CI compiles, lints and tests on
  `macos-latest` and Linux, but the maintainer has no Mac, so syncing, sign-in
  and Keychain behaviour there rely on contributors' reports.

## Mapping the Advanced data events API

Zepp's events API has several mutually non-equivalent shapes, and the same
`eventType` behaves differently in each. Treating them as variants of one API
hides data: asking only for a subset of blood oxygen, for example, makes a
device that is still measuring look silent.

| Shape | Path | Time parameters | Used for |
|---|---|---|---|
| v2 | `/v2/users/me/events` | `from`/`to` in ms | HRV, readiness, Charge (including stress), respiratory rate, skin temperature, blood pressure (experimental), lactate threshold, food |
| user | `/users/{id}/events` | `from`/`to` in ms | SpO2 (**the full set only without subType**), `all_day_stress`, PAI |
| day | `/users/{id}/events/dateString` | ISO-8601 + `timeZone` | Nightly SpO2 `odi` / `osa_event`; blood pressure by date (experimental) |
| file | `/users/me/fileInfo/events` | `from`/`to` in ms | Returns a COS file index, not samples |

Confirmed `eventType`/`subType` values (sources in the README acknowledgements;
two independent projects agree line by line):

```
v2:    hrv_sdnn/real_data · HRVRMSSD/real_data · readiness/watch_score
       Charge/real_data · Charge/stress_data · Charge/insight_data
       DailyHealth/summary · RespiratoryRate/real_data · skinTemp/real_data
       blood_pressure/real_data · Emotion/real_data · LactateThreshold/summary
       Food
user:  blood_oxygen (no subType = the full set) · all_day_stress · PaiHealthInfo
day:   blood_oxygen/odi · blood_oxygen/osa_event
file:  second_heart_rate/real_data
```

The full `blood_oxygen` stream mixes three structures, split by `subType`:
`click` (spot readings), `odi` (nightly summary) and `osa_event` (suspected
apnoea). Only the unfiltered stream contains all three.

Weight records come from `/users/{id}/members/-1/weightRecords` in 90-day
chunks; up to eleven body-composition metrics are normalised when a scale
provides them. Blood pressure is **experimental**: it is requested on three
surfaces and normalised when paired readings are present, but the mapping has
not yet been confirmed against an account that actually measures it.

### Fields in workout detail: verified versus not wired up

Run detail (`/v1/sport/run/detail.json`) carries many delta strings. A field is
accepted only when its series **matches the summary fields of the same
workout**: the summary carries Zepp's own averages and extremes, a ready-made
control. Verified and stored in `workout_samples`:

| Field | Meaning | Checked against |
|---|---|---|
| `power_meter` | Running power, watts | Summary `average_power` and `max_power` |
| `runPosture` item 1 | Ground contact time, ms | `averageGct`, `minGct` |
| `runPosture` item 2 | Vertical oscillation, mm | `averageVo`, `maxVo` |
| `runPosture` item 3 | Vertical stride ratio, 0.1% | `avgVertStrideRatio`, and consistent with oscillation ÷ stride |
| `equivPace` | Equivalent pace, s/km | `bestEquivPace`; the distance-weighted mean matches `avgEquivPace` |

`runPosture` sentinels are `65535` (first two items) and `255` (the third); both
become `null` and are never stored as 0.

`equivPace` is stored exactly as the device sent it and filtered on read: the
device keeps emitting readings while the athlete stands still. The read path
accepts only 60–3600 s/km, the same window `pace` uses. `equivPace` is not
`1/speed`: it is Zepp's own grade-adjusted pace, so `pace` cannot substitute for
it and speed cannot be derived from it.

Still kept as raw only:

- **`Charge/insight_data`**: several values can appear on one day, split by
  `type`; without a control to verify the semantics against, nothing is
  normalised.
- **`Charge/stress_data`**: a protobuf whose float arrays match none of the
  ranges the app displays. The stress screen and the export read
  `all_day_stress` instead, whose `data` field carries the whole day's curve at
  five-minute spacing.
- **`second_heart_rate/real_data`**: the endpoint returns a COS file index rather
  than samples. Fetching the files would mean adding COS hosts to the network
  allow-list, so it is not wired up.
- **`/huami.health.getUserInfo.json`, `/v1/user/manualData.json`**: they carry
  only age and height, and age is not used to estimate heart-rate zones.

### Heart-rate zones: three algorithms, none preset

Heart-rate zones are not estimated. The workout summary carries `heart_range`
(six "seconds, upper bound" pairs) and `heartrate_setting_type`, which are the
boundaries the watch itself uses; the lactate-threshold percentages below were
derived by matching those boundaries, rounding down.

| Algorithm | Formula | Zone percentages |
|---|---|---|
| Max heart rate zones | max HR × percentage | 50 / 60 / 70 / 80 / 90–100% |
| Heart-rate reserve zones | resting + (max − resting) × percentage | 50 / 60 / 70 / 80 / 90–100% |
| Lactate threshold zones | lactate threshold HR × percentage | 65 / 81 / 88 / 93 / 99–109% |

Every available basis is measured locally and carries its own source and
measurement date: `max(workouts.max_hr)`, `daily_metrics.device_max_hr`,
`daily_metrics.device_resting_hr`, `avg(daily_metrics.resting_hr)` over the last
30 days, and `daily_metrics.lactate_threshold_hr`.

No age formula such as 220 − age is used, and no algorithm is preset: the
selector on `/training` starts empty, exports have `selected_model` as `null`
while listing every computable combination, and every `selected` is `false`.
Which one to use is the user's decision.

### Why capability probing needs controls

`/v2/users/me/events` returns HTTP 200 with an empty list for **any**
`eventType`, including names that do not exist. So "returned empty" is not
evidence of anything by itself. The prober always runs two controls:

- **Positive control** `hrv_sdnn/real_data`, known to have data. If it comes
  back empty, the probe chain itself is broken (auth, time window, parsing) and
  every other result is untrustworthy.
- **Negative control**, a stream name that does not exist. If it also returns
  empty, then "empty" is not evidence for any candidate stream, and the
  interface says "cannot determine".

Probing is read-only: nothing is stored, nothing is logged, no measurement is
read. Only statuses and field names are recorded.
