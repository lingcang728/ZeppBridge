# Feedback triage — 2026-09-11

The supplied screenshot shows seven pending reports dated September 5–6.
The live ZeppDock/D1 snapshot contains 264 reports: 208 already resolved and
56 new. This pass reviews those 56; no raw payload, credentials, account identity,
health measurements or locations are included in this document.

## Changes awaiting release

- Workout details now separate elapsed, moving and paused time, and display both
  moving and elapsed pace. The cloud's existing `moving_seconds` field takes
  priority; if unavailable, recorded pauses are clipped and unioned. Missing
  samples are never interpreted as pauses.
- FIT session and activity timer totals prefer cloud moving time, and lap totals
  subtract recorded pauses, with
  average speed calculated from the corresponding timer duration. Elapsed time
  remains distinct. Timer events remain ordered when samples fall inside a pause.
- Seven deviceSource mappings were added to the generator and bundled catalog.
  The same catalog is copied to ZeppDock; its previously stale copy omitted three
  selectable entries, including Balance 2 XT and the two scales.

| Source number | Catalog model | Evidence |
| --- | --- | --- |
| 10551553 | T-Rex 3 Pro | 8 submissions across Linux, Windows and macOS; same-session repeats counted once |
| 10682624 | T-Rex 3 Pro | August 31 Windows and September 5 macOS reports agree |
| 11141377 | Balance 3 | 9 submissions across Windows/macOS and several device contexts; no contrary model |
| 10092803 | Active 2 44mm | 3 submissions, including a separate macOS device context |
| 8323329 | Active 42mm | August 31 and September 6 submissions have different device contexts; two adjacent September 6 submissions count once |
| 10486019 | Balance 2 XT | Linux multi-device context and separate Windows single-device context agree |
| 9978112 | Cheetah 2 Ultra | macOS single-device and Windows multi-device contexts agree |

These diagnostics intentionally contain no reporter identity. Distinct contexts
support the admission decision but do not prove a count of unique people. No code
is admitted solely because two adjacent submissions carry different report IDs.
User assignments still override automatic recognition. Cached device profiles need
a device-list refresh because older caches do not contain deviceSource.

## Reviewed, without enough evidence for automatic changes

- `8126720` (Cheetah Pro) has one submission.
- `92` was assigned to Bip 6 and then GTS 2 Mini 80 seconds later. Neither a
  unique model nor a reliable new low-band mapping is established.
- Low source numbers, notably `102`, `104`, `200`, `209`, `254`, and all
  `deviceType` numbers remain excluded; conflicting model assignments exist.
- `10813699`, `8913155` and `7930112` retain contrary assignments. Repeated
  votes and neighbouring codes do not settle those conflicts.
- `9765121`, `11469059` and `11092224` have adjacent submissions from the same
  apparent context; `11272451` and `10682627` have only one. All remain unmapped.
- Unknown workout-code counts alone do not identify sports. The device assignments
  attached to reports containing `108`, `137`, `214`, `222`, etc. do not name them.
- Scuba report `3b88d194` confirms missing depth, water-temperature and NDL curves
  are an unsupported path. It does not provide their cloud field names, encoding,
  units or sentinels. Keep the request tracked; obtain a redacted dive detail and
  the matching official export before implementing the decoder. Elevation must not
  be reinterpreted as depth, and NDL must not be synthesized.
- “this is not my device”, “Amazfit Neo”, and “Model 19 - Xiaomi Mi Band 3” lack
  sufficient per-device evidence for a new automatic mapping. Existing manual
  correction and unknown-device behaviour are retained.

## Already fixed / issue disposition

- Trail running reported as open-water swimming is fixed by PR #71 and included
  in v2.2.3. Its feedback can be marked resolved.
- [#59](https://github.com/lingcang728/ZeppBridge/issues/59): v2.2.3 contains
  one-session and persistent Hero collapse plus a restore button; close as completed.
- [#40](https://github.com/lingcang728/ZeppBridge/issues/40): the reporter confirmed
  CLI authentication and Home Assistant/MQTT integration work. The original login
  issue is completed; a future incremental MQTT integration is a separate request.
- [#10](https://github.com/lingcang728/ZeppBridge/issues/10): the released backfill
  loop snapshots its work queue once, so a failed chunk cannot monopolize the same
  run. The maintainer already reported the fix; close the original issue.
- [#62](https://github.com/lingcang728/ZeppBridge/issues/62): keep open. The reporter
  has not supplied the requested comparison with Zepp altitude calibration disabled.
  No calibrated elevation or offset is guessed.

## Feedback status policy

Move the reviewed snapshot out of `new`. Use `resolved` only for the already
released trail-running correction, and `reviewed` for this pass's unpublished
changes and retained evidence requests. This is an administrative triage archive,
not a claim that every report is fixed in an installable public release.

## Verification

Frontend regression tests cover timing, overlapping/invalid/clipped pauses and
missing distance. Rust regressions cover all admitted/excluded device codes and
FIT elapsed/timer totals. The real Tauri production build is used for desktop
verification; source-only checks are not treated as proof of the packaged UI.

## Snapshot disposition ledger

| Report prefix | Status | Disposition |
| --- | --- | --- |
| 08860e13 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| fdf55bdb | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| f04e7ab8 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 871a1a79 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 253e721f | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 63343156 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 7373cc86 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| ddde4a19 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| e8c87f4f | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| de2259f6 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 5c28fe03 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| ee1fa9c3 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 6040dc54 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| bd14fa1b | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| db0e96e7 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| d54f8c86 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| d4153868 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| e02212d7 | reviewed | Wrong-device note lacks identification of the affected device |
| 8fa3239d | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| ff3d3624 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| e30938e6 | resolved | Trail running code 7 corrected in released v2.2.3 |
| 545bcfb7 | reviewed | Moving time and FIT timer correction implemented; awaiting release |
| 8189382e | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| cd02d353 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 84f5da66 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| f5a7a2dc | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 934f2d0e | reviewed | Amazfit Neo note lacks reliable per-device source evidence |
| e4b9d804 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 957cdfa8 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 3608ed9e | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 471a3ead | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 7edd13e8 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| bc51dd49 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| a7de77f4 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 29f6ba85 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| ec9ba28f | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 83ba5e73 | reviewed | Model 19 / Mi Band 3 note lacks a matching per-device source hint |
| 18fd1ab4 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 3d03b941 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 4166bef0 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 4d48b7ec | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| c5d7815c | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 3cb9a120 | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 3b88d194 | reviewed | Dive curves require raw encoding and official export evidence |
| 85266e96 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| ea84c1d7 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| bd788c0c | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 3454a4a9 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 8f11480e | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| ab19c05e | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| f8113a26 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| ef71fa1d | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| b05c9707 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 5d4974ea | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
| 6ffd664b | reviewed | Device-source evidence admitted; remaining unknown workout codes retained |
| 570c85f2 | reviewed | Reviewed contribution; insufficient, conflicting, low-band or already-known device evidence |
