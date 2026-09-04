# ZeppBridge architecture summary

This page describes the product boundaries and current implementation of v2.2.0.
For the usage entry point see the project [README](../../README.md); for
engineering gates see the [development guide](../development/development.md).

[简体中文](architecture.zh-CN.md)

## Product boundaries

ZeppBridge is a desktop application that stores Zepp health data locally, on
Windows and macOS (Apple Silicon). Windows is the primary verified platform;
the macOS side is covered by CI's `macos-latest` job for compilation, clippy and
tests:

```text
sign-in window → session cookies → region probe → Credential Manager
Zepp region cloud → ZeppConnector → Raw provenance → Normalizer → SQLite
                                                              ↓
                                       ┌──────────────────────┼──────────────────────┐
                                  Tauri IPC             local REST              CLI / MCP
                                  Vue interface      127.0.0.1:43921          stdio / process
```

Health data is written locally by default. Syncing reaches the Zepp region
service you configured. The app does not automatically fuse different device
sources, and it never generates estimated values for missing routes, curves or
metrics.

All four outlets (desktop interface, local REST, CLI, MCP) are adapters over
`zeppbridge-core`: the data model, SQLite schema and migrations, normalisation,
query semantics, exports, insights and write coordination are implemented once,
in core. The definitions of units, timezones, sources and missing values live in
`core::contract` — if four outlets each explain "what unit is this number" on
their own, sooner or later they give four different answers, and the user has no
way to tell which one is right.

## Current implementation

### Connecting, authentication and syncing

- The first connection uses in-app web sign-in: a separate `zepp-login` window
  opens `watchface.zepp.com` (falling back to `user.huami.com` after a timeout),
  and may navigate only to HTTPS pages on `zepp.com` / `huami.com`.
- The backend polls the sign-in window's cookies, parses `hm-user-login-info` or
  `userid` + `apptoken`, then verifies against an allowed region host using a
  recent heart-rate request.
- The frontend calls only `start_web_login` / `cancel_web_login` /
  `get_login_status` and listens to `login://status`. The payload is
  `{ state, message, page_url, code }`.
- The app token is stored in the platform credential store (Windows Credential
  Manager / macOS Keychain); `auth.json` keeps only non-sensitive metadata.
- A saved credential restores straight to "configured" after a restart, and
  `verify_auth` runs at launch. Only an explicit 401/403 or `needs_reauth`
  requires reconnecting.
- First-run and history syncs cover the 1–365 days you choose (default 30);
  incremental syncs carry a 30-day overlap window
  (`zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`, surfaced to the UI as
  `AppStatus.incremental_sync_days` — do not hard-code it anywhere else).
  A single sync controller
  serves the top-bar "Sync now", Settings, launch sync, the 15-minute automatic
  check, the concurrency lock and page refreshes.
- Sync outcomes distinguish `updated`, `no_new_data`, `partial` and `failed`.
  The cloud fetch time and each stream's newest sample time are stored and shown
  separately. A local re-parse never changes the cloud sync time.

### SQLite and data semantics

- SQLite runs with migrations, WAL, foreign keys and a busy timeout. Raw
  payloads carry a hash and source key, and canonical rows point back through
  `raw_record_id`.
- Runs (Zepp `type=1`) fetch `/v1/sport/run/detail.json` by `trackid` + `source`
  after the history summary, then delta-decode into `workout_samples` /
  `route_points` / `workout_pauses`. With no points, no track or curve is drawn.
- The metric/daily unique indexes use `COALESCE` for empty device IDs, avoiding
  `NULL` duplicates.
- Retention is user-selectable between 1 and 365 days, defaulting to 365.
  Cleanup is driven by the health record's own timestamp and reclaims
  unreferenced raw rows.
- The `user_fused`, `device` and `unknown` sources are preserved. Nothing is
  silently fused when the source is ambiguous.
- Encoded but unverified `band_data` is kept as raw only. No simulated curve or
  map is drawn where there is no real sample or route.
