# ZeppBridge 架构摘要

本文描述 v0.10.0 的产品边界与当前实现。使用入口见项目 [README](../../README.md)，工程门禁见 [开发文档](../development/development.md)。

## 产品边界

ZeppBridge 是本地存储的 Zepp 健康数据桌面应用，支持 Windows 与 macOS（Apple Silicon）；Windows 是主力验证平台，macOS 端由 CI 的 `macos-latest` job 保证编译、clippy 与测试通过：

```text
网页登录窗口 → 会话 cookie → 区域探测 → Credential Manager
Zepp 区域云端 → ZeppConnector → Raw provenance → Normalizer → SQLite
                                                              ↓
                                                Tauri IPC → Vue 界面
```

健康数据默认只写入本机。同步时会访问用户已配置的 Zepp 区域服务；应用不自动融合不同设备来源，也不会为缺失的轨迹、曲线或指标生成估算值。本机 REST 已提供两个只读接口（`/health`、`/workouts/{id}/series`，仅绑定 `127.0.0.1:43921`）；MCP 仍是后续阶段。

## 当前实现

### 连接、认证与同步

- 首次连接走应用内网页登录：独立 `zepp-login` 窗口打开 `watchface.zepp.com`（超时后备用 `user.huami.com`），只允许导航到 `zepp.com` / `huami.com` 的 HTTPS 页面。
- 后端轮询登录窗口 cookie，解析 `hm-user-login-info` 或 `userid` + `apptoken`，再在允许的区域 host 上用最近心率请求验证。
- 前端只调用 `start_web_login` / `cancel_web_login` / `get_login_status`，并监听 `login://status`。载荷为 `{ state, message, page_url }`。
- app token 存在平台凭据存储（Windows Credential Manager / macOS 钥匙串）；`auth.json` 只保留非敏感元数据。
- 已保存认证在应用重启后直接恢复为「已配置」；启动后会尝试 `verify_auth`。只有明确 401/403 或 `needs_reauth` 才要求重新连接。
- 首次/历史同步覆盖用户选择的 1–365 天（默认 30）；增量同步带 7 天重叠窗口。单例同步控制器统一顶部「立即同步」、设置页、启动同步、15 分钟自动检查、并发锁和页面刷新。
- 同步结果区分 `updated`、`no_new_data`、`partial`、`failed`；云端拉取时间与各数据流最新样本时间分别保存和显示。本地重解析不会改变云端同步时间。

### SQLite 与数据语义

- SQLite 启用 migration、WAL、foreign keys 和 busy timeout；raw payload 具备 hash、source key 与 canonical `raw_record_id` 回指。
- 跑步（Zepp `type=1`）在 history 摘要之后按 `trackid` + `source` 拉 `/v1/sport/run/detail.json`，差分解码后写入 `workout_samples` / `route_points` / `workout_pauses`。没有点就不画轨迹或曲线。
- metric/daily 唯一索引对空设备 ID 使用 `COALESCE`，避免 `NULL` 重复。
- retention 可由用户在 1–365 天内选择，默认 365 天；清理由健康记录时间决定，并回收无引用 raw。
- `user_fused`、`device`、`unknown` 来源继续保留。来源不明确时不做静默融合。
- 编码但未验证的 `band_data` 只保留 raw；没有真实采样或路线时不绘制模拟曲线和地图。
- schema 版本为 `PRAGMA user_version = 10`。v10 给 `workout_samples` 加了跑步功率与跑姿列；这些列由 `NORMALIZER_REVISION` 变更触发的本地重放回填，不需要重新联网。
- 重放期间 `storage::replay_in_progress()` 为真，此时发起的云端同步会以 `deferred` 结果让路并在一分钟后自动重试，而不是去抢 SQLite 写锁后报「本地数据库暂时不可用」。`busy_timeout` 同时从 5 秒提到 30 秒。

### 桌面界面

