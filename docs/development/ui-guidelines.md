# ZeppBridge UI design and interaction constraints

Updated 2026-09-27 (batches four to seven: one capsule control, interruptible deck morphs, 3D overview and timelines).
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
| Status | `--danger` `#F0616A`, `--warning` `#F5C33B`, `--focus` neutral `rgba(226,234,242,.55)` (never brand green) |
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
  `.chip`, `.glass`. Switches are one component, `components/GlassSwitch.vue` (Liquid Glass: a white knob at rest that lifts into a refracting lens on press and can be dragged).
- **Real frosted glass (`backdrop-filter`) is only for floating layers**: the
  top bar, the navigation capsule, dropdowns, the date picker and dialogs.
  Ordinary cards are not blurred.
- A category colour only leaves a faint corner glow on a card (about 5% via
  `color-mix`, `--entry-tone` / `--card-tone`); **never hardcode a card
  background**. A card's glyph and its curve share one category colour
  (body = heart red, training = lime, sleep = indigo, activity = cyan).
- Motion uses `--dur-*` / `--ease-*` and honours `prefers-reduced-motion`.
- The capsule control (`SegmentTrack.vue`) draws its labels twice: plain ink
  underneath and "selected" ink on top, clipped to the thumb. The thumb
  position is two registered CSS lengths (`--thumb-l` / `--thumb-w`,
  `@property` in `material.css`) transitioned on the track, so the thumb, the
  top ink's clip and a mask that **hides the plain label under the thumb** move
  in lockstep. (A translucent glass thumb used to show the regular-weight label
  under the bold one — every Latin label ghosted after switching to German.)
  Keyboard focus brightens the thumb (no ring), arrow / Home / End keys work,
  and pressing / dragging lifts the thumb into a glass lens whose size follows
  the item under it (`lib/segmentGlass.ts`). Dragging past either end
  stretches the whole capsule like a rubber band (capped, never out of
  bounds); a hard flick deforms it toward the flick and springs back.
  At rest the thumb is an exact-size plate — nothing is scaled, so its ends
  stay perfectly round.
- **Secondary actions are `.pill-button`** ("Add event", "See all", "Manage",
  "Show 6 more"): the same raised capsule as a selected segment, icon in the
  brand colour; `.pill-button.quiet` has no fill. No bare text links, no
  outlined rectangles.
- **Grids of facts are raised tiles, not flat outlined boxes**: weekly report
  items, the capability board, the coverage ledger and the settings "fact"
  tiles (`settings-base.css` `.s-tile`) are lighter slabs with a rim and a
  soft shadow; an absent item sinks into the groove instead (`.is-sunken`).
- The landing page keeps its own locally scoped dark palette
  (`.landing-page { --site-* }`) — it is brand artwork outside the app shell,
  not a third theme.

### Depth, capsules and motion (v3 redesign, 2026-09-27)

- **Radii are generous**: `--radius-sm/md/lg/xl` = 12 / 20 / 26 / 34 px. Cards
  read as slabs with thickness: `--mat-rim` is a top highlight *and* a bottom
  dark line, `--mat-shadow` has a third, far shadow. The canvas carries a fixed,
  faint ambient light (`--ambient`, painted by `.app-body::before`) so frosted
  glass has something to refract; floating glass (`--glass-rim`) has a
  specular top edge and a return light at the bottom.
- **No hard edges on stages**: carousels and wheels fade into the background
  with a horizontal `mask-image` instead of ending at a border.
- **Choices are capsules, not dropdowns — and there is one look.** A groove
  (`--cap-track`) holding a raised capsule (`--cap-thumb`) with the
  selected label in `--cap-ink`; floating on glass (nav, top bar) the capsule
  is a brighter pane of glass (`--cap-glass-thumb`). Two to five options →
  the draggable `SegmentTrack` (also icon-only, e.g. the moon / sun theme).
  Longer lists (language, workout type, AI provider) → `CapsuleWheel.vue`:
  options on a cylinder by their own widths, the selection always centred
  under the lens, neighbours turning away like a conveyor round a corner;
  `loop` wraps first and last so the wheel is never half empty; `lens-icon`
  pins an icon inside the lens (the globe next to the language). Drag with a
  critically damped snap, wheel, arrows, click a neighbour; the value is
  committed only when the wheel settles. `SelectMenu` is gone.