- The schema version is `PRAGMA user_version = 16`. Migration steps may only be
  appended; published DDL is never modified (`storage/migrations.rs`). v10 added
  running power and posture columns to `workout_samples`; v12 added per-stream
  three-stage provenance; v13 added user naming for unrecognised workout codes
  and manual device-model assignment; v14 added the history coverage ledger;
  v15 added the compressed `payload_zip` column to `raw_records` (reads accept
  both shapes, so plaintext rows stay readable forever); v16 added the backfill
  attempt counter and failure code to the coverage ledger. Derived columns are
  backfilled by a local replay triggered by a `NORMALIZER_REVISION` change, with
  no network access needed.
- A consistency backup is created automatically before every schema migration;
  the migration does not proceed if the backup or its integrity check fails. The
  migration itself starts only after acquiring the cross-process write lock.
- While a replay is running, `storage::replay_in_progress()` is true, and a
  cloud sync started then stands aside with a `deferred` result and retries
  automatically a minute later, rather than racing for the SQLite write lock and
  reporting "the local database is temporarily unavailable". `busy_timeout` is
  raised from 5 seconds to 30 at the same time.

### Data provenance and health

- The **fetch, parse and write** stages are recorded separately per stream, each
  with a status, the last successful time, and a stable machine-readable failure
  class (`network` / `auth` / `not_available` / `unrecognized_payload` /
  `storage` / `busy` / `cancelled` / `unknown`). They are separate because the
  fix for each is completely different: a failed fetch means checking the
  network or reconnecting, a failed parse means our normalizer does not
  recognise that shape, and a failed write is a local problem.
- Coverage is explained according to each stream's cadence rather than flattened
  into one completeness percentage: continuous/daily/nightly streams talk about
  "gaps", while per-event/occasional streams talk about "observations counted".
  Computing completeness for an occasional metric only produces a fake low
  score.
- The data health page (`/health-check`) shows those facts and offers repair
  actions you can run directly.

### Long-term archive and complete history

- Retention (1–365 days) and the history backfill window (up to ten years) are
  two independent settings. With long-term archiving on, a successful sync no
  longer prunes history by the retention window.
- Full history backfill splits the range into calendar months and records each
  chunk in the coverage ledger. A chunk has exactly four outcomes: **written**,
  **the cloud explicitly returned nothing**, **pending**, and **failed but
  retryable**. It can be paused, cancelled and continued after a restart;
  repeated runs create no duplicates.
- The interface deliberately does not flatten those four into a progress bar —
  once it is a progress bar, "do I actually have my 2023 data" has no answer.
  Only when every chunk in the ledger has a conclusion is "a complete local
  copy" allowed as wording; otherwise it is "a local copy of the range that
  synced successfully".
- A backfill reaching outside the retention window with archiving off is blocked
  up front. Fetching history and having the next successful sync delete it is
  the most trust-destroying behaviour available.
- The size estimate is measured per stream: stored payload bytes divided by days
  observed. Streams with fewer than seven days of samples are labelled "not
  enough samples, not counted" rather than multiplying an invented rate by three
  years.

### Backup and restore

- Snapshots use the SQLite Backup API rather than copying the live `zepp.db` /
  WAL / SHM.
- Each snapshot carries a manifest: creation time, app version, schema version,
  normalizer revision, coverage range, per-table row counts, byte size and
  SHA-256. `integrity_check` runs immediately afterwards, and a failed check
  deletes the half-finished file rather than leaving a broken backup that looks
  usable.
- Pre-migration backups are kept on a rolling basis, five at a time, and
  manually created or user-pinned snapshots are never deleted.
- A restore can only be queued: the file replacement runs at the next launch,
  before any database connection is opened — the only moment an atomic swap is
  possible. The preview is given at queue time, spelling out the per-table row
  difference between the snapshot and the current database. The current database
  is saved as a rollback point first, and any failed step returns to it. An
  older schema migrates forward after restoring, the same schema restores
  directly, and a newer schema is refused outright without touching the current
  database.

### Cross-process write coordination

