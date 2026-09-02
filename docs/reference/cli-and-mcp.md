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
| macOS | `data/` next to the executable when it is writable; inside `ZeppBridge.app` it is not, so it falls back to `~/Library/Application Support/com.zeppbridge.ZeppBridge/data` |
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
| 1 | Other failure | Read the error message |
| 2 | Usage error | Fix the command |
| 3 | No Zepp account connected | Sign in with the desktop app |
| 4 | Another process is writing to the database | **Retry later; this is not a failure** |
| 5 | Cloud request failed | Back off and retry |
| 6 | Local database error | Requires human intervention |
| 7 | Database version does not match this build | Run `zeppbridge-cli reprocess` (or launch the desktop app once) to upgrade, or update the CLI to the same version |

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

### Tools

| Tool | Returns |
|---|---|
| `list_workouts` | Workouts, newest first. Distance in metres, heart rate in bpm |
| `get_workout_insight` | One workout compared against your own baseline, with the baseline window, sample count and confidence |
| `get_metric_series` | A per-day metric series, each carrying its `unit` |
| `get_sleep_detail` | One night in detail, stage durations in minutes |
| `get_data_health` | Fetch/parse/write state and coverage per stream |

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
