# ZeppBridge 架构摘要

[English](architecture.md)

本文描述 v2.1.1 的产品边界与当前实现。使用入口见项目 [README](../../README.zh-CN.md)，工程门禁见 [开发文档](../development/development.zh-CN.md)。

## 产品边界

ZeppBridge 是本地存储的 Zepp 健康数据桌面应用，支持 Windows 与 macOS（Apple Silicon）；Windows 是主力验证平台，macOS 端由 CI 的 `macos-latest` job 保证编译、clippy 与测试通过：

```text
网页登录窗口 → 会话 cookie → 区域探测 → Credential Manager
Zepp 区域云端 → ZeppConnector → Raw provenance → Normalizer → SQLite
                                                              ↓
                                       ┌──────────────────────┼──────────────────────┐
                                  Tauri IPC             本机 REST              CLI / MCP
                                  Vue 界面          127.0.0.1:43921          stdio / 进程
```

健康数据默认只写入本机。同步时会访问用户已配置的 Zepp 区域服务；应用不自动融合不同设备来源，也不会为缺失的轨迹、曲线或指标生成估算值。

四个出口（桌面界面、本机 REST、CLI、MCP）都只是 `zeppbridge-core` 的适配层：数据模型、SQLite schema 与迁移、归一化、查询语义、导出、洞察和写入协调只在 core 里实现一次。单位、时区、来源和缺失值的定义集中在 `core::contract`——四个出口各自解释一遍「这个数字是什么单位」，迟早会给出四种说法，而用户没有办法判断哪一种是对的。

## 当前实现

### 连接、认证与同步

- 首次连接走应用内网页登录：独立 `zepp-login` 窗口打开 `watchface.zepp.com`（超时后备用 `user.huami.com`），只允许导航到 `zepp.com` / `huami.com` 的 HTTPS 页面。
- 后端轮询登录窗口 cookie，解析 `hm-user-login-info` 或 `userid` + `apptoken`，再在允许的区域 host 上用最近心率请求验证。
- 前端只调用 `start_web_login` / `cancel_web_login` / `get_login_status`，并监听 `login://status`。载荷为 `{ state, message, page_url, code }`。
- app token 存在平台凭据存储（Windows Credential Manager / macOS 钥匙串）；`auth.json` 只保留非敏感元数据。
- 已保存认证在应用重启后直接恢复为「已配置」；启动后会尝试 `verify_auth`。只有明确 401/403 或 `needs_reauth` 才要求重新连接。
- 首次/历史同步覆盖用户选择的 1–365 天（默认 30）；增量同步带 30 天重叠窗口（契约值 `zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`，经 `AppStatus.incremental_sync_days` 给界面用——别的地方不许再写死这个数字）。单例同步控制器统一顶部「立即同步」、设置页、启动同步、15 分钟自动检查、并发锁和页面刷新。
- 同步结果区分 `updated`、`no_new_data`、`partial`、`failed`；云端拉取时间与各数据流最新样本时间分别保存和显示。本地重解析不会改变云端同步时间。

### SQLite 与数据语义

