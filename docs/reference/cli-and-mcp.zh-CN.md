# 命令行与 MCP

[English](cli-and-mcp.md)

`zeppbridge-cli` 和 `zeppbridge-mcp` 是桌面应用的两个配套工具。两者都只是
[`zeppbridge-core`](architecture.zh-CN.md) 的适配层，读的是桌面应用同一个 `data/zepp.db`。

## 安装

**装了桌面应用**：不用另装。Windows（安装包和便携版）在 `ZeppBridge.exe` 旁边，macOS 在
`ZeppBridge.app/Contents/MacOS/` 里，Linux 的 deb / rpm 在 `/usr/bin`。它们随应用一起升级，
**设置 › 交给 AI 工具**会显示两个程序的完整路径。

**没有桌面的机器**：从 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载
`zeppbridge-tools-<版本>-<平台>.zip`，解压后核对 `SHA256SUMS.txt`。

### 库在哪里

每个可执行文件按**自己的位置**解析数据目录：

| 平台 | 数据目录 |
|---|---|
| Windows | 可执行文件旁边的 `data\`；那里写不进去时（例如在 `C:\Program Files` 下）用 `%APPDATA%\zeppbridge\ZeppBridge\data` |
| macOS | 在 `ZeppBridge.app` 里：`~/Library/Application Support/com.zeppbridge.ZeppBridge/data`。不在包里：可执行文件旁边的 `data/`，写不进去时用同一个 Application Support 目录 |
| Linux | 在共享前缀下（`/usr`、`/bin`、`/sbin`、`/opt`、`/app`、`/snap`、`/nix/store`、`/var/lib/flatpak`）：`~/.local/share/zeppbridge/data`。其他位置（AppImage、解压在家目录的 tarball）：可执行文件旁边的 `data/` |
| Microsoft Store | 包自己的 LocalState 目录 |
| 任何平台 | `$ZEPPBRIDGE_DATA_DIR`（绝对路径）覆盖以上全部（商店版除外） |

所以把工具解压到一个自己的目录（比如 `~/tools/`），打开的是 `~/tools/data`——一个空库，
不是应用那个。要么放到应用旁边，要么直接指定目录：

```bash
ZEPPBRIDGE_DATA_DIR=~/.local/share/zeppbridge/data zeppbridge-cli status --json
```

### 凭据

**先用桌面应用连接账号并至少同步一次。** 命令行不做登录，它从系统凭据存储读令牌
（Windows 凭据管理器、macOS 钥匙串、Linux Secret Service）。无头 Linux 机器没有这些，
用 `ZEPPBRIDGE_CREDENTIAL_STORE=file`，或 `=env` 配合 `ZEPPBRIDGE_APP_TOKEN`——见
[Linux 指南](../guides/linux.zh-CN.md#令牌存在哪)。

从另一台机器拷来的 `data/` 只带库、不带令牌，命令行会以 `3` 退出。用上面任一种凭据存储，
或在新机器的桌面应用里重新登录一次；
[Linux 指南](../guides/linux.zh-CN.md#把已有的库从-windows-或-macos-搬过来)把两条路都写了。

## zeppbridge-cli

无交互：不提问、不等按键、不弹窗。登录、授权、删数据都不在这里做。

```bash
zeppbridge-cli status --json
zeppbridge-cli sync --mode incremental --json
zeppbridge-cli reprocess --json
zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv --out january.csv
zeppbridge-cli fit-override --workout 1787901817 --fit corrected.fit
zeppbridge-cli contract          # 单位、时区、来源与缺失值的定义
zeppbridge-cli version
zeppbridge-cli help
```

带 `--json` 时 stdout 只有正文，提示走 stderr。人读的输出是英文；共用内核的原话是中文时，
命令行改打它的错误码（如 `err.core.config`）。`--json` 的字段名和退出码是稳定契约。
拼错的开关一律报错，不会被忽略。

### 同步与历史

`sync --mode history --days N` 支持 1–3650 天。365 天以内用普通历史窗口，更长的范围用按月
覆盖账本，需要先在设置里开启长期归档（或保留期足够长）。`--max-chunks`（1–720，默认 24）
限制单次处理量；重跑同一条命令会续传，加 `--retry-failed` 重置耗尽重试的失败块。Ctrl+C
保留已完成的块并以 `8` 退出。JSON 报告含 `mode`、`cancelled`、`backfill` 和 `replay`；
`backfill.complete` 描述覆盖情况，云端确认无数据的月份也算覆盖。

### 运动明细、类型与隐藏

运动明细有自己的持久队列：

```bash
zeppbridge-cli workout-details --status --json
zeppbridge-cli workout-details --channel advanced --max-items 20 --json
zeppbridge-cli workout-details --channel official --max-items 20 --retry-failed --json
zeppbridge-cli set-type --workout ID1 --workout ID2 --type run --json
zeppbridge-cli set-type --workout ID1 --clear --json
zeppbridge-cli hide --workout ID1 --json
zeppbridge-cli hide --list --json
zeppbridge-cli restore --workout ID1 --json
zeppbridge-cli set-type --undo EDIT_ID --json
```

拉取必须指定通道并有该通道的凭据，每次 1–40 条（默认 20）。`--status` 只读、不联网，
可用 `--channel` 筛选，不能和 `--max-items`、`--retry-failed` 同用。重跑会续传；已写入和
云端确认无明细的不再请求，失败项退避，`--retry-failed` 只重置所选通道。所选通道还有待请求
或失败项时拉取以 `8` 退出；`--status` 查询成功就是 `0`。

`set-type`、`hide`、`restore` 对全部 `--workout` ID 原子生效并返回编辑 ID；三者都可用
`--undo EDIT_ID` 撤销整批，之后有冲突的修改时拒绝。类型用运动目录的 key，如 `run`；
`--clear` 去掉本机纠正。隐藏保留记录，但在恢复之前不进正常读取、统计和导出。两者都只作用于
这台机器的库。

### 导出

`export` 需要日期范围（`--from` 和 `--to`）或一个 `--workout`。选项：

- `--format json|csv|gpx|fit`（默认 `json`）；`fit` 要求 `--out` 指向目录。CSV、GPX、FIT
  一律导完整明细。
- `--types`（默认 `workouts,daily_activity,sleep`）；`zeppbridge-cli help` 列出全部十八种。
- `--detail summary|full`（默认 `summary`）。
- `--out <路径>`；不给就写到 stdout。

一次导出最多 366 天。

### 解析器升级

派生记录（运动类型、睡眠分期、压力曲线）在报文第一次入库时产出。解析器改版后，只有重放
已存的原始报文才会更新库里的旧记录。桌面应用在启动时重放；无头安装：

| 命令 | 遇到落后的库时 |
|---|---|
| `sync` | 先重放，再同步。`--no-reprocess` 跳过。 |
| `status`、`export` | 只提示，不执行。 |
| `reprocess` | 立刻重放。`--all` 重放全部报文。 |

重放持有写锁、不联网、不改「上次云端同步」时间。不加 `--all` 时，库已是最新就什么都不做。
`status` 报告 `normalizerRevision`、`normalizerRevisionExpected` 和 `normalizerReplayPending`。

### 用修正过的 .fit 顶替运动

桌面应用的**用修正的 .fit 替换**有脚本形式：

```bash
zeppbridge-cli fit-override --workout <id> --fit corrected.fit --json  # 顶替
zeppbridge-cli fit-override --workout <id> --remove --json             # 撤销，回到 Zepp 的数值
zeppbridge-cli fit-override --list --json                              # 这台电脑顶替过哪些
```

顶替只存在这台电脑的库里，Zepp 没有导入运动的接口。同步、`reprocess` 和重放都不会冲掉它，
快照也带上它。运动编号在每台机器上相同，有几份库就在每台上跑同一条命令。文件起点要和那次
运动相差 5 分钟以内（`errorKind: "fit_start_mismatch"`），运动要已在库里
（`workout_not_found`），两者都以 `1` 退出。撤销一条没顶替过的运动照样成功，返回
`"removed": false`。

### 跑鞋和比赛

```bash
zeppbridge-cli shoes list --json                   # 跑鞋、里程和磨损，外加还没添加的 Zepp 鞋编号
zeppbridge-cli shoes save --file shoe.json --json  # 新增；JSON 带 "id" 就是修改，返回编号
zeppbridge-cli shoes delete --id 3 --json
zeppbridge-cli races list --json
cat race.json | zeppbridge-cli races save --file - --json
zeppbridge-cli races delete --id 2 --json
```

`save` 收一个 JSON 对象，字段和桌面表单一样。跑鞋必填 `name`、`sport`（`running` /
`trail` / `walking` / `hiking`）、`retire_km`（100–5000）和 `started_on`（`YYYY-MM-DD`），
`is_default`、`zepp_gear_id`、`start_km`、`retired_on`、`notes` 可选。比赛必填 `name`、
`race_date`、`sport`（`running` / `trail` / `cycling` / `swimming` / `triathlon` / `other`）
和 `priority`（`a` / `b` / `c`），`distance_m`、`goal_seconds`、`result_seconds`、
`workout_id`、`notes` 可选。文件格式不对或值被拒收以 `2` 退出；删不存在的编号以 `1` 退出，
`errorKind: "not_found"`。MCP 的 `save_shoe` 和 `save_race` 写的是同一张表。

### serve 和 pull-token

`serve` 不开桌面应用、单独跑只读 REST API，给 Docker 和服务器用：`/health`、
`/workouts/{id}/series` 和 `/v1/records`。不设 `ZEPPBRIDGE_LISTEN` 就只听
`127.0.0.1:43921`；听本机以外的地址时没有拉取 token（`ZEPPBRIDGE_PULL_TOKEN`，或用
`pull-token rotate` 存一个）就拒绝启动。`pull-token status | show | rotate | revoke`
管理存着的那个，它和桌面端的本机 API token 是两把钥匙。请求和返回的契约见
[自托管拉取](../guides/self-hosted-pull.zh-CN.md)。

### probe

`probe` 检查候选端点有没有返回内容，不导入数据：`--streams`（默认 `blood_pressure`；
还有 `heart_rate`、`daily_summary`），`--days`（1–365，默认 7）。`--json` 只打印条数、
字段名和错误，从不打印读数。

### 退出码

退出码是给脚本的契约：只会新增，已有含义不变。

| 码 | 含义 | 该怎么办 |
|---|---|---|
| 0 | 成功 | — |
| 1 | 其他失败，包括本地数据不可用 | 看错误消息；查无本地运动时 `errorKind: "data_unavailable"` |
| 2 | 用法错误 | 改命令 |
| 3 | 未连接账号、令牌不在这台机器上、没有本地库，或库属于另一个账号 | 用桌面应用登录，或设 `ZEPPBRIDGE_CREDENTIAL_STORE` |
| 4 | 另一个进程正在写库 | **稍后重试，这不是失败** |
| 5 | 云端请求失败 | 退避后重试 |
| 6 | 本机数据库错误 | 需要人介入 |
| 7 | 数据库版本与本程序不匹配 | 跑 `zeppbridge-cli reprocess`（或启动一次桌面应用），或升级命令行 |
| 8 | 同步未完整成功：至少一个数据流失败 | 看逐流结果后重试；已写入的记录保留 |

同步未完整成功时 `--json` 仍输出完整报告，`ok` 和 `success` 为 `false`。`4` 和 `1` 分开，
重试脚本才能分清「桌面应用正在同步」和「出错了」。

### Windows 任务计划程序

每天 07:00 增量同步：

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\Program Files\ZeppBridge\zeppbridge-cli.exe' `
  -Argument 'sync --mode incremental --json'
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
Register-ScheduledTask -TaskName 'ZeppBridge 每日同步' -Action $action -Trigger $trigger
```

路径换成你自己的安装位置。想把「正忙」当成跳过而不是失败，包一层：

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
# 每天 07:00 增量同步；退出码 4（另有进程在写）当作跳过
0 7 * * * /path/to/zeppbridge-cli sync --mode incremental --json; s=$?; [ $s -eq 4 ] && s=0; exit $s
```

