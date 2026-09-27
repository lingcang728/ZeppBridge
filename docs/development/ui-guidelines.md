# ZeppBridge UI design and interaction constraints

Updated 2026-09-05 (aligned with the accessibility and readability pass).
ZeppBridge is a bridge to the user's wearable health data, not a bloated
analytics app.

[简体中文](ui-guidelines.zh-CN.md)

The visual system is **cool grey with olive green**. Dark is the reference
scheme: brand colour `--brand: #7DA33E`, interface base `#0C0E11` (surfaces
`#16191E`). The light scheme keeps the same roles on a warm-white base
(`--brand: #2F6B4F`, base `#EAEDE5`). No ubiquitous purple, no high-saturation
neon. Category colours (heart-rate red, pace blue, sleep violet, activity cyan
and so on) mark data categories only; they are never decoration.

There are **two interface schemes — dark and light — plus a follow-the-system
mode**. See "Dual theme" below.

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
  interface scale lives in the "Display and language" settings card; the data
  folder, clearing credentials and sync diagnostics live in "Advanced and
  maintenance".

## Design tokens

**The single source of truth is `src/styles/tokens.css`**: `:root` holds the
dark values and `html[data-theme="light"]` overrides the same set. Do not
hardcode synonymous colour values in pages (the gradient backgrounds on hero
and panel are a deliberate local exception).

| Purpose | Token |
| --- | --- |
| Layer backgrounds | `--bg` `#0C0E11` / `--sidebar` `#08090C` / `--canvas` `#0D0F12` / `--surface` `#16191E` / `--surface-raised` `#1D2128` / `--surface-hover` `#262B33` |
| Text | `--ink` `#F2F4EE` / `--muted` `#B4BBC3` / `--subtle` `#949CA5` / `--faint` aliases `--subtle` |
| Strokes | `--line` / `--line-strong` for quiet structure; `--line-control` for interactive boundaries |
| Type scale | `--fs-2xs` 13px / `--fs-xs` 14.5px / `--fs-sm` 15.5px / `--fs-md` 16.5px / `--fs-lg` 17.5px / `--fs-xl` 18.5px / `--fs-2xl` 20px / `--fs-3xl` 22px |
| Brand and actions | `--brand` `#7DA33E` = `--accent`, plus `--accent-hover` `#93B952`, `--accent-soft`, `--accent-ink` `#12170A`, `--action-green` |
| Category colours | `--heart` `#F0616A`, `--pace` / `--cadence` `#4AA8E8`, `--calories` `#F5860B`, `--altitude` `#F5C33B`, `--activity` `#2BB3C0`, `--training` / `--readiness` `#A3CC5C` (light `#4E8A2E`, same family as the brand lime), each with a translucent `*-wash` |
| Sleep stages | `--sleep-deep` `#6477D7` / `--sleep-light` `#7C8FF0` / `--sleep-rem` `#8B5CF6` / `--sleep-awake` `#E8833A` |
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

### Dual theme: dark, light and system

- ZeppBridge v3 ships **dark, light and follow-the-system schemes**. The user's
  choice is persisted in `localStorage` under `zeppbridge-theme`
  (`light` / `dark` / `system`); `src/composables/useTheme.ts` resolves the
  effective scheme and `initializeTheme()` runs in `main.ts` before first
  render, so no opposite-scheme flash.
- The resolved scheme lives on `<html data-theme="light|dark">`
  (`data-theme-preference` keeps the raw choice for debugging) and
  `color-scheme` follows it, so scrollbars and native controls repaint. The
  `theme-color` meta is updated with the scheme.
- **Components consume tokens and never branch on the scheme.** When a
  hardcoded dark value genuinely cannot become a token (rare), add a narrowly
  scoped `html[data-theme="light"] …` override in the patch table at the bottom
  of `tokens.css` — that table is transitional and should shrink to empty.
- Category colours keep their hue across schemes and only shift lightness /
  saturation (light-mode heart red `#C93F49`, brand `#2F6B4F`…). A token keeps
  the same role in both schemes; semantics do not drift.
### Material: restrained glass (2026-09-26)

- The whole app has **one card material**: a two-stop gradient, a top-edge
  highlight (`inset 0 1px 0`) and two soft shadows. Tokens are the `--mat-*`
  set in `tokens.css` (`--mat-card`, `--mat-line`, `--mat-rim`,
  `--mat-shadow`, raised `--mat-raised*`, inset `--mat-inset*`, floating
  `--mat-glass*`), defined for both schemes. Primitives live in
  `src/styles/material.css`: `.surface-card` / `.mat-card`, `.button`
  variants (sink 1px when pressed), `.mat-inset`, `.mat-field`,
  `.mat-switch`, `.chip`, `.glass`.