- SQLite 启用 migration、WAL、foreign keys 和 busy timeout；raw payload 具备 hash、source key 与 canonical `raw_record_id` 回指。
- 跑步（Zepp `type=1`）在 history 摘要之后按 `trackid` + `source` 拉 `/v1/sport/run/detail.json`，差分解码后写入 `workout_samples` / `route_points` / `workout_pauses`。没有点就不画轨迹或曲线。
- metric/daily 唯一索引对空设备 ID 使用 `COALESCE`，避免 `NULL` 重复。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理由健康记录时间决定，并回收无引用 raw。
- `user_fused`、`device`、`unknown` 来源继续保留。来源不明确时不做静默融合。
- 编码但未验证的 `band_data` 只保留 raw；没有真实采样或路线时不绘制模拟曲线和地图。
- schema 版本为 `PRAGMA user_version = 16`。迁移步骤只能追加，已发布的 DDL 永不修改（`storage/migrations.rs`）。v10 给 `workout_samples` 加了跑步功率与跑姿列；v12 加了逐流三阶段 provenance；v13 加了未识别运动编号的用户命名与设备型号指认；v14 加了历史覆盖账本；v15 给 `raw_records` 加了压缩列 `payload_zip`（读的时候两种形态都认，明文行永远可读）；v16 给覆盖账本加了补拉尝试次数与失败码。派生列由 `NORMALIZER_REVISION` 变更触发的本地重放回填，不需要重新联网。
- 每次 schema 迁移之前自动生成一份一致性备份；备份或完整性校验失败时迁移不会继续。迁移本身在拿到跨进程写锁之后才开始。
- 重放期间 `storage::replay_in_progress()` 为真，此时发起的云端同步会以 `deferred` 结果让路并在一分钟后自动重试，而不是去抢 SQLite 写锁后报「本地数据库暂时不可用」。`busy_timeout` 同时从 5 秒提到 30 秒。

### 数据来源与健康状况

- 每条流的**抓取、解析、写入**三个阶段分别记录状态、最近一次成功时间和稳定的机器可读失败类别（`network` / `auth` / `not_available` / `unrecognized_payload` / `storage` / `busy` / `cancelled` / `unknown`）。分开记录是因为这三件事的修复动作完全不同：抓不到要查网络或重新连接，解析不了是我们的 normalizer 不认识那个结构，写不进去是本机的问题。
- 覆盖情况按流的节律解释，不压成一个统一的完整度百分比：连续/每日/每夜的流谈「缺口」，按事件/偶发的流谈「观察到的次数」。给偶发指标算完整度只会得到一个假的低分。
- 数据健康页（`/health-check`）展示上述事实，并提供可以直接执行的修复动作。

### 长期归档与完整历史

- 保留期（1–365 天）和历史补拉窗口（最长十年）是两个独立设置。开启长期归档后，成功同步不再按保留期清理历史。
- 完整历史补拉按自然月分块，逐块记进覆盖账本。每块只有四种结局：**已写入**、**云端明确无返回**、**待做**、**失败可重试**。可以暂停、取消、重启后继续；重复执行不产生重复记录。
- 界面刻意不把这四种状态压成一个进度条——压成进度条之后，「我 2023 年的数据到底有没有」就没有答案了。只有账本里每一块都有结论时，才允许说「本机完整副本」；否则措辞是「已成功同步范围内的本地副本」。
- 补拉范围超出保留期且未开启归档时直接拦下。刚补回来、下一次成功同步就被清掉，是最伤信任的行为。
- 占用估算按流实测：用本机已有报文长度除以观察到的天数。样本不足 7 天的流明确标注「样本不足、未计入」，不拿一个编出来的速率去乘三年。

### 备份与恢复

- 快照走 SQLite Backup API，不直接复制正在使用的 `zepp.db` / WAL / SHM。
- 每份快照带 manifest：创建时间、应用版本、schema 版本、normalizer revision、覆盖范围、各表记录数、字节数和 SHA-256。生成后立刻 `integrity_check`，校验不过就删掉半成品，不留一份「看起来能用」的坏备份。
- 迁移前自动生成的备份滚动保留 5 份，且从不删除手动生成或用户标记保留的快照。
- 恢复只能排队：文件替换在下次启动、任何数据库连接打开之前执行，那是唯一能做到原子替换的时刻。排队时就给出预览——快照里各表记录数与当前库的差值直接写出来。替换前先把当前库存成回滚点，任何一步失败自动回到原库。旧 schema 恢复后正向迁移，同 schema 直接恢复，更新的 schema 明确拒绝且不改动当前库。

### 跨进程写入协调