不要写成 `...; [ $? -eq 4 ] && exit 0`：同步成功时那个判断为假，整行以 `1` 退出。macOS 下
cron 需要「完全磁盘访问权限」才能读数据目录。

### 与桌面应用并发

CLI 的 `sync` 和桌面应用共用一把跨进程同步租约和一把写锁，任何时刻只有一个同步、一个写者。
等不到时（写锁最多等 20 秒）CLI 以 `4` 退出。

## zeppbridge-mcp

stdio 传输，**不监听任何端口**。只有被调用的工具需要时才联网：`sync_now` 启动随附的
`zeppbridge-cli`，`publish_training_plan` 把计划发给 Zepp。每行请求上限 1 MiB；格式错误或
超长的行收到错误，后续行照常处理。工具失败通过 `result` 返回 `isError: true`；未知工具和
结构错误是 JSON-RPC 错误。读走 `PRAGMA query_only` 连接；会写的工具在写锁下另开一条短连接
（最多等 5 秒），联网时不持锁。

### 从桌面应用连接

**设置 › 交给 AI 工具 › 连到本地 AI**会填好应用旁边那份 `zeppbridge-mcp` 的真实路径。生成的
配置读整个库；打开**只给共享任务**时加 `--scope task`，卡片还会标出仍按另一种设置登记的客户端。
预设：Claude Code、Codex、Claude Desktop、OpenCode、Grok Build、Factory，其余用通用
`mcpServers` JSON：