- Syncing, history backfill, schema migration, restore, backup, re-parsing and
  cleanup all acquire the cross-process write lock first, so the desktop app and
  the CLI can never write the same database simultaneously.
- The lock is held by the operating system (exclusive share-mode file open on
  Windows, `flock` on Unix-likes), so the kernel releases it when a process
  crashes. There is no "it crashed last time and now the database will not open"
  failure mode requiring someone to delete a lock file by hand.
- Read-only queries take no write lock: a read-only connection cannot write
  anyway, and making them queue would stall every MCP query during a long sync.
  Read-only connections use `PRAGMA query_only`, so writes are refused at the
  SQLite layer.

### Deterministic insights

- Post-run insights and the local weekly report produce **facts and evidence
  only**: the comparison against your own baseline, the definition of the
  baseline window, the sample count and the confidence. The backend generates no
  natural-language conclusions.
- The baseline is this person's own history, not a population standard. With
  insufficient samples it returns "not enough evidence" and says why, rather
  than lowering the bar to manufacture a sentence.
- The AI interprets those facts; it does not rewrite them.

### Desktop interface

- The main navigation is Overview, Hand to AI (`/explore`), Data health
  (`/health-check`) and Settings. The top bar carries connection status and a
  global sync.
- The interface is **dark only**: by design there is no light or follow-system
  mode and no theme switch. The only adjustable dimension is interface scale
  (80%–125%, in Settings → "Advanced and maintenance", or Ctrl + / Ctrl - /
  Ctrl 0).
- The interface is **bilingual, Chinese and English**. On first launch it
  follows the system language (Chinese only when the system explicitly says so);
  the Settings page header switches it at any time, and the choice is stored in
  `localStorage['zeppbridge-locale']`. Dates, weekday names and number grouping
  follow the language too (`i18n/intlLocale()`), not just the words.
  - **vue-i18n is deliberately not used.** It was measured: wiring it up
    (runtime build included, before translating a single string) grew the
    first-screen gzip from 73.0 kB to 91.6 kB, 7.6 kB over the size budget. The
    hand-rolled layer is under a screenful of code and adds 0.4 kB.
  - Copy lives with the module that uses it (`defineMessages(zh, en)` inline,
    with a matching `*.i18n.ts` for large pages) rather than in one global
    dictionary, so a lazily loaded page's chunk still carries only its own copy.
  - `defineMessages` uses `NoInfer` to pin the shape to the Chinese half, so a
    missing English key, an extra key or a mismatched parameter fails to compile.
  - **The backend does not produce copy per locale.** The four outlets (GUI,
    CLI, MCP, export) must answer the same question the same way, so the backend
    emits stable codes (`recordsUnitCode`, `HealthAction.code`,
    `SyncProgress.code`, `InsightFact.reason_code`, `err.*`, `ui.*` …) while
    keeping the Chinese original for the CLI. The interface renders its own
    wording from the code and falls back to the original only when it does not
    recognise it. The `note` / `detail_note` / `reason` fields in exported JSON
    are never translated — they are a contract external scripts read.
  - CI runs `npm run i18n:check`: hardcoded Chinese in the interface turns it
    red, as does a backend code with no English copy, or the interface rendering
    a backend original where a code was available. Per-line exemptions live in
    `ALLOWED` / `ALLOWED_PROSE` in `scripts/release/check-i18n.mjs`.
- Overview is organised as "latest heart rate → Hand to AI entry → recent
  sleep/workouts"; sync time and heart-rate sample time are kept visibly
  separate. Recovery and training analysis do not happen on Overview.
- Sleep and workouts are not in the main navigation. Overview's "view all" leads
  to `/sleep` and `/workouts`; individual detail pages are `/sleep/:sleepId` and
  `/workouts/:workoutId`.
- Body status `/body` and training status `/training` are likewise secondary
  pages, reached from two entry cards on Overview. Both are purely presentational:
  the data is already in the local database, and the page only renders it over 7
  days / 1 month / 6 months, stating honestly "M of N days have records". Days
  without data break the curve rather than being interpolated.
