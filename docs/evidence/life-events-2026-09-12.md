# Life events validation — 2026-09-12

## Delivered scope

- Overview statistics area: create, search, edit and delete calendar events;
  filter ongoing events and paginate the list.
- Single days, inclusive ranges and open-ended ongoing events. Five categories:
  health, travel, routine, training and other.
- Metric trend cards: related-event shortcuts and clickable highlighted data
  points; ordinary data points prefill the event date. Overview, body and
  training pages also provide shortcuts.
- Optional `life_events` export type, off by default, available in JSON, CSV and
  AI handoff. Intersecting events retain their original dates and are explicitly
  identified as user-authored context. Cross-midnight workouts include both
  local calendar dates. GPX/FIT do not carry life events.
- SQLite schema 23, independent of cloud records, normalizer replay and retention.
  Snapshots include life events, with counts in the restore preview.
- All new interface text and the user guide include Chinese, English and Spanish.

## Automated checks

- `npm test`: 126 tests passed, including calendar boundaries, invalid dates and
  a check that every new Spanish label is translated rather than falling back
  to English.
- `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked`: passed;
  the existing private-fixture test remains ignored.
- Focused core tests also prove CRUD validation, explicit export selection,
  original date preservation, cross-midnight workout context and preservation
  through retention cleanup, replay, migration and snapshot restore.
- Frontend production build, i18n check, documentation links, version consistency,
  bundle budget and Rust formatting checks passed.

## Packaged Windows runtime

Built with `node node_modules/@tauri-apps/cli/tauri.js build --no-bundle --ci`,
using the shared Cargo target directory. The resulting EXE serves its embedded
production frontend; the smoke test confirmed the Tauri origin.

EXE SHA-256:
`462e197cfb0a01e918c60fd66e7608f53546e718d77f3909cf7555faea8454e7`

Playwright connected to the real EXE's WebView2 through CDP. The test used a
separate `ZEPPBRIDGE_DATA_DIR` containing only synthetic records. No normal user
library or login credentials were modified.

Verified in the executable:

- Chinese, English and Spanish creation dialogs and list rendering.
- Open-ended event state, editing, deletion confirmation and data persistence
  after terminating and restarting the process.
- Inclusive export overlap, original date retention, omission when not selected,
  and event text in the prepared AI handoff.
- CSV round-trip of Unicode, quotes and multiline notes.
- Spanish layout at a 620-pixel viewport, with no horizontal overflow.
- Chart shortcut and highlighted data point opening the associated event.
- Overview shortcut opening the editor without navigating into a metric card.
- Spanish export checkbox present, initially off, and selectable.

Screenshots and the synthetic runtime report are kept locally under
`mock-test/life-events/` (ignored by Git). The local preview EXE is under
`release/preview-life-events/`.

## Remaining boundaries

No release tag or installer publication is part of this feature change. Native
macOS/Linux runtime validation is not established by the Windows smoke test.
DST ingestion, unresolved device sources and unknown workout mappings remain
separate evidence-dependent work; this PR does not claim to resolve them.
