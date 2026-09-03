# ZeppBridge security and privacy boundaries

This page describes the data flows and deletion scope of the current
implementation. It is not a claim of absolute safety: the installers are
unsigned, the health database is plaintext by default, and the behaviour across
real accounts and regions has not been fully verified against live services.

[简体中文](security-and-privacy.zh-CN.md)

## Credentials

- The app token is stored by Windows Credential Manager under the service name
  `com.zeppbridge.app`, with the account name keyed by user ID.
- `auth.json` lives in `data/` next to the program (`{exe_dir}/data`) and holds
  only authentication metadata (version, user ID, region host, updated-at). A
  normal save never writes the token to a file. Nothing is written to `%APPDATA%`.
- Startup recovery rebuilds the sync manager from that metadata plus the
  credential store. When the credential is missing or invalid, Settings says
  re-authentication is needed and the token never appears in a status response.
- Web sign-in reads the session cookies inside its own window, extracts the user
  ID and app token, and writes them straight to the credential store.
  `login://status` returns only `state`, `message`, `page_url` and `code` —
  never a token.
- A token is still sensitive data. Do not log it, paste it into an issue, commit
  it, send it to a third party, or share it publicly.

## Network and regions

- Syncing is not an offline feature: once you press verify or sync, ZeppBridge
  makes HTTPS requests to the Zepp region host configured for your account.
- The connector accepts only origins of the form `https://api-mifit*.zepp.com`
  or `https://api-mifit*.huami.com` — no arbitrary domains, paths, queries,
  fragments, embedded credentials or uncontrolled ports.
- The HTTP client has a 30-second timeout and classifies 401/403, 404, 429/5xx
  and other non-2xx responses, with a bounded retry budget.
- The sign-in window may navigate only to `https://*.zepp.com` /
  `https://*.huami.com` (plus `about`/`data`/`blob` intermediates) and the exact
  OAuth provider hosts that page uses. Region probing only touches API origins
  on the allow-list.
- There is no LAN HTTP proxy, and no system or user CA is installed.
- The local REST API binds only to `127.0.0.1:43921`. It does not listen on LAN
  addresses, offers no CORS, and exposes only a read-only health probe and a
  workout-series route. **It is off by default**; it starts listening only after
  you enable it in Settings, and every request needs a token (`zbk_` prefix,
  compared in constant time). The token can be rotated at any time, which
  invalidates the old one immediately; turning the switch off releases the port.
  The request line, individual headers and total header size are all capped —
  an oversized request is rejected rather than read into memory.
- `zeppbridge-mcp` speaks stdio only. It **listens on no port and makes no
  network requests**. It opens the database with `PRAGMA query_only`, so writes
  are refused at the SQLite layer rather than relying on the tool list happening
  to contain no write operations. Its responses carry no tokens, cookies, full
  account identifiers or absolute local paths.
- `zeppbridge-cli` reaches the network only during `sync`, through exactly the
  same connector and host allow-list as the desktop app. It does not sign in and
  never prints a token; `export --out` echoes back only the path you gave it,
  without resolving it to an absolute path.

## The three kinds of "export" have different boundaries

Confusing them causes real privacy accidents — sending a whole-database
snapshot as if it were "the data for the AI" hands over every raw payload.

| | Contents | Redaction | Who can read it |
|---|---|---|---|
| **JSON / CSV / GPX** | Normalised data for the selected range | None automatic; you choose the range | Any tool |
| **Database snapshot** | The entire `zepp.db`, including raw payloads and provenance | **None** | ZeppBridge only |
| **AI hand-off package** | The range you picked | Authentication fields, account, device, serial numbers and precise coordinates removed automatically | The model you chose |

Snapshots stay in `data/backups/` on this machine. They are never uploaded, and
they are not encrypted — like `zepp.db` they are plaintext SQLite. On a shared
computer, use separate operating-system accounts.

## The web sign-in session

1. `start_web_login` bumps the epoch, closes any old sign-in window, opens a new
   one and sets the state to `waiting`.
2. A background poll reads cookies. On a successful parse the state moves
   `extracting` → `verifying`, probing region hosts in parallel.
3. On success the credential is saved, the sync manager is initialised, the
   state becomes `connected` and the window closes.
4. `cancel_web_login`, closing the window, or a new `start_web_login` all
   invalidate the previous epoch. A session times out after 15 minutes as
   `failed`.
5. "Clear credentials" also invalidates the sign-in epoch and resets the sign-in
   state to `idle`.

Sign-in window capabilities cover only the main window and `zepp-login`. Do not
share the sign-in URL with anyone you do not trust.

## The health database

- The database and raw payloads live in `data/zepp.db` next to the program, as
  plaintext SQLite by default. There is currently no whole-database encryption
  and no remote backup. The WebView cache sits in `data/webview`.
- SQLite runs with WAL, foreign keys, migrations, de-duplication and raw
  provenance. Canonical health rows point back at the raw record they came from,
  so any value can be traced to its source.
- Retention is yours to choose between 1 and 365 days, defaulting to 365.
  Cleanup is based on the health record's own timestamp and removes old
  canonical rows plus unreferenced raw rows after a successful sync. It cannot
  be undone, so take a snapshot first.
- Encoded or compressed `band_data` payloads may be kept as raw only and marked
  `unverified`. The program never fabricates sleep stages out of content it
  could not decode.