- 主导航为概览、交给 AI（`/explore`）、设置。顶栏提供连接状态与全局同步。
- 界面是**统一深色**：设计上不提供浅色 / 跟随系统模式，也没有主题切换入口。可调的只有界面缩放（80%–125%，设置「高级与维护」或 Ctrl + / Ctrl - / Ctrl 0）。
- 概览按「最新心率 → 交给 AI 入口 → 最近睡眠/运动」组织；同步时间与心率样本时间明确分开。不在概览做恢复或训练分析。
- 睡眠与运动不进主导航。概览「查看全部」进入 `/sleep`、`/workouts`；单条详情为 `/sleep/:sleepId`、`/workouts/:workoutId`。
- 身体状态 `/body` 与训练状态 `/training` 同样是二级页面，由概览的两张入口卡片进入。两页都是纯展示：数据早已在本地库里，页面只负责按 7 天 / 1 个月 / 6 个月呈现，并如实说明「N 天里有 M 天有记录」，缺的那几天曲线直接断开，不做插值。
- 睡眠详情显示真实总时长、评分和四阶段比例；运动详情显示距离、热量、平均/最高心率、训练负荷与 VO₂max，只在距离和时长均有效时计算配速。跑步若已解码出轨迹或心率点则画折线，否则仍显示「未提供」。
- JSON 导出在 `/explore`（交给 AI）：选提示词模板、复制、保存文件、直接交接给白名单内的 AI 站点。设置页按编号分区展开连接、账户、设备、隐私、保留、导出偏好、本机 API、更新与自动同步；界面缩放、数据文件夹、清除认证和同步诊断收进底部「高级与维护」。
- 状态色含义为绿色成功、灰色中性、黄色需关注、红色失败。分类色只用于心率、睡眠、运动等数据类别标记。品牌强调色为低饱和橄榄绿 `#7DA33E`，不是系统蓝。完整色板与页面结构见 [UI 约束](../development/ui-guidelines.md)。

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
- **`Charge/stress_data`** — 已确认是 protobuf，正确解析后是 4 个 repeated float32（2880 / 255 / 8 / 6 个值），没有一组对得上 App 显示的日均与区间。日汇总走 `all_day_stress`（最低/最高与 App 完全一致），这条不接。
- **`second_heart_rate/real_data`** — `/users/me/fileInfo/events` 确认有数据，但返回的是 COS 文件索引而不是样本，取到逐秒心率还需要再下载文件。当前 host allow-list 只放行 `api-mifit*.zepp.com` / `huami.com`，COS 域名不在其中，接入等于放宽网络边界，未做。
- **8/16 之后的逐条血氧** — `blood_oxygen/click` 的点测在 2026-08-16 停止，之后只有 `odi` 夜间汇总，但 Zepp App 仍能画出连续曲线。已排除的方向：`/users/me/fileInfo/events`（同接口面 `second_heart_rate` 有数据、血氧没有，是有依据的否定）、`band_data` 的 8 字节块（只有模式/强度/步数/心率）、`blood_oxygen` 的 `auto` / `real_data` 子类型。**剩下的方向只有抓 Zepp App 的真实请求，而本项目明令禁止恢复 MITM / 用户 CA / Wi-Fi 代理路线**，所以这条到此为止。
- **未接的端点** — `/users/me/bloodPressure`、`/users/{id}/members/-1/weightRecords`、`/huami.health.getUserInfo.json`、`/v1/user/manualData.json`。血压与体重已由能力探测覆盖（账号近一年确无记录），`getUserInfo` 只有年龄/身高，而年龄**不能**用来估算心率区间（见下），因此都没有接入价值。

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
| 本机只读 REST（`/health`、`/workouts/{id}/series`） | 已实现 |
| MCP | 未开始 |
| 更多数据源 | 未开始 |
| macOS（Apple Silicon）桌面端 | 已合入（#1）；CI 有编译/测试门禁，Release 自 v0.9.2 起提供 dmg 与 updater 产物；ad-hoc 签名，无 Apple 公证 |
| 公开发布工程（签名、更新、SBOM、干净 VM） | 部分完成：updater 产物与 `latest.json` 已用 Tauri 密钥签名并经 GitHub Release 自动更新；安装包仍无 Authenticode 证书，也没有干净 VM 验收 |
