# ZeppBridge connection guide

There are three ways to connect: **Zepp account authorization**, which is
what you should start with; the **advanced data connection**, which adds the
metrics Zepp's official API does not offer; and manual entry as a last resort.

[简体中文](connection.zh-CN.md)

## Three things worth knowing first

- Both sign-in paths only ever open official Zepp / Huami pages. You sign in
  to your own account, on their page.
- A token can read your health data. Never post a token, a full request header,
  a network capture, or a screenshot of a signed-in session anywhere public — including
  GitHub issues.
- Credentials stay on this machine: the token goes into the OS credential store
  (Windows Credential Manager / macOS Keychain / Linux Secret Service), and
  `auth.json` keeps only metadata such as the user ID and region host. On a
  Linux machine with no keyring, see the
  [Linux guide](linux.md#where-the-token-is-stored) for the two alternatives.

## Recommended: authorize with your Zepp account

This is the official Zepp Open Platform authorization. It runs in your normal
web browser, so **Google, Xiaomi, Facebook and Apple sign-in all work** — the
ones that never responded inside the old sign-in window.

1. Open ZeppBridge and go to **Settings → Account & devices → Sign-in**.
2. Click **Authorize** next to **Zepp account authorization**. Your default
   browser opens Zepp's own authorization page.
3. Sign in however you normally do and approve ZeppBridge.
4. The browser shows **Authorized**. Go back to ZeppBridge: it finishes
   connecting by itself within a few seconds. You can close the browser tab.

What passes through our server (`zeppbridge.pages.dev`, Cloudflare) and why:
Zepp requires a server-held app secret to turn the authorization into tokens,
so that one step happens there. The tokens are encrypted while they wait,
handed to your ZeppBridge exactly once, and deleted the moment it picks them
up — at most 10 minutes later. Your computer proves it started the request
with a one-time secret that never appears in the browser. Refreshing a token
later goes through the same server, which adds the app secret and keeps
nothing. See [security and privacy](../reference/security-and-privacy.md).

The tokens then live in the OS credential store, next to (but separate from)
the advanced-data token. **Disconnect** revokes the authorization at Zepp and
deletes the tokens from this computer; it never deletes health data.

What the Zepp authorization syncs depends on whether the advanced data
connection below is also set up. ZeppBridge takes each kind of data from
whichever side is richer:

| Data | Zepp authorization only | Both connected |
|---|---|---|
| Sleep | Official (includes naps and measured REM) | Official; the same night from the advanced connection is kept but not shown twice |
| Steps by hour | Official | Official (only the official API has it) |
| Heart rate, daily steps, workouts with routes, PAI, weight | Official | Advanced data (more fields: training load, training effect, max heart rate, body composition) |
| HRV, SpO₂, stress, readiness, training load | Not available | Advanced data |

> HRV, SpO₂, stress, readiness and similar metrics are not in Zepp's official
> API at all, so they only come from the advanced data connection below.

## Advanced data: email or phone sign-in

This connection reads the data the official API does not offer. It signs in
inside a window embedded in the app, which third-party providers block — so it
works with an email or phone number and password, **not** with Google, Xiaomi,
Facebook or Apple sign-in.

### 1. Start the connection

1. Open ZeppBridge and go to **Settings**.
2. Click **Use** next to **Advanced data connection**.
3. A separate window opens at `https://watchface.zepp.com/`.

### 2. Sign in

1. Sign in with your usual Zepp account.
2. The app reads the session credentials inside that window. The token is never
   shown in the interface.
   Every connection attempt uses an isolated browser session that is
   discarded when the login window closes.
3. The status line moves through **waiting → extracting → verifying → connected**.
4. Once verified the window closes and Settings refreshes. If this machine has
   no cloud-sync history yet, an incremental sync starts straight away.

ZeppBridge uses the region host returned by the signed-in page before trying
known fallback regions. A rejected credential and a temporarily unreachable
region are reported separately.

If the primary page is still untouched after about 90 seconds — nothing typed,
nothing clicked, and the window still on the page ZeppBridge opened — it switches
to the fallback page `https://user.huami.com/privacy2/index.html`. That switch is
for a page that never rendered, so it never happens while you are signing in:
once you type or click, or the window reaches a Xiaomi, Google, Facebook or
WeChat page, ZeppBridge leaves it alone for the rest of the session. The whole
session times out after 15 minutes; **Retry** starts it again.

If you are signed in but ZeppBridge says it **could not read the credentials**,
web sign-in will not get any further no matter how many times you retry — use
the fallback below instead.

### 3. After that

Once the credential is saved, day-to-day syncing talks to your region's Zepp
service directly. Closing the window leaves the app in the tray; you do not sign
in again. Only a 401/403, or Settings showing **needs reconnecting**, means it is
time to reconnect.

## Fallback: enter the credentials yourself

Use this when you already obtained the credentials through a legitimate route you
control. In Settings → authentication method → **Manual entry**, fill in three
fields:

| Field | What it is |
| --- | --- |
| App Token | The access credential issued after sign-in |
| User ID | Your numeric Zepp user ID |
| Region host | Looks like `https://api-mifit-us3.zepp.com`; mainland-China accounts use `api-mifit*.huami.com` |

The region host is accepted only as `https://api-mifit*.zepp.com` or
`https://api-mifit*.huami.com`, with no port, path, query, fragment or embedded
credentials. The connector enforces this, so a malformed value is rejected
outright rather than silently used.

The token is written only to the OS credential store, and the full
token is never displayed.

**If you are not sure where a token came from, do not import it.**

## Troubleshooting

| What you see | Check first | If it still fails |
| --- | --- | --- |
| **Connect** opens no window | That you are in the desktop app; whether antivirus or a window manager is blocking new windows | Restart the app and try again |
| Stuck on *waiting for sign-in* | Whether you actually completed sign-in in the pop-up | Cancel and retry, or use the manual-entry fallback |
| *Signed in, but the credentials could not be read* | Nothing — retrying web sign-in will not help | Use manual entry |
| *No Zepp region accepted the credentials* | Whether this network can reach the Zepp region APIs; whether sign-in really completed | Try another network or later; confirm the sign-in page was on zepp.com / huami.com |
| *Can't reach the Zepp region service — retrying* | Nothing; the sign-in window stays open and ZeppBridge keeps trying until the session times out | Fix the network, or cancel and retry |
| *The token could not be saved to the system credential store* | Whether Windows Credential Manager (or the macOS keychain) is disabled by a system policy | The message carries the underlying reason; use it to tell a disabled store apart from a token too long to save |
| Sign-in timed out | Whether more than 15 minutes passed | Click **Retry** |
| *Needs reconnecting* | Whether the token expired, or you just cleared the credentials | Run web sign-in again |
| Sleep shows *unverified / unavailable* | `band_data` may be a compressed or encoded payload | Only the raw record is kept; sleep stages are never fabricated |
| Only part of a sync completes | The per-stream status in Settings → Advanced & privacy | Retry when a core stream fails; an optional stream being unavailable does not mean other data is missing |

## Clearing credentials and local data

- **Clear credentials** cancels any in-flight web sign-in, deletes this user's
  token from the OS credential store, deletes the auth metadata, and resets the
  in-memory connection state. It does **not** delete your health database.
- Settings lets you keep 1–365 days locally (365 by default). Cleanup runs after
  a successful sync using that number; the manual **Clean up old data** uses the
  same number and cannot be undone.
- To remove everything, clear credentials in Settings first, then look at the
  `data\` folder next to the program. Back it up before deleting the install
  folder.
- **One `data\` folder holds one Zepp account.** The database remembers which
  account first wrote to it; signing in or authorizing with a different account
  afterwards is refused without writing anything, and existing data is never
  wiped automatically. To switch accounts, quit ZeppBridge, move or rename the
  `data\` folder (your old data stays in it), then start the program and
  connect again. The legacy connector and the official authorization must use
  the same account.

Further boundaries are in [security and privacy](../reference/security-and-privacy.md).