- **Real frosted glass (`backdrop-filter`) is only for floating layers**: the
  top bar, the navigation capsule, dropdowns, the date picker and dialogs.
  Ordinary cards are not blurred.
- A category colour only leaves a faint corner glow on a card (about 5% via
  `color-mix`, `--entry-tone` / `--card-tone`); **never hardcode a card
  background**. A card's glyph and its curve share one category colour
  (body = heart red, training = lime, sleep = indigo, activity = cyan).
- Motion uses `--dur-*` / `--ease-*` and honours `prefers-reduced-motion`.
- The navigation capsule (`SegmentTrack.vue`) draws its labels twice: plain
  ink underneath and "selected" ink on top, clipped to the thumb's shape, so a
  label is never half dark mid-drag. The focus ring is drawn on the thumb,
  arrow / Home / End keys work, and dragging turns the thumb into a glass lens.
- The landing page keeps its own locally scoped dark palette
  (`.landing-page { --site-* }`) — it is brand artwork outside the app shell,
  not a third theme.

### Interface copy: two languages, never hardcoded

- **Every word on screen needs a Chinese and an English version.** Write it as
  `defineMessages(zh, en)` in the module that uses it; large pages (Settings,
  Overview) get a matching `*.i18n.ts`. Do not build one global dictionary — a
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
- MiSans ships only 400 and 700. Use 400 for body copy and request 600 for
  emphasis roles; font matching resolves 600 to the bundled bold face. Do not
  use 500 because it resolves down to regular and adds no emphasis.
- Numbers are always monospaced with `tabular-nums`, so nothing jumps on
  refresh. The body base is `--fs-md: 16.5px`.

## Page structure

Three main navigation items in the centred pill of the top bar
(`src/components/shell/AppTopBar.vue`): **Overview** (`/`), **Hand to AI**
(`/ai`) and **Settings** (`/settings`). Keep it at three — a new page gets an
entry card, not a navigation slot. The top bar also carries the sync-status
pill, the theme cycle button and the language `SelectMenu`; below 760px the
pill hides and a bottom tabbar covers the same three items.

Secondary pages stay out of the main navigation: `/body` (body status),
`/training` (training status), `/recent` (recent records), the `/sleep` and
`/workouts` lists, and the `/sleep/:sleepId`, `/workouts/:workoutId` detail
pages, reached from Overview's entry cards and its "view all" links.

### 1. Overview (`/`)

- There is **no hero card** in v3; the old hero and its "hide intro" preference
  are gone (Overview clears `zeppbridge.overview.hideHero` on mount). The page
  opens with the weekly report, coverage notice, `SourcesStrip` (device and
  account status, extracted from the v2 sidebar) and then the card grid.
