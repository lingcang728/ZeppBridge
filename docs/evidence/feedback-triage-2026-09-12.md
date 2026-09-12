# Issue and feedback review — 2026-09-12

## Verified baseline

Remote main `443e1b3` includes PR #81 (`1e3665a`) and PR #82. `git merge-base --is-ancestor` succeeds and both #81 files are unchanged at #82. CI run 34664573360 succeeded. Merging #81 again is unnecessary. These commits are newer than release v2.2.4.

The live ZeppDock service reports 275 synchronized records with zero pending remote writes. Its 67 `new` records include all 56 entries from the September 11 ledger plus 11 later submissions. Only 9 of the 67 are v2.2.4; older reports were still pending. Device contributions and contradictory selections are not 67 reproducible application defects.

## Implemented in this branch

- #76: one system-region/local-time display policy, persisted regional/12-hour/24-hour and date-order preferences, chart and status integration, local calendar-date parsing. Absolute timestamps retain source offsets. London/New York DST and Shanghai regression cases are covered.
- #78: original Amazfit Bip, searchable as Bip 1, added to the generator and catalog. Official source: https://support.amazfit.com/en/amazfit_bip/files/user-manual.pdf.pdf . No speculative source IDs or later-generation images.
- #80: migrate an existing app-bundle data directory into Application Support using a staged copy and SQLite online backup, preserving the source. Existing destination libraries are never overwritten or mixed. Partial conflicting destinations and symbolic links require manual recovery. This can only migrate data still present: users upgrading from old releases MUST copy the old bundle's `Contents/MacOS/data` outside the bundle before replacing the app; a new binary cannot recover a bundle already deleted by Finder/updater.
- #79 follow-up: accept `userid` query parameters; bind account ID, token and regional host to one authenticated request; reject lookalike domains; provide actionable localized HAR errors.

## Remaining evidence and product work

- #76's reported London heart-rate offset is not proven fixed. Band ingestion uses the source summary `tz` and minute index; changing it requires raw date/tz/sample evidence across DST. Display preferences do not justify altering stored timestamps.
- Conflicting low-number device identifiers cannot be resolved by majority vote. Keep manual assignments and request per-device evidence.
- Unknown cloud sport codes require textual source evidence. Device protocol tables are not interchangeable with cloud-history codes.
- Dive curves and injury/illness annotations remain open work, as identified per row below. No feedback is marked resolved merely to empty the inbox.
- ZeppDock's current sync schema omits workout-type corrections/cloud-rejection details. This review covers the synchronized fields; separate CLI access to those extra D1 fields was unavailable. The running service remains configured and is used for status writes.

## Complete disposition ledger

`resolved` below means verified in an existing release; `reviewed` explicitly retains unimplemented requests, incomplete evidence, or unresolved incidental diagnostics. These statuses do not assert reporter retests.

