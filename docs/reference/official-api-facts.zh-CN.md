# Zepp 官方开放平台：接口事实

[English](official-api-facts.md)

ZeppBridge 的官方通道（「Zepp 授权」）和训练计划写入都建立在下面这些事实上。来源有两种：

- **官方文档**：2026-09-05 逐字核对 `devopen.zepp.com` 的开放平台文档。文档没写的一律记为「文档未说明」，不推断。
- **实测**：真实账号、手表和手机 Zepp App 上跑出来的结果。训练计划写入的逐条记录在 [`official-api-matrix.json`](../capabilities/official-api-matrix.json) 的 `training_plan_write.verified`。

代码以 `src-tauri/crates/core/src/official/`（授权、令牌、拉取）和 `src-tauri/crates/core/src/training_plan/`（计划写入）为准；本文与代码不一致时，以代码和测试为准，并回来改本文。

## 1. 官方文档里的事实

### 授权与令牌

- 授权页 `https://user.zepp.com/oauth2/index.html#/login`，API base `https://api-open.zepp.com`。
- 要拿 refresh token，授权请求需带 `token=%5B%22access%22,%22refresh%22%5D`。
- 换令牌：`POST https://auth.zepp.com/v2/oauth2/access_token`，form-urlencoded，**必须带 `client_secret`**；`expires_in` 示例为 3600。
- 刷新：`POST https://auth.zepp.com/v2/oauth2/refresh_token`，**必须带 `Authorization: Bearer <access_token>`**，外加 client_id、client_secret、grant_type。
- 全站未提及 PKCE / `code_verifier`。

结论：授权码流不能只在桌面端完成，必须有一个持有 `client_secret` 的服务端。ZeppBridge 用 Cloudflare 上的中转站补 secret，桌面端不带 App ID 和 App Secret（见[安全与隐私](security-and-privacy.zh-CN.md)）。

### 交付模型

- 文档列了三种：Ping-Pull（运动）、Push（健康数据）、异步 Backfill。
- Webhook 正文是 **JSON 数组，每个元素是序列化成字符串的 JSON**（要解两层）。
- 新 partner 的 webhook **不要求签名 / HMAC**（Activity 与 authorizationChange 两页都明说）。
- Activity 要求 30 秒内返回 2xx。
- FIT 下载链接**一次性**、**24 小时过期**、仍需用户的 Bearer token；过期返回 410，文档未给重新签发的办法。
- Backfill 是 **GET**，单次 ≤ **30 天**（2,592,000 秒），返回 **202 Accepted**，限额 **50 次/小时，作用域是每个 partner application ID**；没有完成通知，也没有状态查询。
- 撤权事件的 `eventTime` 是**毫秒**，健康事件是**秒**。

由此得出的两条约束：

1. **异步 Backfill API 全应用共用配额。** 六个类型补一年历史约需 78 次请求。按月覆盖账本走高级数据，官方历史数据走下文列出的普通查询接口。
2. **推送没有来源校验。** 任何人知道回调地址都能伪造事件。ZeppBridge 目前**不接收任何推送**：中转站的数据回调一律返回 503 `data_ingestion_not_enabled`，所有官方数据都由桌面端用 REST 轮询拉取。将来如果接收撤权事件，**撤权绝不删除本地档案**，只能进入可恢复的暂停，并主动向 Zepp 反查确认。

### 数据类型状态

| 类型 | 文档状态 | 要点 |
|---|---|---|
| Sleep | 正式 | 有 `remSleepInSeconds` / `naps` / `unmeasurableSleepInSeconds` / `validation` / `sleepLevelsMap`；`summaryId` 可为 null |
| HRV | 正式 | 只有 `lastNightAvg`，**算法、单位、统计窗口全部未定义**；`hrvValues` 可为 null |
| Activity | 正式 | ping + FIT 下载；`summaryId` 作幂等键 |
| `/users/-/heartrates` | Transitional | 参数是**日期**不是时间戳；`type` = AUTO / MANUAL / ALL |
| `/users/-/body` | Transitional | **完全没标单位**，`muscleRate` 是 kg 还是 % 未知 |
| `/users/-/activities` | Legacy，官方明确不推荐新接入 | 全天步数唯一现成的 pull 路径 |
| dailies / pulseOx / bodyComps / hybridCharge / nutrition / skinTemp | 全部标 `[Upcoming]` | 未确认对本应用开通 |

### FIT

含 Session / Record（1 秒）/ Event / Lap / **Length（游泳）** / **Set（力量）** / TimeInZone / MaxMetData / `num_sessions`（多项目）。

- **`zepp_coord_system`：0 = WGS-84，1 = GCJ-02。**
- 已确认的 developer field：`hyrox_type` = 40、`total_muscle_load` = 81、`total_cardiac_load` = 82、`total_exertion_load` = 83、`threshold_speed` = 4（m/s）。

### 未证实，不当事实用

- `training_load_peak` 与 `threshold_heart_rate` 两个 developer field 在文档里**没找到**。
- `hyrox_type` 在总表是 40，专题指南里可能是 41。
- 本应用实际开通了哪些 Upcoming 类型。

## 2. ZeppBridge 实际拉哪些

官方通道只做 REST 轮询，代码在 `official/fetch.rs`：

| 种类 | 接口 | 落进哪条流 |
|---|---|---|
| 睡眠 | `GET /users/-/sleep?interval=daily` | `sleep` |
| 逐分钟心率 | `GET /users/-/heartrates?type=ALL` | `heart_rate` |
| 每日活动 | `GET /users/-/activities?interval=daily` | `daily_summary` |
| 每小时活动 | `GET /users/-/activities?interval=hourly` | `daily_summary` |
| 运动列表 | `GET /users/-/sports` | `workouts` |
| 运动明细 | `GET /users/-/sportDetail?trackId=…`（返回 JSON，不是 FIT） | `workout_detail` |
| PAI | `GET /users/-/openData/PaiSummary` | `wellness` |
| 体重 | `GET /users/-/body` | `weight` |

