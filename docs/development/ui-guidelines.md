# ZeppBridge UI design and interaction constraints

Updated 2026-08-25 (aligned with the second UI round: the body-status and
training-status pages, the heart-rate zone selector, the export data-stream
selector). ZeppBridge is a bridge to the user's wearable health data, not a
bloated analytics app.

[简体中文](ui-guidelines.zh-CN.md)

The visual system is **cool grey with olive green**, dark throughout: brand
colour `--brand: #7DA33E`, interface base `#131519` (sidebar `#0F1114`, cards
`#1D2026`). No ubiquitous purple, no high-saturation neon. Category colours
(heart-rate red, pace blue, sleep violet, activity cyan and so on) mark data
categories only; they are never decoration.

There is **only a dark interface**. That is a settled trade-off — see
"Dark only" below.

## Core principles

- **Sync is trustworthy**: the cloud fetch time, the sync status and the device's
  time-series sample times must be expressed as clearly separate things.
- **Truth first**: missing values render as "not provided" / `—` or an explicit
  empty state. Never fake data, zeros or simulated curves. With no samples,
  show empty-state copy (for example "after syncing, real 24-hour heart-rate
  movement appears here") rather than a placeholder curve.
- **Analysis lives outside**: clinical and training advice is left to whichever
  AI tool the user chooses. The app focuses on collection, normalised storage,
  redaction and AI-ready export.
- **Privacy floor**:
  - exporting to an AI applies irreversible redaction by default
    (`redact_ai_export` strips device_id, MAC, IMEI, precise GPS and similar,
    and writes a `redactions` list back into the JSON); a precise track is
    injected only when the user explicitly ticks `include_precise_route`;
  - a package over 2 MiB (`AI_HANDOFF_INLINE_LIMIT_BYTES`) is written to
    `zeppbridge-ai-handoff.json` on the desktop, and the clipboard gets only the
    drag-in instructions;
  - GPS tracks are drawn locally with inline SVG (`routeCanvas` in
    `WorkoutDetail.vue`) and never request third-party online map tiles.
- **Progressive disclosure**: everyday use shows core metrics and quick export;
  interface scale, the data folder, clearing credentials and sync diagnostics
  are folded into "Advanced and maintenance" at the bottom of Settings.

## Design tokens

**The single source of truth is the `:root` block in `src/App.vue`.** Do not
hardcode synonymous colour values in pages (the gradient backgrounds on hero and
panel are a deliberate local exception).

| Purpose | Token |
| --- | --- |
| Layer backgrounds | `--bg` `#131519` / `--sidebar` `#0F1114` / `--canvas` `#14161A` / `--surface` `#1D2026` / `--surface-raised` `#24272F` / `--surface-hover` `#2C3039` |
| Text | `--ink` `#F2F4EE` / `--muted` `#9AA1A9` / `--subtle` `#6E757D` / `--faint` `#4B5158` |
| Strokes | `--line` / `--line-strong` (both low-opacity cool white) |
| Brand and actions | `--brand` `#7DA33E` = `--accent`, plus `--accent-hover` `#93B952`, `--accent-soft`, `--accent-ink` `#12170A`, `--action-green` |
| Category colours | `--heart` `#F0616A`, `--pace` / `--cadence` `#4AA8E8`, `--calories` `#F5860B`, `--altitude` `#F5C33B`, `--activity` `#2BB3C0`, `--training` / `--readiness` `#3DD84C`, each with a translucent `*-wash` |
| Sleep stages | `--sleep-deep` `#4458B8` / `--sleep-light` `#7C8FF0` / `--sleep-rem` `#8B5CF6` / `--sleep-awake` `#E8833A` |
| Status | `--danger` `#F0616A`, `--warning` `#F5C33B`, `--focus` `#7DA33E` |
| Route pace spectrum | `--route-neutral` / `-mint` / `-cyan` / `-amber` / `-coral` |
| Spacing / radius | `--space-1…8`, `--radius-sm` 10px / `-md` 14px / `-lg` 18px |

The four bands annotated under the 24-hour heart-rate line on Overview use
**absolute thresholds**, purely as a rough reading scale rather than
personalised zones: rest 0–99 / fat burn 100–139 / aerobic 140–169 / anaerobic
170+ (`HR_ZONES` in `Overview.vue`).

Personalised heart-rate zones are a different matter, living in the selector on
`/training`: three algorithms (max HR / heart-rate reserve / lactate threshold)
and five measured bases, **with no default preset**, each basis labelled with its
source and measurement date. Estimating with formulas such as 220 − age is
forbidden. The provenance of the algorithms and percentages is in the
[architecture summary](../reference/architecture.md).

### Dark only (a settled design trade-off)

- ZeppBridge **offers a dark interface only**. There is no light mode and no
  follow-the-system mode. `:root` maintains this one token set; do not add
  `@media (prefers-color-scheme)` or `[data-theme="light"]` branches, and do not
  add a theme switch.
- You may therefore assume a dark background when writing styles. No light
  fallback is needed — but still use tokens rather than hardcoded colours, so
  the palette stays adjustable as a whole.
- The light-mode leftovers (`useTheme.ts` and the `zeppbridge-light` ECharts
  theme) were deleted on 2026-08-24. Do not reintroduce them.

### Interface copy: two languages, never hardcoded

- **Every word on screen needs a Chinese and an English version.** Write it as
  `defineMessages(zh, en)` in the module that uses it; large pages (Settings,
  Explore) get a matching `*.i18n.ts`. Do not build one global dictionary — a
  lazily loaded page's chunk should carry only its own copy.
- `defineMessages` uses `NoInfer` to pin the shape to the Chinese half: a
  missing English key, an extra key or a mismatched parameter fails to compile.
  A missed translation goes red at `npm run build`, not after a user sees it.
- **Never branch on a display name.** `label === '骑行'` or
  `seriesName === '阈值配速'` silently stops working when the language changes,
  without raising an error. Branch on a key, an id or an index.
- **Format dates and numbers with `intlLocale()`**, never a literal `'zh-CN'`.
  Do not cache `Intl.*` instances as module-level constants either — that pins
  the language to the moment the module loaded.
- Copy coming from the backend (stream names, actions, sync progress, insight
  reasons, heart-rate zones…) is **always looked up in the interface by the
  stable code or key it provides**. Never display the backend's Chinese
  directly — that copy is for the CLI and MCP, which do not follow the
  interface language.
- `npm run i18n:check` blocks hardcoded Chinese, backend codes without English
  copy, and the interface rendering a backend original where a code exists.
  Places where Chinese is genuinely correct (the bilingual language-switch
  label, for instance) are listed line by line in `ALLOWED` / `ALLOWED_PROSE` in
  `scripts/release/check-i18n.mjs`, each with a reason.

## Type and typography

- Bundled fonts: MiSans (Chinese, 400 / 700 only) and Inter (Latin and digits,
  400 / 500 / 600 / 700), defined in `src/styles/fonts.css`.
- `--font-sans: 'MiSans', 'Segoe UI', 'Microsoft YaHei UI', sans-serif`;
  `--font-mono: 'Cascadia Code', ...` for every numeric value.
- Chinese never uses the 500 / 600 intermediate weights (MiSans ships only
  400/700, and an intermediate triggers blurry faux-bold). Hierarchy comes from
  size and brightness instead.
- Numbers are always monospaced with `tabular-nums`, so nothing jumps on
  refresh. The base is `font-size: 13px`.

## Page structure

Three main navigation items: **Overview** (`/`), **Hand to AI** (`/explore`) and
**Settings** (`/settings`). Keep it at three — a new page gets an entry card,
not a sidebar slot.

Secondary pages stay out of the main navigation: `/body` (body status),
`/training` (training status), `/recent` (recent records), the `/sleep` and
`/workouts` lists, and the `/sleep/:sleepId`, `/workouts/:workoutId` detail
pages, reached from Overview's entry cards and its "view all" links.

### 1. Overview (`/`)

- Hero card: brand line, three value cards (secure / private / AI-ready), and on
  the right a "recognised device → flowing dashed line → cloud AI" diagram. The
  device comes from real recognition; with no device, that flow is not drawn.
- A 12-column dashboard grid: 24-hour heart-rate line (span 6), today's step
  ring (span 3), last night's sleep structure (span 3), a resting-heart-rate
  mini card plus the body-status and training-status entry cards (span 4 each),
  and a two-column recent-records list (full width).
- Each entry card carries today's value and a 7-day `Sparkline`, leading to
  `/body` and `/training`. They replaced the old training-load / VO₂ Max mini
  cards — the same number is not shown twice on one screen.
- `Sparkline` draws nothing below two points: one reading is a value, not a
  trend, and drawing it as a flat line claims a stability nobody measured.
- Every card has its own empty state. Loading uses `SkeletonBlock`; failure
  gives a retryable `EmptyState`.
- Overview does no interpretation such as recovery scoring or training advice.
  The entry cards give numbers and shapes; interpretation is left to the AI the
  user chose.

### 2. Hand to AI (`/explore`)

A three-column layout:

- Left: template categories and a searchable prompt-template list.
- Middle: the current template's prompt editor (editable, copyable), a
  four-cell data-awareness summary (date range / record count / data-type count
  / estimated size), quick-range pills and a hand-drawn calendar popover (not a
  native date input).
- Right: export format, target AI (seven: ChatGPT, Claude, Gemini, Kimi,
  Doubao, DeepSeek, Grok, via the `AI_PROVIDERS` allow-list — a non-listed
  address is simply refused), and the save / copy prompt / send actions.
- Each of the three formats runs its own real conversion, and the card subtitle
  must state the difference. "Choose CSV, actually get JSON" is not allowed:
  JSON = fully structured; CSV = long-format summary (no per-point samples or
  tracks); GPX = only workouts that have a GPS track. With nothing to export it
  errors rather than writing an empty file.
- Fifteen selectable data types (`exportTypeOptions`) are presented in the right
  column in the four groups of `exportTypeGroups`: activity / sleep / body
  status / training. A group heading selects or clears the whole group;
  individual items are checkboxes. A template only **pre-fills** the selection
  and never locks it — what you ticked is what gets exported, and the count and
  size in the summary always describe the file you are about to receive.
- Size and count are an asynchronous preview; while computing they show `…`,
  never `0`.

### 3. Recent records and detail (`/recent`, `/sleep`, `/workouts`, `/sleep/:id`, `/workouts/:id`)

- `/recent` is two columns (sleep / workouts) with "N total" in each column
  header and a type filter tab on the workout column. Incomplete records that
  were filtered out must be announced explicitly — "N incomplete records
  hidden" — never silently disappear.
- Workout detail: a metric matrix, ECharts heart-rate/pace curves, a local SVG
  track (mapped onto the `--route-*` spectrum by pace) and pause intervals. No
  track points means no map; no per-point samples means no curve.
- Sleep detail: a `StageBar` composition (the four `--sleep-*` colours), a
  collapsible "stage explanation", and a stacked bar chart of the last seven
  nights. Duration, score, source and device are shown as they are, and missing
  means "not provided".

### 4. Body status (`/body`) and training status (`/training`)

- The two pages share a structure: `PageHeader` carries a 7-day / 1-month /
  6-month `range-switch` on the right, and the body is a responsive
  `minmax(320px, 1fr)` card grid.
- Body status has eight `MetricTrendCard`s: recovery, stress, SpO2, nightly SpO2
  ODI, HRV (SDNN), HRV (RMSSD), respiratory rate and resting heart rate. The
  ones with a measured range (stress, SpO2, HRV, respiratory rate) draw a
  day's min–max shading behind the line; **a day with no measured range draws no
  zero-width shading.**
- Training status: VO₂max / training load / PAI trend cards, a dual-axis lactate
  threshold heart-rate plus pace card (the pace axis is `inverse`, so "faster"
  points up), a load-balance card (7-day load, 28-day weekly average and the
  acute:chronic ratio as three lines), and the `HeartRateZonePicker`.
- Every card states its coverage: "12 of 30 days have records". **Days without
  data break the line** (`connectNulls: false`) — no interpolation, no zero
  padding. With only one day of data no chart is drawn; it simply says a trend
  cannot be plotted.
- The 6-month range is not decorative: VO₂max and lactate threshold are measured
  only a few times a year, and a 30-day window would show data the database
  already holds as empty.

### 5. Settings (`/settings`)

Numbered sections, top to bottom: 1 authentication method (official web sign-in
/ HAR import / manual entry) → 2 account and region → 3 connected devices and
data sources → 4 privacy and security (including the privacy-principles modal)
→ 5 local data retention → 6 export and backfill preferences → 7 local REST API
status → 8 software updates → 9 automatic sync.

An "Advanced and maintenance" section at the bottom folds in interface scale,
opening the data folder and clearing credentials, with a nested "sync
diagnostics" section listing per-stream status and cloud sync times.

## Components and charts

- No UI framework: every component is in-house, under `src/components/` —
  `BrandMark`, `CategoryMark`, `CircularProgress`, `DesignIcon`, `DeviceCard`,
  `DeviceMarquee`, `DeviceVisual`, `EmptyState`, `HeartRateZonePicker`, `Icon`,
  `MetricTrendCard`, `PageHeader`, `RecordRow`, `SkeletonBlock`, `Sparkline`,
  `StageBar`. Check here for something reusable before adding one.
- Per-day trends always go through `MetricTrendCard` plus `buildSeriesOption`
  from `lib/metricSeries.ts`; do not write a separate option object per page.
  `SERIES_RANGES` is the single source for the three ranges.
- The two icon sets have distinct jobs: `Icon.vue` is inline linear SVG (UI
  controls, small sizes), `DesignIcon.vue` renders the PNG design icons in
  `src/assets/design-icons/` (navigation, large semantic icons). Images must be
  imported so Vite emits real files — the desktop CSP allows neither data URLs
  nor external image sources.
- Charts use `vue-echarts` with the `zeppbridge-dark` theme registered in
  `main.ts`. Do not redefine the palette per page.

## Interaction and accessibility

- A "skip to main content" link sits at the top; navigation and radio groups are
  annotated with `role` / `aria-*` / `aria-pressed`; charts carry `role="img"`
  and a localised `aria-label`.
- Focus is a uniform `:focus-visible` 2px `--focus` outline. `outline: none` on
  its own is forbidden.
- Touch targets are at least 44px (the mobile menu button, the bottom
  navigation, `RecordRow`).
- The main breakpoint is 760px: the sidebar becomes a top bar plus a bottom
  tabbar. Overview additionally drops columns at 1180 and 820.
- Interface scale is 80 / 90 / 100 / 110 / 125% (`UI_SCALES`), reachable from
  Settings → "Advanced and maintenance", with Ctrl + / Ctrl - / Ctrl 0, persisted
  in localStorage.
- Check that `Date.getTime()` is valid before formatting a time. Error messages
  keep actionable content rather than collapsing into "failed to load".

## Maintaining this document

Page structure follows `src/router/index.ts` and the `navigation` array in
`src/App.vue`; design tokens follow the `:root` block in `App.vue`. Update this
page when you change navigation, the palette or theme state. **Where it
conflicts with the source, the source wins** — and fix this page while you are
there. Engineering gates are in the [development guide](development.md); product
boundaries are in the
[architecture summary](../reference/architecture.md).