## Handing data to an external AI

"Send to AI" in Explore first calls the local `prepare_ai_handoff` to build a
structured export for the current date range and data types, then recursively
removes authentication fields (token, cookie, authorization, credential and
other authentication keys) along with account, device and serial identifiers and sleep/training
record IDs. `route`, latitude/longitude and other precise coordinates are
removed entirely by default; they are kept only if you deliberately enable
"include precise GPS route" and pass a second confirmation. Authentication data
is never exported, and `redactions` plus `metadata` record which policy applied.

A redacted JSON payload of 2 MiB or less goes to the clipboard together with the
prompt. Above that threshold the clipboard gets only the prompt and a note
asking you to upload the generated file, while the redacted JSON is written to
`zeppbridge-ai-handoff.json` on your Desktop — or, when no Desktop directory can
be resolved, to `exports/` in the app data directory. A
clipboard failure does not open the browser; if the browser fails to open, the
copied content is kept so you can retry. The seven destination URLs are hard-coded — your input and your prompt cannot
change them, and they carry no query parameters, health data or prompt text.

The hand-off only copies and opens the destination site. It performs no page
injection, no automatic sign-in and no automatic submission. The account,
network, retention and privacy policy of the external AI site are yours to
confirm; seeing the page in a preview does not mean anything was submitted.

## Voluntary problem reports

When a device or workout type is not recognised, you can press "submit a problem
report" in Settings. It always requires an explicit confirmation first. The app
never reports anything in the background, and never creates or replies to GitHub
issues.

The desktop app uses a separate HTTPS client with no Zepp cookie jar, sending a
strongly typed allow-listed report only to
`https://zeppbridge.pages.dev/api/feedback`. The permitted fields are: app and
parser version, operating system, database schema version, the field names and
JSON types in the device response, catalogue candidates, firmware version, safe
product-name and short-model hints, model-class numbers, the count of
unrecognised devices, unrecognised workout codes with record counts, the
count of type conflicts, and the numeric error code from the most recent request
the Zepp cloud rejected (the number, which data stream and when — never any text
the cloud returned). The report schema has no fields for accounts, tokens, cookies, serial numbers,
device IDs, MAC addresses, GPS, health values, raw responses or local paths.

Model-class numbers (`modelIdentifierHints`) are strings of the exact form
`name:integer`, and only two names are accepted: `deviceSource` and
`deviceType`. The value must be a JSON integer in the device response, within
0–99,999,999; anything else is dropped before the report is built. Some Zepp
accounts return no
product-name field whatsoever, and those two numbers are the only model clue
available. They describe *which model of watch*, not *which watch*, and the
shape is pinned to `name:integer` on both the client and the Pages Function, so
a serial number, a MAC address or any string cannot get in. Without them, such
devices can never be added to the built-in catalogue and stay "unrecognised"
for every user forever.

The Pages Function re-runs strict schema, field-count and 32 KiB size checks
before writing to a private D1 database. There is no public read route, and the
response returns only a random report number. D1 is used solely to locate
catalogue and parser compatibility problems — never for profiling, usage
statistics or health analysis.

## "Clear credentials" versus "clean up data"

### Clear credentials

- Invalidates the web sign-in session;
- Deletes the Credential Manager token for the current user ID;
- Deletes the `auth.json` metadata;
- Clears the in-memory sync manager, auth state and warnings;
- **Keeps** the existing health database, canonical records and raw records.

### Clean up old data

- Triggered from Settings via `cleanup_old_data`, with the day count limited to
  `1–365`;
- Deletes canonical records (metric, daily, sleep, workout and so on) outside
  the window;
- Deletes old raw records no longer referenced by any canonical record;
- Does **not** delete the Windows Credential Manager token unless you separately
  press "clear credentials".

For a complete wipe, use the in-app actions first, then open the data folder,
check what remains, and handle it according to your own backup policy.

## Telemetry statement

ZeppBridge has no automatic product telemetry, usage statistics or background
crash reporting. Syncing, credential verification, web sign-in and the problem
reports you explicitly confirm do produce network traffic. The destinations are
limited to:

- the Zepp region service you configured, after host validation;
- the official Zepp / Huami pages the sign-in window visits;
- the ZeppBridge Cloudflare Pages Function, for voluntary problem reports;
- the app's own local Tauri IPC.

While ZeppBridge is running it can expose a read-only local API.
`GET /workouts/{id}/series` returns no authentication fields, but it can include
heart rate, cadence and precise GPS. Other local processes on the machine can
reach it, so only run software you trust. The listener stops when you quit the
tray process.

## Risks that remain before release

- The Windows installer can be Authenticode-signed with a local self-signed
  certificate (`CN=ZeppBridge Local`) so the publisher is identifiable, but that
  chain is not in the Windows trusted roots and SmartScreen may still warn. It
  is not EV/OV code signing and does not clear the bar for public distribution.
- The macOS build is unsigned — no Apple Developer ID and no notarisation. See
  the install section of the [README](../../README.md).
- The health database is plaintext by default.
- There is no system-level background service, no SBOM and no clean-VM
  evidence. Update checks happen only while the app process is running.
- There is no live sign-in evidence covering every region and account type.
- Real sleep stages, GPS/routes, training detail and HybridCharge have no
  redacted fixtures verifying them yet.

Engineering gates and the pre-release checklist are in the
[development guide](../development/development.md).