- 每次请求最多 90 天，心率 7 天。长区间会被**静默截断**：一块返回的最后一天离请求结束日还差 7 天以上时，从断处再要一次（每块最多续 3 次）。
- 官方运动接口实测只回跑步、步行等少数类型；骑行、力量、球类等只有「高级数据」通道有。设备型号也只有高级数据的 `deviceSource` 能认。
- 两种模式（`sync/official.rs`）：
  - **只连官方**：上表全部走官方。
  - **两边都连**：旧通道照旧，官方只补睡眠和每小时步数。
- CLI 日常同步也采用这两种模式。`sleep-history` 调用官方睡眠接口查询指定日期范围，两端都含。详见 [CLI 与 MCP](cli-and-mcp.zh-CN.md#同步与历史)。
- 同一晚睡眠两边都有时显示官方的（多了小睡、REM 真值）。每小时步数以旧通道的逐分钟明细为主，官方的按小时汇总只补缺（`storage/hourly_steps.rs`）。
- 坐标系：用真实库里的国内路线叠 OSM 核对过，高级数据通道的轨迹本来就是 WGS-84，原样显示和导出；只有官方明细按 `zepp_coord_system` 处理（1 = GCJ-02 才换算）。

## 3. 数据差异

### 官方没有等价入口，只能靠「高级数据」

HRV（SDNN / RMSSD）、血氧 SpO₂ 与 ODI、夜间评分与测量分钟、全天压力曲线、准备度、能量 Charge、呼吸率、VO₂max、日度训练负荷、乳酸阈心率与配速。

即使六个 Upcoming 全部开通，仍然缺：`spo2_odi` / `spo2_night_score` / `spo2_measured_minutes`（pulseOx 一个都没有）、`calories` 总热量与 `active_minutes`（dailies 只给 `activeKilocalories`），以及 11 个体成分里的 `protein_rate` / `visceral_fat` / `bmr` / `body_balance_score` / `height`。

所以「高级数据」通道不能删，官方通道是它的补充，不是替代。

### 官方更好

REM 睡眠真值、小睡、不可测时长、`validation` 可信度、FIT 的游泳 Length / 力量 Set / 多项目 / TimeInZone、显式坐标系标注、结构化逐条营养，以及正式 OAuth 带来的授权可持续性。

### 单位陷阱

官方 `bodyComps` 的 weight / boneMass / muscleMass 是**克**，百分比是 **0–100**；而 `contract.rs` 里 `weight` / `muscle_mass` / `bone_mass` 都是 **kg**，适配层必须显式换算。`/users/-/body` 完全没标单位，拿到实测样本前不推断。

### 三条禁令

这三条是数据正确性规则，归一化代码（`normalizer/official.rs`）、指标说明（`src/lib/metricInfo/`）和 MCP 指南都照着守：

1. 官方 `hybridCharge` 是**用户手动记录的生活事件加主观负荷等级**，和 Charge 能量分数语义不同，**不能顶替 Charge**。
2. 官方 HRV `lastNightAvg`（及睡眠报文里的 `sleepHrv`）算法未定义，**不写进 SDNN 或 RMSSD 列**。
3. **不从稀疏 SpO₂ 反算 ODI。**

同样的思路也用于其他来源：分不清统计量的 HRV 不进 SDNN / RMSSD 列；缺失的不补 0；认不出的不猜。

## 4. 训练计划写入（2026-10-06 实测）

真账号、手表和手机 Zepp App 上的实测结论。代码以 `training_plan/mod.rs` 的 `VERIFIED` 为准。

- **只用 V2**（`POST /users/-/workouts`，`version=2.0.0`）。V1 不可用：目标显示成乱码、手机 Zepp App 点详情闪退、走路不显示；而且 V1 和 V2 共用同一个 7 天窗口，会互相覆盖。
- **`sport` 只认 4 个大类**：RUNNING / CYCLING / LAP_SWIMMING / OPEN_WATER_SWIMMING。其余值（WALKING、HIKING、TREADMILL……）被**逐条静默丢弃**，服务端照样回 success。这类活动界面照原样显示，但校验会阻断发布（`sport_not_deliverable`）。
- 越野跑、山地骑行作为跑步、骑行的子类型发出；力量的动作与组数发不过去。
- 手表上第三方计划**只到大类**，会让用户再选一次子类型；ZeppBridge 把「目的 · 子类型」写进描述第一行提醒用户（描述里的换行在手机和手表上都正确显示）。
- 单位：`DISTANCE` 是**米**（文档写秒是错的）；`PACE_LAP` 是**速度（米/秒）**，可带小数；`OPEN`（low = high = 0）表示不设目标。同一天两条、功率区间、重复组都能正确显示。
- 名字在手表列表里约 14 个汉字后截断（只提醒，不阻断）。
- **未来窗口可推**（startDate = 今天 + 7 等），不影响本周。手表本身只显示 7 天以内，后面的由 Zepp App 同步时陆续推到手表，所以发布时计划覆盖到的每个窗口都要推。
- **`workouts: []` 永远只清「今天起 7 天」**，与 startDate 无关。清未来窗口的做法是推「该窗口加一条日期在窗口前一天的占位训练」，再立刻重推前一个窗口把占位覆盖掉。这依赖服务端不校验越界日期的未定义行为，封装在 `training_plan::v2::clear_future_window` 一处。
- 没有读取已发布计划的 GET 接口，ZeppBridge 自己记一份发布账本。
- 用户在 Zepp App 里手建的计划不受推送影响。