- **Theme is two icon cells, moon and sun**, in the top bar and in Display
  settings alike. It follows the system by default; picking the cell that
  matches the system goes back to following it (`useTheme.pickTheme`). The
  new theme **spreads from the icon that was pressed**: a View Transition
  with a feathered radial mask on the new snapshot (`html[data-theme-morph]`
  in `material.css`), never a hard full-screen cut.
- **Width changes animate.** When a capsule's text changes (sync pill
  "Today 10:30" → "Data ready · hand to AI", the undo pill), `useWidthMorph`
  tweens the width instead of jumping.
- **Page transitions never pass through a blank frame**: old and new page are
  on stage together (no `out-in`). `lib/navigation.ts#pageMotion` picks the
  direction — `forward` focuses into a detail page, `back` backs out, `left` /
  `right` slide between tabs in nav-capsule order — all with blur. The leaving
  page is pinned at its scroll position so it does not jump to the top.
- **Card → detail page works like the settings deck** (`composables/usePageMorph.ts`,
  2026-10-03): the new page itself is cropped out of the card (`translate` + a
  fixed-radius `clip-path`, 1:1, no scaling) and slides from the card's corner
  home, so its header lands where the card was; a copy of the card fades out on
  top, the header fades in at 6–34 %, the rest at 12–50 %, and the page it came
  from recedes to .94 / .32. The backing surface and the card copy are children
  of the page, so one clip animation carries all three. Card and page contents
  take turns with only a short overlap (no double exposure). Going back is the
  exact reverse and the last frame is the real card. **Prepared before it
  opens**: page chunks and first-screen data are fetched on hover, press and
  idle (`lib/motion/prefetch.ts`, `lib/pageQueries.ts`, `lib/readCache.ts`,
  stale-while-revalidate across syncs), the new page draws its first frame
  with real content, and only then does the morph start. Small tiles that link
  with `?focus=<metric>` (pinned metrics, the week digest) grow straight into
  that trend card on the detail page, which gets a brief ring
  (`lib/motion/focusTarget.ts`). Going back from a scrolled page shrinks the
  part you are looking at, so it keeps the same pace. Timing is shared with the
  deck (`lib/motion/timing.ts`; slowed on 2026-10-03 to 500 / 440 ms with
  `cubic-bezier(.4, .6, .2, 1)`); while it runs, `lib/motion/budget.ts` holds
  back late chart mounts and skeleton-to-content swaps.
- **`.ready-glow`** (rotating brand-gradient ring + breathing outer light) is
  reserved for one moment: "your data is ready — go hand it to the AI". Never
  two glowing things on one screen. Glass controls are stacking contexts, so
  the ring is masked to the edge and the light is an outer `box-shadow`;
  neither may tint the inside of the capsule.

### Hard rules: where things come from, how choices look (2026-10-07)

These four rules apply to every page. A page that breaks one is a bug, not a
style choice; the open list of pages that still do is
[`motion-audit.md`](motion-audit.md).

1. **Anything a click brings up grows out of what was clicked, and shrinks
   back into it.** Secondary pages, dialogs, popovers, menus, detail panes: a
   page goes through a route and `usePageMorph` (mark the source with
   `data-morph-card`; rows and capsules smaller than 140×56 work too), a
   dialog goes through `ModalDialog` + `lib/motion/dialogFlight.ts`, a card
   table through `lib/motion/cards`. Timing is `lib/motion/timing.ts` (open
   500 ms, close 440 ms, `cubic-bezier(.4, .6, .2, 1)`). Esc halfway reverses
   from the current computed style — never jump to "fully open" first, never
   `reverse()` a finished animation. Do not write a second morph engine.
2. **Every switch fades with a blur; nothing hard-cuts.** Toggling a panel,
   swapping tab contents, replacing a skeleton: cross-fade plus a short blur
   on a *static* layer (blur is set once, only opacity / transform animate —
   per-frame `filter` / `mask` keeps the fans spinning). Width changes go
   through `useWidthMorph`. Native `<details>` opens instantly, so a fold that
   users open often needs a transition wrapper.