- 同步、历史补拉、schema 迁移、恢复、备份、重新解析和清理都要先拿到跨进程写锁，因此桌面应用和 CLI 不可能同时写同一个库。
- 锁由操作系统持有（Windows 独占共享模式打开文件，类 Unix `flock`），进程崩溃时内核自动释放，不存在「上次崩了、这次打不开库」这种需要人工删锁文件的故障模式。
- 只读查询不拿写锁：只读连接本来就写不了东西，让它们排队只会让 MCP 查询在一次长同步期间全部卡住。只读连接用 `PRAGMA query_only`，写入在 SQLite 层就被拒绝。

### 确定性洞察

- 跑后洞察与本地周报只产出**事实与证据**：与个人基线的比较、基线窗口的定义、样本数和置信度。后端不生成任何自然语言结论。
- 基线是这个人自己的历史，不是人群标准。样本不足时明确返回「证据不足」并说明原因，不为了凑出一句话而降低门槛。
- AI 负责解释这些事实，不负责改写它们。

### 桌面界面

- 主导航为概览、交给 AI（`/explore`）、数据健康（`/health-check`）、设置。顶栏提供连接状态与全局同步。
- 界面是**统一深色**：设计上不提供浅色 / 跟随系统模式，也没有主题切换入口。可调的只有界面缩放（80%–125%，设置「高级与维护」或 Ctrl + / Ctrl - / Ctrl 0）。
- 界面是**中英双语**。首次启动跟随系统语言（只有明确说中文的才给中文），设置页页头可以随时切换，选择存在 `localStorage['zeppbridge-locale']`。日期、星期和数字分组跟着语言走（`i18n/intlLocale()`），不只换文字。
  - **没有引 vue-i18n。** 量过：接上它（含运行时构建、一句文案都没翻）首屏 gzip 从 73.0 kB 涨到 91.6 kB，超出体积预算 7.6 kB。自建的那一层不到一屏代码，首屏只多 0.4 kB。
  - 文案跟着用它的模块走（`defineMessages(zh, en)` 就地定义，大页面放同名 `*.i18n.ts`），不建全局大字典：懒加载页面的 chunk 仍然只带自己那份。
  - `defineMessages` 用 `NoInfer` 把形状钉在中文那份上，英文漏键、多键、参数对不上都编译不过。
  - **后端不按 locale 出文案。** GUI / CLI / MCP / 导出四个出口对同一个问题必须给同一份回答，所以后端发稳定的码（`recordsUnitCode`、`HealthAction.code`、`SyncProgress.code`、`InsightFact.reason_code`…），中文原文一并保留给 CLI，界面按码自己出人话，认不出码时才回退到原文。导出 JSON 的 `note` / `detail_note` / `reason` 一个都不翻——它们是外部脚本读的契约。
  - CI 有一道 `npm run i18n:check`：界面里再出现硬编码中文就红。逐条豁免写在 `scripts/release/check-i18n.mjs` 的 ALLOWED 里。
- 概览按「最新心率 → 交给 AI 入口 → 最近睡眠/运动」组织；同步时间与心率样本时间明确分开。不在概览做恢复或训练分析。
- 睡眠与运动不进主导航。概览「查看全部」进入 `/sleep`、`/workouts`；单条详情为 `/sleep/:sleepId`、`/workouts/:workoutId`。
- 身体状态 `/body` 与训练状态 `/training` 同样是二级页面，由概览的两张入口卡片进入。两页都是纯展示：数据早已在本地库里，页面只负责按 7 天 / 1 个月 / 6 个月呈现，并如实说明「N 天里有 M 天有记录」，缺的那几天曲线直接断开，不做插值。
- 睡眠详情显示真实总时长、评分和四阶段比例；运动详情显示距离、热量、平均/最高心率、训练负荷与 VO₂max，只在距离和时长均有效时计算配速。跑步若已解码出轨迹或心率点则画折线，否则仍显示「未提供」。
- JSON 导出在 `/explore`（交给 AI）：选提示词模板、复制、保存文件、直接交接给白名单内的 AI 站点。设置页按编号分区展开连接、账户、设备、隐私、保留、导出偏好、本机 API、更新与自动同步；界面缩放、数据文件夹、清除认证和同步诊断收进底部「高级与维护」。
- 状态色含义为绿色成功、灰色中性、黄色需关注、红色失败。分类色只用于心率、睡眠、运动等数据类别标记。品牌强调色为低饱和橄榄绿 `#7DA33E`，不是系统蓝。完整色板与页面结构见 [UI 约束](../development/ui-guidelines.zh-CN.md)。