- Sleep detail shows the real total duration, score and four-stage proportions;
  workout detail shows distance, calories, average/max heart rate, training load
  and VO₂max, computing pace only when both distance and duration are valid. A
  run draws a polyline if a track or heart-rate points were decoded, and
  otherwise still says "not provided".
- JSON export lives in `/explore` (Hand to AI): choose a prompt template, copy,
  save a file, or hand off directly to an allow-listed AI site. Settings expands
  by numbered section into connection, account, devices, privacy, retention,
  export preferences, local API, updates and automatic sync; interface scale,
  the data folder, clearing credentials and sync diagnostics are tucked into
  "Advanced and maintenance" at the bottom.
- Status colours mean green success, grey neutral, yellow needs attention, red
  failure. Category colours are used only to mark data categories such as heart
  rate, sleep and workouts. The brand accent is a low-saturation olive green
  `#7DA33E`, not system blue. The full palette and page structure are in the
  [UI guidelines](../development/ui-guidelines.md).

## Verified and unverified

The project has completed syncing and installer smoke tests with an
owner-authorised account. The public repository keeps only redacted,
reproducible engineering evidence — no accounts, devices or personal health
samples.

The current evidence still does not extrapolate to:

- compatibility with every Zepp region, account, device and firmware;
- any browser session reliably yielding parseable cookies (needs verification on
  a real account);
- run detail returning a decodable delta string on all regions/firmware;
- per-point samples existing for non-`type=1` activities such as walking and
  cycling;
- signed installers, whole-database encryption, or meeting the bar for public
  distribution;
- **macOS being accepted on real hardware**: there is only CI (`macos-latest`)
  compilation, clippy and tests passing, plus one contributor's smoke test on an
  M-series chip. The repository maintainer has no macOS device and cannot
  independently verify syncing, sign-in or Keychain behaviour.

## Mapping the Zepp events API

Zepp's events API has **three mutually non-equivalent shapes**, and the same
`eventType` behaves differently in each. Treating them as variants of one API is
exactly why ZeppBridge once concluded "this account has no SpO2" — while the
Zepp app was showing continuous SpO2 records.

| Shape | Path | Time parameters | Used for |
|---|---|---|---|
| v2 | `/v2/users/me/events` | `from`/`to` in ms | HRV, readiness, Charge (including stress), respiratory rate, skin temperature, blood pressure, lactate threshold |
| user | `/users/{id}/events` | `from`/`to` in ms | SpO2 (**the full set only without subType**), `all_day_stress`, PAI |
| day | `/users/{id}/events/dateString` | ISO-8601 + `timeZone` | Nightly SpO2 `odi` / `osa_event` |
| file | `/users/me/fileInfo/events` | `from`/`to` in ms | Returns a COS file index, not samples |

Confirmed `eventType`/`subType` values (sources in the README acknowledgements;
two independent projects agree line by line):

```
v2:    hrv_sdnn/real_data · HRVRMSSD/real_data · readiness/watch_score
       Charge/real_data · Charge/stress_data · Charge/insight_data
       DailyHealth/summary · RespiratoryRate/real_data · skinTemp/real_data
       blood_pressure/real_data · Emotion/real_data · LactateThreshold/summary
user:  blood_oxygen (no subType = the full set) · all_day_stress · PaiHealthInfo
day:   blood_oxygen/odi · blood_oxygen/osa_event
file:  second_heart_rate/real_data
```

Three structures are mixed under the full `blood_oxygen` stream, split by
`subType`: `click` (spot readings), `odi` (nightly summary) and `osa_event`
(suspected apnoea). Taking only the `click` subset misses the other two — which
is precisely what caused the early misdiagnosis that "the device stopped
measuring SpO2".

### Fields in workout detail: verified versus not wired up

Run detail (`/v1/sport/run/detail.json`) carries many delta strings. The test is
not "what does it look like" but **whether it matches the summary fields of the
same workout** — the summary carries Zepp's own averages and extremes, a
ready-made control.

Verified and stored (`workout_samples`, schema v10):

