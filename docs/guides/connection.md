# ZeppBridge connection guide

There are three ways to connect: the in-app web sign-in, which is what you
should use, and two fallbacks for when that fails.

[简体中文](connection.zh-CN.md)

## Three things worth knowing first

- The sign-in window only ever opens official Zepp / Huami pages. You sign in to
  your own account, on their page.
- A token can read your health data. Never post a token, a full request header,
  a HAR file, or a screenshot of a signed-in session anywhere public — including
  GitHub issues.
- Credentials stay on this machine: the token goes into the OS credential store
  (Windows Credential Manager / macOS Keychain / Linux Secret Service), and
  `auth.json` keeps only metadata such as the user ID and region host. On a
  Linux machine with no keyring, see the
  [Linux guide](linux.md#where-the-token-is-stored) for the two alternatives.

## Recommended: in-app web sign-in

### 1. Start the connection

1. Open ZeppBridge and go to **Settings**.
2. Click **Connect**.
3. A separate window opens at `https://watchface.zepp.com/`.

### 2. Sign in

1. Sign in with your usual Zepp account.
2. The app reads the session credentials inside that window. The token is never
   shown in the interface.
   Every connection attempt uses an isolated browser session, so a previous
   Xiaomi, WeChat, Google or Facebook account cannot be selected from stale
   cookies. The session is discarded when the login window closes.
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
one of the two fallbacks below instead.

### 3. After that

Once the credential is saved, day-to-day syncing talks to your region's Zepp
service directly. Closing the window leaves the app in the tray; you do not sign
in again. Only a 401/403, or Settings showing **needs reconnecting**, means it is
time to reconnect.

## Fallback 1: HAR import

Use this when web sign-in does not work. A HAR file is a browser's export of the
network requests it made over some period, and it contains the credentials that
were sent after you signed in.

1. Sign in to Zepp on the web in your browser and let the page load real data.
2. Open developer tools (F12) → **Network**, tick *Preserve log*, and reload the
   page once.
3. Right-click in the request list → **Save all as HAR with content**, and save
   the `.har` file.
4. Back in ZeppBridge, go to Settings → authentication method → **HAR import**
   and pick that file.

The app reads only the requests to `api-mifit*` hosts, takes the token, user ID
and region host, and ignores everything else in the file. **Delete the HAR file
once the import succeeds** — it is equivalent to your account password.

## Fallback 2: enter the credentials yourself

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

Either way the token is written only to the OS credential store, and the full
token is never displayed.

**If you are not sure where a token came from, do not import it.**

## Troubleshooting

| What you see | Check first | If it still fails |
| --- | --- | --- |
| **Connect** opens no window | That you are in the desktop app; whether antivirus or a window manager is blocking new windows | Restart the app and try again |
| Stuck on *waiting for sign-in* | Whether you actually completed sign-in in the pop-up | Cancel and retry, or use one of the fallbacks below |
| *Signed in, but the credentials could not be read* | Nothing — retrying web sign-in will not help | Use HAR import or manual entry |
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

Further boundaries are in [security and privacy](../reference/security-and-privacy.md).
