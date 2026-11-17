# Zepp Open Platform: API facts

[中文](official-api-facts.zh-CN.md)

ZeppBridge's official channel ("Zepp authorization") and training-plan publishing rest on the facts below. They come from two places:

- **Official documentation**: the `devopen.zepp.com` Open Platform docs, checked word by word on 2026-09-05. Anything the docs do not say is recorded as "not stated"; nothing is inferred.
- **Measurements**: results from a real account, a watch and the Zepp phone app. The per-case record for training-plan publishing is `training_plan_write.verified` in [`official-api-matrix.json`](../capabilities/official-api-matrix.json).

The code is the authority: `src-tauri/crates/core/src/official/` (authorization, tokens, fetching) and `src-tauri/crates/core/src/training_plan/` (plan publishing). Where this page and the code disagree, the code and its tests win, and this page gets fixed.

## 1. What the official documentation says

### Authorization and tokens

- Authorization page `https://user.zepp.com/oauth2/index.html#/login`; API base `https://api-open.zepp.com`.
- To receive a refresh token, the authorization request must carry `token=%5B%22access%22,%22refresh%22%5D`.
- Exchange: `POST https://auth.zepp.com/v2/oauth2/access_token`, form-urlencoded, **`client_secret` required**; the example `expires_in` is 3600.
- Refresh: `POST https://auth.zepp.com/v2/oauth2/refresh_token`, **requires `Authorization: Bearer <access_token>`** plus client_id, client_secret and grant_type.
- PKCE / `code_verifier` is not mentioned anywhere.

Consequence: the authorization-code flow cannot be completed on the desktop alone; a server holding `client_secret` is unavoidable. ZeppBridge uses a relay on Cloudflare to add the secret, and the desktop app carries neither the App ID nor the App Secret (see [Security and privacy](security-and-privacy.md)).

### Delivery models

- The docs describe three: Ping-Pull (activities), Push (health data) and asynchronous Backfill.
- A webhook body is a **JSON array whose elements are JSON serialized as strings** (two levels of decoding).
- Webhooks for new partners **require no signature / HMAC** (both the Activity and the authorizationChange pages say so).
- Activity requires a 2xx response within 30 seconds.
- FIT download links are **single-use**, **expire after 24 hours** and still need the user's Bearer token; an expired link returns 410, and the docs give no way to re-issue it.
- Backfill is a **GET**, at most **30 days** per request (2,592,000 seconds), returns **202 Accepted**, and is limited to **50 requests per hour per partner application ID**; there is no completion notice and no status query.
- `eventTime` is in **milliseconds** for revocation events and in **seconds** for health events.

Two constraints follow:

1. **Official backfill cannot be a self-service feature.** The quota is per application, not per user, and every user of an open-source app shares one App ID. A year of history costs about `ceil(365/30) × number of types` requests: 78 for six types, which uses up the whole application's quota for an hour and a half. ZeppBridge's history backfill therefore runs on the Advanced data channel only.
2. **Pushes carry no proof of origin.** Anyone who knows the callback URL can forge an event. ZeppBridge currently **accepts no pushes at all**: the relay's data callback always answers 503 `data_ingestion_not_enabled`, and the desktop app pulls all official data over REST. If revocation events are ever accepted, **a revocation never deletes the local archive**; it can only lead to a recoverable pause plus an active check back with Zepp.

### Data types

| Type | Status in the docs | Notes |
|---|---|---|
| Sleep | Released | Has `remSleepInSeconds` / `naps` / `unmeasurableSleepInSeconds` / `validation` / `sleepLevelsMap`; `summaryId` may be null |
| HRV | Released | Only `lastNightAvg`; **algorithm, unit and window are all undefined**; `hrvValues` may be null |
| Activity | Released | ping + FIT download; `summaryId` is the idempotency key |
| `/users/-/heartrates` | Transitional | Parameters are **dates**, not timestamps; `type` = AUTO / MANUAL / ALL |
| `/users/-/body` | Transitional | **No units at all**; whether `muscleRate` is kg or % is unknown |
| `/users/-/activities` | Legacy, officially not recommended for new integrations | The only ready-made pull path for all-day steps |
| dailies / pulseOx / bodyComps / hybridCharge / nutrition / skinTemp | All marked `[Upcoming]` | Not confirmed as enabled for this app |

### FIT

Contains Session / Record (1 s) / Event / Lap / **Length (swimming)** / **Set (strength)** / TimeInZone / MaxMetData / `num_sessions` (multisport).

- **`zepp_coord_system`: 0 = WGS-84, 1 = GCJ-02.**
- Confirmed developer fields: `hyrox_type` = 40, `total_muscle_load` = 81, `total_cardiac_load` = 82, `total_exertion_load` = 83, `threshold_speed` = 4 (m/s).

### Unconfirmed, not to be used as facts

- The developer fields `training_load_peak` and `threshold_heart_rate` were **not found** in the docs.
- `hyrox_type` is 40 in the master table and possibly 41 in a topic guide.
- Which Upcoming types are actually enabled for this app.

## 2. What ZeppBridge actually fetches

The official channel only polls over REST; the code is in `official/fetch.rs`:

| Kind | Endpoint | Stream it lands in |
|---|---|---|
| Sleep | `GET /users/-/sleep?interval=daily` | `sleep` |
| Per-minute heart rate | `GET /users/-/heartrates?type=ALL` | `heart_rate` |
| Daily activity | `GET /users/-/activities?interval=daily` | `daily_summary` |
| Hourly activity | `GET /users/-/activities?interval=hourly` | `daily_summary` |
| Workout list | `GET /users/-/sports` | `workouts` |
| Workout detail | `GET /users/-/sportDetail?trackId=…` (returns JSON, not FIT) | `workout_detail` |
| PAI | `GET /users/-/openData/PaiSummary` | `wellness` |
| Weight | `GET /users/-/body` | `weight` |

