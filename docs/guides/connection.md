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

1. Open ZeppBridge and go to **Settings → Account and devices → Sign-in method**.
2. Click **Authorize** next to **Zepp account authorization**. Your default
   browser opens Zepp's own authorization page.
3. Sign in however you normally do and approve ZeppBridge.
4. The browser shows **Authorized**. Go back to ZeppBridge: it finishes
   connecting by itself within a few seconds. You can close the browser tab.

If clicking **Authorize** doesn't open a browser (this happens on some Linux
setups), ZeppBridge keeps waiting and moves **Copy authorization link** to the
front. Paste the link into your browser's address bar and approve there; the
app connects by itself, with no need to click **Authorize** again.

If the browser says you're authorized but ZeppBridge keeps **waiting for the
browser**:

- Click **Check now** on that row to check immediately instead of waiting.
- After a few failed attempts to reach `zeppbridge.com`, Settings says so and
  suggests what to check; when the main address is unreachable, ZeppBridge
  automatically tries the backup address `zeppbridge.pages.dev`.
- If it still fails, a proxy, firewall or company network is probably blocking
  those two domains. ZeppBridge uses your system proxy settings.

Signing in and refreshing the token go through our server, because Zepp
requires an app secret that can only live there. What it sees and keeps is in
the [FAQ](faq.md#relay).

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
| Heart rate, daily steps, PAI, weight | Official | Advanced data (more fields: training effect, max heart rate, body composition) |
| Workouts | Runs and walks only, with routes | Advanced data (every sport) |
| History older than your first sync | Not available | Advanced data (backfill) |
| HRV, SpO₂, stress, readiness, training load | Not available | Advanced data |

> HRV, SpO₂, stress, readiness and similar metrics are not in Zepp's official
> API at all, so they only come from the advanced data connection below.

## Advanced data: email or phone sign-in

This connection reads the data the official API does not offer. It signs in
inside a window embedded in the app, which third-party providers block — so it
works with a Zepp email or phone number and password, **not** with Google,
Apple, WeChat or Xiaomi sign-in.

The sign-in window says this at the top and hides the third-party buttons; if
you still end up on a third-party sign-in page, it blocks it and asks you to use
email or phone + password. If you sign in to a different
Zepp account than the one connected through **Zepp account authorization**,
ZeppBridge tells you it's another Zepp account and doesn't save it, so the two
accounts' data never mix.

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
once you type or click, ZeppBridge leaves it alone for the rest of the session. The whole
session times out after 15 minutes; **Retry** starts it again.

If you are signed in but ZeppBridge says it **could not read the credentials**,
web sign-in will not get any further no matter how many times you retry — use
the fallback below instead.

### 3. After that

Once the credential is saved, day-to-day syncing talks to your region's Zepp
service directly. Closing the window leaves the app in the tray; you do not sign
in again. When Zepp rejects the saved token, sync stops with *Sign-in expired —
reconnect to Zepp*; sign in again with **Use**. For the official authorization,
Settings shows **needs re-authorizing** and a **Re-authorize** button.

## Fallback: enter the credentials yourself

Use this when you already obtained the credentials through a legitimate route you
control. In **Settings → Account and devices → Sign-in method → Enter manually**,
fill in three fields:

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
| **Use** opens no window | That you are in the desktop app; whether antivirus or a window manager is blocking new windows | Restart the app and try again |
| Stuck on *waiting for sign-in* | Whether you actually completed sign-in in the pop-up | Cancel and retry, or use the manual-entry fallback |
| *Signed in, but the credentials could not be read* | Nothing — retrying web sign-in will not help | Use manual entry |
| *Credentials read, but the account region could not be confirmed* | Whether this network can reach the Zepp region APIs | Sign in again later or on another network, or use manual entry |
| *Zepp rejected these credentials* | Whether you signed in to the right account | Sign out in the sign-in window, then sign in again |
| *Can't reach the Zepp region service — retrying* | Nothing; the sign-in window stays open and ZeppBridge keeps trying until the session times out | Fix the network, or cancel and retry |
| *The token could not be saved to the system credential store* | Whether Windows Credential Manager, the macOS keychain or Linux Secret Service is disabled by a policy or not running | The message carries the underlying reason; use it to tell a disabled store apart from a token too long to save |
| Sign-in timed out | Whether more than 15 minutes passed | Click **Retry** |
| *Sign-in expired* / *needs re-authorizing* | Whether the token expired, or you just signed out | Sign in again, or **Re-authorize** |
| Sleep shows *unverified / unavailable* | `band_data` may be a compressed or encoded payload | Only the raw record is kept |
| Only part of a sync completes | The per-stream status in **Settings → Your data** | Retry when a core stream fails; an optional stream being unavailable does not mean other data is missing |

## Signing out and removing data

- **Settings → Account and devices → Sign out of Zepp → Log out** signs the
  advanced data connection out and deletes its token. The official
  authorization has its own **Disconnect**, which also revokes it at Zepp.
  Neither deletes health data.
- **Settings → Archive and storage → Keep data for** sets how long data is kept
  (30 days to **Forever**, one year by default). The manual **Prune by
  retention** is in **Advanced and maintenance → Maintenance** and cannot be
  undone.
- To remove everything, uninstall with **Delete the application data** ticked.
  This removes the `data\` folder next to the program, the tokens in the
  credential store, and anything an old 2.x install left in
  `%APPDATA%\zeppbridge\ZeppBridge`. Back up `data\` first if you may want it again.
- **One `data\` folder holds one Zepp account.** Signing in with another account
  is refused without writing anything. To switch, choose **Start over with
  another account** in the sign-in error: both connections sign out, `data\` is
  renamed to `data-before-<date>` (rename it back to return), and the app
  restarts with an empty library. Both connections must use the same account.
- **Don't create a new Zepp account or move your watch to another account to
  get this working.** Pairing a watch with a different account resets the
  watch's settings. If your Zepp account was created with Google, Apple or
  another service, signing in with the same email and a password is a different
  account to Zepp; use the official authorization.

Further boundaries are in [security and privacy](../reference/security-and-privacy.md).
