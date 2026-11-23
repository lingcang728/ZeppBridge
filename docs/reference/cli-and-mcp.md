# Command line and MCP

`zeppbridge-cli` and `zeppbridge-mcp` are two companion tools for the desktop
app. Both are thin adapters over [`zeppbridge-core`](architecture.md) and read
the same `data/zepp.db` the desktop app uses.

[简体中文](cli-and-mcp.zh-CN.md)

## Installing

**With the desktop app installed** there is nothing more to install. On Windows
(installer and portable build) they sit next to `ZeppBridge.exe`, on macOS inside
`ZeppBridge.app/Contents/MacOS/`, and Linux deb, rpm and Arch packages put them in `/usr/bin`.
They are updated together with the app, and **Settings › AI tools** shows the
full path of both.

**On a machine without a desktop**, download
`zeppbridge-tools-<version>-<platform>.zip` from
[Releases](https://github.com/lingcang728/ZeppBridge/releases), unpack it, and
check it against `SHA256SUMS.txt`.

### Where the library is

Each executable resolves the data directory from its own location:

| Platform | Data directory |
|---|---|
| Windows | `data\` next to the executable; if that folder can't be written (for example under `C:\Program Files`), `%APPDATA%\zeppbridge\ZeppBridge\data` |
| macOS | Inside `ZeppBridge.app`: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`. Outside a bundle: `data/` next to the executable, or the same Application Support folder when that can't be written |
| Linux | `~/.local/share/zeppbridge/data` for deb, rpm and Arch packages. Flatpak uses `~/.var/app/com.zeppbridge.app/data/zeppbridge/data/`. An AppImage or an unpacked tarball uses `data/` next to the executable |
| Any | `$ZEPPBRIDGE_DATA_DIR`, an absolute path, overrides all of the above |

So tools unpacked into a folder of their own, `~/tools/` say, open
`~/tools/data` — an empty library, not the app's. Either put them next to the
app or name the directory:

```bash
ZEPPBRIDGE_DATA_DIR=~/.local/share/zeppbridge/data zeppbridge-cli status --json
```

### Credentials

**Connect your account in the desktop app and sync at least once first.** The
CLI never signs in. It reads the token from the OS credential store (Windows
Credential Manager, macOS Keychain, Linux Secret Service). A headless Linux
machine has none, so use `ZEPPBRIDGE_CREDENTIAL_STORE=file` or `=env` with
`ZEPPBRIDGE_APP_TOKEN` — see the
[Linux guide](../guides/linux.md#where-the-token-is-stored).

For a headless Official connection, copy `official.json` and the matching
`credentials.json` from a desktop that uses the file store. Keep the destination
writable by the service user and the credential file private (mode `0600`).
The CLI refreshes the official grant through the authorization relay and saves
renewed credentials locally. The `env` store supplies only the Advanced App
Token, which also needs `auth.json`. See the
[Linux guide](../guides/linux.md#moving-an-existing-library-from-windows-or-macos).

## zeppbridge-cli

Non-interactive: it never asks a question, waits for a key press or opens a
window. Signing in, granting access and deleting data are not here.

```bash
zeppbridge-cli status --json
zeppbridge-cli sync --mode incremental --json
zeppbridge-cli reprocess --json
zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv --out january.csv
zeppbridge-cli fit-override --workout 1787901817 --fit corrected.fit
zeppbridge-cli contract          # units, time zone, source and missing-value definitions
zeppbridge-cli version
zeppbridge-cli help
```

With `--json`, stdout carries only the payload and notices go to stderr.
Human-readable output is English; where the shared core's message is Chinese,
the CLI prints its error code (such as `err.core.config`) instead. The `--json`
field names and the exit codes are the stable contract. A misspelled flag is an
error, never ignored.

### Sync and history

`sync` uses the configured channels. With both, Advanced data is supplemented
by official sleep, naps, REM and hourly steps. With only Official configured,
it pulls all supported official streams. Use `--channel advanced` or
`--channel official` to select one channel. The same defaults apply to MCP
`sync_now`.

`sync --json` reports each attempted channel under `channels`. A valid
empty official response is reported as empty. Authorization rejection that
needs user action sets `needsReauth` and exits `3`, even when Advanced data
was saved. `status --json` reports local official credential state, the last
official sync attempt and the latest fetch of official sleep records without
contacting Zepp.

`sync --mode history --days N` accepts 1–3650 days. With Advanced enabled,
ranges over 365 days use the Advanced monthly coverage ledger. Monthly history
and official history require archive mode or enough local retention.
`--max-chunks`
(1–720, default 24) bounds each run; rerun the same command to resume, and add
`--retry-failed` to reset exhausted failures. Ctrl+C keeps finished chunks and
exits `8`. The JSON report includes `mode`, `cancelled`, `backfill` and
`replay`; `backfill.complete` describes coverage, including months the cloud
confirmed empty.

To recover official sleep and naps for an inclusive date range, use:

```bash
zeppbridge-cli sleep-history --from 2026-01-01 --to 2026-01-15 --json
```

Dates use the library's device time zone when available. This command uses the
official sleep endpoint and updates existing days in place if rerun. It can
retrieve only the sleep records Zepp returns. Set retention or archive mode to
cover the start date.

`probe --streams heart_rate,daily_summary --days 7 --json` reports direct
endpoint status and counts. `parsedHeartRateSamples` counts the dedicated
endpoint, while `bandHeartRateSamples` counts samples successfully decoded
from `band_data`. `emptyResponses` counts explicitly empty responses and
`responsesWithoutUsableMetrics` counts unfamiliar non-empty responses.

### Workout details, types and hiding

Workout details have their own persistent queue:

```bash
zeppbridge-cli workout-details --status --json
zeppbridge-cli workout-details --channel advanced --max-items 20 --json
zeppbridge-cli workout-details --channel official --max-items 20 --retry-failed --json
zeppbridge-cli set-type --workout ID1 --workout ID2 --type run --json
zeppbridge-cli set-type --workout ID1 --clear --json
zeppbridge-cli hide --workout ID1 --json
zeppbridge-cli hide --list --json
zeppbridge-cli restore --workout ID1 --json
zeppbridge-cli set-type --undo EDIT_ID --json
```

Fetching needs an explicit channel and its credentials, and fetches 1–40
details per run (default 20). `--status` reads without network or writes and can
filter by `--channel`; it can't be combined with `--max-items` or
`--retry-failed`. Rerunning resumes; saved and cloud-empty details are skipped,
failures back off, and `--retry-failed` resets failures for the selected channel
only. Fetching exits `8` while that channel still has pending or failed
requests; a `--status` query exits `0` when it succeeds.

`set-type`, `hide` and `restore` are atomic across all `--workout` IDs and
return an edit ID; `--undo EDIT_ID` (on any of the three) reverses the whole
edit unless a later edit conflicts. Types are workout-catalogue keys such as
`run`; `--clear` removes the local correction. Hiding keeps the record but
leaves it out of normal reads, statistics and exports until restored. Both apply
to this machine's library only.

### Export

`export` needs a range (`--from` and `--to`) or one `--workout`. Options:

- `--format json|csv|gpx|fit` (default `json`); `fit` needs `--out` pointing at a
  directory. CSV, GPX and FIT always export full detail.
- `--types` (default `workouts,daily_activity,sleep`); `zeppbridge-cli help`
  lists all eighteen.
- `--detail summary|full` (default `summary`).
- `--out <path>`; without it the export goes to stdout.

One export covers at most 366 days.

### Normalizer upgrades

Derived records (a workout's sport type, sleep stages, the stress curve) are
produced when a payload is first stored. When the normalizer changes, only a
replay of the stored raw payloads updates the library. The desktop app replays
at startup; for headless installs:

| Command | When the library is behind |
|---|---|
| `sync` | Replays first, then syncs. `--no-reprocess` skips it. |
| `status`, `export` | Report it and do nothing. |
| `reprocess` | Replays now. `--all` replays every payload. |

A replay takes the write lock, never uses the network, and never changes the
"last cloud sync" time. Without `--all` it does nothing once the library is
current. `status` reports `normalizerRevision`, `normalizerRevisionExpected` and
`normalizerReplayPending`.

### Replacing a workout with a corrected .fit

The desktop app's **Replace with a corrected .fit** has a script form:

```bash
zeppbridge-cli fit-override --workout <id> --fit corrected.fit --json  # replace
zeppbridge-cli fit-override --workout <id> --remove --json             # undo; Zepp's values come back
zeppbridge-cli fit-override --list --json                              # what this machine has replaced
```

A replacement lives only in this machine's library; Zepp has no way to import a
workout. It survives syncs, `reprocess` and replays, and snapshots include it.
Workout IDs are the same on every machine, so run the same command on each
library. The file must start within 5 minutes of the workout
(`errorKind: "fit_start_mismatch"`) and the workout must already be in the
library (`workout_not_found`); both exit `1`. Undoing something never replaced
succeeds with `"removed": false`.

### Shoes and races

```bash
zeppbridge-cli shoes list --json                   # shoes with distance and wear, plus Zepp gear IDs not added yet
zeppbridge-cli shoes save --file shoe.json --json  # add, or update when the JSON has "id"; prints the id
zeppbridge-cli shoes delete --id 3 --json
zeppbridge-cli races list --json
cat race.json | zeppbridge-cli races save --file - --json
zeppbridge-cli races delete --id 2 --json
```

`save` takes one JSON object with the desktop form's fields. A shoe needs
`name`, `sport` (`running` / `trail` / `walking` / `hiking`), `retire_km`
(100–5000) and `started_on` (`YYYY-MM-DD`); `is_default`, `zepp_gear_id`,
`start_km`, `retired_on` and `notes` are optional. A race needs `name`,
`race_date`, `sport` (`running` / `trail` / `cycling` / `swimming` / `triathlon`
/ `other`) and `priority` (`a` / `b` / `c`); `distance_m`, `goal_seconds`,
`result_seconds`, `workout_id` and `notes` are optional. A malformed file or a
rejected value exits `2`; deleting an id that does not exist exits `1` with
`errorKind: "not_found"`. MCP's `save_shoe` and `save_race` write the same
tables.

### serve and pull-token

`serve` runs the read-only REST API without the desktop app, for Docker and
servers: `/health`, `/workouts/{id}/series` and `/v1/records`. It listens on
`127.0.0.1:43921` unless `ZEPPBRIDGE_LISTEN` says otherwise, and beyond
loopback it refuses to start without a pull token (`ZEPPBRIDGE_PULL_TOKEN`, or
one stored with `pull-token rotate`). `pull-token status | show | rotate |
revoke` manages the stored token, which is separate from the desktop app's
local API token. The request and response contract is in
[self-hosted pull](../guides/self-hosted-pull.md).

### probe

`probe` checks whether candidate endpoints return anything, without importing
data: `--streams` (default `blood_pressure`; also `heart_rate`,
`daily_summary`), `--days` (1–365, default 7). `--json` prints counts, field
names and errors only, never readings.

### Exit codes

Exit codes are a contract for scripts. New ones may be added; an existing
meaning never changes.

| Code | Meaning | What to do |
|---|---|---|
| 0 | Success | — |
| 1 | Other failure, including unavailable local data | Read the message; a missing local workout is `errorKind: "data_unavailable"` |
| 2 | Usage error | Fix the command |
| 3 | No account connected, no token on this machine, no local library, or the library belongs to another account | Sign in with the desktop app, or set `ZEPPBRIDGE_CREDENTIAL_STORE` |
| 4 | Another process is writing to the database | **Retry later; this is not a failure** |
| 5 | Cloud request failed | Back off and retry |
| 6 | Local database error | Needs a person |
| 7 | Database version does not match this build | Run `zeppbridge-cli reprocess` (or open the desktop app once), or update the CLI |
| 8 | Sync incomplete: one or more streams failed | Check the stream results and retry; written records are kept |

An incomplete sync still prints the full report with `--json`, with `ok: false`
and `success: false`. Exit `4` is separate from `1` so a retry script can tell
"the desktop app is syncing" from "something broke".

### Windows Task Scheduler

Incremental sync daily at 07:00:

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' `
  -Argument 'sync --mode incremental --json'
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
Register-ScheduledTask -TaskName 'ZeppBridge daily sync' -Action $action -Trigger $trigger
```

Use your own install path. To treat "busy" as a skipped round rather than a
failure, wrap it:

```powershell
& 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' sync --mode incremental --json
switch ($LASTEXITCODE) {
  0 { exit 0 }
  4 { Write-Host 'The desktop app is writing; skipping this round'; exit 0 }
  default { exit $LASTEXITCODE }
}
```

### cron (macOS / Linux)

```cron
# Incremental sync daily at 07:00; exit code 4 (another writer) counts as skipped
0 7 * * * /path/to/zeppbridge-cli sync --mode incremental --json; s=$?; [ $s -eq 4 ] && s=0; exit $s
```

Don't write `...; [ $? -eq 4 ] && exit 0`: after a successful sync the test
fails and the line exits `1`. On macOS, cron needs Full Disk Access to read the
data directory.

### Running alongside the desktop app

The CLI's `sync` and the desktop app share one cross-process sync lease and one
write lock, so only one sync and one writer run at a time. When the CLI can't
get them within its wait (up to 20 seconds for a write), it exits `4`.

## zeppbridge-mcp

stdio transport. It **listens on no port**. It goes online only when a tool
that needs it is called: `sync_now` starts the bundled `zeppbridge-cli`, and
`publish_training_plan` sends a plan to Zepp. Each request line is limited to
1 MiB; malformed or oversized lines get an error and later lines still work.
Tool failures come back in `result` with `isError: true`; unknown tools and
malformed envelopes are JSON-RPC errors. Reads use a `PRAGMA query_only`
connection; tools that write open a short write connection under the write lock
(waiting at most 5 seconds) and never hold it while on the network.

### Connecting from the desktop app

**Settings › AI tools › Connect a local AI** fills in the real path of the
`zeppbridge-mcp` next to the app. The generated configuration reads the whole
library; the **Only shared tasks** switch adds `--scope task`, and the card
flags clients still registered with the other setting. Presets: Claude Code,
Codex, Claude Desktop, OpenCode, Grok Build, Qwen Code, Factory, and a generic
`mcpServers` JSON for anything else:

- **Claude Code** and **Codex** copy the commands that register the server, add
  this repository as a plugin marketplace and install the `zepp-coach` skill
  (plus a `mcp remove` first when an older registration is in the way). Paste
  them into a terminal. The `--` separator is written as `"--"` because
  PowerShell swallows a bare `--`.
- **Claude Desktop** saves `ZeppBridge.mcpb`; double-click it to install. It
  starts the `zeppbridge-mcp` next to the app, so it updates with ZeppBridge;
  the installer closes it before updating, and the card warns when that program
  is older than the app.
- **OpenCode**, **Grok Build** and **Qwen Code** copy one `mcp add` command; **Factory** copies
  a `~/.factory/mcp.json` entry.

When the library is not the `data` folder next to the executable, the
configuration also sets `ZEPPBRIDGE_DATA_DIR`. Development builds without the
sidecar disable these buttons. The Linux AppImage mounts at a new path on every
launch, so the app does not hand that path to AI tools; use the separate tools
package and the configuration below.

### Example configuration

```json
{
  "mcpServers": {
    "zeppbridge": {
      "command": "/path/to/zeppbridge-mcp",
      "args": []
    }
  }
}
```

No token or API key is needed. Add `"env": {"ZEPPBRIDGE_DATA_DIR": "…"}` when
the library is not next to the executable. `mcp-config-example.json` in the
tools archive has the same snippet.

### Access scope (`--scope`)

The process accepts `--scope` and `--version` (prints the version and exits).
Anything else — an unknown argument or value, a missing value, a repeated flag —
exits `2` with one stderr line, so a typo never widens access.

```json
{
  "mcpServers": {
    "zeppbridge": {
      "command": "/path/to/zeppbridge-mcp",
      "args": ["--scope", "task"]
    }
  }
}
```

- **`full-readonly`** (the default) — the whole local library. Health data is
  read-only; the write tools below change only records the user authors.
- **`task`** — read-only, limited to what the desktop app marks as *shared with
  MCP* on its task page: health data inside each task's per-category date
  windows. A task's selected workouts are readable only when the task enables
  the workout category; otherwise they only anchor the windows. Metrics and
  fields taken out of a task stay unreadable. Grants are re-read on every call,
  so flipping the share switch applies to the next request.

Under `task`, requests outside the grants are refused rather than silently
truncated:

- `list_workouts` returns only granted workouts; `get_workout_insight`
  recomputes its baseline over them.
- `get_metric_series`, `get_metric_records`, `list_sleep_sessions` and
  `get_sleep_detail` answer only inside the granted windows ("latest night"
  means the latest granted one). A metric that maps to no task category is
  refused, and so is one a task excludes.
- `get_workout_detail` drops excluded fields and anything that would reveal them
  (heart-rate zones when heart rate is excluded, stride when distance is).
  `get_workout_series` never returns the precise route, and refuses per-point
  sections for a workout whose task excludes any field.
- `get_food_data` returns daily intake totals only (as body data), no entries.
- Whole-library views are refused: `list_available_metrics`,
  `list_life_events`, `get_data_health`, `get_baselines`.
- Coach tools, every write tool and both actions are refused.

A task with no selected workouts ("the last N days") has a window ending today,
exactly like the export. With several shared tasks the grants are a union.
Responses under `task` drop identity fields such as `device_id`.

Every `tools/call` result carries `"scope": {"mode": ..., "grants": N}`, and
`initialize` / `server/discover` report the mode. Scope refusals are tool
results with `structuredContent.error.code` set to `err.mcp.scope_denied`
(`error.permittedRanges` lists the `{category, start, end}` windows to retry
within) or `err.mcp.scope_no_grants` (nothing is shared).

### Tools

| Tool | Returns |
|---|---|
| `list_workouts` | Paged workouts, newest first. Distance in metres, heart rate in bpm. `gearId` is the ID of the shoes picked for that workout in Zepp, or `null`; Zepp sends no shoe names |
| `get_workout_insight` | One workout compared against your own baseline, with the baseline window, sample count and confidence |
| `get_workout_detail` | All stored summary fields, heart-rate zones, and strength-training summary/sets (when present) for one workout; `localFitCorrection` (file name, import time, cloud distance) is set when the user replaced it with a corrected .fit, otherwise `null` |
| `get_workout_series` | Paged workout samples, GPS route, pauses, splits and laps, plus the main climbs and descents (`section: "climbs"`, detected locally from the altitude series) and strength-training sets/volume (`section: "strength"`); precise coordinates are returned only for `section: "route"` |
| `get_metric_series` | A per-day metric series, each carrying its `unit` |
| `get_food_data` | Food entries plus daily intake: calories (kcal), protein, fat and carbohydrates (g); optional `days` (default 90, maximum 1825) |
| `get_baselines` | Your own norm per metric, never a population norm: `recent` compares the latest reading (within 3 days) with the previous 28-day median and gives the 90-day middle-80% band; `long_term` is the middle 80% of all local history (up to ten years) with its median, start date and a per-year breakdown (`null` under a year of history) |
| `list_available_metrics` | Actual local metrics, with source, unit, count and date range |
| `get_metric_records` | Paged stored daily values or individual readings for any discovered metric |
| `list_sleep_sessions` | Paged sleep summaries and IDs |
| `get_sleep_detail` | One night in detail, stage durations in minutes |
| `list_life_events` | Locally authored life events in a date window |
| `get_data_health` | Fetch/parse/write state and coverage per stream. Per-stream parse counts separate `empty_response` (Zepp answered with an empty list for that window: nothing there, not an error) from `quarantined` (a payload the parser could not read) |
| `get_training_context` | Recent training and recovery in one call (default 28 days, maximum 90): a day-by-day table aligned to local dates (readiness, resting heart rate and baseline — taken from the sleep summary's `rhr`, not the average heart rate during sleep — sleep HRV and baseline, stress, daily load, steps, sleep and naps), a summary of every workout (pace in s/km, seconds per heart-rate zone, load, training effect, the watch's RPE plus the user's own `userRpe` and sore spots), days since the last workout, the active plan and life events (`epoch: true` marks a named era such as a marathon build) |
| `get_athlete_profile` | Maximum heart rate (watch-reported and observed over a year), resting heart rate (the sleep summary's `rhr`), the watch's heart-rate zones, lactate threshold, VO₂max (a watch estimate), height and weight, runs from the last 90 days, the background the user wrote for AI, coach notes (`coachNotes`), and the user's journal (`journal`: 5K / 10K / half / marathon PBs computed locally, ongoing and recently healed injuries, upcoming races with A/B/C priority and race results, shoes in use with mileage, named eras) |
| `get_training_plan` | The training-plan ledger: the active plan, delivery state per 7-day window, unsent drafts, and whether AI may publish directly |
| `draft_training_plan` | **Writes**: validates and saves a plan draft (nothing is sent to the watch); a plan that fails validation is not saved and the issues come back as-is |
| `publish_training_plan` | **Writes**: sends a draft to the Zepp app and watch; allowed only after the user turns on "Let AI publish training plans directly", and never clears a window |
| `propose_coach_note` | **Writes**: remembers one sentence about the user (an injury, a routine, a preference). It takes effect at once in `get_athlete_profile` and is recorded in the change ledger; a sentence the user rejected or undid is never written again |
| `save_injury` | **Writes**: adds or edits an injury (body part, severity 1–3, start date; set `endDate` when healed) |
| `save_life_event` | **Writes**: adds or edits a life event (category, dates, `epoch` for a named era) |
| `save_race` | **Writes**: adds or edits a race (date, sport, distance in m, goal and result in s, priority a/b/c) |
| `save_shoe` | **Writes**: adds or edits a pair of shoes (sport, start and retire km; set `retiredOn` to retire) |
| `annotate_workout` | **Writes**: the user's own RPE (1–10) and sore body parts for one workout; the watch's RPE and the shoe choice are untouched |
| `set_workout_type` | **Writes**: corrects a workout's sport type, the same path as the desktop's "Change type" (the cloud record is not changed) |
| `sync_now` | **Action**: pulls new data from Zepp cloud by starting the `zeppbridge-cli` next to it (`sync --json --no-reprocess`); waits up to 45 s, then reports `running` and lets the CLI finish. `deferred` while a local reparse is pending, `schema_mismatch` when the CLI and library versions differ, `needs_reauth` when a channel's authorization has lapsed |
| `export_data` | **Action**: writes a summary JSON for a date range (≤ 366 days, no routes) into the data folder's `exports`, returning the file name relative to that folder |

Parameter limits (page sizes, date ranges, section names) are in each tool's
`inputSchema` from `tools/list`.

Metrics the user switched off with **Use in analysis** (the "?" panel on a
metric card) are removed from every result, in any spelling, and the result
carries `excludedByUser` noting that this is the user's choice, not missing
data. Nothing is deleted; the user's own exports are not affected.

`get_food_data` returns daily totals and the stored food-log entries (name,
description, meal type, time, reported weight, nutrients including fiber).
Reported weight has no verified unit. Entries are newest first, limited by
`limit` (default 200, maximum 1000), with `totalEntries` and `truncated`;
`mealDetailsAvailable` says whether entries exist at all. Intake calories are
separate from calories burned. Food comes in with a sync (the desktop app,
`zeppbridge-cli sync` or `sync_now`). The four `intake_*` metrics are also
available through `get_metric_series`.

`get_metric_series` silently skips metric names it doesn't chart, returning no
series for them; call `list_available_metrics` first, and use
`get_metric_records` for anything in `daily_metrics` or `metric_samples` (plus
`sleep_score`). No tool returns raw cloud payloads.

`get_data_health` lets a model tell "nothing was synced" apart from "there
really was no data in that period".

### Tools that write

Health data from the cloud stays read-only. The write tools change only records
the user authors, and every write goes into a change ledger (`mcp_writes`) with
the record before and after. In **Settings › AI tools › Recent AI changes** the
user undoes any of them: an added record is removed, an edited one goes back,
and an undone coach note becomes "rejected" so the AI can't write it again. A
record that changed again afterwards is not rolled back
(`err.mcp_writes.stale`). There are **no delete tools**: an injury heals with
`endDate`, a shoe retires with `retiredOn`. To edit, pass the `id` and only the
fields to change; validation is the desktop app's own. `sync_now` and
`export_data` are actions and are not in the ledger.

Coach notes from `propose_coach_note` are stored in their own table, never a
health table, and appear in `get_athlete_profile` as `coachNotes` at once,
labelled with the MCP client's name. The user can undo, edit, delete and export
them.

### Training plans

- `draft_training_plan` only saves a draft, with the same validation as the
  desktop app's "paste the AI's reply". Only running, cycling, pool and
  open-water swimming reach the watch (a Zepp API limit: walking, hiking,
  strength, inline skating and cross-country skiing are refused). Running also
  takes `trail` and cycling `mountain`. Purpose and description are required;
  the step syntax is in the tool description. A plan that fails validation
  leaves no draft. The draft shows up on the desktop **Send to AI** page.
- `publish_training_plan` refuses with `err.training_plan.ai_publish_disabled`
  until the user turns on **Let AI publish training plans directly** in
  **Settings › AI tools**. It records the attempt under the write lock, releases
  the lock while on the network, and records the result. A publish that would
  clear a 7-day window always returns `err.training_plan.needs_clear_confirmation`;
  only the user can confirm a clear, on the desktop.
- `sent` only means Zepp accepted the request (it answers success to any body);
  the content was validated before sending. The watch still asks for the
  sub-type before the workout starts.

### The guide resource

The server publishes `zeppbridge://guide` (`resources/list` /
`resources/read`, named in the handshake `instructions`): the tool list, a
recommended order (start with `get_training_context`), the data rules and how
undo works.

### The contract

The handshake states the boundaries instead of leaving a client to guess from an
empty series:

- **Time**: RFC 3339 with a timezone offset. The time data was fetched and the
  time a sample occurred are different things; one never stands in for the
  other.
- **Missing values**: no sample means `null` or an absent segment. **A gap is
  never filled with 0, the previous value or an estimate.**
- **Source**: `source_scope` says which layer a record came from — `device` (a
  specific watch), `user_fused` (the cloud's cross-device composite), `unknown`.
  `unknown` is never folded into `device`.
- **Never returned**: tokens, cookies, full account identifiers, absolute local
  paths.

`zeppbridge-cli contract` prints the same definitions.