## 已验证与未验证

项目已用拥有者授权的账号完成同步和安装入口烟测，公开仓库只保留脱敏后的可复现工程证据，不保存账号、设备或个人健康样本。

当前证据仍不能外推：

- 所有 Zepp 区域、账号、设备与固件均兼容；
- 任意浏览器会话都能稳定给出可解析 cookie（需在真实账号上验证）；
- 跑步 detail 在所有区域/固件上都能返回可解码差分串；
- 走路、骑行等非 `type=1` 运动已有逐点采样；
- 安装包已签名、数据库已整库加密，或已达到公开发布门槛；
- **macOS 端已在真实设备上验收**：目前仅有 CI（`macos-latest`）的编译、clippy 与测试通过，以及贡献者本人在 M 芯片上的一次冒烟；仓库维护者没有 macOS 设备，无法独立复核同步、登录与钥匙串行为。

## Zepp 事件接口映射

Zepp 的事件接口有**三套互不等价的形态**，同一个 `eventType` 在不同形态下行为不同。把它们当成一个接口的变体，是 ZeppBridge 早期认定「本账号没有血氧」的直接原因——而 Zepp App 里明明有连续血氧记录。

| 形态 | 路径 | 时间参数 | 用途 |
|---|---|---|---|
| v2 | `/v2/users/me/events` | `from`/`to` 毫秒 | HRV、readiness、Charge（含压力）、呼吸率、皮温、血压、乳酸阈值 |
| user | `/users/{id}/events` | `from`/`to` 毫秒 | 血氧（**不带 subType 才是全量**）、`all_day_stress`、PAI |
| day | `/users/{id}/events/dateString` | ISO-8601 + `timeZone` | 夜间血氧 `odi` / `osa_event` |
| file | `/users/me/fileInfo/events` | `from`/`to` 毫秒 | 返回 COS 文件索引，不是样本本身 |

已确证的 `eventType`/`subType`（来源见 README 致谢，两个独立项目逐条一致）：

```
v2:    hrv_sdnn/real_data · HRVRMSSD/real_data · readiness/watch_score
       Charge/real_data · Charge/stress_data · Charge/insight_data
       DailyHealth/summary · RespiratoryRate/real_data · skinTemp/real_data
       blood_pressure/real_data · Emotion/real_data · LactateThreshold/summary
user:  blood_oxygen（不带 subType = 全量）· all_day_stress · PaiHealthInfo
day:   blood_oxygen/odi · blood_oxygen/osa_event
file:  second_heart_rate/real_data
```

`blood_oxygen` 全量流底下混着三种结构，按 `subType` 分流解析：`click`（点测读数）、`odi`（夜间汇总）、`osa_event`（疑似呼吸暂停）。只要 `click` 这个子集就会漏掉后两种——这正是早期误判「设备停止测血氧」的原因。

### 运动 detail 里已验证与未接入的字段

跑步 detail（`/v1/sport/run/detail.json`）带着大量差分串。判断标准不是「看起来像什么」，而是**能否和同一次运动的 summary 字段对上**——summary 自己带着 Zepp 算出来的均值/极值，是现成的对照组。

已验证并入库（`workout_samples`，schema v10）：