- **Claude Code** 和 **Codex**：复制注册服务、把本仓库加为插件市场、装上 `zepp-coach` 技能的
  命令（有旧登记挡路时先加一条 `mcp remove`），粘到终端运行。分隔符写成 `"--"`，因为
  PowerShell 会吞掉裸的 `--`。
- **Claude Desktop**：保存 `ZeppBridge.mcpb`，双击安装。它启动的是应用旁边那份
  `zeppbridge-mcp`，随 ZeppBridge 一起升级；安装器更新前会先关掉它，那份程序比应用旧时卡片会提醒。
- **OpenCode** 和 **Grok Build**：复制一行 `mcp add` 命令；**Factory**：复制一段
  `~/.factory/mcp.json`。

库不是可执行文件旁边的 `data` 时，配置还会设 `ZEPPBRIDGE_DATA_DIR`。没附带 sidecar 的开发构建里
这些按钮不可点。Linux 的 AppImage 每次启动都挂到新路径，应用不把这个路径交给 AI 工具：请用单独的
工具包和下面的配置。

### 配置示例

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

不需要 token 或 API key。库不在可执行文件旁边时加 `"env": {"ZEPPBRIDGE_DATA_DIR": "…"}`。
工具包里的 `mcp-config-example.json` 是同一段内容。

