# Security policy · 安全策略

ZeppBridge keeps your Zepp sign-in and health data on your own computer. If you find a way that data could leak — credentials, tokens, raw health payloads, precise GPS, or the local REST API answering beyond `127.0.0.1` — please report it privately first.

ZeppBridge 把 Zepp 登录凭据和健康数据留在你自己的电脑上。如果你发现了会让这些数据外泄的问题（凭据、令牌、健康原始报文、精确 GPS，或本机 REST API 在 `127.0.0.1` 以外可访问），请先私下报告。

## How to report · 怎么报告

- Email **feedback@zeppbridge.com** with `[security]` in the subject. · 发邮件到 **feedback@zeppbridge.com**，标题带上 `[security]`。
- Include the ZeppBridge version, operating system, and the steps to reproduce. Leave out your own tokens, account details and health values; a description of where they appear is enough. · 写清楚 ZeppBridge 版本、操作系统和复现步骤。不要附上你自己的令牌、账号或健康数值，说明它们出现在哪里就够了。
- Please don't open a public issue for an unfixed vulnerability. · 漏洞修好之前请不要开公开 issue。

You should get a reply within a week. Fixes ship through the normal in-app update; the release notes will credit you unless you prefer otherwise.

一般一周内会回复。修复随正常的应用内更新发出，更新说明里会致谢（你不想署名也可以）。

## Supported versions · 支持的版本

Only the latest 3.x release receives fixes. 2.x is no longer maintained.

只修最新的 3.x 版本，2.x 已不再维护。

## Scope · 范围

In scope: the desktop app, `zeppbridge-cli`, `zeppbridge-mcp`, the local REST API, and the zeppbridge.com site and its `/api/*` functions.

Out of scope: Zepp's own apps and servers. Report those to Zepp.

范围内：桌面应用、`zeppbridge-cli`、`zeppbridge-mcp`、本机 REST API，以及 zeppbridge.com 网站和它的 `/api/*` 接口。范围外：Zepp 自己的应用和服务器，请直接报告给 Zepp。

See [security and privacy](docs/reference/security-and-privacy.md) for what ZeppBridge stores, where, and what it never sends.