| 字段 | 语义 | 验证方式 |
|---|---|---|
| `power_meter` | 跑步功率，瓦特 | 序列均值 249.3 / 231.5 对上 summary `average_power` 249.0 / 231.0；最大值 326 / 303 对上 `max_power` |
| `runPosture` 第 1 项 | 触地时间，毫秒 | 均值 263.5 对上 `averageGct` 263，最小值 232 对上 `minGct` |
| `runPosture` 第 2 项 | 垂直振幅，毫米 | 均值 88.3 对上 `averageVo` 88，最大值 95 对上 `maxVo` |
| `runPosture` 第 3 项 | 垂直步幅比，0.1% | 均值 87.1 对上 `avgVertStrideRatio` 87；且 88 mm ÷ 1010 mm 步幅 = 8.7%，两个字段互证单位 |
| `equivPace` | 等效配速，秒/公里 | 最小值 264 对上 `bestEquivPace`；按距离加权均值（5428.6 s ÷ 15257 m = 355.8）对上 `avgEquivPace` 355 |

`runPosture` 的哨兵是 `65535`（前两项）与 `255`（第三项），一律转 `null`，不落库为 0。

`equivPace` 列按设备原样落库，读取时才过滤：运动员站着不动时设备照发读数，本账号库里出现过 51604 s/km（十四小时每公里）。读路径只接受 60–3600 s/km，和 `pace` 转分钟每公里用的是同一个窗口——真实库 98011 条里有 682 条（0.7%）落在窗口外。

**注意 `equivPace` 不是 `1/speed`。** 两者逐秒比对有三分之一的样本对不上，最佳偏移下仍有 32%–36% 偏差；它是 Zepp 自己的坡度校正配速，不能拿现有 `pace` 顶替，也不能拿它反推速度。

仍然只保留 raw、标 unverified：

- **`Charge/insight_data`（原 `charge_insight`）** — 曾被怀疑是「综合能量分」，**已排除**：同一天可以出现三条样本（`insight` 分别为 6 / 79 / 6），按 `type` 分成 3 与 7 两类，各带 `s`/`e` 毫秒偏移和 `jsonExtra.hcInsightId`。一个日度分数不会一天出现三个值。`insight`、`insightId`、`type` 的语义都没有对照组可验证，因此不归一化。
- **`Charge/stress_data`** — 已确认是 protobuf，正确解析后是 4 个 repeated float32（2880 / 255 / 8 / 6 个值），没有一组对得上 App 显示的日均与区间。也已经不需要它了：`all_day_stress` 的 `data` 字段里本来就带着当天整条曲线（五分钟一个点），而同一条记录上的日汇总正是从这条曲线算出来的——带这两个字段的 946 条记录里，服务器给的最低/最高值每一次都等于这条序列自己的最低/最高。压力界面和导出都读 `all_day_stress`，这条不接。
- **`second_heart_rate/real_data`** — `/users/me/fileInfo/events` 确认有数据，但返回的是 COS 文件索引而不是样本，取到逐秒心率还需要再下载文件。当前 host allow-list 只放行 `api-mifit*.zepp.com` / `huami.com`，COS 域名不在其中，接入等于放宽网络边界，未做。
- **8/16 之后的逐条血氧** — `blood_oxygen/click` 的点测在 2026-08-16 停止，之后只有 `odi` 夜间汇总，但 Zepp App 仍能画出连续曲线。已排除的方向：`/users/me/fileInfo/events`（同接口面 `second_heart_rate` 有数据、血氧没有，是有依据的否定）、`band_data` 的 8 字节块（只有模式/强度/步数/心率）、`blood_oxygen` 的 `auto` / `real_data` 子类型。**剩下的方向只有抓 Zepp App 的真实请求，而本项目明令禁止恢复 MITM / 用户 CA / Wi-Fi 代理路线**，所以这条到此为止。
- **未接的端点** — `/users/me/bloodPressure`、`/users/{id}/members/-1/weightRecords`、`/huami.health.getUserInfo.json`、`/v1/user/manualData.json`。
  - **血压与体重：明确不支持，也不计划支持。** 这是 2026-08-30 的产品决定，不是「证据不足、等 fixture 再说」——
    早先那版「拿到经过审计的脱敏 fixture 就接」的结论已经作废，不要据此重启接入。
    具体是：不请求 `/users/me/bloodPressure` 与 `weightRecords`，不归一化上面 v2 事件面里出现的血压 `eventType`，
    界面和文档不出现体重/血压的卡片、占位或「即将支持」字样。需要体脂秤与血压的用户请继续用 Zepp App 自己看。
  - `getUserInfo` / `manualData`：只有年龄/身高，而年龄**不能**用来估算心率区间（见下），因此不接。