### 访问范围（`--scope`）

进程接受 `--scope` 和 `--version`（打印版本后退出）。其他一切——不认识的参数或值、缺值、
重复传参——都以 `2` 退出并写一行 stderr，拼错的参数绝不会放宽范围。

```json
{
  "mcpServers": {
    "zeppbridge": {
      "command": "/path/to/zeppbridge-mcp",
      "args": ["--scope", "task"]
    }
  }
}
```

- **`full-readonly`**（缺省）——整个本机库。健康数据只读；下面的写工具只改用户自己写的记录。
- **`task`**——只读，只看得到桌面任务页里标为「开放给 MCP」的内容：各任务按类别展开的日期窗口内
  的健康数据。任务里选的运动只有在任务启用了运动类别时才读得到本身，否则只用来定日期窗。任务里
  拿掉的指标和字段同样读不到。授权每次调用都重新读，翻转开关对下一次请求就生效。

`task` 范围下，授权外的请求会被拒绝，而不是悄悄截断：

- `list_workouts` 只回授权的运动；`get_workout_insight` 按它们重算基线。
- `get_metric_series`、`get_metric_records`、`list_sleep_sessions`、`get_sleep_detail` 只在授权
  窗口内回答（「最近一晚」指最近一个授权的晚上）。归不进任何任务类别的指标拒绝，任务排除的也拒绝。
- `get_workout_detail` 去掉被排除的字段和能算回它们的字段（排除心率时去掉心率区间，排除距离时
  去掉步幅）。`get_workout_series` 从不返回精确轨迹；任务排除了任一字段的运动，逐点各段一律拒绝。
- `get_food_data` 只回按天的摄入合计（归身体类），不给逐条记录。
- 整库视角的工具整体拒绝：`list_available_metrics`、`list_life_events`、`get_data_health`、
  `get_baselines`。
- 教练工具、所有写工具和两个动作整体拒绝。

没选运动的任务（「最近 N 天」）窗口截止到今天，和导出一致。多个任务同时开放时按并集放行。
`task` 范围的响应去掉 `device_id` 这类身份字段。

每个 `tools/call` 结果都带 `"scope": {"mode": ..., "grants": N}`，`initialize` /
`server/discover` 也报告当前范围。范围拒绝是工具结果，`structuredContent.error.code` 为
`err.mcp.scope_denied`（`error.permittedRanges` 列出可重试的 `{category, start, end}` 窗口）或
`err.mcp.scope_no_grants`（没有任何任务开放）。

### 工具