- Cards are modular components under `src/components/overview/`:
  `HeartRateCard` (24-hour line), `StepsCard` (today's ring), `SleepCard`
  (last night's structure), two `StatusEntryCard`s (body / training entries)
  and `RecentCard` (two-column recent records), laid out on the 12-column
  `dashboard-grid`.
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

### 2. Hand to AI (`/ai`)

One analysis task per screen (`views/AiComposer.vue`, pieces in `components/ai/`):

- `AiTaskHeader`: task title (auto-titled until the user edits it) and the
  saved-task library.
- `TaskGraph`: the workouts picked in `WorkoutPicker` and the data categories
  around them as nodes; each category carries its own window (7 / 14 / 30 days)
  and can be switched off. `CoverageDetails` says what the local library
  actually has for that window — missing days show as missing, never as 0.
- `DirectionPanel` + `TaskExtras`: the question for the AI and optional
  attachments.
- `HandoffPanel`: target AI from the `AI_PROVIDERS` allow-list (ChatGPT,
  Claude, Gemini, Kimi, Doubao, DeepSeek, Grok — any other address is refused),
  then `ai_task_prepare` builds the redacted package. Precise GPS stays out
  unless the user opts in.
- Previews are asynchronous; while computing they show `…`, never `0`.

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

A **wallet-style card stack**, with no sidebar. Eight cards
(`views/settings/cards.ts`): account and devices · sync and updates · archive
and storage · data content · hand to AI tools · display and language · privacy
and security · advanced and maintenance.

- `/settings` is the overview: cards stack vertically, each showing its header
  (glyph, title, one live status line), lifting on hover.
- `/settings/:card` opens one card: it rises to the top and expands, the rest
  shrink into two blurred layers behind it. Flip by dragging the header past a
  threshold or flinging it, or with the previous / next buttons (hold to
  repeat), ←/→ and PageUp/PageDown; Esc returns to the overview; reduced motion
  switches instantly.
- Three layers: `lib/deck/physics.ts` (pure, with vitest) →
  `composables/useCardDeck.ts` (gesture state machine) →
  `components/deck/CardDeck.vue`. Card contents live in
  `views/settings/sections/`; shared state is injected through
  `composables/settings/context.ts`.
- Inside a card, rows use `settings-base.css`: label left, control right,
  hairlines between rows.
- History backfill has exactly one entry point, in "archive and storage"
  (long-term archive switch → start date and run → estimated size → coverage
  ledger).

## Components and charts

- No UI framework: every component is in-house, under `src/components/` —
  `BrandMark`, `CategoryMark`, `CircularProgress`, `CardDeck` (`deck/`),
  `DatePicker`, `DeviceMarquee`, `DeviceVisual`, `EmptyState`, `GlyphTile`,
  `HeartRateZonePicker`, `Icon`, `MetricTrendCard`, `ModalDialog`,
  `PageHeader`, `RecordRow`, `SegmentTrack`, `SelectMenu`, `SkeletonBlock`,
  `Sparkline`, `StageBar`; page-specific pieces live in `components/<page>/`
  (`overview/`, `workout/`, `archive/`, `ai/`, `deck/`, `shell/`). Check
  here for something reusable before adding one.
- Per-day trends always go through `MetricTrendCard` plus `buildSeriesOption`
  from `lib/metricSeries.ts`; do not write a separate option object per page.
  `SERIES_RANGES` is the single source for the three ranges.
- Icons: `Icon.vue` is inline linear SVG; large semantic icons use
  `GlyphTile.vue` — a CSS material base plus an `Icon.vue` glyph, coloured by a
  `tone` category token (name → glyph map in `lib/glyphs.ts`), shared by both
  schemes. Do not add PNG 3D icons; only brand artwork (app-icon, brand-mark,
  zepp-cloud) stays as images. Images must be
  imported so Vite emits real files — the desktop CSP allows neither data URLs
  nor external image sources.
- Charts use `vue-echarts` through `src/lib/echartsSetup.ts`, which registers
  both `zeppbridge-dark` and `zeppbridge-light` and exports the reactive
  `CHART_THEME` / `chartPalette`. Every `VChart` binds `:theme="CHART_THEME"`
  **and** `:key="CHART_THEME"` so the chart is rebuilt on a scheme switch, and
  every chart `option` is a `computed` that reads chrome colours (axis labels,
  grid lines, tooltip, marks, series semantics) from `chartPalette.value` —
  never a literal hex. The palette's colour values mirror `tokens.css` because
  CSS variables cannot reach canvas. Do not redefine the palette per page.
- **Overview never loads ECharts.** Its heart-rate curve is
  `components/overview/HrMiniChart.vue` (SVG, geometry in `lib/miniChart.ts`)
  and the entry cards use `Sparkline`. The chart engine is 580 KB and belongs to
  the interactive charts on detail pages; a `VChart` on Overview makes every cold
  start parse it again.

## Interaction and accessibility

- A "skip to main content" link sits at the top; navigation and radio groups are
  annotated with `role` / `aria-*` / `aria-pressed`; charts carry `role="img"`
  and a localised `aria-label`.
- Focus is a uniform `:focus-visible` 2px `--focus` outline. `outline: none` on
  its own is forbidden.
- Touch targets are at least 44px (the mobile menu button, the bottom
  navigation, `RecordRow`).
- The main breakpoint is 760px: the top bar's pill navigation hides and a
  bottom tabbar covers the same three items. Overview additionally drops
  columns at 1180 and 820.
- Interface scale is 80 / 90 / 100 / 110 / 125% (`UI_SCALES`), reachable from
  the "Display and language" settings card, with Ctrl + / Ctrl - / Ctrl 0, persisted
  in localStorage.
- Check that `Date.getTime()` is valid before formatting a time. Error messages
  keep actionable content rather than collapsing into "failed to load".

## Maintaining this document

Page structure follows `src/router/index.ts` and the `navigation` array in
`src/App.vue`; design tokens follow `src/styles/tokens.css`. Update this
page when you change navigation, the palette or theme state. **Where it
conflicts with the source, the source wins** — and fix this page while you are
there. Engineering gates are in the [development guide](development.md); product
boundaries are in the
[architecture summary](../reference/architecture.md).


### Readability follow-up

- Template titles/descriptions and select options wrap instead of hiding meaningful text behind ellipses. Prompt editing and dialog prose use `--fs-md`; supporting copy uses the existing smaller tokens.
- Do not fade explanatory text with container opacity. Missing-data cards keep readable text and use a dashed border for distinction; disabled actions can still be dimmed.
- `SelectMenu` keeps focus on the trigger and links its teleported list and active option with `aria-controls` / `aria-activedescendant`. Options and triggers are at least 44px tall.
- Settings uses `ModalDialog` for privacy and release notes: named dialog, contained Tab/Shift+Tab navigation, Escape dismissal, focus restoration and a scrolling viewport. Keep close buttons labelled in both languages.
- Search/editor wrappers use `:focus-within` when their inner fields suppress the native outline.
