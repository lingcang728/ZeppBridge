# FAQ

[简体中文](faq.zh-CN.md)

- [Why does signing in go through zeppbridge.com?](#relay)
- [Why is some of my data missing?](#missing-data)
- [Does it work with the Helio Strap?](#helio)
- [Windows or my browser says the download is dangerous](#windows-warning)
- [Can AI read my data directly, without copy and paste?](#ai-direct)

<a id="relay"></a>

## Why does signing in go through zeppbridge.com?

Only the **Zepp authorization** (official API) does, and only for the sign-in
itself. Zepp's Open Platform hands out tokens only to a server that presents
the app secret, and it has no PKCE, the standard way for a desktop app to sign
in without a secret. An app secret shipped inside a desktop app is a secret
everyone can read, so that one step runs on our server
(`zeppbridge.com`, also reachable as `zeppbridge.pages.dev`, on Cloudflare).

What it keeps and what it doesn't:

- **Your health data never passes through it.** ZeppBridge downloads records
  straight from `api-open.zepp.com`.
- **Your tokens pass through once.** They wait encrypted until your ZeppBridge
  collects them, at most 10 minutes, and are deleted the moment it does. Only
  the ZeppBridge that started the sign-in can collect them: it proves this with
  a one-time secret that never appears in the browser.
- **Refreshing a token** later goes through the same server, which adds the app
  secret, passes the request to Zepp and keeps nothing.
- **What it keeps permanently:** the app ID and secret, plus a SHA-256 hash of
  each Zepp user ID that completed authorization, with no names or raw IDs.

The **advanced data** connection doesn't use our server at all: it talks to
Zepp directly. Full details: [Connecting your account](connection.md) and
[Security and privacy](../reference/security-and-privacy.md#zepp-account-authorization-official-api).

<a id="missing-data"></a>

## Why is some of my data missing?

ZeppBridge has two connections, and they don't return the same data.

| | Zepp authorization (official) | Advanced data |
|---|---|---|
| Heart rate, sleep, steps, PAI, weight | Yes | Yes |
| Workouts | Runs and walks | All types, including cycling and strength |
| HRV, blood oxygen, all-day stress, readiness, Charge, training load | No | Yes |
| Food logs, device identification | No | Yes |
| Backfilling older history | No | Yes |
| How you sign in | In your browser; Google, Apple, Xiaomi and others work | Zepp email or phone number + password only |

With the official authorization alone, everything in the right-hand column is
missing. That's a limit of what Zepp's official channel offers, not a
ZeppBridge bug. We've asked Zepp (Huami) to open more of it and haven't had a
reply.

**If you signed up for Zepp with Google, Apple or another third-party
account,** the advanced data connection can't use that sign-in. Set an email
or phone number and a password for your account in the Zepp app first, then
use those. Signing in with a different account than your official
authorization is flagged right away, so you won't end up with half of two
accounts.

The same explanation is in the app under **Settings › Account and devices › Why is some data
missing?**

<a id="helio"></a>

## Does it work with the Helio Strap?

Yes. ZeppBridge reads your Zepp account, not the device: whatever the Helio
Strap syncs to the Zepp app comes through like data from a watch. If you wear
it together with a watch, it shows up as a second device.

- **Device identification needs the advanced data connection.** With the
  official authorization alone, devices can't be identified and Settings says
  so; it doesn't mean the strap's data is missing.
- If a device still shows as **not identified** with advanced data connected,
  send a report from **Settings › Report a problem**. Once two different users report the
  same model number with nobody disagreeing, we add it.
- Which metrics you see depends on what the strap records and on the
  connection: HRV, for example, only comes through advanced data (see
  [above](#missing-data)).

<a id="windows-warning"></a>

## Windows or my browser says the download is dangerous

The Windows installers **aren't code-signed yet**. Every release is a new file
nobody has downloaded before, so Chrome and Edge flag it as uncommon or
dangerous, and Windows SmartScreen says "Windows protected your PC". We're
applying for free open-source code signing; until then:

- **Chrome:** open Downloads, and on the blocked file choose **Keep** (on some
  versions, **Download dangerous file**).
- **Edge:** in the download panel, **…** → **Keep** → **Show more** →
  **Keep anyway**.
- **SmartScreen:** **More info** → **Run anyway**.

Only download from [GitHub Releases](https://github.com/lingcang728/ZeppBridge/releases)
or [zeppbridge.com](https://zeppbridge.com/). To check the file, compare its
hash with `SHA256SUMS.txt` in the same release:

```powershell
Get-FileHash .\ZeppBridge-*-Windows-*.exe -Algorithm SHA256
```

Updates installed from inside the app are different: ZeppBridge verifies each
one against the release signing key before installing it.

macOS has its own first-launch steps: see
[macOS first launch](../../README.md#macos-first-launch).

<a id="ai-direct"></a>

## Can AI read my data directly, without copy and paste?

Two ways:

- **MCP.** In **Settings › AI tools**, one click connects Claude Desktop, Claude
  Code or Codex; other MCP clients take the config shown there. The AI then
  queries your local records itself; health data is read-only. ChatGPT can't
  use a local MCP server, so use hand-off for it. See
  [CLI and MCP](../reference/cli-and-mcp.md).
- **Automatic hand-off (Windows).** Turn on **Settings › AI tools › Hand off to AI
  automatically**: after you send, ZeppBridge opens the AI site, pastes the
  file and the opening line, and sends them. Press Esc at any time to stop.
  Without it, the file is on your clipboard: press Ctrl+V (⌘V on a Mac) in the
  chat box.