| 工具 | 返回 |
|---|---|
| `list_workouts` | 分页运动记录，最新在前。距离米、心率 bpm。`gearId` 是这次运动在 Zepp 里选的跑鞋编号，没选为 `null`；Zepp 不给跑鞋名称 |
| `get_workout_insight` | 一次运动与个人基线的比较、基线窗口、样本数、置信度 |
| `get_workout_detail` | 单次运动已保存的完整汇总字段、心率区间，以及力量训练汇总与逐组明细（有记录时）；用户拿修正过的 .fit 顶替过时，`localFitCorrection` 给出文件名、导入时间和云端原距离，否则为 `null` |
| `get_workout_series` | 分页运动采样、GPS 轨迹、暂停、分段和记圈，以及主要爬升 / 下降段（`section: "climbs"`，本机从逐点海拔识别）与力量训练逐组 / 容量（`section: "strength"`）；仅 `section: "route"` 返回精确坐标 |
| `get_metric_series` | 按天的指标序列，每条带 `unit` |
| `get_food_data` | 饮食记录和每日摄入：热量（kcal）、蛋白质、脂肪和碳水（g）；可选 `days`（默认 90，最多 1825） |
| `get_baselines` | 每项指标「你的常态」，只和自己比、不用人群常模：`recent` 是最新读数（3 天内）与之前 28 天中位数的比较和 90 天中间八成的常态带；`long_term` 是本机全部历史（最多十年）的中间八成、中位数、起始日期和逐年拆分（不满一年为 `null`） |
| `list_available_metrics` | 本机实际入库的指标，带来源、单位、记录数和日期范围 |
| `get_metric_records` | 分页读取任一已发现指标的每日值或逐次测量值 |
| `list_sleep_sessions` | 分页列出睡眠摘要和 ID |
| `get_sleep_detail` | 一晚睡眠的明细，分期时长单位分钟 |
| `list_life_events` | 指定日期窗口内的本机生活事件 |
| `get_data_health` | 每条流的抓取 / 解析 / 写入状态与覆盖情况。逐流解析计数把 `empty_response`（Zepp 对那段时间回了空列表：本来就没有，不是错误）和 `quarantined`（解析器读不懂的报文）分开 |
| `get_training_context` | 近期训练与恢复一次给齐（默认 28 天，最多 90）：按本地日对齐的每日表（准备度、静息心率及基线——取自睡眠汇总的 `rhr`，不是睡眠期间的平均心率——睡眠 HRV 及基线、压力、每日负荷、步数、睡眠与小睡）、每次运动摘要（配速 s/km、心率区间秒数、负荷、训练效果、手表 RPE 和用户自己的 `userRpe` 与酸痛部位）、距上次运动几天、已生效的计划和生活事件（`epoch: true` 是起了名的纪元，如「备战首马」） |
| `get_athlete_profile` | 最大心率（手表自报 / 近一年实测）、静息心率（睡眠汇总的 `rhr`）、手表的心率区间、乳酸阈值、VO₂max（手表估算）、身高体重、近 90 天跑步、用户写给 AI 的背景、教练笔记（`coachNotes`）和用户的履历（`journal`：本机算的 5K / 10K / 半马 / 全马 PB、还没好和最近好的伤病、带 A/B/C 优先级的将来比赛与比赛成绩、还在穿的跑鞋与里程、纪元） |
| `get_training_plan` | 训练计划账本：已生效的计划、每个 7 天窗口的送达状态、未发的草稿、是否允许 AI 直接发布 |
| `draft_training_plan` | **写**：校验并保存一份计划草稿（不发到手表）；没通过校验就不保存，原样返回问题 |
| `publish_training_plan` | **写**：把草稿发到 Zepp App 与手表；用户打开「允许 AI 直接发布训练计划」后才放行，永远不清空窗口 |
| `propose_coach_note` | **写**：记住一句关于用户的话（伤病、作息、偏好）。马上出现在 `get_athlete_profile` 里，并记进改动账本；用户拒绝或撤销过的同一句话不会再写进去 |
| `save_injury` | **写**：新增或修改一条伤病（部位、程度 1–3、开始日；好了就填 `endDate`） |
| `save_life_event` | **写**：新增或修改一条生活事件（类别、日期，`epoch` 表示起了名的纪元） |
| `save_race` | **写**：新增或修改一场比赛（日期、项目、距离 m、目标与成绩 s、A/B/C 优先级） |
| `save_shoe` | **写**：新增或修改一双鞋（用途、起始与退役里程 km；退役就填 `retiredOn`） |
| `annotate_workout` | **写**：一次运动里用户自己的 RPE（1–10）和酸痛部位；手表的 RPE 和选鞋不动 |
| `set_workout_type` | **写**：纠正运动类型，和桌面「改类型」同一条路径（云端原始记录不变） |
| `sync_now` | **动作**：启动旁边那份 `zeppbridge-cli`（`sync --json --no-reprocess`）从云端拉一次新数据；最多等 45 秒，没完就回 `running`、由 CLI 自己跑完。本机欠着重解析时回 `deferred`，命令行和库版本不一致时回 `schema_mismatch` |
| `export_data` | **动作**：把一段日子（最多 366 天，不含轨迹）的摘要写成 JSON，放进数据目录的 `exports`，只回相对这个目录的文件名 |