3. **Two to five options are a glass `SegmentTrack`; longer lists are a
   `CapsuleWheel`; numbers are wheel columns (`WheelColumn`,
   `WheelDatePicker`).** Drag, keyboard and click all work; the lens follows
   the finger (`useGlassLens`, `lib/segmentGlass.ts`).
4. **No dropdowns, no traditional card-style pickers, no bare checkboxes or
   radio buttons.** The one exception is the workout-type correction on the
   workout detail page (`TypePicker`): there are too many types for a wheel.

Check before merging: run `python scripts/verify/text_overlap.py` (every interface language × the main pages; any two visible text runs that overlap fail it — the French metric-card header once did). Open and close each new layer at 4× CPU throttle and
DPR 2 in headless Chrome (an unthrottled run hides the long tasks) and step
through the frames — no bright frame, no blank frame, no jump at the start.

### Playing cards and the collection box (2026-10-07, reworked in round 3)

A day of one metric is a card. Cards are how the user picks *which days* go to
the AI.

- **Motion kit** (`src/lib/motion/cards/`): `dealCards` first **draws a pile
  out** of where it came from (0.12 s, the whole pile together), then fans it
  out (middle first); `stackCards` + `returnStack` (= `stackAndReturn`)
  gather cards the way a real deck is put away; `flipCard` squeezes a card to
  a line and opens it on the other face (2D `scaleX` — a 3D turn rasterises
  the text and it blurs halfway); `shuffleCards` / `cutDeck` say "a different
  deck" / "re-sorted"; `flyCardHome` / `flyFromBox` move the real card in and
  out of the box; `receive` / `landPulse` / `bump` let the origin catch a
  returning pile; `recedeLayer` pushes the camera in; `gatherCards` stacks a
  week and flies it into the watch icon (plan delivery). `pose.ts` turns
  "where on screen, which angle, how big" into the card's own transform
  (cards sit in tilted slots — skip that and a pile lands a few degrees off).
  Springs are sampled into CSS `linear()` once and played by WAAPI on the
  compositor (`spring.ts`). Only transform and opacity move; with reduced
  motion everything becomes a short fade.
- **Putting cards away is three beats**: (1) *stack* — from the current
  computed pose, cards slide from the edges inward into one pile at the
  centre, each tilted 1–4° and offset 1.5 px, fully opaque; (2) *return* —
  the pile travels along an arc back to where it came from: into the button
  (which fans its icon open to catch it, then bumps and glows once) or onto
  the pile that was tapped, matching its position, size and angle on the last
  frame before cross-fading into it; (3) the backdrop blur, header and range
  fade back over exactly the same time as the return. Never shrink cards one
  by one into a point, never let them vanish in mid-air.
- **Drilling in alternates, never overlaps**: the layer's cards gather into
  the tapped pile, that pile shrinks back and dims to 0.35, and only then is
  the next layer drawn out of it. No blurred clone of a layer with text in it
  (it doubled "9/14–9/20" over "9/16"). Switching range: shuffle → stack in
  the centre → deal the new deck from that same pile.
- **Picking a card takes two steps**: the first tap lifts the card (160 ms)
  and turns it to the back ("For AI ✓", neighbours step aside); tapping the
  check sends **the real card** — a ghost placed on exactly the same pose,
  the real one hidden in the same task — along an arc into the box. The box
  counts it only when it lands; a cancelled flight rolls back. The slot keeps
  a dashed outline "In the box"; tapping it flies a card back and turns it
  face up. Piles (week / month) fly as one piece on long-press.
- **Interrupting**: every layer (card table, collection box, glass popover)
  reverses from the *current* computed style when an opposite action arrives
  mid-animation (`reversible.ts`: read computed style, cancel, animate from
  there — never `reverse()` a finished animation, Chromium flashes a frame).
  Nothing is unmounted half-way; clicking the origin again while cards are
  being put away fans them back out.