### 心率区间：三种算法，一个都不预设

心率区间的基准不是估算出来的。工作区 summary 里有 `heart_range`（六组「秒数, 上界」）和 `heartrate_setting_type`，这就是手表自己用的边界：本账号 `heartrate_setting_type = 3`，边界 113/141/154/162/173/190，而 `lactateThresholdHr = 175`——正好是 floor(175 × 65/81/88/93/99/109%)。**向下取整、这组百分比、以及「五个区间 + 区间外」的分桶方式，都是这么对出来的，不是抄来的。**

| 算法 | 公式 | 区间百分比 |
|---|---|---|
| 最大心率区间 | 最大心率 × 百分比 | 50 / 60 / 70 / 80 / 90–100% |
| 储备心率区间 | 静息 +（最大 − 静息）× 百分比 | 50 / 60 / 70 / 80 / 90–100% |
| 乳酸阈值区间 | 乳酸阈值心率 × 百分比 | 65 / 81 / 88 / 93 / 99–109% |

可用基准全部取自本机实测，各自带出处与测量日期：`max(workouts.max_hr)`、`daily_metrics.device_max_hr`、`daily_metrics.device_resting_hr`、`avg(daily_metrics.resting_hr)` 近 30 天、`daily_metrics.lactate_threshold_hr`。

**禁止用 220−年龄 之类的公式估算**，也不预设默认算法：`/training` 的选择器初始为空，导出里 `selected_model` 为 `null` 并列出全部可算组合，`selected` 全为 `false`。选哪一种是用户的事。

### 能力探测为什么必须带对照组

`/v2/users/me/events` 对**任何** `eventType` 都返回 HTTP 200 与空列表，包括根本不存在的名字。因此「返回空」本身不构成任何证据。设置页的探测器固定跑两个对照：

- **正对照** `hrv_sdnn/real_data` — 已知有数据。它若为空，说明探测链路本身坏了（鉴权、时间窗、解析），其余结果一律不可信。
- **负对照** 一个不存在的流名 — 它若同样返回空，则「空」对任何候选流都不构成证据，界面必须显示「无法判断」，而不是「接口有响应但没数据」。

探测只读，不落库、不写日志、不读取任何测量值，只记录状态与字段名。

## 后续阶段

| 阶段 | 状态 |
| --- | --- |
| 账号同步、SQLite、桌面 Dashboard | 已完成受控安装版烟测 |
| 网页登录首次连接 | 电脑端链路已实现，真实账号登录按环境验证 |
| 本机只读 REST（`/health`、`/workouts/{id}/series`） | 已实现；默认关闭，启用后需 token |
| CLI（`status` / `sync` / `export` / `contract`） | 已实现，随 Release 提供版本化压缩包 |
| MCP（stdio，只读五个工具） | 已实现，随 Release 提供版本化压缩包 |
| 完整历史补拉、长期归档、覆盖账本 | 已实现 |
| 数据库快照与排队恢复 | 已实现 |
| 更多数据源 | 未开始 |
| macOS（Apple Silicon）桌面端 | 已合入（#1）；CI 有编译/测试门禁，Release 自 v0.9.2 起提供 dmg 与 updater 产物；ad-hoc 签名，无 Apple 公证 |
| 公开发布工程（签名、更新、SBOM、干净 VM） | 部分完成：updater 产物与 `latest.json` 已用 Tauri 密钥签名并经 GitHub Release 自动更新；安装包仍无 Authenticode 证书，也没有干净 VM 验收 |