参数限制（分页大小、日期范围、分段名）见 `tools/list` 里各工具的 `inputSchema`。

用户在指标卡「?」浮层里关掉**参与分析**的指标，会从每个工具的返回里去掉（不分写法），返回里带
`excludedByUser`，说明这是用户的选择、不是缺数据。数据不删，用户自己的导出不受影响。

`get_food_data` 返回每日合计和已存的饮食明细（名称、描述、餐次、时间、上报重量、含纤维的营养
成分）。上报重量的单位未经验证。明细按时间倒序，`limit` 默认 200、最多 1000，带 `totalEntries`
和 `truncated`；`mealDetailsAvailable` 表示是否有明细。摄入热量和消耗热量是两回事。饮食随同步
进来（桌面应用、`zeppbridge-cli sync` 或 `sync_now`）。四个 `intake_*` 指标也能用
`get_metric_series` 读。

`get_metric_series` 对它不画的指标名静默跳过、不回序列；先调 `list_available_metrics`，
`daily_metrics`、`metric_samples` 里的任何指标（以及 `sleep_score`）用 `get_metric_records` 读。
没有工具返回原始云端报文。

`get_data_health` 让模型分清「没同步」和「那段时间本来就没数据」。

### 会写库的工具

云端来的健康数据始终只读。写工具只改用户自己写的记录，每次写入都记进改动账本（`mcp_writes`，
存改之前和改之后的样子）。用户在**设置 › 交给 AI 工具 › AI 最近的改动**里逐条撤销：新增的删掉，
修改的改回原样，撤销的教练笔记改成「拒绝」，AI 不能再写回来。之后又被改过的不回滚
（`err.mcp_writes.stale`）。**没有删除工具**：伤病好了填 `endDate`，跑鞋退役填 `retiredOn`。
修改时传 `id` 和要改的字段，校验沿用桌面端那一套。`sync_now` 和 `export_data` 是动作，不进账本。

`propose_coach_note` 写的教练笔记放在单独一张表，不碰健康数据表，马上以 `coachNotes` 出现在
`get_athlete_profile` 里，标明是哪个 MCP 客户端写的。用户能撤销、修改、删除和导出。

### 训练计划

- `draft_training_plan` 只存草稿，和桌面「粘贴 AI 的回复」同一套校验。只有跑步、骑行、泳池和
  公开水域能发到手表（Zepp 接口的限制：走路、徒步、力量、轮滑、越野滑雪会被拦下）。跑步还可写
  `trail`，骑行可写 `mountain`。训练目的和要点必填，步骤写法见工具说明。没通过校验不留草稿。
  草稿出现在桌面「交给 AI」页。
- `publish_training_plan` 在用户于**设置 › 交给 AI 工具**打开**允许 AI 直接发布训练计划**之前一律
  返回 `err.training_plan.ai_publish_disabled`。它在写锁内先记账，联网时放开写锁，再记结果。会清空
  某个 7 天窗口的发布一律返回 `err.training_plan.needs_clear_confirmation`，清空只能由用户在桌面确认。
- `sent` 只说明 Zepp 收下了请求（它对任何报文都回成功），内容发之前已经校验过。手表上开始训练前
  还要再选一次子类型。

### 说明书资源

服务发布 `zeppbridge://guide`（`resources/list` / `resources/read`，握手的 `instructions` 里
点了名）：工具清单、推荐顺序（先 `get_training_context`）、数据口径和怎么撤销。

### 契约

握手时服务器就交代边界，不让客户端从一条空序列去猜：

- **时间**：RFC 3339 带时区偏移。拉取时间和样本发生时间是两回事，任何时候都不互相替代。
- **缺失值**：没有采样就是 `null` 或整段不存在。**空缺从不用 0、上一个值或估算值填。**
- **来源**：`source_scope` 说明记录来自哪一层——`device`（某块手表）、`user_fused`（云端跨设备
  合成）、`unknown`。`unknown` 不会被并进 `device`。
- **不返回**：token、Cookie、完整账号标识、本机绝对路径。

`zeppbridge-cli contract` 打印的是同一份定义。