- **Card table** (`components/cards/CardTable.vue`, picking logic in
  `composables/useCardPicking.ts`): 7 days → seven day cards; 1 month → 4–5
  piles by calendar week; 6 months → six month piles (empty piles are dimmed,
  slightly smaller, with a "No record" pill). Card faces: weekday + suit at
  the top left, only the suit and the day number (upside down, like a real
  card) at the bottom right; readings are split into big numbers and small
  units and never wrap (`lib/cards/faceValue.ts`). The range segment always
  has a selection. The "Your past" workout row deals one card per workout
  (key `workout:<id>`, handed over as `workout_ids`).
- **Collection box** (`components/cards/CollectionBox.vue`): bottom right,
  above everything. While a card table is open it slides in even when empty
  (a dashed "Drop here" slot) and slides out with the table if still empty —
  it never pops up from nowhere. Opening deals the hand out of the box, then
  the group labels and buttons float in last; closing runs backwards. Drag a
  card up to take it out (rAF-throttled, fling with release velocity, the
  rest close the gap with FLIP). The arrow opens a **new** task with exactly
  those categories × days (`picked_days`). Stored locally, emptied only once
  the task is handed to the AI.
- **One-off tips**: operating hints appear once as a floating bar with
  "Got it" (`composables/useCoachTips.ts`, localStorage wrapped in try/catch);
  the keyboard hint lives in `aria-describedby`, not on screen.
- Wherever a picked task is described, say "N picked days", not "last N days"
  (`lib/aiTask/pickedDays.ts` is the single count).

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
pill, the moon / sun theme toggle and the looping language wheel (globe in
its lens); below 760px the pill hides and a bottom tabbar covers the same three
items.