| Field | Meaning | How it was verified |
|---|---|---|
| `power_meter` | Running power, watts | Series means 249.3 / 231.5 match summary `average_power` 249.0 / 231.0; maxima 326 / 303 match `max_power` |
| `runPosture` item 1 | Ground contact time, ms | Mean 263.5 matches `averageGct` 263, minimum 232 matches `minGct` |
| `runPosture` item 2 | Vertical oscillation, mm | Mean 88.3 matches `averageVo` 88, maximum 95 matches `maxVo` |
| `runPosture` item 3 | Vertical stride ratio, 0.1% | Mean 87.1 matches `avgVertStrideRatio` 87; and 88 mm ÷ 1010 mm stride = 8.7%, the two fields confirming each other's units |
| `equivPace` | Equivalent pace, s/km | Minimum 264 matches `bestEquivPace`; the distance-weighted mean (5428.6 s ÷ 15257 m = 355.8) matches `avgEquivPace` 355 |

`runPosture` sentinels are `65535` (first two items) and `255` (the third); both
become `null` and are never stored as 0.

The `equivPace` column is stored exactly as the device sent it and filtered on
read: the device keeps emitting readings while the athlete stands still, and
this account's database contains 51604 s/km (fourteen hours per kilometre). The
read path accepts only 60–3600 s/km, the same window `pace` uses when converting
to minutes per kilometre — 682 of 98011 real rows (0.7%) fall outside it.

**Note that `equivPace` is not `1/speed`.** A second-by-second comparison
disagrees on a third of samples, and even at the best offset there is a 32%–36%
deviation. It is Zepp's own grade-adjusted pace: the existing `pace` cannot
substitute for it, and speed cannot be derived from it.

Still kept as raw only, marked unverified:

- **`Charge/insight_data` (formerly `charge_insight`)** — once suspected to be a
  "combined energy score", now **ruled out**: three samples can appear on one day
  (`insight` values 6 / 79 / 6), splitting by `type` into classes 3 and 7, each
  with `s`/`e` millisecond offsets and a `jsonExtra.hcInsightId`. A daily score
  does not produce three values in one day. The semantics of `insight`,
  `insightId` and `type` have no control to verify against, so nothing is
  normalised.
- **`Charge/stress_data`** — confirmed to be protobuf. Parsed correctly it is
  four repeated float32 arrays (2880 / 255 / 8 / 6 values), and none of them
  matches the daily average and range the app displays. It is also no longer
  needed: `all_day_stress` turned out to carry the whole day's curve in its
  `data` field, five minutes apart, and the roll-up it ships alongside is
  computed from exactly that curve — across 946 items the reported minimum and
  maximum equal the series' own, every time. So the stress screen and the
  export both read `all_day_stress`, and this one stays unwired.
- **`second_heart_rate/real_data`** — `/users/me/fileInfo/events` confirms data
  exists, but it returns a COS file index rather than samples; getting
  per-second heart rate would need a further file download. The current host
  allow-list permits only `api-mifit*.zepp.com` / `huami.com`, and COS domains
  are not among them, so wiring this up would mean widening the network
  boundary. Not done.
- **Per-reading SpO2 after 16 August** — `blood_oxygen/click` spot readings stop
  on 2026-08-16, leaving only the `odi` nightly summary, yet the Zepp app still
  draws a continuous curve. Directions already ruled out:
  `/users/me/fileInfo/events` (the same API surface has data for
  `second_heart_rate` but not SpO2, which is an evidenced negative), the 8-byte
  blocks in `band_data` (only mode/intensity/steps/heart rate), and the `auto` /
  `real_data` subtypes of `blood_oxygen`. **The only remaining direction is
  capturing the Zepp app's real requests, and this project explicitly forbids
  reviving the MITM / user CA / Wi-Fi proxy route**, so this line stops here.
