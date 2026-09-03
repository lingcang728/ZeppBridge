# Feedback triage

ZeppBridge's in-app diagnostic report posts to `POST /api/feedback`
([`functions/api/feedback.js`](../../functions/api/feedback.js)), which writes a
row into a private Cloudflare D1 database. There is no admin page, and
`GET /api/feedback` deliberately returns 405.

Triage runs through one script:
[`scripts/feedback/triage.mjs`](../../scripts/feedback/triage.mjs).

```bash
npm run feedback:triage summary
```

## Why a script and not an admin UI

The database holds model-class numbers, workout codes, JSON field *shapes*, and
whatever sentence the reporter typed. It holds no account, token, cookie,
serial, MAC, GPS, or health value — but it is still not something to hang on the
public internet. An authenticated admin page would need its own login, audit
trail, and minimum-field discipline for a job that happens about once a week.
Fixing the commands in a reviewed script means everyone runs the same query and
nobody dumps raw rows by accident.

## Commands

| Command | What it shows |
| --- | --- |
| `summary` | Totals by status, app version, OS, category, and date span |
| `notes` | Every report where the reporter wrote a sentence — usually the highest-signal rows |
| `codes` | Unknown workout codes: report count, record count, versions seen |
| `rejections` | Cloud business error codes — HTTP 200 responses that said "not successful" |
| `devices` | User-assigned models grouped by `deviceSource`/`deviceType`, with an eligibility verdict |
| `list <status>` | Report ids in one status |
| `mark <status> <id...>` | Move reports to a status |

Output is aggregated. No command dumps `device_evidence_json` or any other raw
payload.

## Status meanings

`status` is constrained by
[`migrations/0001_feedback_reports.sql`](../../migrations/0001_feedback_reports.sql)
to `new` / `reviewed` / `resolved` / `ignored`.

* **`new`** — not looked at.
* **`reviewed`** — looked at and acted on, but the fix is not in a public
  release yet. Most reports should sit here between a merge and a release.
* **`resolved`** — the fix is in a released build. Do not use it for merged but
  unreleased work: "the code is in main" and "the reporter can install it" are
  different claims, and the second one is what the reporter cares about.
* **`ignored`** — duplicate submission or nothing actionable.

## Turning contributions into catalog entries

Two of the aggregates feed the bundled catalogs directly.

### Workout codes

`codes` ranks unknown Zepp workout codes by record count. **Volume is not
evidence of meaning.** A code with 200 records only proves people use it; it
says nothing about which sport it is. Only add a code to
[`src/assets/workouts/catalog.json`](../../src/assets/workouts/catalog.json)
when there is written evidence — a reporter's own sentence, or a second
independent source.

Of the 28 unknown codes seen so far, exactly one qualified: `211`, which one
reporter described as "road cycling with zepp code 211 was read as unknown
workout". The other 27 are still unmapped on purpose.

### Cloud rejection codes

`rejections` is the one aggregate that is expected to be **empty**, and that is
the point. Zepp wraps three streams in `{ code, message, data }`, where `code: 1`
means success. Across 3,466 retained payloads in one real library, all 1,075
wrapped ones carried `code: 1` — not a single failure code has ever been
observed here. So `classify_business_code` turns a non-1 code into a reported
error and refuses to decide on its own that it means "sign in again": guessing
would trade a certain bad experience (being thrown back to the login screen) for
an unverified hunch.

The moment a non-empty row appears here, map that specific code to
`NeedsReauth` in
[`src-tauri/crates/core/src/connectors/zepp.rs`](../../src-tauri/crates/core/src/connectors/zepp.rs)
and record the report id next to it. Until then, people whose account looks
empty ("All my readings are showing empty") get neither a prompt to reconnect
nor any data — that dead end is what this column exists to end.

The report carries the number, the stream and a timestamp. It never carries the
cloud's own message: that is server-supplied free text, and the report's promise
to users is an allow-list of fields.

### Catalog entries with no code

A catalog entry may carry `"code": null`. That means the sport is offered as a
manual correction but no Zepp number is known to produce it — invent one and the
normalizer will start relabelling a whole class of history on a guess.

**Changing the catalog means bumping `NORMALIZER_REVISION`** in
[`src-tauri/crates/core/src/storage/mod.rs`](../../src-tauri/crates/core/src/storage/mod.rs).
That constant is the only trigger for replaying `raw_records`; without it the
new mapping applies to future syncs only, and the already-stored `unknown:211`
rows stay wrong forever — which is exactly what the reporter is complaining
about.

### Device model numbers

`devices` groups user model assignments by their `modelIdentifierHints` and
prints an eligibility verdict per hint. The admission rules live in
`DEVICE_SOURCE_CODES` in
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
and are described in [the device catalog reference](./device-catalog.md).

`eligible: review` is not approval. It means the automatic filters could not
rule the hint out and a person has to decide. Never resolve a conflict by
majority vote alone — look for whether the dissenting reporters also assigned a
second watch in the same report, which is the usual sign that someone picked
the wrong device in the picker.

## Credentials

The script shells out to `wrangler`, so it uses whatever Cloudflare account
`wrangler login` established. The database binding and id are in
[`wrangler.jsonc`](../../wrangler.jsonc).
