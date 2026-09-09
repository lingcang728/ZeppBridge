# Workout feedback investigation — 2026-09-09

## Implemented: individual workout FIT export

[Issue #28 comment](https://github.com/lingcang728/ZeppBridge/issues/28#issuecomment-5588711932)
correctly identifies a missing entry point. The detail page only offered clipboard
JSON/CSV/GPX, while the main export page already invoked the FIT backend.

The detail page now offers FIT, selects an output folder, and invokes the existing
backend with an explicit single-workout scope and full detail. Cancelling the
picker writes nothing. Buttons are disabled while export is pending. Backend
errors are displayed instead of being replaced by a clipboard error.

Its CSV field list also omitted all five already decoded power/running-form
fields. Those columns are now included; absent measurements remain empty.

## Investigated: missing FIT power, not reproduced

The same comment reports intermittent missing power. The decoder reads
`power_meter`; storage persists `power_watts`; the FIT writer emits record power
and session average/maximum power. The desktop FIT command forces full detail.

A new integration regression exercises raw detail decoding, database storage,
single-workout export, FIT encoding and FIT decoding. The readings 200, 250, 0
and 300 W survive, including empty time deltas and zero watts.

Read-only inspection of the available local database found nonempty power streams
in 71 of 176 raw workout details and 283,477 stored power samples. This is evidence
that the local path works, not a reproduction of the reporter's workout.
No fallback power is synthesized from a summary average.

Remaining evidence: the affected workout's raw detail and exported FIT, ideally
paired with Zepp's export of the same activity. Compare timestamps and the presence
of `power_meter` before assigning the fault to retrieval, decoding or encoding.

## Unresolved: trail running labelled as open-water swimming

[Issue #24](https://github.com/lingcang728/ZeppBridge/issues/24) reports a trail run
being assigned the swimming type. The [new comment](https://github.com/lingcang728/ZeppBridge/issues/24#issuecomment-5588483563)
describes 500 m ascent on that mislabelled activity. Removing altitude would discard
potentially correct running data and would not fix classification.

The catalog maps 7 to open-water swimming using the device protocol, while several
other entries use different cloud-history codes. Trail running has no verified
cloud code. The official [device workout table](https://docs.zepp.com/docs/guides/workout-extension/quick-start/)
does identify 7 as swimming, but it does not establish the cloud-history mapping.
The available issue comments and diagnostic note provide no numeric code; the
local database has no relevant activity. Therefore no numeric mapping was changed.

Remaining evidence: one affected raw history row (`type`, source and any sport
name fields), plus the sport shown by Zepp. An actual open-water swim row provides
the counterexample needed to check any shared-code hypothesis. The existing manual
Trail Running correction remains available; it is a workaround, not an automatic
classification fix.

## Unresolved: missing scuba depth, water temperature and NDL

The supplied screenshot reports a T-Rex 3 scuba record exporting only heart rate.
The current sample model and decoder have no depth, water temperature or NDL
fields, and consequently cannot export those curves. `altitude_m` is elevation,
not a placeholder for dive depth. Its absence does not establish where depth was
lost. No scuba payload or FIT was available for this investigation.

Remaining evidence: one dive's raw cloud detail and, if available, Zepp's own FIT
for the same dive. Establish field names, time encoding, units and missing-value
sentinels before adding model/storage/JSON/CSV/FIT support and replaying historical
raw details. Device UI constants do not establish cloud payload encoding. No
depth is inferred from altitude and no NDL curve is calculated or fabricated.

These unresolved reports are deliberately not marked fixed or closed by this PR.

## Validation

- Frontend build, 109 Vitest tests, i18n checks and documentation-link checks pass.
- `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked` passes
  (the existing ignored test remains ignored).
- `tauri build --no-bundle --ci` produces the tested Windows EXE. Plain
  `cargo build --release` is not the packaging path: it can retain the dev URL.
- The EXE was tested against an isolated SQLite backup, without copying auth.
  The FIT option renders and selects correctly. Invoking the real FIT command
  for one workout writes one file; independent Python `fitdecode` reads 122
  records whose 122 power readings all match SQLite. Clicking CSV produces
  122 rows whose power values also match SQLite.
- Native folder-picker interaction was not automated. The FIT command was
  invoked directly in the EXE; the CSV clipboard sink was captured by the test.
  This is not a claim that a native dialog click-through was tested.
- The existing `release/ZeppBridge.exe` and its data were not replaced.
