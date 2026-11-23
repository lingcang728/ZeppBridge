# ZeppBridge 架构摘要

[English](architecture.md)

本文描述 v3.3.0-beta.1 的产品边界与当前实现。使用入口见项目 [README](../../README.zh-CN.md)，工程门禁见 [开发文档](../development/development.zh-CN.md)，各项能力的状态见 [能力成熟度](capability-maturity.zh-CN.md)。

## 产品边界

ZeppBridge 是把 Zepp 健康数据存到本机的桌面应用，提供 Windows（x64）、macOS（Apple Silicon）和 Linux（x86_64：deb、rpm、AppImage、Flatpak）版本，另有无界面的 CLI / MCP 工具包和 Docker 构建方式。Windows 是主要验证平台；macOS 与 Linux 是预览版，由 CI 的编译、clippy 和测试覆盖（见[能力成熟度](capability-maturity.zh-CN.md#平台)）。

```text
Zepp 官方授权 ──► 中转站（zeppbridge.com）──► api-open.zepp.com ─┐
高级数据：登录窗口 ─► 会话 Cookie ─► 区域探测 ─► api-mifit ────────┤
导入：GPX / FIT / Strava / Apple 健康 / unstrap ─────────────────┤
                                                                ▼
                                原始报文与来源 → 归一化 → SQLite
                                                                │
                                ┌──────────────────┬────────────┴─────┐
                           Tauri IPC          本机 REST           CLI / MCP
                           Vue 界面        127.0.0.1:43921      stdio / 进程
```

健康数据写在本机。同步经一条或两条通道访问 Zepp：**官方通道**（Zepp 开放平台 OAuth，见[官方接口事实](official-api-facts.zh-CN.md)）和**高级数据**通道（Zepp 账号自己的应用接口）。应用不自动融合不同设备来源，也不为缺失的路线、曲线或指标生成估算值。

四个出口（桌面界面、本机 REST、CLI、MCP）都是 `zeppbridge-core` 的适配层：数据模型、SQLite schema 与迁移、归一化、查询语义、导出、洞察和写入协调都只在 core 里实现一次。单位、时区、来源和缺失值的定义在 `core::contract`，这样每个出口对「这个数是什么单位」给出的都是同一个答案。

## 当前实现

### 连接、认证与同步

- **官方授权**在系统浏览器里打开 Zepp 授权页。Cloudflare 上的中转站在换令牌和刷新令牌时补上 App Secret；桌面端既不带 App ID 也不带 secret，令牌从中转站领取一次（`official/`）。官方通道只做 REST 轮询，ZeppBridge 不接收 Zepp 的任何推送。
- **高级数据**走应用内网页登录：单独的 `zepp-login` 窗口打开 `watchface.zepp.com`（超时后回退到 `user.huami.com`），只允许导航到 `zepp.com` / `huami.com` 的 HTTPS 页面。第三方登录主机（Google、Apple、微信、小米、Facebook、Amazfit 账号站）一律拦截，需要用账号的邮箱或手机号和密码登录。
- 后端轮询登录窗口的 Cookie，解析 `hm-user-login-info` 或 `userid` + `apptoken`，再用一次最近心率请求向允许的区域主机验证。
- 前端只调 `start_web_login` / `cancel_web_login` / `get_login_status`，监听 `login://status`，载荷为 `{ state, message, page_url, code }`。
- 令牌存进平台凭据存储：Windows 凭据管理器、macOS 钥匙串或 Linux Secret Service。macOS 和 Linux 可以显式改用文件存储；Linux（含容器）上高级数据的令牌也可以来自环境变量，见[凭据边界](security-and-privacy.zh-CN.md#凭据)。`auth.json` 只存不敏感的元数据。
- 保存过的凭据重启后直接恢复为「已配置」，启动时跑一次 `verify_auth`；只有明确的 401/403 或 `needs_reauth` 才需要重新连接。
- 历史补拉覆盖你选的 1–3650 天（默认 180）。增量同步带 30 天重叠窗口（`zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`，经 `AppStatus.incremental_sync_days` 交给界面）。自动同步每 15、30 或 60 分钟一次（默认 15），只重拉最近 `QUICK_SYNC_DAYS`（3）天；过去 `FULL_WINDOW_REFRESH_HOURS`（24）小时内没有完全成功的整窗同步时，回退到整窗。手动、启动、托盘和 CLI 同步总是整窗（`AppStatus.auto_sync_days` 告诉界面用哪种）。顶栏「立即同步」、设置、启动同步、自动同步、并发锁和页面刷新共用同一个同步控制器。
- 两条通道都连着时，高级数据照旧，官方通道补睡眠和每小时步数；只连官方授权时，官方能给的都从官方拿。见[官方接口事实 §2](official-api-facts.zh-CN.md#2-zeppbridge-实际拉哪些)。
- 同步结果分 `updated`、`no_new_data`、`partial`、`failed`。云端拉取时间与每条流的最新样本时间分开存、分开显示；本地重新解析不改云端同步时间。

### SQLite 与数据语义

- SQLite 开启迁移、WAL、外键和 30 秒 busy timeout。原始报文带哈希和来源键，规范行经 `raw_record_id` 指回原始报文；每行记着来自哪条通道（`provider`）。
- 跑步（Zepp `type=1`）在历史摘要之后按 `trackid` + `source` 拉 `/v1/sport/run/detail.json`，差分解码进 `workout_samples` / `route_points` / `workout_pauses`。没有点就不画轨迹和曲线。
- 指标 / 日值唯一索引对空设备 ID 用 `COALESCE`，避免 `NULL` 重复。
- 保留期可选 1–365 天，默认 365。清理按健康记录自己的时间戳，并回收不再被引用的原始行。新建的库默认开启长期归档，不自动清理。
- 保留 `user_fused`、`device`、`unknown` 来源；来源不明时不静默融合。
- 编码未验证的报文只存原始数据。`band_data` 里唯一解码的是核对过的逐分钟格式（1440 分钟 × 8 字节），从中读出每小时步数（`storage/hourly_steps.rs`）。没有真实样本或路线的地方不画模拟曲线或地图。
- 当前 schema 版本是 `PRAGMA user_version = CURRENT_SCHEMA_VERSION`（`storage/mod.rs`，目前是 52），迁移步骤在 `storage/migrations.rs`。派生列由 `NORMALIZER_REVISION` 变更触发的本地重放回填，不需要重新联网。主要节点：

  | 版本 | 改动 |
  | --- | --- |
  | v10–v16 | 跑步功率与跑姿、逐流来源记录、未识别运动编号的命名与设备指认、历史覆盖账本、原始报文压缩 |
  | v31、v34 | 两条通道的来源列与原始对象；官方睡眠 |
  | v35、v37 | 训练计划写入与多窗口推送 |
  | v36 | AI 往返记录；新库默认长期归档 |
  | v42–v45 | 本机日志数据：跑鞋、运动标注、伤病、比赛、个人纪录、信件、提示词历史 |
  | v46、v50、v51 | 导入（GPX、FIT、Strava 整包、Apple 健康；unstrap 备份） |
  | v47–v49 | 隐藏设备、小睡阶段、MCP 改动账本 |
  | v52 | 力量训练逐组明细 |

- 每次 schema 迁移前自动做一份一致性备份；备份或它的完整性检查失败，迁移就不进行。迁移本身拿到跨进程写锁后才开始。
- 重放进行中 `storage::replay_in_progress()` 为真，这时发起的云端同步会以 `deferred` 结果让开、一分钟后自动重试，不和重放抢 SQLite 写锁。

### 数据来源与数据健康

- 每条流分别记录**拉取、解析、写入**三个阶段，各有状态、最近成功时间和稳定的机器可读失败类别（`network` / `auth` / `not_available` / `unrecognized_payload` / `storage` / `busy` / `cancelled` / `unknown`）。分开记是因为修法完全不同：拉取失败查网络或重连，解析失败是归一化器不认识那种形状，写入失败是本机问题。
- 覆盖情况按每条流的节奏解释，不压成一个完整度百分比：连续 / 每日 / 每晚的流说「缺口」，按事件 / 偶发的流说「记到几次」。
- 数据健康页（`/health-check`）展示这些事实，并给出可以直接执行的修复动作。

### 长期归档与完整历史

- 保留期（1–365 天）和历史补拉窗口（最长十年）是两个独立设置。开启长期归档后，成功同步不再按保留期清理历史。
- 完整历史补拉走高级数据通道，按自然月切块，每块记进覆盖账本。每块的结局是五种之一：**待做**、**已写入**、**云端明确没有**、**部分**、**失败可重试**。可以暂停、取消，重启后继续；重复跑不会产生重复数据。
- 界面不把这些状态压成进度条。只有账本里每一块都有结论，才用「完整本机副本」这个说法；否则说「同步成功的那段范围的本机副本」。
- 关闭归档时，补拉范围超出保留期会被提前拦下，补回来的历史不会被下一次成功同步删掉。
- 体积估算按流实测：已存报文字节数除以观测天数。样本不足七天的流标「样本不足，不计入」。

### 备份与恢复

- 快照用 SQLite Backup API，不直接复制正在用的 `zepp.db` / WAL / SHM。
- 每份快照带清单：创建时间、应用版本、schema 版本、归一化修订号、覆盖范围、各表行数、字节数和 SHA-256。做完立即跑 `integrity_check`，检查失败就删掉半成品。
- 迁移前备份滚动保留五份；手动创建或用户固定的快照永不删除。
- 恢复只能排队：文件替换在下次启动、打开任何数据库连接之前进行。排队时给出预览，逐表写明快照和当前库的行数差异。先把当前库存成回滚点，任何一步失败都回到它。旧 schema 恢复后向前迁移，同 schema 直接恢复，更新的 schema 直接拒绝，不碰当前库。

### 跨进程写入协调

- 同步、历史补拉、schema 迁移、恢复、备份、重新解析、清理、CLI 编辑和 MCP 写工具都先拿跨进程写锁，桌面应用、CLI 和 MCP 不会同时写同一个库。
- 同步和历史补拉全程持有单独的**同步租约**（跨进程不会有两次同步重叠），写锁只在真正落库的那几段拿。它在等网络时，保存设置或日志条目照常进行；这类短写会等几秒同步的写入空档，而不是立刻失败。
- 锁由操作系统持有（Windows 用独占共享模式打开文件，类 Unix 用 `flock`），进程崩溃时内核会释放它，从来不需要手动删锁文件。
- 只读查询不拿写锁。只读连接用 `PRAGMA query_only`，写入在 SQLite 层就被拒绝。

### 确定性洞察

- 跑后洞察和本机周报只产出**事实与证据**：和你自己基线的对比、基线窗口的定义、样本数和可信度。后端不生成自然语言结论，也不给医学建议。
- 基线是这个人自己的历史，不是人群标准。样本不足时返回「证据不足」并说明原因。
- AI 客户端解读这些事实，不改写它们。

### 桌面界面

- 主导航是概览、交给 AI（`/ai`）和设置。顶栏放连接状态、全局同步和信件按钮。
- 主题：深色、浅色、跟随系统（设置 › 显示与语言）。界面缩放可调（80%–125%，也可以 Ctrl + / Ctrl - / Ctrl 0），界面特效也可调（自动 / 完整 / 低特效；自动 = 在 Linux、性能偏弱或电量低时用低特效）。
- 界面提供**十四个语言与地区选项**：简体中文、英文、西班牙语、荷兰语、巴西葡萄牙语、欧洲葡萄牙语、德语、俄语、印地语、法语、意大利语、波兰语、韩语、繁体中文。首次启动跟随第一个受支持的系统语言，否则用英文；设置里随时可换，选择存在 `localStorage['zeppbridge-locale']`。日期、星期名和数字分组也跟着语言走（`i18n/intlLocale()`）。
  - 中文、英文和西班牙语文案和所在模块放在一起（`defineMessages(zh, en, es?, moduleId?)`，大页面配一个 `*.i18n.ts`）。其余十一种用 `src/i18n/locales/<locale>.ts` 语言包，按需加载、按 `moduleId` 对应。缺的译文回落英文；繁体中文回落简体中文。
  - `defineMessages` 用 `NoInfer` 把形状钉在中文那一半上：英文少键、多键或参数对不上都编译不过。
  - **后端不按语言产出文案。** 四个出口（界面、CLI、MCP、导出）对同一个问题必须给出同样的回答，所以后端发稳定的码（`recordsUnitCode`、`HealthAction.code`、`SyncProgress.code`、`InsightFact.reason_code`、`err.*`、`ui.*` …），同时保留给 CLI 用的中文原文。界面按码渲染自己的文案，认不出码时才回落原文。导出 JSON 里的 `note` / `detail_note` / `reason` 字段永不翻译：它们是外部脚本读的契约。
  - i18n 检查怎么工作见[开发文档](../development/development.zh-CN.md)。
- 概览先放你固定的指标，再放首次启动时选的关注领域（心率、步数、睡眠、身体、训练）对应的模块，其余折起。同步时间和心率样本时间分开显示。
- 二级页从概览的卡片进入：`/recent`、`/heart`、`/activity`、`/sleep` 与 `/sleep/:sleepId`、`/workouts` 与 `/workouts/:workoutId`、身体状态 `/body`、训练状态 `/training`、`/rings`、`/devices/:deviceKey`、`/health-check`。日志（`/journal`：跑鞋、比赛、伤病、纪元与生活事件）、信匣（`/letters`）和 AI 相关页（`/ai/plan`、`/ai/memory`、任务记录）各有入口。这些页面都只渲染本机库里已有的数据，如实写「N 天里有 M 天有记录」；没有数据的日子曲线断开，不插值。
- 睡眠详情显示真实总时长、评分和分期占比；运动详情显示距离、热量、心率、训练负荷、分段，解出了路线就显示路线；距离和时长都有效时才算配速。
- 交给 AI（`/ai`）按分析任务打一份脱敏包，交给白名单里的 AI 网站。导出：`zeppbridge-cli export` 出 JSON / CSV / GPX / FIT，运动详情页也能出 FIT，设置里「带走全部」出一个 JSON，Beta 实验室出 unstrap 格式 zip，MCP 有 `export_data`。
- 设置是一叠十张卡：账号与设备、同步、归档与存储、数据内容、交给 AI 工具、显示与语言、Beta 实验室、新手引导、隐私与安全、高级与维护。
- 状态色：绿色成功、灰色中性、黄色需要注意、红色失败。类别色只用来标数据类别，比如心率、睡眠、运动。品牌强调色是橄榄绿 `#7DA33E`。完整色板和页面结构见 [UI 规范](../development/ui-guidelines.zh-CN.md)。

## 已验证与未验证

已经用维护者授权的账号完成同步和安装包冒烟测试。公开仓库只保留脱敏、可复现的工程证据：没有账号、设备或个人健康样本。

现有证据不能外推到：

- 兼容所有 Zepp 区域、账号、设备和固件；
- 任何浏览器会话都能稳定拿到可解析的 Cookie；
- 所有区域和固件的跑步明细都返回可解码的差分串；
- 每种运动类型都有逐点样本；
- 签名安装包或整库加密；
- macOS 与 Linux 真机：CI 在 `macos-latest` 和 Linux 上编译、lint、测试，但维护者没有 Mac，那边的同步、登录和钥匙串行为依赖贡献者的反馈。

## 高级数据事件接口对照

Zepp 的事件接口有几种互不等价的形态，同一个 `eventType` 在不同形态下表现不同。把它们当成同一个接口的变体会漏数据：比如只要血氧的一个子集，还在测的设备就看起来像不测了。

| 形态 | 路径 | 时间参数 | 用于 |
|---|---|---|---|
| v2 | `/v2/users/me/events` | `from`/`to`，毫秒 | HRV、准备度、Charge（含压力）、呼吸率、皮肤温度、血压（实验性）、乳酸阈、饮食 |
| user | `/users/{id}/events` | `from`/`to`，毫秒 | 血氧（**不带 subType 才是全集**）、`all_day_stress`、PAI |
| day | `/users/{id}/events/dateString` | ISO-8601 + `timeZone` | 夜间血氧 `odi` / `osa_event`；按日期的血压（实验性） |
| file | `/users/me/fileInfo/events` | `from`/`to`，毫秒 | 返回 COS 文件索引，不是样本 |

已确认的 `eventType`/`subType`（来源见 README 致谢；两个独立项目逐行一致）：

```
v2:    hrv_sdnn/real_data · HRVRMSSD/real_data · readiness/watch_score
       Charge/real_data · Charge/stress_data · Charge/insight_data
       DailyHealth/summary · RespiratoryRate/real_data · skinTemp/real_data
       blood_pressure/real_data · Emotion/real_data · LactateThreshold/summary
       Food
user:  blood_oxygen（不带 subType = 全集）· all_day_stress · PaiHealthInfo
day:   blood_oxygen/odi · blood_oxygen/osa_event
file:  second_heart_rate/real_data
```

完整的 `blood_oxygen` 流混着三种结构，按 `subType` 分：`click`（单次测量）、`odi`（夜间汇总）、`osa_event`（疑似呼吸暂停）。只有不带过滤的全集里三种都有。

体重记录来自 `/users/{id}/members/-1/weightRecords`，按 90 天分块拉；秤提供时最多归一化十一项体成分指标。血压是**实验性**的：在三种接口面上请求，有成对读数时归一化，但映射还没有在真正测血压的账号上核对过。

### 运动明细字段：已验证与未接入

跑步明细（`/v1/sport/run/detail.json`）带着很多差分串。一个字段只有当它的序列**和同一次运动的汇总字段对得上**才被采用：汇总里有 Zepp 自己算的均值和极值，是现成的对照组。已验证并存进 `workout_samples` 的：

| 字段 | 含义 | 对照的汇总字段 |
|---|---|---|
| `power_meter` | 跑步功率，瓦 | `average_power`、`max_power` |
| `runPosture` 第 1 项 | 触地时间，毫秒 | `averageGct`、`minGct` |
| `runPosture` 第 2 项 | 垂直振幅，毫米 | `averageVo`、`maxVo` |
| `runPosture` 第 3 项 | 垂直步幅比，0.1% | `avgVertStrideRatio`，并和「振幅 ÷ 步幅」互相印证 |
| `equivPace` | 等效配速，秒/公里 | `bestEquivPace`；按距离加权的均值对上 `avgEquivPace` |

`runPosture` 的哨兵值是 `65535`（前两项）和 `255`（第三项），都转成 `null`，从不存成 0。

`equivPace` 按设备发来的原样存，读的时候过滤：运动员站着不动时设备也照样出读数。读路径只接受 60–3600 秒/公里，和 `pace` 用的窗口相同。`equivPace` 不是 `1/速度`，它是 Zepp 自己的坡度修正配速，所以 `pace` 替代不了它，也不能从它推出速度。

仍只存原始数据的：

- **`Charge/insight_data`**：一天可能出现好几个值，按 `type` 分开；没有对照组可以核对含义，所以不做归一化。
- **`Charge/stress_data`**：protobuf，里面的浮点数组和应用显示的范围都对不上。压力页和导出改读 `all_day_stress`，它的 `data` 字段就是每五分钟一点的整天曲线。
- **`second_heart_rate/real_data`**：接口返回 COS 文件索引而不是样本。要拿文件就得把 COS 主机加进网络白名单，所以没接。
- **`/huami.health.getUserInfo.json`、`/v1/user/manualData.json`**：只有年龄和身高，而年龄不用来估算心率区间。

### 心率区间：三种算法，不预设

心率区间不靠估算。运动汇总里有 `heart_range`（六组「秒数，上界」）和 `heartrate_setting_type`，就是手表自己用的边界；下表里乳酸阈的百分比是对着这些边界、向下取整反推出来的。

| 算法 | 公式 | 区间百分比 |
|---|---|---|
| 最大心率区间 | 最大心率 × 百分比 | 50 / 60 / 70 / 80 / 90–100% |
| 储备心率区间 | 静息 + (最大 − 静息) × 百分比 | 50 / 60 / 70 / 80 / 90–100% |
| 乳酸阈区间 | 乳酸阈心率 × 百分比 | 65 / 81 / 88 / 93 / 99–109% |

每个可用的基准都在本机实测，各带来源和测量日期：`max(workouts.max_hr)`、`daily_metrics.device_max_hr`、`daily_metrics.device_resting_hr`、最近 30 天 `avg(daily_metrics.resting_hr)`、`daily_metrics.lactate_threshold_hr`。

不用 220 − 年龄这类年龄公式，也不预设算法：`/training` 上的选择器初始为空，导出里 `selected_model` 为 `null`、列出所有能算的组合、每个 `selected` 都是 `false`。用哪一种由用户决定。

### 能力探测为什么要对照组

`/v2/users/me/events` 对**任何** `eventType` 都返回 HTTP 200 加空列表，包括根本不存在的名字。所以「返回空」本身不是任何证据。探测器总是带两个对照：

- **正对照** `hrv_sdnn/real_data`，已知有数据。它也回空，说明探测链路本身坏了（认证、时间窗、解析），其余结果都不可信。
- **负对照**，一个不存在的流名。它也回空，「空」就不能作为任何候选流的证据，界面说「无法判断」。

探测只读：不存储、不记日志、不读取测量值，只记录状态和字段名。