**Back goes where you came from.** The top-left back button and a settings
card's × / Esc use the history entry vue-router keeps in
`history.state.back` (`lib/navigation.ts#backDestination`,
`cardCloseDestination`): Overview → "Manage" → the account card → back lands
on Overview, not on the settings deck. Only a deep link with no origin falls
back to the tab root.

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
  `HeartRateCard` (recent hours), `StepsCard` (today's ring), `SleepCard`
  (last night's structure), two `StatusEntryCard`s (body / training entries)
  and `RecentCard`, laid out on the 12-column `dashboard-grid`.
- **Panels are slabs, not flat boxes** (`overview/panels.css`): 28px radius,
  rim highlight and shadow, no border; the `v-tilt` directive
  (`lib/tilt.ts`) leans a card toward the pointer (a degree or three, less
  on wide cards) with a specular highlight following it. Off for touch and
  reduced motion.
- `RecentCard` is a **horizontal timeline**: the last five sleeps and
  workouts from left (oldest) to right (newest), each a node on one line with
  its time above and title / duration below. Life events at the bottom are a
  **vertical timeline** (category colour + icon per node, ongoing events
  breathe), with an "all / ongoing" capsule and a capsule search field.
- **Fetch time is not sample time.** When the cloud has nothing for the last
  hours, the heart-rate card says so and names the newest reading ("the newest
  reading is from yesterday 22:20 — watch data reaches the cloud through the
  Zepp app first"), never "shows up after a sync" right after a sync. Steps
  say "today's steps haven't reached the cloud yet"; the sources strip shows
  each device's newest data time instead of "has recent data".
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
- The launch sync reports progress in one place only: the top bar's sync capsule ("Syncing 3/8"). Once the sync the user was waiting for lands it turns into a glowing "data ready · send to AI". Only awaited syncs light it (launch, top bar, tray, settings) — never the 15-minute background auto-sync; failure or a sync that never ran never claim readiness (`lib/dataReady.ts`). Entering `/ai` puts it out. A running sync cannot be cancelled from the UI: stopping halfway leaves some streams updated and others not.

### 2. Hand to AI (`/ai`)

The hub only summarises; every drill-down is a route that grows out of its
summary card (`usePageMorph`), and drafts survive moving between them
(module-level singletons).

- **Hub** (`/ai`): task-name capsule (→ `/ai/tasks`), "Your past" summary
  card (→ `/ai/past`), "Your next step" summary card with this week's
  training / rest and delivery state (→ `/ai/plan`), the "last sent to the
  watch" status bar, template capsules plus the single question box, the
  round-trip list (each row → `/ai/exchanges/:id`) and the dock.
- **Your past** (`/ai/past`, `/ai/past/:category`): six categories with their
  daily strips and a range handle; a category page deals its days as a card
  table and lists them one row per day. Missing days stay "—".
- **Plan** (`/ai/plan`, `/ai/plan/:date`): week view with free drag (drop on a
  card swaps, drop in a gap inserts and shifts, past days are locked, keyboard
  alternatives), day view with the intensity chart editable in place
  (duration on the right edge, heart-rate band vertically) and wheel rows for
  fine values. Sport class and variant are glass segments, with one line
  saying the watch will ask for the sub-type again (official limitation).
  Focus and description are required before publishing. A sent plan stays
  editable except for past days; re-sync pushes every affected 7-day window.
- **Check before sending** (`/ai/check`): what data goes and how complete it
  is, attachments, detail level, precise route, per-provider subscription,
  and a read-only preview of the full prompt (tap the user's sentence to fly
  back to the question box). No "advanced" fold.
- **Dock**: readiness summary (→ `/ai/check`) and one provider capsule you can
  swipe between models; tap sends. Subscription is a badge.
- Plan vs actual matches local date and compatible sport only. Demo libraries
  label every record as synthetic and simulate delivery without watch
  requests.

### 3. Recent records and detail (`/recent`, `/sleep`, `/workouts`, `/sleep/:id`, `/workouts/:id`)

- `/recent` is **one vertical timeline** grouped by day, sleep (placed on the
  day you woke up) and workouts together, newest first. A capsule switches
  all / sleep / workouts; with workouts a wheel filters by type; "all sleep"
  and "all workouts" lead to the full lists. Incomplete records that were
  filtered out must be announced explicitly — "N incomplete records hidden" —
  never silently disappear.
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
- Life events appear **once per page** as a capsule row (add / the events in
  range / manage); trend cards no longer repeat "+ Add event · Manage" under
  every chart. Event dots on a chart still open the event.
- **Switching range morphs the lines** instead of clearing and redrawing:
  trend charts update in merge mode (`metricSeries.ts#SMOOTH_CHART_UPDATE`,
  `notMerge: false, replaceMerge: ['series']`) with a 520ms update animation.
- Every card states its coverage: "12 of 30 days have records". **Days without
  data break the line** (`connectNulls: false`) — no interpolation, no zero
  padding. With only one day of data no chart is drawn; it simply says a trend
  cannot be plotted.
- The 6-month range is not decorative: VO₂max and lactate threshold are measured
  only a few times a year, and a 30-day window would show data the database
  already holds as empty.

### 5. Settings (`/settings`)

A **card deck with three forms**, no sidebar. Eight cards
(`views/settings/cards.ts`): account and devices · sync and updates · archive
and storage · data content · hand to AI tools · display and language · privacy
and security · advanced and maintenance. The same cards morph between forms
with Web Animations on the real elements (FLIP; geometry in the pure
`lib/deck/morph.ts`, orchestration in `composables/useDeckMorph.ts`) — so
every morph can be **interrupted**: closing a card half-way plays the opening
backwards (`Animation.reverse()`), collapsing mid-unbox flies each card back
from where it is on screen. (View Transitions froze input for the duration and
re-rendered blurred snapshots, which stuttered on collapse.)

- `/settings`, default — **coverflow** (`DeckCoverflow.vue`, poses from the
  pure `lib/deck/coverflow.ts`): the centre card stands upright; neighbours
  turn ~46° and stack tightly on both sides, smaller, blurrier and fainter with
  distance; the deck wraps around so both sides are always populated, and the
  stage edges dissolve into the background. Drag (velocity snap via
  `useSpringIndex`), wheel, ←/→, or click a side card to turn it to the centre;
  click the centre card or Enter to open. There are no arrow buttons — dragging
  is flipping. Side cards have no hard edges: their outer half dissolves into
  the background with distance (`coverflowPose().dissolve`).
- **"Show all"** unboxes the deck: cards leave one by one (16ms apart from the
  centre outwards, 420ms each) into a two-column vertical list; a prominent floating
  **"Collapse"** capsule puts them back in reverse order. The choice is
  remembered per viewer.
- `/settings/:card` opens one card: it grows out of its source card (top-left
  aligned scale plus a bottom clip to the source's proportions) while the
  overview recedes around its top centre, blurs and fades; closing lands it
  exactly back on the source. Inside, flip by dragging the header or flinging
  it (a drag interrupts a running flip), ←/→ and PageUp/PageDown, or the dots;
  × / Esc go back where the card was opened from; reduced motion switches
  instantly. No card has a border or a highlight line — edges come from depth.
- Unrelated small tools or facts sit **side by side** as tiles (`.s-tiles`):
  the three privacy facts, and data folder / data health / compaction under
  Advanced.
- Layers: `lib/deck/physics.ts` + `lib/deck/coverflow.ts` + `lib/deck/morph.ts`
  (pure, with vitest) → `composables/useCardDeck.ts` / `useSpringIndex.ts` /
  `useDeckMorph.ts` → `components/deck/`. Card contents live in
  `views/settings/sections/`; shared state is injected through
  `composables/settings/context.ts`.
- Inside a card, rows use `settings-base.css`: label left, control right,
  hairlines between rows.
- History backfill has exactly one entry point, in "archive and storage"
  (long-term archive switch → start date and run → estimated size → coverage
  ledger).

## Components and charts

- No UI framework: every component is in-house, under `src/components/` —
  `BrandMark`, `CapsuleWheel`, `CategoryMark`, `CircularProgress`, `CardDeck`
  (`deck/`), `DatePicker`, `DeviceMarquee`, `DeviceVisual`, `EmptyState`,
  `GlyphTile`, `HeartRateZonePicker`, `Icon`, `MetricTrendCard`,
  `cards/` (`CardTable`, `PlayingCard`, `CollectionBox`, `PickDaysButton`),
  `ModalDialog`, `PageHeader`, `RecordRow`, `SegmentTrack`, `SkeletonBlock`,
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
- Chart chrome follows the glass material: tooltips are rounded, blurred glass
  panes; the axis pointer is a thin dashed line, and bar charts do not draw the
  grey shadow box (the sleep chart turned it off entirely). Line series carry a
  soft gradient under the line unless a measured range is shaded.
- **Overview never loads ECharts.** Its heart-rate curve is
  `components/overview/HrMiniChart.vue` (SVG, geometry in `lib/miniChart.ts`)
  and the entry cards use `Sparkline`. The chart engine is 580 KB and belongs to
  the interactive charts on detail pages; a `VChart` on Overview makes every cold
  start parse it again.

## Interaction and accessibility

- A "skip to main content" link sits at the top; navigation and radio groups are
  annotated with `role` / `aria-*` / `aria-pressed`; charts carry `role="img"`
  and a localised `aria-label`.
- Focus is a uniform `:focus-visible` 2px `--focus` outline in a neutral grey —
  no green outlines anywhere, and selected chips are shown by fill, not by a
  brand-coloured stroke. `outline: none` on its own is forbidden (capsules and
  wheels brighten their thumb instead).
- Hover tips and help popovers that can sit near an edge carry `v-edge-safe`
  (`lib/edgeSafe.ts`): when shown they are nudged (and narrowed if needed) to
  stay inside the window and every ancestor that clips them.
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
`src/AppShell.vue`; design tokens follow `src/styles/tokens.css`. Update this
page when you change navigation, the palette or theme state. **Where it
conflicts with the source, the source wins** — and fix this page while you are
there. Engineering gates are in the [development guide](development.md); product
boundaries are in the
[architecture summary](../reference/architecture.md).


### Readability follow-up

- Template titles/descriptions and select options wrap instead of hiding meaningful text behind ellipses. Prompt editing and dialog prose use `--fs-md`; supporting copy uses the existing smaller tokens.
- Do not fade explanatory text with container opacity. Missing-data cards keep readable text and use a dashed border for distinction; disabled actions can still be dimmed.
- Capsule choices are a `role="radiogroup"` (`SegmentTrack`) or a `role="slider"` (`CapsuleWheel`, with `aria-valuetext` naming the current item); arrows and Home/End work.
- Settings uses `ModalDialog` for privacy and release notes: named dialog, contained Tab/Shift+Tab navigation, Escape dismissal, focus restoration and a scrolling viewport. Keep close buttons labelled in both languages.
- Search/editor wrappers use `:focus-within` when their inner fields suppress the native outline.
