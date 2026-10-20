# 常见问题

[English](faq.md)

- [为什么登录要经过 zeppbridge.com？](#relay)
- [为什么有些数据没有？](#missing-data)
- [Helio 表带能用吗？](#helio)
- [Windows 或浏览器说下载的文件危险](#windows-warning)
- [AI 能直接读我的数据吗，不用复制粘贴？](#ai-direct)

<a id="relay"></a>

## 为什么登录要经过 zeppbridge.com？

只有**官方授权**（Zepp 开放平台）这一步经过它，而且只在登录的那一下。Zepp 开放平台只把令牌发给能出示应用密钥（client_secret）的服务器，又不支持 PKCE（桌面应用不带密钥也能安全登录的标准做法）。密钥放进桌面程序等于公开，所以这一步只能放在我们的服务器上（`zeppbridge.com`，也可经 `zeppbridge.pages.dev` 访问，跑在 Cloudflare 上）。

它存什么、不存什么：

- **健康数据从不经过它。** ZeppBridge 直接从 `api-open.zepp.com` 下载记录。
- **令牌只经过一次。** 加密后等你的 ZeppBridge 来取，最多等 10 分钟，取走的那一刻就删除。只有发起这次登录的那个 ZeppBridge 取得走：它凭一个一次性密钥证明身份，这个密钥从不出现在浏览器里。
- **之后刷新令牌**也经过同一台服务器：它补上应用密钥、转给 Zepp，什么都不留。
- **长期保存的**只有应用 ID 和密钥，以及完成过授权的 Zepp 用户 ID 的 SHA-256 哈希，没有名字，也没有原始 ID。

**高级数据**连接完全不经过我们的服务器，直接连 Zepp。完整说明见[连接账号](connection.zh-CN.md)和[安全与隐私](../reference/security-and-privacy.zh-CN.md)。

<a id="missing-data"></a>

## 为什么有些数据没有？

ZeppBridge 有两条连接，能拿到的数据不一样。

| | 官方授权 | 高级数据 |
|---|---|---|
| 心率、睡眠、步数、PAI、体重 | 有 | 有 |
| 运动 | 跑步和步行 | 全部类型，包括骑行、力量 |
| HRV、血氧、全天压力、准备度、Charge、训练负荷 | 没有 | 有 |
| 饮食记录、设备识别 | 没有 | 有 |
| 补拉更早的历史 | 不能 | 能 |
| 怎么登录 | 在浏览器里授权，Google、Apple、小米等都能用 | 只能用 Zepp 邮箱 / 手机号 + 密码 |

只连官方授权时，右边那一栏都拿不到。这是官方渠道开放的权限不够，不是 ZeppBridge 出了问题。我们已向华米反馈，至今没有回复。

**如果你当初是用 Google、Apple 等第三方账号注册的 Zepp，**高级数据用不了那种登录方式。请先在 Zepp App 里给账号设置邮箱或手机号和密码，再用它登录。登录的账号和官方授权不是同一个时会马上提醒，不会出现两个账号各拿一半数据的情况。

应用里也有同样的说明：**设置 › 账号与设备 › 为什么有些数据没有？**

<a id="helio"></a>

## Helio 表带能用吗？

能。ZeppBridge 读的是你的 Zepp 账号，不是设备本身：Helio 表带同步到 Zepp App 里的数据，会像手表的数据一样进来。和手表一起戴时，它会显示成第二台设备。

- **设备识别需要高级数据连接。** 只连官方授权时设备认不出来，设置页会直接说明；这不代表表带的数据没进来。
- 连了高级数据仍显示**未识别**，请在**设置 › 反馈问题**里发一份报告。两位不同用户报告同一个型号编号、且没有人提出异议，我们就会收录。
- 能看到哪些指标取决于表带记录了什么，也取决于连接方式：比如 HRV 只有高级数据才有（见[上一条](#missing-data)）。

<a id="windows-warning"></a>

## Windows 或浏览器说下载的文件危险

Windows 安装包**还没有代码签名**。每一版都是一个没人下载过的新文件，所以 Chrome 和 Edge 会标成「不常见」或「危险」，Windows SmartScreen 会提示「Windows 已保护你的电脑」。我们正在申请免费的开源代码签名，在那之前：

- **Chrome：**打开「下载内容」，在被拦下的文件上选**保留**（有的版本叫**下载危险文件**）。
- **Edge：**在下载面板里点 **…** → **保留** → **显示更多** → **仍然保留**。
- **SmartScreen：**点**更多信息** → **仍要运行**。

只从 [GitHub Releases](https://github.com/lingcang728/ZeppBridge/releases) 或 [zeppbridge.com](https://zeppbridge.com/) 下载。想核对文件，可以把哈希和同一个发布里的 `SHA256SUMS.txt` 比一比：

```powershell
Get-FileHash .\ZeppBridge-*-Windows-*.exe -Algorithm SHA256
```

应用内的自动更新不一样：ZeppBridge 安装前会用发布签名密钥逐个校验。

macOS 首次打开另有步骤，见 [README 的 macOS 首次打开](../../README.zh-CN.md)。

<a id="ai-direct"></a>

## AI 能直接读我的数据吗，不用复制粘贴？

有两种办法：

- **MCP。** 在**设置 › 交给 AI 工具**里，一键接入 Claude Desktop、Claude Code 或 Codex；别的 MCP 客户端用那里给出的配置。之后 AI 会自己查询本机记录，健康数据只读。ChatGPT 接不了本机的 MCP，用「交给 AI」就好。详见 [CLI 与 MCP](../reference/cli-and-mcp.zh-CN.md)。
- **全自动交给 AI（Windows）。** 打开**设置 › 交给 AI 工具 › 全自动交给 AI**：交出去以后，ZeppBridge 会打开 AI 网站，替你粘贴文件和开场白并发送，随时按 Esc 停下。不开的话，文件已经在剪贴板里，在对话框里按 Ctrl+V（Mac 上 ⌘V）就行。
