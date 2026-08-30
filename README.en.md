<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Your Zepp data, handed back to you.</strong></p>
  <p>View, archive and export your Amazfit health records on your own Windows or macOS machine.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#download-and-install)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#download-and-install)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">中文说明</a></p>
</div>

> [!IMPORTANT]
> ZeppBridge is an independent, unofficial open-source project. It is not affiliated with or endorsed by Zepp Health, Huami or Amazfit. Use it only with accounts and data you are entitled to access.

> The app ships in English and Chinese; it follows your system language on first launch, and Settings has a switch. The Chinese README stays the primary document — this page describes exactly the same capabilities, and nothing here is translated more generously than it is implemented.

## Isn't this already in the Zepp app?

It is — but only on your phone, only the way the official app chooses to show it, and it lives on someone else's server. ZeppBridge addresses a few specific things:

- **See it on a real screen.** Long-term trends for heart rate, sleep, workouts, recovery, stress and SpO₂, over 7 days / 1 month / 6 months.
- **The data sits on your own computer.** Everything lands in one file on your machine. It keeps working offline, across phone changes, account deletions and app redesigns.
- **You can backfill history from before you installed it.** Month by month, pausable and resumable, and honest about which months the cloud genuinely had nothing for versus which ones simply haven't been fetched yet.
- **Backups that actually restore.** Whole-database snapshots with checksums and integrity checks, and a record-count diff shown before you restore.
- **Export whenever you want.** JSON, CSV and GPX — drop them into Excel, Strava or your own scripts.
- **Hand it to an AI in one step.** Pick a date range and data types; the app packages it in a model-readable shape, strips identifying details, and copies it to your clipboard.
- **Usable without opening a window.** Ships with a non-interactive CLI (schedulable via Task Scheduler or cron) and a read-only MCP server, so a model can query your local data without the data leaving your machine.

One thing worth stating plainly: **it will not prettify your data.**

If you didn't wear the watch that day, the chart has a gap. If your watch never measured something, the interface says "not provided" — never `0`. No GPS track means no map. In health data, an invented smooth curve is worse than an honest gap.

The same applies to the word "complete": the interface only claims a **complete local copy** once the coverage ledger shows every month chunk has reached a conclusion. Until then it says "a local copy of the range that synced successfully".

## Which devices are supported

**If your device syncs to the Zepp app, it's worth trying.** ZeppBridge reads what your account holds in the cloud; it does not talk to the watch, so it is not tied to specific models.

The bundled catalogue recognises 52 Amazfit products across the **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio and Band** families (watches, bands, straps, rings). Recognised devices show the correct model name and product image; unrecognised ones still sync — they just show a generic name, and you can identify yours by hand.

Which metrics you actually get depends on what your watch measures. After connecting, the settings page lists this for your account, item by item.

## Download and install

