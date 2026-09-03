# 命令行与 MCP

[English](cli-and-mcp.md)

`zeppbridge-cli` 和 `zeppbridge-mcp` 是桌面应用之外的两个出口，随每个 Release 以独立压缩包分发：需要它们的人不该被迫先装一个 GUI，装了 GUI 的人也不该被塞进两个用不到的程序。

两者都只是 [`zeppbridge-core`](architecture.zh-CN.md) 的适配层，读的是桌面应用同一个 `data/zepp.db`。

## 安装

从 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载对应平台的 `zeppbridge-tools-<版本>-<平台>.zip`，解压后核对 `SHA256SUMS.txt`。

把两个程序放到 ZeppBridge 可执行文件旁边，它们就会读同一个库。数据目录由 `paths.rs` 决定：

| 平台 | 数据目录 |
|---|---|
| Windows | `ZeppBridge.exe` 旁边的 `data\` |
| macOS | 可执行文件旁的 `data/`；在 `ZeppBridge.app` 里那个位置不可写，于是回退到 `~/Library/Application Support/com.zeppbridge.ZeppBridge/data` |
| Linux | 包管理器安装的（deb、rpm、Flatpak）用 `~/.local/share/zeppbridge/data`——那些前缀不属于这个程序；AppImage 和解包的 tarball 用可执行文件旁的 `data/` |
| 任何平台 | `$ZEPPBRIDGE_DATA_DIR` 设成绝对路径时覆盖以上全部 |

所有平台都不用 `%APPDATA%`。

这张表要按「每个可执行文件各自」来读，而不是按「这台机器」。两个工具是拿自己的位置去套这条规则的，所以把它们解压到一个自己的目录里——比如 `~/tools/`——解析出来的是 `~/tools/data`，那是一个全新的空库，不是应用一直在写的那个。表现出来就是：一句理直气壮的「本机还没有数据库」，而旁边那个应用明明有。

要让它们真的共用同一个库，有两条路：

```bash
# 放到应用数据目录旁边，让这条规则落到同一个位置上。
# 或者——更可靠的做法——直接把目录说出来：
ZEPPBRIDGE_DATA_DIR=~/.local/share/zeppbridge/data zeppbridge-cli status --json
```

在 macOS 和 Linux 上，直接指定是更好的习惯：那两个平台上应用的数据目录，通常离你想放两个命令行程序的地方很远。

`ZEPPBRIDGE_DATA_DIR` 是给「安装目录旁边」这句话没有意义的场合准备的：容器、systemd 单元、NAS 的任务计划。相对路径会被拒绝，而不是按工作目录展开——调度器的工作目录不是写单元文件的人能看见的东西。

Linux 上令牌从 Secret Service（GNOME Keyring / KWallet）读。无头机器上没有它，所以那里要用 `ZEPPBRIDGE_CREDENTIAL_STORE=file`，或者 `=env` 配合 `ZEPPBRIDGE_APP_TOKEN`——见 [Linux 指南](../guides/linux.zh-CN.md)。

**前提**：先用桌面应用连接账号并至少同步一次。命令行不做登录，MCP 不联网。

光把另一台机器的 `data/` 文件夹拷过来不够。数据库能搬，令牌搬不过来——它在
那台机器的凭据管理器 / 钥匙串 / Secret Service 里，从来不在文件里。所以拷过
来的文件夹是「元数据齐了、密钥没有」，命令行会以 `3` 退出，说凭据管理器里没
有这个账号的令牌。用上面两种凭据存储任选一种，或者在新机器的桌面应用里重新
登录一次都可以，
[跨平台搬库](../guides/linux.zh-CN.md#把已有的库从-windows-或-macos-搬过来)
把两条路都写了。

## zeppbridge-cli

无交互：不会提问、不会等按键、不会弹窗。所有需要人来决定的事（登录、授权、删数据）都不在这里做。

```bash
zeppbridge-cli status --json
zeppbridge-cli sync --mode incremental --json
zeppbridge-cli reprocess --json  # 用当前解析器重放本地报文
zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv --out january.csv
zeppbridge-cli contract          # 打印单位、时区、来源与缺失值的定义
zeppbridge-cli help
```

`--json` 的正文独占 stdout，人读的提示走 stderr，所以 `zeppbridge-cli export > a.csv` 拿到的是干净的文件。

人读的那一半是**英文**：命令行随安装包发给全世界的用户，而 issue #40 那位 Linux
用户撞上的正是一句他读不懂的中文提示。从共用内核冒上来的错误目前仍然是中文——
那些字符串散在几百处，桌面端靠错误码查本地文案、根本不显示它们；翻一半只会让
中英文混在同一句话里。`--json` 的字段名和退出码是契约，不受这件事影响。

拼错的开关一律报错而不是忽略——静默接受 `--form json` 会让脚本以为格式生效了。

### 解析器升级

派生记录——一次运动的类型、一晚的睡眠阶段、全天压力曲线——是报文第一次入库时由解析器产出的。规则改版之后，已经在库里的记录仍然是旧结果。只有把存下来的原始报文重放一遍，历史才会跟上；不重放，一个新增运动编号的版本只修好以后同步来的记录，此前那 199 条 `unknown:211` 一条都不会变——而来报这个问题的人恰恰是为历史记录来的。

桌面应用在启动时用后台线程做这件事。无头安装没有那次启动，所以：

| 命令 | 遇到旧库时做什么 |
|---|---|
| `sync` | 先重放，再同步。它是挂在定时器上的那条，所以无头用户什么都不用做。`--no-reprocess` 可以关掉。 |
| `status`、`export` | 只提示，不执行。一条平时毫秒级返回的命令，不能突然开始一次几分钟的写入。 |
| `reprocess` | 立刻重放。`--all` 重放全部报文，而不只是这次修订号变更需要的那些。 |

重放全程持有跨进程写锁，不联网，也不改写「上次云端同步」的时间——它有自己的时间线。放进定时任务是安全的：不加 `--all` 时，修订号一旦对上它什么都不做。

`status` 会报 `normalizerRevision`（库里记着的）、`normalizerRevisionExpected`（这个版本会产出的）和 `normalizerReplayPending`。前两者不相等，就是全部信号。

### 退出码

退出码是对调度脚本的契约，只会新增，不会改变含义。

| 码 | 含义 | 该怎么办 |
|---|---|---|
| 0 | 成功 | — |
| 1 | 其他失败 | 看错误消息 |
| 2 | 用法错误 | 改命令 |
| 3 | 未连接 Zepp 账号，或者令牌不在这台机器上 | 打开桌面应用登录，或设 `ZEPPBRIDGE_CREDENTIAL_STORE` |
| 4 | 另一个进程正在写库 | **稍后重试，这不是失败** |
| 5 | 云端请求失败 | 退避后重试 |
| 6 | 本机数据库错误 | 需要人介入 |
| 7 | 数据库版本与本程序不匹配 | 跑一次 `zeppbridge-cli reprocess`（或启动一次桌面应用）完成升级，或把命令行升到同一版本 |

4 和 1 分开，是因为「桌面应用正开着同步」和「真的出错了」需要完全不同的应对；把它们并成一个码，重试逻辑就没法写。

### Windows 任务计划程序

每天 07:00 增量同步，busy 时不当作失败：

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' `
  -Argument 'sync --mode incremental --json'
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
Register-ScheduledTask -TaskName 'ZeppBridge 每日同步' -Action $action -Trigger $trigger
```

把路径换成你自己的安装位置。任务计划程序会记录退出码；如果你在意 busy 与失败的区别，用一个包装脚本：

```powershell
& 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' sync --mode incremental --json
switch ($LASTEXITCODE) {
  0 { exit 0 }
  4 { Write-Host '桌面应用正在写库，跳过这一轮'; exit 0 }
  default { exit $LASTEXITCODE }
}
```

### cron（macOS / Linux）

```cron
# 每天 07:00 增量同步；退出码 4（另有进程在写）当作跳过而不是失败
0 7 * * * /path/to/zeppbridge-cli sync --mode incremental --json; s=$?; [ $s -eq 4 ] && s=0; exit $s
```

不要写成 `...; [ $? -eq 4 ] && exit 0`：同步成功时那个判断为假，整行退出码变成
1，于是每一次成功的同步都会被 cron 记成失败；真失败时退出码也会被压成 1，
上面那张退出码表就失去意义了。

macOS 下 cron 需要「完全磁盘访问权限」才能读到数据目录。

## zeppbridge-mcp

stdio 传输，**不监听任何端口，不发出任何网络请求**。只读由连接层保证（`PRAGMA query_only`），不是靠工具列表里恰好没有写操作。

### 配置示例

大多数 MCP 客户端读同一种形状的配置：

```json
{
  "mcpServers": {
    "zeppbridge": {
      "command": "/path/to/zeppbridge-mcp",
      "args": []
    }
  }
}
```

把 `command` 换成解压后的实际路径。**不需要任何 token、API key 或环境变量**——这个程序只读本机文件。

压缩包里的 `mcp-config-example.json` 是同一段内容。

### 工具

| 工具 | 返回 |
|---|---|
| `list_workouts` | 运动记录列表，最新在前。距离米、心率 bpm |
| `get_workout_insight` | 一次运动与个人基线的比较、基线窗口、样本数、置信度 |
| `get_metric_series` | 按天的指标序列，每条带 `unit` |
| `get_sleep_detail` | 一晚睡眠的明细，分期时长单位分钟 |
| `get_data_health` | 每条流的抓取/解析/写入状态与覆盖情况 |

`get_data_health` 值得单独说：它让模型能区分「这个问题查不到」是因为没同步，还是因为那段时间本来就没数据。

### 契约

握手时服务器就把边界交给调用方，不必等它拿到一条空序列自己猜：

- **时间**：全部 RFC 3339 带时区偏移。云端拉取时间与健康样本发生时间是两件事，任何情况下都不互相替代。
- **缺失值**：没有采样就是缺失，字段为 `null` 或整段不存在。**任何情况下都不会用 0、上一个值或估算值填空。** 一条曲线的点数少于时间跨度，说明那几天确实没有数据。
- **来源**：`source_scope` 说明记录来自哪一层——`device` 是某块表上报的，`user_fused` 是云端跨设备合成的，`unknown` 是无法判断的；`unknown` 不会被归并进 `device`。
- **不返回**：token、Cookie、完整账号、本机绝对路径。

`zeppbridge-cli contract` 打印的是同一份定义。

## 与桌面应用并发

CLI 的 `sync` 和桌面应用的同步走同一把跨进程写锁，任何时刻只有一个写者。拿不到锁时 CLI 以退出码 4 退出，不会和 GUI 抢着写。

MCP 的只读查询不拿写锁，可以和同步同时进行。
