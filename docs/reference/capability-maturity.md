# Capability maturity (v3.1)

[简体中文](capability-maturity.zh-CN.md)

> How far each capability is wired through core / desktop / CLI / MCP / local
> REST, whether the task scope (MCP `--scope task`) governs it, which platforms
> it has been verified on, and its known limits. The "verified" column lists
> only what has actually been run, never what is inferred.

## At a glance

| Capability | core | Desktop | CLI | MCP | Local REST | Task scope |
|---|---|---|---|---|---|---|
| Advanced data sync / history backfill | ✓ | ✓ manual, automatic, 180 days after first connect | ✓ `sync` | ✓ `sync_now` (runs the CLI sync) | — | refused |
| Official open-platform authorization and pulls | ✓ | ✓ authorization relayed through Cloudflare | partial: `workout-details --channel official`; `sync` uses Advanced data only | — | — | n/a |
| Imports (GPX, FIT, Strava bundle, Apple Health; unstrap backup in the Beta lab) | ✓ | ✓ | ✗ | — | — | n/a |
| Local reprocessing | ✓ | ✓ automatic at startup by revision, manual in Settings | ✓ `reprocess` | — | — | n/a |
| Data export (JSON / CSV / GPX / FIT; "take everything with you"; unstrap zip in the Beta lab) | ✓ | ✓ | ✓ `export` (JSON / CSV / GPX / FIT) | ✓ `export_data` (JSON, at most 366 days) | — | refused |
| Send to AI (single `.md` task bundle) | ✓ | ✓ | ✗ | shares the task definition for task scope | — | it is the source |
| Read-only queries: workouts / metrics / sleep / food / life events / data health / baselines | ✓ | ✓ per page | `status` gives an overview only | ✓ 16 tools | partial: `/health`, `/workouts/{id}/series` | MCP only |
| Journal writes: injuries, life events, races, shoes, workout feelings, workout type | ✓ | ✓ read/write | ✓ `shoes`, `races`, `set-type`, `hide`, `restore` | ✓ six write tools, each recorded under Recent AI changes and undoable | — | refused |
| Backup, verify, queued restore | ✓ | ✓ | ✗ | — | — | n/a |
| Training plan drafting / sending to the watch | ✓ | ✓ paste the AI reply, week view, per-day tuning | ✗ | ✓ drafting; publishing needs "Let AI publish training plans directly" | — | refused |
| Post-workout rating | ✓ | ✓ overview card, plan archive | ✗ | ✓ read in `get_training_plan` (`recentFeedback`); written with `annotate_workout` | — | refused |
| Coach notes (AI memory) | ✓ | ✓ edit / delete / export Markdown; included in the AI handoff `.md` | ✗ | ✓ `propose_coach_note` (takes effect at once, undoable under Recent AI changes) | — | refused |
| Account ownership (one account per library) | ✓ | ✓ | ✓ checked before sync | — | — | n/a |

Legend: ✓ wired; ✗ not wired, use the desktop app; — not done by design.

## Task scope (MCP `--scope task`)

This applies only to an MCP server started with `--scope task` (the desktop app
adds it when **Only shared tasks** is on). The default `full-readonly` scope is
not narrowed by task switches, and the local REST API does not look at tasks at
all. The rules are in the "Access scope" section of
[Command line and MCP](cli-and-mcp.md); this table only lists how each tool is
handled:

| Tool | Inside task scope |
|---|---|
| `list_workouts`, `get_workout_insight`, `get_workout_detail` | Only granted workouts; excluded fields never leave (`get_workout_detail` also drops what could be derived back, such as heart-rate zones and stride); insight baselines are recomputed over the granted set |
| `get_workout_series` | Never returns precise tracks; for a workout where the task excluded any field, per-point series are refused entirely |
| `get_metric_series`, `get_metric_records`, `list_sleep_sessions`, `get_sleep_detail` | Clipped to the granted date window; excluded metrics are refused and excluded fields omitted; metrics that fit no category are refused |
| `get_food_data` | Daily intake totals only (counted as body data), no individual food entries |
| `list_available_metrics`, `list_life_events`, `get_data_health`, `get_baselines` | Whole-library views, refused entirely |
| `get_training_context`, `get_athlete_profile`, `get_training_plan`, `draft_training_plan`, `publish_training_plan`, `propose_coach_note` | Cross-category, cross-date or training-plan ledger, refused entirely |
| Write and action tools (`save_*`, `annotate_workout`, `set_workout_type`, `sync_now`, `export_data`) | Refused entirely |

A task with no workouts selected ("the last N days") has a window that ends
today; export and MCP compute it with the same function
(`ai_tasks::coverage::task_window`).

## Platforms

| Platform | Verified as far as |
|---|---|
| Windows 10 / 11 | Daily use on the maintainer's own account; CI checks and the full test suite |
| macOS (Apple Silicon) | CI on `macos-latest`: format, check, Clippy and all tests pass, and the dmg / app.tar.gz build. The maintainer has no Mac; real-machine behaviour relies on contributors' reports |
| Linux (x86_64) | CI: the same checks; deb / rpm / AppImage / Flatpak build, and the Docker image has an offline self-check. Real-machine behaviour relies on users' reports |

Only real hardware can settle these, and they have not been checked
systematically: frosted glass in the macOS / Linux WebViews; dragging a file
into an AI chat under Wayland (the drag plugin uses X11 on Linux); "Show in
Explorer" should read "Finder" on macOS and "File Manager" on Linux. Windows MSI
rejects prerelease versions such as `3.0.0-beta.N`, and the CI Windows packaging
job builds NSIS and MSI together, so it only succeeds with a plain version such
as `3.0.0`.

## Known limits

- **Official open platform**: stress, SpO₂, menstrual data, scales and AFib
  have to be requested separately from Zepp; long date ranges are silently
  truncated, so pulls are chunked to ≤90 days; official hourly steps are
  incomplete, so the Advanced data channel's per-minute data stays primary.
  Details in [official API facts](official-api-facts.md).
- **Switching accounts**: one `data` folder holds one account. **Start fresh
  with another account** in Settings moves the current `data` folder aside to
  `data-before-<time>`. When both channels are on with different accounts, the
  official supplementary sync only logs it and does not tell the user.
- **Official workout details**: when one is permanently unavailable it is set
  aside and retried later.
- **Self-update**: silent. The app checks on launch and downloads a new version
  in the background (signature-checked); a ring around the top-left logo shows
  progress and glows once it is ready, and nothing is replaced until the user
  clicks **Update**, which first waits for any sync or backfill to finish. The
  installer build updates through NSIS (passive), the portable build swaps its
  own exe in place, Apple-silicon macOS replaces the `.app`. Linux is left to
  the package manager or a manual download, and the Microsoft Store build to
  the Store. The portable path needs each release to carry the
  `windows-x86_64-portable` package (`scripts/release/package-portable.ps1`).
- **Upgrades**: one-way; there is no going back. Returning to 2.x only works
  from the pre-upgrade snapshot, and that snapshot is deleted automatically once
  the library is confirmed intact.
