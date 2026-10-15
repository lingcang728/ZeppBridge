<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Keep every record. Plan your next run.</strong></p>
  <p>Store your Zepp health data on your computer, explore the trends, talk them through with AI, and send training plans back to your watch.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#download-and-install)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-preview-999999?logo=apple&logoColor=white)](#download-and-install)
  [![Linux](https://img.shields.io/badge/Linux-preview-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="#get-started">Get started</a> · <a href="https://zeppbridge.com/">Watch the one-minute film</a> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

> [!IMPORTANT]
> ZeppBridge is an independent open-source project with official Zepp approval. Use it only with accounts and data you are entitled to access.

> [!IMPORTANT]
> **macOS: “ZeppBridge is damaged and can’t be opened”?** After installing from this repository's Releases, follow the [macOS first-launch instructions](#macos-first-launch) below.

[![ZeppBridge overview: pinned metrics, heart rate, steps and sleep](docs/assets/readme/overview-zh.png)](https://zeppbridge.com/)

*Click the image to watch the short film on the interface, card interactions and training plans. All images and video use sample data; the screenshots show the Chinese interface, and the app is available in ten languages.*

## From a record to your next step

ZeppBridge is a desktop app for Zepp / Amazfit users. Your watch uploads its records through the Zepp app on your phone, and ZeppBridge syncs whatever data is available to your own computer. Once synced, your records can be viewed offline, backed up and exported.

### See where you stand

Pin the metrics you care about to the overview and see today's state alongside the long-term trend. Open any card to go into one night of sleep, one workout, or the detailed trend for a period.

- **Sleep and recovery**: sleep duration, score and stages, plus trends for resting heart rate, HRV and readiness.
- **Workouts and training**: pace, heart rate, splits, training load and GPS tracks; running power and form when the data is there.
- **Daily activity**: steps, active calories, stress, blood oxygen and more, with a personal weekly report to look back on.
- **Life events**: note a trip, a change of routine or how you felt, so the numbers come with your own context.

![Sleep detail: duration, score and stage timeline](docs/assets/readme/sleep-zh.png)

Post-workout insights and the weekly report use your own history as the baseline. Periods without samples stay blank, missing metrics are never filled with zeros, and the app says so when there are too few samples.

### Talk it through with AI

No more piles of screenshots. Pick the dates, workouts and data categories, write your question, and ZeppBridge builds a Markdown file with the records, their units and a note on data coverage.

![Send to AI: choose records, an AI tool and this time's question](docs/assets/readme/ai-zh.png)

- Pick days out of your trends into a collection box, to discuss one change or a few sessions together.
- Customise the question, add personal background, and check which data is included and which dates are missing before you send.
- Open the AI site you chose and paste or drop in the file; on Windows it can also paste and send for you.
- Save the task and the conversation round trip, and pick it up again next time.

Works with ChatGPT, Claude, DeepSeek and other tools. ZeppBridge prepares the data and you use your own AI account; costs and data handling are set by the AI provider you choose.

### Turn the conversation into a training plan

Paste back an AI reply written in the agreed format and the plan is laid out as a week of day cards. Check each day, drag to swap dates, then adjust each session's warm-up, main set, intervals and cool-down.

![Training plan week view: rest days, easy runs, rides and intervals](docs/assets/readme/plan-zh.png)

- Edit duration, distance, intensity targets and repeat sets.
- Save frequent sessions as templates, or import `.zwo` and training-plan `.fit` files.
- When recovery is poor, swap the day's intervals for an easy session.
- Once you confirm, send it to a compatible watch through Zepp and follow the delivery status.

Running, cycling, pool swimming and open-water swimming plans can be sent today. Rest and sleep suggestions stay on your computer; whether your watch accepts and shows a plan depends on the device and its sync state.

### Browsing that feels good

V3 redesigns the whole interface: glass navigation, day cards that flip, plans you can drag and a stack of settings cards. Dark, light and follow-system themes; ten language and region options, including English, Chinese and Spanish; and adjustable units, time zone and interface scale.

[Watch the short film: dealing cards, dragging, theme switching and page motion →](https://zeppbridge.com/)

## Your data, in your hands

**Sync and archive.** Supports official Zepp authorization, with an optional advanced connection for more metrics. History can be backfilled in batches, paused and resumed; what this machine covers and what failed to sync are reported separately.

**Backup and restore.** Take whole-database snapshots, verify their integrity, and preview the record differences before you restore. Keep long-term backups on another disk.

**Export freely.** JSON for programs, CSV for spreadsheets, GPX for tracks, and FIT for exchanging workouts. Exports contain only the data actually retrieved.

**Connect your own tools.** MCP lets compatible AI clients query your local records, with health data read-only; training plans can be drafted, and publishing them directly needs a separate permission. There is also a CLI and a local read-only REST API (off by default) for scripts and automation. See [CLI and MCP](docs/reference/cli-and-mcp.md).

## Get started

### Download and install

Installers and release notes are on [Releases](https://github.com/lingcang728/ZeppBridge/releases). Make sure you download the version you mean to use.

| Platform | How to install | Verification |
| --- | --- | --- |
| Windows 10/11 · x64 | Run the `.exe` installer | Main development and daily-use platform |
| macOS · Apple Silicon | Open the `.dmg` and drag the app into Applications | V3 not yet fully verified on a real machine |
| Linux · x86_64 | Pick `.deb`, `.rpm`, AppImage or Flatpak for your distribution | V3 not yet fully verified on a real machine; see the [Linux guide](docs/guides/linux.md) |

The installers are not code-signed yet. Windows may warn about an unknown publisher, and macOS may block the app from opening. Only allow it to run, following your system's prompt, once you have checked where the download came from and decided to trust the app. To build V3 from source, see [Development](docs/development/development.md).

Before moving from 2.x, keep a separate copy of your old database: once upgraded by V3, it cannot be opened by 2.x again.

### macOS first launch

If macOS says “ZeppBridge is damaged and can’t be opened”, first make sure you downloaded it from [this repository's Releases](https://github.com/lingcang728/ZeppBridge/releases) and dragged it into **Applications**. Then open **Terminal** and run:

```sh
xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
```

This removes the quarantine attribute for ZeppBridge only. Open the app again after running the command.

### First connection

1. On first launch you can try the sample data to get to know the interface.
2. In **Settings → Account and devices**, click **Connect** and complete the official Zepp authorization in your browser.
3. Come back to the app, wait for the sync, and see the records retrieved on the overview.
4. For extra data such as HRV, stress and blood oxygen, also connect **Advanced data**. It uses your Zepp email or phone number and password, and does not support third-party sign-in.

Use the same Zepp account for both connections. Which metrics are available depends on what your device measures, what the cloud keeps and the authorization scope; "not retrieved yet" does not mean "your device doesn't support it".

### Where your data lives

**Open the data folder** in Settings shows the current data directory.

| Platform | Default location |
| --- | --- |
| Windows | The `data` folder next to `ZeppBridge.exe` |
| macOS | `~/Library/Application Support/com.zeppbridge.ZeppBridge/data` |
| Linux | Usually `~/.local/share/zeppbridge/data`; for Flatpak and AppImage see the [Linux guide](docs/guides/linux.md) |

If the Windows install folder is not writable, the app uses your user data folder instead; a custom location is whatever the app shows.

## Privacy and connections

- Health records are kept in a local database, which is not encrypted by default.
- Syncing contacts Zepp; for official authorization, the callback and token exchange pass through the project's authorization relay.
- Account and device identifiers are removed before anything goes to AI, and precise GPS is excluded by default. Records you choose to share are processed by the AI service you pick, and so are MCP query results.
- Tracks are drawn locally by default. If you turn on the online map, the map service is asked for the matching area.
- Syncing health records is read-only; training plans you confirm are written to Zepp. MCP's "Let AI publish training plans directly" is a separate switch.
- Error reports are only sent when you confirm them. There is no automatic telemetry or background crash reporting.

ZeppBridge is an independent open-source project with official Zepp approval. See [security and privacy](docs/reference/security-and-privacy.md); report security issues through GitHub's private vulnerability reporting, not a public issue.

## Docs and feedback

- [Backup, restore and full history](docs/guides/backup-and-restore.md)
- [CLI and MCP](docs/reference/cli-and-mcp.md) · [Docker](docs/guides/docker.md)
- [Development](docs/development/development.md) · [Changelog](CHANGELOG.md)
- [Report a problem or suggest something](https://github.com/lingcang728/ZeppBridge/issues)

## Acknowledgements and licence

The API research draws on [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) and [Thejuampi/icu](https://github.com/Thejuampi/icu); workout detail decoding draws on [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor).

[MIT License](LICENSE). Third-party code and assets are attributed in [NOTICE](NOTICE); related marks belong to their respective owners.