- Each request covers at most 90 days, 7 days for heart rate. Long ranges are **silently truncated**: when the last day returned in a chunk is more than 7 days short of the requested end, ZeppBridge asks again from the break (at most 3 extra requests per chunk).
- Measured: the official workout endpoint returns only a few types such as runs and walks; cycling, strength, ball sports and so on come only from the Advanced data channel. Device models can likewise only be identified from Advanced data's `deviceSource`.
- Two modes (`sync/official.rs`):
  - **Official only**: everything in the table comes from the official channel.
  - **Both connected**: the legacy channel runs as before; the official channel only adds sleep and hourly steps.
- When both channels have the same night of sleep, the official one is shown (it adds naps and true REM). Hourly steps come primarily from the legacy per-minute detail; the official hourly totals only fill gaps (`storage/hourly_steps.rs`).
- Coordinates: checked by overlaying domestic Chinese routes from a real library on OSM, Advanced data tracks are already WGS-84 and are shown and exported as they are; only official details are handled according to `zepp_coord_system` (converted only when it is 1 = GCJ-02).

## 3. Data differences

### No official equivalent: only Advanced data has them

HRV (SDNN / RMSSD), blood oxygen SpO₂ and ODI, night score and measured minutes, the all-day stress curve, readiness, Charge energy, respiratory rate, VO₂max, daily training load, lactate-threshold heart rate and pace.

Even with all six Upcoming types enabled, these would still be missing: `spo2_odi` / `spo2_night_score` / `spo2_measured_minutes` (pulseOx has none of them), total `calories` and `active_minutes` (dailies only gives `activeKilocalories`), and of the 11 body-composition metrics `protein_rate` / `visceral_fat` / `bmr` / `body_balance_score` / `height`.

So the Advanced data channel cannot be removed. The official channel complements it rather than replacing it.

### Where the official channel is better

True REM sleep, naps, unmeasurable time, the `validation` confidence flag, FIT swim Lengths / strength Sets / multisport / TimeInZone, explicit coordinate-system labels, structured per-entry nutrition, and the durable authorization that a real OAuth grant brings.

### Unit traps

Official `bodyComps` reports weight / boneMass / muscleMass in **grams** and percentages as **0–100**, whereas `contract.rs` stores `weight` / `muscle_mass` / `bone_mass` in **kg**; the adapter has to convert explicitly. `/users/-/body` has no units at all, so nothing is inferred until real samples exist.

### The three prohibitions

These are data-correctness rules. The normalizer (`normalizer/official.rs`), the metric explanations (`src/lib/metricInfo/`) and the MCP guide all follow them:

1. Official `hybridCharge` is **a life event the user logs by hand plus a subjective load rating**. It means something different from the Charge energy score and **never substitutes for Charge**.
2. Official HRV `lastNightAvg` (and `sleepHrv` in the sleep payload) has no defined algorithm and **is never written to the SDNN or RMSSD columns**.
3. **ODI is never back-calculated from sparse SpO₂.**

The same reasoning applies to other sources: HRV whose statistic is unclear stays out of the SDNN / RMSSD columns, missing values are not filled with 0, and anything unrecognized is not guessed.

## 4. Training-plan publishing (measured 2026-10-06)

Results measured on a real account, a watch and the Zepp phone app. The code's source of truth is `VERIFIED` in `training_plan/mod.rs`.

- **V2 only** (`POST /users/-/workouts`, `version=2.0.0`). V1 is unusable: targets show as garbled text, the Zepp phone app crashes when opening details, and walks are not shown. V1 and V2 also share the same 7-day window and overwrite each other.
- **`sport` accepts only 4 top-level types**: RUNNING / CYCLING / LAP_SWIMMING / OPEN_WATER_SWIMMING. Any other value (WALKING, HIKING, TREADMILL…) is **silently dropped one workout at a time** while the server still answers success. Such activities display normally in the app, but validation blocks publishing (`sport_not_deliverable`).
- Trail runs and mountain-bike rides are sent as variants of running and cycling; strength exercises and sets cannot be sent.
- The watch shows third-party plans **only at the top-level type** and asks the user to pick a subtype again; ZeppBridge puts "purpose · subtype" on the first line of the description as a reminder (line breaks in the description display correctly on both phone and watch).
- Units: `DISTANCE` is **metres** (the docs say seconds, which is wrong); `PACE_LAP` is **speed (m/s)** and may have decimals; `OPEN` (low = high = 0) means no target. Two workouts on one day, power zones and repeat groups all display correctly.
- Names are cut off after about 14 CJK characters in the watch list (a warning, not a blocker).
- **Future windows can be pushed** (startDate = today + 7 and so on) without affecting the current week. The watch itself only shows the next 7 days; later ones reach it as the Zepp app syncs, so publishing pushes every window the plan covers.
- **`workouts: []` always clears only "the 7 days from today"**, whatever the startDate. A future window is cleared by pushing that window plus a placeholder workout dated the day before it, then immediately re-pushing the previous window to overwrite the placeholder. This relies on undefined server behaviour (out-of-window dates are not validated) and is wrapped in one place, `training_plan::v2::clear_future_window`.
- There is no GET endpoint for published plans, so ZeppBridge keeps its own publishing ledger.
- Plans the user builds by hand in the Zepp app are never affected by our pushes.
