# Self-hosted pull: the `/v1/records` contract

For a service that runs next to ZeppBridge and pulls from it on a schedule
(SparkyFitness, Home Assistant and similar). ZeppBridge keeps the local library
fresh; the puller reads it over a small read-only REST API. Mapping our records
to the puller's own model is the puller's side of the contract — this page is
what stays stable on ours.

[简体中文](self-hosted-pull.zh-CN.md)

## Where it runs

Pulling only makes sense from a machine that stays on, so the supported shape is
the headless image: `zeppbridge-cli serve` in Docker on a NAS or home server,
with `zeppbridge-cli sync` on a host timer as before ([Docker](docker.md)).

- **`serve` listens on `127.0.0.1:43921` unless you set `ZEPPBRIDGE_LISTEN`**
  (for example `0.0.0.0:43921` inside a container).
- **Beyond loopback it needs a pull token**, or it refuses to start. Either set
  `ZEPPBRIDGE_PULL_TOKEN` (at least 32 characters, e.g.
  `openssl rand -base64 33`) or create one with `zeppbridge-cli pull-token
  rotate`. `pull-token status | show | rotate | revoke` manage the stored one;
  a revoked or rotated stored token stops working within a few seconds, no
  restart needed. With `ZEPPBRIDGE_CREDENTIAL_STORE=env` (the Docker default)
  there is nowhere to store one, so use the environment variable.
- **The pull token can read only `/v1/*` and `/health`.** It is a different key
  from the desktop app's local API token and can be revoked on its own.
- **Plain HTTP.** Keep the API on a container-internal network — the
  `serve` service in `packaging/docker/docker-compose.yml` publishes no port and
  joins an `internal: true` network — or put an HTTPS reverse proxy in front.
  serve says so in its log when it starts beyond loopback.
- **Rate limits**: serve accepts 120 requests per minute per source address.
  Ten failed authentications in a minute lock that address out for 10 minutes
  (the desktop app's API does this too). Both answer `429` with `Retry-After`.
- The desktop app serves the same `/v1/records` to processes on the same
  computer, with its own local API token. It always listens on `127.0.0.1` only;
  no setting changes that.

## Requests

Every request needs `Authorization: Bearer <token>`.

`GET /v1` describes the service: version, `records_version`, the routes, the
default types and the limits below. `GET /health` is the liveness probe.

`GET /v1/records`

| Parameter | Required | Meaning |
|---|---|---|
| `from`, `to` | yes | Local dates, `YYYY-MM-DD`, both inclusive. At most **92 days** per request; split longer ranges. |
| `types` | no | Comma-separated. Default: `sleep,heart_rate,hrv,activity,workouts,weight`. The export type names (`daily_activity`, `steps`, `hrv_rmssd`, …) are accepted too. |
| `since` | no | RFC 3339 timestamp. Only records whose source data was fetched from the cloud at or after it. Records written by the user (`source: "user"`) are always included. |
| `detail` | no | `summary` (default) or `full`. `full` adds per-second workout samples and intraday series. |
| `include_gps` | no | `true` / `false` (default). Workout routes are returned **only** with `include_gps=true` together with `detail=full`. |
| `limit` | no | Page size, 1–2000, default 500. |
| `cursor` | no | `next_cursor` from the previous page. A cursor is bound to the query: changing any parameter other than `limit` invalidates it. |

An unknown parameter, or one given twice, is an error rather than ignored.

## Responses

```json
{
  "records_version": "zeppbridge.records.v1",
  "query": {
    "types": ["sleep", "workouts"],
    "from": "2026-11-01",
    "to": "2026-11-07",
    "since": null,
    "detail": "summary",
    "include_gps": false,
    "timezone": "system_local"
  },
  "count": 2,
  "total": 9,
  "next_cursor": "djE6…",
  "records": [
    { "record_type": "sleep_session", "source": "official", "…": "…" },
    { "record_type": "workout", "source": "advanced", "…": "…" }
  ],
  "devices": [],
  "capabilities": {}
}
```

- `records` is one flat list. Each item carries `record_type` and `source`;
  the other fields are the same as in `zeppbridge-cli export --format json`.
  `record_type` is one of `sleep_session`, `workout`, `daily_metric`,
  `metric_sample`, `life_event`, in that order.
- `source`: `official` = Zepp Open Platform authorization; `advanced` = the
  account connector; `mixed` = one folded value had readings from both;
  `user` = calendar context the user wrote. It is read from what each row was
  stored from, not guessed. A puller that wants official data only can filter
  on it.
- `next_cursor` is `null` on the last page. All pages reached through a cursor
  use the same snapshot. Snapshots live for up to 30 seconds and may be evicted
  by another query. On HTTP 409 `cursor_expired`, restart without a cursor.
- Units, time zone and missing values follow the read contract
  (`zeppbridge-cli contract`): a missing value is absent or `null`, never `0`.
- Errors are `{"error": {"code": "…", "message": "…"}}`:

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_query` | Unknown or repeated parameter, bad encoding, query longer than 2 KB, bad `include_gps` |
| 400 | `invalid_range` / `range_too_long` | Missing or malformed dates, `to` before `from`, more than 92 days |
| 400 | `invalid_types` | Unknown type, or none selected |
| 400 | `invalid_since` / `invalid_detail` / `invalid_limit` / `invalid_cursor` | As named |
| 409 | `cursor_expired` | The snapshot expired. Retry without a `cursor`. |
| 401 | `unauthorized` | Missing or wrong token |
| 403 | `token_scope` | The pull token asked for a route outside `/v1/*` and `/health` |
| 429 | `rate_limited` | See rate limits above; honour `Retry-After` |
| 503 | `local_data_unavailable` | The library could not be read right now (for example mid-upgrade); retry later |

`records_version` changes only for a breaking change. New fields can appear in
`v1`; ignore the ones you do not know.

## Headless sign-in

Not available yet. The authorization relay itself does not care which device
asks (the client makes a random `state` and claim secret, the user authorizes
in any browser, the client claims the token), so `zeppbridge-cli` could print
the link and claim the token. But `zeppbridge-cli sync` does not run the
official channel yet — that orchestration still lives in the desktop app — so a
token signed in from the CLI would have nothing to use it. Until both land
together, connect once with the desktop app and hand the data directory to the
container, as [Docker](docker.md) describes.