- **Endpoints not wired up** — `/users/me/bloodPressure`,
  `/users/{id}/members/-1/weightRecords`, `/huami.health.getUserInfo.json`,
  `/v1/user/manualData.json`.
  - **Blood pressure and weight: explicitly unsupported, and not planned.** This
    is a product decision made on 2026-08-30, not "insufficient evidence, waiting
    for a fixture" — the earlier conclusion of "we will wire it up once we have
    an audited redacted fixture" is void, and must not be used to restart the
    work. Concretely: do not request `/users/me/bloodPressure` or
    `weightRecords`, do not normalise the blood-pressure `eventType` appearing in
    the v2 event surface above, and do not put weight/blood-pressure cards,
    placeholders or "coming soon" text in the interface or documentation. Users
    who need a body-fat scale or blood pressure should keep using the Zepp app.
  - `getUserInfo` / `manualData`: only age and height, and age **cannot** be used
    to estimate heart-rate zones (see below), so neither is wired up.

### Heart-rate zones: three algorithms, none preset

The basis for heart-rate zones is not estimated. The workout summary carries
`heart_range` (six "seconds, upper bound" pairs) and `heartrate_setting_type`,
which are the boundaries the watch itself uses: this account has
`heartrate_setting_type = 3` with boundaries 113/141/154/162/173/190, while
`lactateThresholdHr = 175` — exactly floor(175 × 65/81/88/93/99/109%).
**Rounding down, this set of percentages, and the "five zones plus out-of-zone"
bucketing were all derived that way, not copied from anywhere.**

| Algorithm | Formula | Zone percentages |
|---|---|---|
| Max heart rate zones | max HR × percentage | 50 / 60 / 70 / 80 / 90–100% |
| Heart-rate reserve zones | resting + (max − resting) × percentage | 50 / 60 / 70 / 80 / 90–100% |
| Lactate threshold zones | lactate threshold HR × percentage | 65 / 81 / 88 / 93 / 99–109% |

Every available basis is measured on this machine and carries its own source and
measurement date: `max(workouts.max_hr)`, `daily_metrics.device_max_hr`,
`daily_metrics.device_resting_hr`, `avg(daily_metrics.resting_hr)` over the last
30 days, and `daily_metrics.lactate_threshold_hr`.

**Estimating with formulas such as 220 − age is forbidden**, and no algorithm is
preset: the selector on `/training` starts empty, exports have `selected_model`
as `null` while listing every computable combination, and every `selected` is
`false`. Which one to use is the user's decision.

### Why capability probing needs controls

`/v2/users/me/events` returns HTTP 200 with an empty list for **any**
`eventType`, including names that do not exist. So "returned empty" is not
evidence of anything by itself. The prober in Settings always runs two controls:

- **Positive control** `hrv_sdnn/real_data` — known to have data. If it comes
  back empty, the probe chain itself is broken (auth, time window, parsing) and
  every other result is untrustworthy.
- **Negative control** — a stream name that does not exist. If it also returns
  empty, then "empty" is not evidence for any candidate stream, and the
  interface must say "cannot determine" rather than "the API responded but there
  is no data".

Probing is read-only: nothing is stored, nothing is logged, no measurement is
read. Only statuses and field names are recorded.

## Later stages

| Stage | Status |
| --- | --- |
| Account sync, SQLite, desktop dashboard | Controlled installer smoke test complete |
| Web sign-in for the first connection | Desktop chain implemented; real-account sign-in verified per environment |
| Local read-only REST (`/health`, `/workouts/{id}/series`) | Implemented; off by default, token required when enabled |
| CLI (`status` / `sync` / `export` / `contract`) | Implemented, shipped as a versioned archive with each release |
| MCP (stdio, five read-only tools) | Implemented, shipped as a versioned archive with each release |
| Full history backfill, long-term archive, coverage ledger | Implemented |
| Database snapshots and queued restore | Implemented |
| More data sources | Not started |
| macOS (Apple Silicon) desktop | Merged (#1); CI has compile/test gates and releases have shipped a dmg plus updater artifacts since v0.9.2; ad-hoc signed, no Apple notarisation |
| Public-release engineering (signing, updates, SBOM, clean VM) | Partly done: updater artifacts and `latest.json` are signed with the Tauri key and auto-update through GitHub Releases; the installers still have no Authenticode certificate and there is no clean-VM acceptance |