Get the latest build from [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Download `ZeppBridge_<version>_x64-setup.exe` (or `.msi`) and run it.
2. There is no code-signing certificate yet, so Windows may warn about an unknown publisher. Choose **More info → Run anyway**.
3. Later versions install over the top; your data is not touched.

**macOS (Apple Silicon)**

1. Download `ZeppBridge_<version>_aarch64.dmg` and drag `ZeppBridge.app` into Applications.
2. The bundle is ad-hoc signed — no Apple Developer ID, no notarisation — so the first launch reports an unverified developer. **Right-click the app → Open → Open.**
3. macOS builds are covered by CI (compile, clippy, tests) and one contributor smoke test on Apple Silicon. The maintainer does not own a Mac and cannot independently verify sync or keychain behaviour. If that matters to you, prefer Windows.

**Not supported**: Intel Macs, Linux, mobile.

**From 1.0.0 the local database's schema and upgrade path are treated as something to maintain long-term**: every migration takes an automatic backup first, and snapshots can be verified and restored. Your data stays local — but the snapshots live on the same disk as the database, so **if you are worried about drive failure, copy one somewhere else yourself.**

## First connection

1. Open ZeppBridge and go to **设置** (Settings) in the sidebar.
2. Click connect. The **official Zepp login page** opens in its own window; sign in with your usual credentials.
3. Once it says connected, the window closes and the app runs its first sync. Give it about 40 seconds.

Both mainland-China and international accounts work; the app detects which regional server you belong to.

The first sync fetches 30 days. For older history, use **长期归档与完整历史** (Long-term archive and full history) in settings: choose 1/2/3 years or a custom start, and it fetches month by month. You can stop at any point and continue later. Before starting, it estimates disk usage from the actual rate your own data accumulates — not from a hard-coded constant.

If the range exceeds your local retention window, the app requires you to enable long-term archiving first; otherwise the history you just fetched would be cleaned up after the next successful sync.

Stuck at login? See the [connection guide](docs/guides/connection.md) (Chinese) for troubleshooting and two fallback methods.

## What you get

**Trends**

| Page | What it shows |
| --- | --- |
| **Overview** | 24-hour heart rate, today's steps, last night's sleep structure, resting heart rate |
| **Body status** | Recovery, stress, SpO₂, HRV, respiratory rate and resting heart rate over time |
| **Training status** | VO₂max, training load, lactate threshold, PAI, and whether recent volume is high or low |
| **Recent records** | Every sleep session and workout, each openable in detail |
| **Workout detail** | Distance, pace, heart rate, per-kilometre splits, GPS track; running also shows power and form |
| **Data health** | Per-stream fetch / parse / write state — whether a gap means "not synced" or "nothing was ever measured" |

**Post-workout insight and weekly report**

After a workout, the app compares it against your own history: recent runs in the same distance band, and how pace, heart rate and training load differ — along with how many samples that rests on and how confident it is. **The baseline is you, not a population norm.** When there aren't enough samples it says so, rather than lowering the bar to produce a sentence. These are facts and evidence; interpretation is left to an AI.

**Hand it to an AI**

Several prompt templates are built in (performance summary, training insight, recovery assessment, sleep analysis). Pick a template and range, and the app packages the data, strips device identifiers and precise locations, copies it to the clipboard and opens the AI site you chose.

Packages over 2 MB are written to a file on your desktop instead.

**Export files**

- **JSON** — full structured data, for scripts or models
- **CSV** — tabular summary for spreadsheets
- **GPX** — standard tracks for Strava, Garmin and others

**Without a window**

Each release also ships `zeppbridge-tools-<version>-<platform>.zip` containing two programs:

- `zeppbridge-cli` — non-interactive: `status`, `sync`, `export`. Exit codes are a stable contract, so it schedules cleanly under Task Scheduler or cron.
- `zeppbridge-mcp` — read-only MCP server over stdio. No ports, no network. Lets a model query your local data without the data leaving your machine.

See [CLI and MCP](docs/reference/cli-and-mcp.md) (Chinese) for usage and configuration examples.

**Local read-only REST**

Settings can enable a read-only endpoint bound to `127.0.0.1` only, for your own scripts. It is off by default, requires a token once enabled, returns no credentials, and never listens on the local network.

## FAQ

**Does my computer need to stay on?**
No. Each launch catches up on the period you missed.

**Can I stop using the Zepp phone app?**
No. The chain is: watch → Zepp app on your phone → Zepp cloud → ZeppBridge. Your watch still needs the phone app to upload. Open it occasionally.

**Could this get my account banned?**
ZeppBridge uses your own credentials and **only ever issues read requests** — there is not a single write request anywhere in the project; you can grep for it. Behaviourally it is the same as opening the official app to look at your data. It is still an unofficial use, and we cannot make guarantees on Zepp's behalf.

**A metric came back empty.**
First check whether your watch actually measured it. Some metrics (lactate threshold, VO₂max) only update after specific workouts, a handful of times a year. The settings page reports each one for your account — note that **"not retrieved" is not the same as "your watch doesn't support it"**: Zepp's API returns an empty response for data that doesn't exist *and* for stream names that were never valid, so emptiness alone proves nothing.

**Where is my data?**
- **Windows**: a `data` folder next to the install directory (not `%APPDATA%`). Settings → Advanced has a button to open it.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`

**Is my data still there after uninstalling?**
Yes. Uninstalling leaves the `data` folder, backups, coverage ledger and settings alone. Delete it manually if you want it gone.

**Can I back up and restore the database?**
Yes. Settings can create a whole-database snapshot at any time, each with a SHA-256 and an integrity check. Restores are queued and applied at the next launch — the only moment a file can be swapped atomically — and the queue step shows a record-count diff first. See [backup and restore](docs/guides/backup-and-restore.md) (Chinese).

**Does anything get sent to your servers?**
Health data, workout details and credentials never leave your machine. Only if you explicitly confirm "submit an error report" does the app send application/parser versions, OS, safe model hints and field structure for unrecognised products, firmware version, and unknown workout codes with counts. It never sends accounts, tokens, serial numbers, device IDs, GPS, health values, raw responses or local paths. There is no automatic telemetry and no background crash reporting.

## Privacy

- **Credentials** live in the OS credential store (Windows Credential Manager / macOS Keychain), not in a plaintext file.
- **Health data** is an unencrypted database file on your computer. If you share the machine, use separate OS accounts.
- **AI packages are redacted first**: device identifiers, MAC addresses and precise GPS are stripped, and the file lists what was removed. Precise tracks are only included if you opt in.
- **Maps render locally.** No requests go to any third-party map service.
- **Error reports require explicit confirmation**, use a fixed allow-list, are built locally, need no GitHub account, and are never auto-published as issues.
- Syncing contacts Zepp's servers, so this is not a fully offline application.

See [security and privacy](docs/reference/security-and-privacy.md) (Chinese). Report security issues through GitHub's private vulnerability reporting, not a public issue.

## For developers

Tauri 2 + Vue 3 + Rust. The core lives in the `zeppbridge-core` crate; the desktop app, CLI, MCP server and local REST endpoint are all thin adapters over it — SQL, unit conversion and missing-value rules are never duplicated.

```bash
npm ci
npm run tauri dev
```

- [Development](docs/development/development.md) — build gates, command contracts, local REST API, acceptance order
- [Architecture](docs/reference/architecture.md) — product boundaries, Zepp API mapping, verified vs unverified list
- [CLI and MCP](docs/reference/cli-and-mcp.md) — exit-code contract, read-only tools, scheduling examples
- [Backup and restore](docs/guides/backup-and-restore.md) — snapshots, restore flow, coverage ledger
- [UI guidelines](docs/development/ui-guidelines.md) — design tokens, page structure, components

Documentation is in Chinese. Issues and PRs are welcome in either language. Before changing anything, read the "unverified" list in the architecture document — this project has an explicit standard for what counts as an established fact.

## Acknowledgements

Zepp's API is undocumented; whether a data stream exists at all is only knowable from people who have already made it work. The API mapping draws on:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) — event surface partitioning and field values
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — an independent reproduction of the same APIs, useful as cross-validation
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor) (Apache-2.0) — workout detail decoding

None of them are bundled; ZeppBridge draws on the API facts they recorded.

## Licence

[MIT License](LICENSE).

The distribution includes third-party assets, attributed in [NOTICE](NOTICE): MiSans (Xiaomi, attribution required — noted in the settings page), Inter (SIL OFL 1.1), and the decoding algorithm credited above (Apache-2.0).

Zepp, Amazfit and related marks belong to their respective owners.
