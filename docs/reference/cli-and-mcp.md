# Command line and MCP

`zeppbridge-cli` and `zeppbridge-mcp` are two companion tools alongside the
desktop app,
shipped as a separate archive with every release: people who need them should
not be forced to install a GUI first, and people who installed the GUI should
not be handed two programs they will never run.

[简体中文](cli-and-mcp.zh-CN.md)

Both are thin adapters over [`zeppbridge-core`](architecture.md), reading the
same `data/zepp.db` the desktop app uses.

## Installing

Download `zeppbridge-tools-<version>-<platform>.zip` for your platform from
[Releases](https://github.com/lingcang728/ZeppBridge/releases), unpack it, and
check it against `SHA256SUMS.txt`.

Put both programs next to the ZeppBridge executable and they will read the same
database. The data directory is resolved by `paths.rs`:

| Platform | Data directory |
|---|---|
| Windows | `data\` next to `ZeppBridge.exe` |
| macOS | `~/Library/Application Support/com.zeppbridge.ZeppBridge/data` inside `ZeppBridge.app` (bundles are replaced whole on update, so data never lives in them — a surviving legacy bundle library is migrated there on first launch); `data/` next to an executable that is not in a bundle |
| Linux | `~/.local/share/zeppbridge/data` for a packaged install (deb, rpm, Flatpak — those live in a prefix the app does not own); `data/` next to the executable for an AppImage or an unpacked tarball |
| Any | `$ZEPPBRIDGE_DATA_DIR`, when set to an absolute path, overrides all of the above |

No platform uses `%APPDATA%`.

Read that table as a rule about **each executable**, not about the machine. The
tools apply it to their own location, so unpacking them somewhere of their own —
`~/tools/`, say — resolves `~/tools/data`, which is a fresh empty library, not
the one the app has been filling. The symptom is a confident "no database on
this machine" next to an app that clearly has one.

Two ways to actually share the library:

```bash
# Put them next to the app's data directory, so the rule lands in the same place.
# Or, more reliably, name the directory:
ZEPPBRIDGE_DATA_DIR=~/.local/share/zeppbridge/data zeppbridge-cli status --json
```

Naming it is the better habit on macOS and Linux, where the app's data directory
is usually nowhere near where you would keep two command-line binaries.

`ZEPPBRIDGE_DATA_DIR` exists for the cases where "next to the executable" is
not a meaningful idea: a container, a systemd unit, a NAS task scheduler. A
relative value is rejected rather than resolved against the working directory,
because a scheduler's working directory is not something the person writing the
unit file can see.

On Linux the token is read from the Secret Service (GNOME Keyring / KWallet).
A headless machine has none, so `ZEPPBRIDGE_CREDENTIAL_STORE=file` or
`=env` with `ZEPPBRIDGE_APP_TOKEN` is how the CLI gets a token there — see the
[Linux guide](../guides/linux.md#where-the-token-is-stored).

**Prerequisite**: connect your account with the desktop app and sync at least
once. The command line does not sign in, and MCP does not touch the network.

Copying a `data/` folder over from another machine is not enough on its own.
The database travels; the token does not — it lives in that machine's Credential
Manager / Keychain / Secret Service, never in a file. A copied folder therefore
arrives with the metadata and no secret, and the CLI exits `3` saying the
credential store has no token for this account. Fix it with either credential
store above, or by signing in again in the desktop app on the new machine —
[moving a library across platforms](../guides/linux.md#moving-an-existing-library-from-windows-or-macos)
walks through both.

## zeppbridge-cli

Non-interactive: it never asks a question, waits for a key press or opens a
window. Everything that needs a human decision (signing in, granting access,
deleting data) is deliberately not here.

```bash
zeppbridge-cli status --json
zeppbridge-cli sync --mode incremental --json
zeppbridge-cli reprocess --json  # replay local payloads with the current normalizer
zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv --out january.csv
zeppbridge-cli contract          # prints the unit, timezone, source and missing-value definitions
zeppbridge-cli help
```

With `--json`, stdout contains only the payload; human-readable notices go to
stderr. So `zeppbridge-cli export > a.csv` gives you a clean file.

The human-readable half is English. Errors raised by the shared core are still
Chinese: those strings live in hundreds of places the desktop app never shows
(it looks up localized text by error code instead), and translating half of them
would put two languages inside one sentence. The `--json` field names and the
exit codes are a contract and do not change with any of this.

A misspelled flag is always an error rather than being ignored — silently
accepting `--form json` would let a script believe the format took effect.

### Normalizer upgrades

Derived records — a workout's sport type, a night's sleep stages, the all-day
stress curve — are produced by the normalizer at the moment a payload is first
stored. When its rules change, everything already in the library keeps the old
result. Only a replay of the stored raw payloads brings history forward; without
one, a release that adds sport codes fixes new records and leaves the 199 old
ones sitting at `unknown:211`, which is exactly what people report.

The desktop app replays on startup, in a background thread. A headless install
never has that startup, so:

| Command | What it does about a stale library |
|---|---|
| `sync` | Replays first, then syncs. This is the one on a timer, so headless users need to do nothing. `--no-reprocess` skips it. |
| `status`, `export` | Say so and do nothing. A command that normally answers in milliseconds must not start a multi-minute write. |
| `reprocess` | Runs the replay now. `--all` replays every payload rather than only what the revision bump requires. |

A replay takes the cross-process write lock, never touches the network, and
never rewrites the "last cloud sync" timestamp — it has its own timeline. It is
safe on a timer: without `--all` it does nothing once the revision matches.

`status` reports `normalizerRevision` (what the library holds),
`normalizerRevisionExpected` (what this build produces) and
`normalizerReplayPending`. Those first two being different is the whole signal.

### Exit codes

Exit codes are a contract for scheduling scripts. New ones may be added; the
meaning of an existing one never changes.

| Code | Meaning | What to do |
|---|---|---|
| 0 | Success | — |
| 1 | Other failure, including unavailable local data | Read the error message; a missing local workout uses JSON `errorKind: "data_unavailable"`, not a cloud error |
| 2 | Usage error | Fix the command |
| 3 | No Zepp account connected, or the token is not on this machine | Sign in with the desktop app, or set `ZEPPBRIDGE_CREDENTIAL_STORE` |
| 4 | Another process is writing to the database | **Retry later; this is not a failure** |
| 5 | Cloud request failed | Back off and retry |
| 6 | Local database error | Requires human intervention |
| 7 | Database version does not match this build | Run `zeppbridge-cli reprocess` (or launch the desktop app once) to upgrade, or update the CLI to the same version |
| 8 | Sync incomplete: one or more streams failed | Inspect the stream results and retry; successfully written records are retained |

An incomplete sync still emits the full report with `--json`, with `ok: false`
and `success: false`. Unavailable or unverified optional streams alone do not
cause this exit code.

4 is separate from 1 because "the desktop app happens to be syncing" and
"something actually broke" call for completely different responses. If they
shared one code, a retry script would have no way to tell them apart.

### Windows Task Scheduler

Incremental sync daily at 07:00, without treating "busy" as a failure:

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' `
  -Argument 'sync --mode incremental --json'
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
Register-ScheduledTask -TaskName 'ZeppBridge daily sync' -Action $action -Trigger $trigger
```

Replace the path with your own install location. Task Scheduler records the exit
code; if you care about the difference between busy and failed, use a wrapper:

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
# Incremental sync daily at 07:00; exit code 4 (another writer) counts as skipped, not failed
0 7 * * * /path/to/zeppbridge-cli sync --mode incremental --json; s=$?; [ $s -eq 4 ] && s=0; exit $s
```

Do not write it as `...; [ $? -eq 4 ] && exit 0`. When the sync succeeds, the
test fails, and the whole line then exits 1 — cron records every successful sync
as a failure, and a real failure loses its own exit code along the way.

On macOS, cron needs Full Disk Access to read the data directory.

## zeppbridge-mcp

Uses stdio transport. It **listens on no port and makes no network requests**.
Each request line is limited to 1 MiB. Malformed UTF-8/JSON and oversized lines
receive an error; subsequent lines can still be processed. Tool execution
failures are returned in `result` with `isError: true` and explanatory text.
Unknown tools and malformed call envelopes remain JSON-RPC errors.
Read-only is enforced by the connection layer (`PRAGMA query_only`), not by the
tool list happening to contain no write operations.

### Example configuration

Most MCP clients read the same shape of configuration:

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

Replace `command` with the real path where you unpacked it. **No token, API key
or environment variable is needed** — the program only reads a local file.

`mcp-config-example.json` in the archive contains the same snippet.

### Access scope (`--scope`)

The process accepts exactly one optional flag:

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

- **`full-readonly`** (the default when `--scope` is absent) — the behavior
  existing configurations already have: read-only access to the whole local
  database. Configurations without the flag keep working unchanged.
- **`task`** — still read-only, but limited to what the desktop app marks as
  *shared with MCP* on its task page: only the listed workout IDs, plus health
  data inside the per-category date windows those workouts open. Grants are
  re-read on every call, so flipping the share switch applies to the very next
  request — no restart needed.

argv parsing is fail-closed: an unrecognized argument, an unknown `--scope`
value, a missing value, or a repeated flag exits non-zero with a single stderr
line. A mistyped flag never widens access silently.

Under `task`, requests outside the grants are refused rather than silently
truncated: `list_workouts` returns only granted workout IDs (even when they are
not among the most recent), `get_workout_insight` re-computes its baseline over
granted workouts alone, `get_metric_series` answers only days inside the
granted windows, `get_sleep_detail` resolves "latest night" within the granted
sleep windows, and `get_data_health` — a whole-library report that cannot be
honestly clipped — is refused outright. Responses under `task` also drop
identity fields such as `device_id`.

Every `tools/call` result carries `"scope": {"mode": ..., "grants": N}` (inside
`structuredContent` on success and at the top level on errors), and
`initialize` / `server/discover` report `"scope": {"mode": ...}` plus an
instructions line, so a client always knows which view it is looking at.

Scope refusals are tool results, not protocol errors: `isError: true` with
`structuredContent.error.code` set to `err.mcp.scope_denied` (the request is
outside the grants — `error.permittedRanges` lists the actual
`{category, start, end}` windows to retry within) or `err.mcp.scope_no_grants`
(no task is currently shared).

### Tools

| Tool | Returns |
|---|---|
| `list_workouts` | Paged workouts, newest first. Distance in metres, heart rate in bpm |
| `get_workout_insight` | One workout compared against your own baseline, with the baseline window, sample count and confidence |
| `get_workout_detail` | All stored summary fields and heart-rate zones for one workout |
| `get_workout_series` | Paged workout samples, GPS route, pauses, splits and laps; precise coordinates are returned only for `section: "route"` |
| `get_metric_series` | A per-day metric series, each carrying its `unit` |
| `get_food_data` | Daily Food intake totals: calories, protein, fat and carbohydrates |
| `list_available_metrics` | Actual local metrics, with source, unit, count and date range |
| `get_metric_records` | Paged stored daily values or individual readings for any discovered metric |
| `list_sleep_sessions` | Paged sleep summaries and IDs |
| `get_sleep_detail` | One night in detail, stage durations in minutes |
| `list_life_events` | Locally authored life events in a date window |
| `get_data_health` | Fetch/parse/write state and coverage per stream |

For Food, call `get_food_data` or request `intake_calories`,
`intake_protein_g`, `intake_fat_g`, and `intake_carbs_g` from
`get_metric_series`. These are **daily totals**, not individual meals. Meal
names, meal types and times are not stored as structured records, so the MCP
server cannot return them. `get_food_data` reports this limit explicitly.
Passing `food` as a `get_metric_series` metric now returns a clear error with
the discovery path instead of an empty result.

Use `list_available_metrics` before querying less familiar types.
`get_metric_records` can read any name actually present in `daily_metrics` or
`metric_samples`, plus `sleep_score` from `sleep_sessions`, including metrics outside `get_metric_series`' fixed chart
list. The inventory reflects normalized local data, not every endpoint the
cloud might offer. No tool returns arbitrary raw cloud payloads.

`get_data_health` deserves a mention of its own: it lets a model tell the
difference between "this question cannot be answered because nothing was synced"
and "there genuinely was no data in that period".

### The contract

The server hands the caller its boundaries at handshake time, rather than
letting it receive an empty series and guess:

- **Time**: everything is RFC 3339 with a timezone offset. The time data was
  fetched from the cloud and the time a health sample occurred are two different
  things, and one never substitutes for the other.
- **Missing values**: no sample means missing — the field is `null` or the whole
  segment is absent. **A gap is never filled with 0, the previous value or an
  estimate.** If a curve has fewer points than its time span, those days really
  had no data.
- **Source**: `source_scope` says which layer a record came from — `device` is
  what a specific watch reported, `user_fused` is the cloud's cross-device
  composite, `unknown` cannot be determined. `unknown` is never folded into
  `device`.
- **Never returned**: tokens, cookies, full account identifiers, absolute local
  paths.

`zeppbridge-cli contract` prints the same definitions.

## Running alongside the desktop app

The CLI's `sync` and the desktop app's sync share one cross-process write lock,
so there is only ever one writer. When the CLI cannot get the lock it exits with
code 4 rather than racing the GUI.

MCP's read-only queries take no write lock and can run during a sync.