| Report | Version | In prior 56 | Status | Evidence / next action |
| --- | --- | --- | --- | --- |
| 8c05a5e3 | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-gtr-2e; do not adopt conflicting/ambiguous source assignments |
| fee45735 | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-active-3-premium; do not adopt conflicting/ambiguous source assignments |
| 3cac3db9 | 2.2.4 | no | resolved | Released catalog already recognizes amazfit-gtr-4-46mm |
| 7e90dd33 | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-gtr-3-pro-46mm; do not adopt conflicting/ambiguous source assignments |
| 8b0f57ab | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-gts-4-mini; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 68, 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| df687aa3 | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-balance-2; do not adopt conflicting/ambiguous source assignments |
| 41550db7 | 2.2.4 | no | reviewed | Released catalog already recognizes amazfit-active-2-44mm; Needs independent device evidence for mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments |
| 87de270d | 2.2.4 | no | resolved | Released catalog already recognizes amazfit-balance-46mm |
| 89cf4e68 | 2.2.2 | no | reviewed | Needs independent device evidence for amazfit-band-7; do not adopt conflicting/ambiguous source assignments |
| 4c94b421 | 2.2.4 | no | reviewed | Needs independent device evidence for amazfit-t-rex-3-pro-48-44mm; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 214, 222, 226, 1008, 1049, 2002 need cloud-source labels or redacted detail, not device-protocol guesses |
| 881e0e37 | 2.2.3 | no | reviewed | New feature request: date-ranged injury/illness notes in AI exports; not an existing-version regression; remains unimplemented |
| 570c85f2 | 2.2.3 | yes | reviewed | Needs independent device evidence for amazfit-band-7; do not adopt conflicting/ambiguous source assignments |
| 6ffd664b | 2.2.3 | yes | resolved | Released catalog already recognizes amazfit-t-rex-3-pro-48-44mm |
| 5d4974ea | 2.2.3 | yes | reviewed | Needs independent device evidence for amazfit-gts-4-mini; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 68, 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| b05c9707 | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-gtr-2-new-46mm, amazfit-t-rex-pro, amazfit-t-rex-pro; do not adopt conflicting/ambiguous source assignments |
| ef71fa1d | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-gtr-2-new-46mm, amazfit-gtr-2e, amazfit-t-rex-pro; do not adopt conflicting/ambiguous source assignments |
| f8113a26 | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-gtr-2-new-46mm; do not adopt conflicting/ambiguous source assignments |
| ab19c05e | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-up; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 208, 224 need cloud-source labels or redacted detail, not device-protocol guesses |
| 8f11480e | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-up; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 208, 224 need cloud-source labels or redacted detail, not device-protocol guesses |
| 3454a4a9 | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-t-rex-3-pro-48-44mm; do not adopt conflicting/ambiguous source assignments |
| bd788c0c | 2.0.0 | yes | reviewed | Needs independent device evidence for amazfit-balance-ultra, amazfit-helio-ring; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 222 need cloud-source labels or redacted detail, not device-protocol guesses |
| ea84c1d7 | 2.0.0 | yes | reviewed | Needs independent device evidence for amazfit-balance-ultra; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 222 need cloud-source labels or redacted detail, not device-protocol guesses |
| 85266e96 | 2.2.2 | yes | reviewed | Needs independent device evidence for amazfit-gtr-4-46mm; do not adopt conflicting/ambiguous source assignments |
| 3b88d194 | 2.2.1 | yes | reviewed | Dive depth, water temperature and NDL decoding requires redacted cloud detail plus matching official export; remains unsupported |
| 3cb9a120 | 2.2.1 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Needs independent device evidence for amazfit-helio-strap-pro, amazfit-helio-strap-pro; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 222, 228 need cloud-source labels or redacted detail, not device-protocol guesses |
| c5d7815c | 2.2.1 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Needs independent device evidence for amazfit-helio-strap-pro; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 222, 228 need cloud-source labels or redacted detail, not device-protocol guesses |
| 4d48b7ec | 2.2.1 | yes | reviewed | Released catalog already recognizes amazfit-cheetah-2-ultra; Unknown sport codes 222, 226 need cloud-source labels or redacted detail, not device-protocol guesses |
| 4166bef0 | 2.2.1 | yes | reviewed | Released catalog already recognizes amazfit-cheetah-2-ultra; Unknown sport codes 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| 3d03b941 | 1.1.2 | yes | reviewed | Needs independent device evidence for amazfit-balance-3; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 12, 222, 224, 228, 2002 need cloud-source labels or redacted detail, not device-protocol guesses |
| 18fd1ab4 | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-t-rex-3-pro-48-44mm; do not adopt conflicting/ambiguous source assignments |
| 83ba5e73 | 2.2.1 | yes | reviewed | User note reviewed; affected device/source not identified sufficiently for an automatic correction |
| ec9ba28f | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-smart-scale; do not adopt conflicting/ambiguous source assignments |
| 29f6ba85 | 2.2.1 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Unknown sport codes 222, 228 need cloud-source labels or redacted detail, not device-protocol guesses |
| a7de77f4 | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-gtr-3-46mm; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 222 need cloud-source labels or redacted detail, not device-protocol guesses |
| bc51dd49 | 1.1.2 | yes | reviewed | Needs independent device evidence for amazfit-bip-5-46mm; do not adopt conflicting/ambiguous source assignments |
| 7edd13e8 | 2.1.2 | yes | reviewed | Needs independent device evidence for amazfit-active-2-44mm; do not adopt conflicting/ambiguous source assignments |
| 471a3ead | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-smart-scale; do not adopt conflicting/ambiguous source assignments |
| 3608ed9e | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-gts-4-mini; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 68, 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| 957cdfa8 | 2.2.1 | yes | resolved | Released catalog already recognizes amazfit-balance-2-xt |
| e4b9d804 | 2.2.1 | yes | reviewed | Needs independent device evidence for amazfit-active-2-44mm; do not adopt conflicting/ambiguous source assignments |
| 934f2d0e | 2.2.0 | yes | reviewed | User note reviewed; affected device/source not identified sufficiently for an automatic correction |
| f5a7a2dc | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-active-2-44mm, amazfit-t-rex-3-pro-48-44mm; Needs independent device evidence for amazfit-bip-6; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 203 need cloud-source labels or redacted detail, not device-protocol guesses |
| 84f5da66 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-t-rex-3-pro-48-44mm; Needs independent device evidence for amazfit-bip-6; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 203 need cloud-source labels or redacted detail, not device-protocol guesses |
| cd02d353 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-t-rex-3-pro-48-44mm; Unknown sport codes 203 need cloud-source labels or redacted detail, not device-protocol guesses |
| 8189382e | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-cheetah-2-ultra; Unknown sport codes 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| 545bcfb7 | 2.2.0 | yes | resolved | Moving/paused time and FIT timer correction included in released v2.2.4 |
| e30938e6 | 2.2.0 | yes | resolved | Trail-running code 7 corrected in released v2.2.3; incidental unknown code 108 remains separately tracked |
| ff3d3624 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Needs independent device evidence for mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments; Unknown sport codes 224 need cloud-source labels or redacted detail, not device-protocol guesses |
| 8fa3239d | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Unknown sport codes 224 need cloud-source labels or redacted detail, not device-protocol guesses |
| e02212d7 | 2.2.0 | yes | reviewed | Unknown sport codes 47 need cloud-source labels or redacted detail, not device-protocol guesses; User note reviewed; affected device/source not identified sufficiently for an automatic correction |
| d4153868 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-balance-3; Unknown sport codes 196, 216, 226, 227 need cloud-source labels or redacted detail, not device-protocol guesses |
| d54f8c86 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-active-3-premium; do not adopt conflicting/ambiguous source assignments |
| db0e96e7 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-active-2-44mm; do not adopt conflicting/ambiguous source assignments |
| bd14fa1b | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-smart-scale; do not adopt conflicting/ambiguous source assignments |
| 6040dc54 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-active-42mm; Needs independent device evidence for mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments |
| ee1fa9c3 | 2.2.0 | yes | resolved | Released catalog already recognizes amazfit-active-42mm |
| 5c28fe03 | 2.2.0 | yes | resolved | Released catalog already recognizes amazfit-active-2-44mm |
| de2259f6 | 2.2.0 | yes | reviewed | Needs independent device evidence for mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments |
| e8c87f4f | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-active-2-square, mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments |
| ddde4a19 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-active-2-square; do not adopt conflicting/ambiguous source assignments |
| 7373cc86 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-cheetah-pro-47mm; do not adopt conflicting/ambiguous source assignments |
| 63343156 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-balance-2; Needs independent device evidence for mi-body-composition-scale-2; do not adopt conflicting/ambiguous source assignments |
| 253e721f | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-balance-2-xt; Unknown sport codes 108 need cloud-source labels or redacted detail, not device-protocol guesses |
| 871a1a79 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-gts-2-mini; do not adopt conflicting/ambiguous source assignments |
| f04e7ab8 | 2.2.0 | yes | reviewed | Needs independent device evidence for amazfit-bip-6; do not adopt conflicting/ambiguous source assignments |
| fdf55bdb | 2.1.2 | yes | reviewed | Released catalog already recognizes amazfit-t-rex-3-pro-48-44mm; Unknown sport codes 214, 222 need cloud-source labels or redacted detail, not device-protocol guesses |
| 08860e13 | 2.2.0 | yes | reviewed | Released catalog already recognizes amazfit-t-rex-3-pro-48-44mm; Unknown sport codes 137 need cloud-source labels or redacted detail, not device-protocol guesses |

## Verification and feedback writeback

- Frontend production build passed; Vitest: 123 passed across 15 files, including 9 date/time cases.
- Core suite: 288 passed, 1 ignored; subsequently added original-Bip alias test passed. Core Clippy with warnings denied passed.
- `tauri build --no-bundle --ci` produced the production Windows EXE using `G:/build_cache/cargo-target`.
- Packaged EXE loaded `http://tauri.localhost/settings`; 24-hour and year/month/day choices survived reload. Chinese, English and Spanish controls worked; switching to 12-hour in English persisted into Spanish. No page errors. Isolated test data was used.
- Local macOS runtime testing is unavailable; required macOS CI is the cross-platform verification gate.
- ZeppDock authenticated batch API accepted all 67 transitions: 59 reviewed, 8 resolved, 0 skipped, 0 missing. Remote outbox completion is checked separately.
