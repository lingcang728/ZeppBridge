# ZeppBridge 3.0 施工计划（v3 实验仓交接文档）

> **这是 v3 实验仓的内部工作文档，不是随产品发布的文档**，因此不需要英文对照版
> （`docs/` 下其余文档的 `*.zh-CN.md` 配对约定不适用于它）。
>
> 基线：`main@8dc9cb6` + 本仓库的 `22e2715`。核对日期 2026-09-05。

## 0. 接手前必读

本目录是 `MyProject\ZeppBridge` 的独立副本，**没有 git remote**（clone 后已
`git remote remove origin`），所以这里提不了 PR 也推不出去；要把修复带回主仓库
用 cherry-pick。其余隔离规则见 `CLAUDE.md` 顶部的「这是 v3 实验仓」一节，**动手前
先读那一节**，尤其是 cargo target 必须走 `pwsh scripts\v3-gates.ps1`。

**接入资料在仓库外**：那批 PDF、与官方对接人的聊天截图、第三方 guide 存放在用户
桌面的一个本地目录，**一律不得进入本仓库或任何 GitHub 仓库**，3.0.0 发布后删除。
需要引用时只写结论本身，不要贴原文、截图、审批信息或应用凭据。

## 1. 背景与已定决策

Zepp 开放平台主动邀请 ZeppBridge 注册为正式 partner。开发者身份、应用注册（Web
授权方式）、健康数据合作三项审批均已通过，后台「数据推送」已开启，授权回调地址已
填为本项目 Cloudflare Pages 上的 `/api/zepp/oauth/callback`。但仓库里
`functions/api/zepp/oauth/callback.js` 与 `functions/api/zepp/data/callback.js`
仍是占位实现（带参数一律 503，数据回调不读正文），**全部真实数据仍走非官方内部接口**。

用户已确认的四个决定：

| 决定 | 内容 |
|---|---|
| 数据源策略 | **官方为主，旧连接器降级为可选补充**——不是二选一，也不是纯替换 |
| 重构半径 | **前后端都重构** |
| 仓库形态 | clone 保留历史，删除 origin |
| 开发库 | 主仓库根 `data/` 的 74 MB 开发库副本 |

## 2. 官方接口的事实基础

以下每一条都在 2026-09-05 逐字核对过 `devopen.zepp.com` 官方文档。**引用这些结论
时不要再加工**；文档没写的一律记为「文档未说明」，不要推断。

### 授权与令牌
- 授权页 `https://user.zepp.com/oauth2/index.html#/login`，API base `https://api-open.zepp.com`
- 索要 refresh token 需带 `token=%5B%22access%22,%22refresh%22%5D`
- 交换：`POST https://auth.zepp.com/v2/oauth2/access_token`，form-urlencoded，
  **必须带 `client_secret`**；`expires_in` 示例 3600
- 刷新：`POST https://auth.zepp.com/v2/oauth2/refresh_token`，**必须带
  `Authorization: Bearer <access_token>`** + client_id + client_secret + grant_type
- **全站未提及 PKCE / code_verifier**

→ 结论：授权码流**无法**只在桌面端完成，服务端不可避免。

### 交付模型
- 三种：Ping-Pull（运动）、Push（健康）、异步 Backfill
- Webhook 正文是 **JSON 数组，每个元素是被序列化成字符串的 JSON**（双层解码）
- **新 partner 的 webhook 不要求签名 / HMAC**（Activity 与 authorizationChange 两页都明说）
- Activity 要求 30 秒内返回 2xx
- FIT 下载链接**一次性**、**24 小时过期**、**仍需用户 Bearer token**；过期返 410，
  **文档未给重新签发办法**
- Backfill 是 **GET**、单次 ≤ **30 天**（2,592,000 秒）、返 **202 Accepted**、
  **50 次/小时且作用域是「每个 partner application ID」**；**无完成通知、无状态查询**
- 撤权事件 `eventTime` 是**毫秒**，健康事件是**秒**

### 数据类型状态
| 类型 | 状态 | 要点 |
|---|---|---|
| Sleep | 正式 | 有 `remSleepInSeconds` / `naps` / `unmeasurableSleepInSeconds` / `validation` / `sleepLevelsMap`；`summaryId` **可为 null** |
| HRV | 正式 | 只有 `lastNightAvg`，**算法、单位、统计窗口全部未定义**；`hrvValues` 可为 null |
| Activity | 正式 | ping + FIT 下载；`summaryId` 作幂等键 |
| `/users/-/heartrates` | **Transitional** | 参数是**日期**不是时间戳；`type` = AUTO/MANUAL/ALL |
| `/users/-/body` | **Transitional** | **完全没标单位**，`muscleRate` 是 kg 还是 % 未知 |
| `/users/-/activities` | **Legacy，官方明确不推荐新接入** | 全天步数唯一的现成 pull 路径 |
| dailies / pulseOx / bodyComps / hybridCharge / nutrition / skinTemp | **全部标 `[Upcoming]`** | 未确认对本应用开通 |

### FIT
含 Session / Record(1 秒) / Event / Lap / **Length（游泳）** / **Set（力量）** /
TimeInZone / MaxMetData / `num_sessions`（多项目）。
**`zepp_coord_system`：0 = WGS-84，1 = GCJ-02。**
Developer fields 已确认：`hyrox_type`=40、`total_muscle_load`=81、
`total_cardiac_load`=82、`total_exertion_load`=83、`threshold_speed`=4（m/s）。

### 未证实，禁止当事实用
- `training_load_peak` 与 `threshold_heart_rate` 两个 developer field 在文档里**没找到**
- `hyrox_type` 总表是 40，专题指南可能是 41
- **本应用实际开通了哪些类型**
- **所有接口对真实账号的返回值——一条实测都没有**

## 3. 三个会改变产品形态的约束

1. **Backfill 限额是「每应用」50 次/小时，不是每用户。** 一个用户补一年历史
   ≈ `ceil(365/30) × 类型数`，六个类型就是 78 次 ≈ 占满全应用一个半小时。公开开源
   应用所有用户共用一个 App ID → **官方历史补拉无法作为自助功能开放**。这让双源成为
   长期形态，也让「用户自建接入服务」值得做成正经选项。
2. **没有签名校验，而撤权事件能触发破坏性动作。** 任何人知道回调 URL 就能 POST 一个
   `changeType: delete`。**红线：撤权事件绝不允许删除本地档案**，只能进入可恢复的暂停，
   并主动向 Zepp 反查确认。
3. **全天步数没有官方路径。** `dailies` 是 Upcoming，`/users/-/activities` 被官方标为
   不推荐，FIT 只含已记录的运动。概览步数卡和整个 `/activity` 页都靠它——
   **「官方成为默认」卡在一个跟 FIT 完全无关的地方。**

## 4. 数据差异

### 官方没有等价入口 → 只能靠旧连接器，**所以旧连接器不能删**
HRV(SDNN/RMSSD)、血氧 SpO₂ 与 ODI 与夜间评分与测量分钟、全天压力曲线、准备度、
能量 Charge、PAI、呼吸率、VO₂max、日度训练负荷、乳酸阈心率与配速。

即使六个 Upcoming 全部开通，仍然缺：`spo2_odi` / `spo2_night_score` /
`spo2_measured_minutes`（pulseOx 三个字段一个都没有）、`calories` 总热量与
`active_minutes`（dailies 只给 `activeKilocalories`）、以及 11 个体成分里的
`protein_rate` / `visceral_fat` / `bmr` / `body_balance_score` / `height`。

**三条禁令**：
- 官方 `hybridCharge` 是**用户手动记录的生活事件 + 主观负荷等级**，与 Charge 能量
  分数语义不同，**不能顶替**
- 官方 HRV `lastNightAvg` 算法未定义，**不许写进 SDNN 或 RMSSD 列**
- **禁止从稀疏 SpO₂ 反算 ODI**

### 官方更好 → 值得接
REM 睡眠真值（现有 `rem_stage_is_not_invented` 测试正是因为不敢编造）、小睡、
不可测时长、`validation` 可信度、FIT 的游泳 Length / 力量 Set / 多项目 / TimeInZone、
**显式坐标系标注**（现在差分解码后默认当 WGS-84 导出 GPX，是潜在错误）、
结构化逐条营养、以及正式 OAuth 带来的授权可持续性。

### 单位陷阱
官方 `bodyComps` 的 weight / boneMass / muscleMass 是**克**，百分比是 **0–100**；
而 `contract.rs` 里 `weight` / `muscle_mass` / `bone_mass` 都是 **kg**。适配层必须显式
换算。`body-data-pull` 那条路完全没标单位，**拿到实测样本前不得推断**。

## 5. 架构

```
Zepp ──push/ping──► 接入 Worker ──► 加密收件箱 ──领取──► 桌面 Rust 核心 ──► 本机 SQLite
                        │                                    │
                        └── 抢 24h 窗口下载 FIT              └── 落库成功才确认，云端随即删
旧连接器（可选补充）───────────────────────────────────────────┘
```

云端只做四件事：OAuth 与令牌、接收并持久登记推送、抢下 FIT、按游标交付。
**不做图表、不做分析、不做长期健康库。**

唯一的无服务器子集是 profile + `/users/-/heartrates` + `/users/-/body` 三个 pull
接口，能力太窄，只作为「隐私纯粹模式」备选。

**必须坦白的代价**：云端一旦接收他人健康数据，维护者即成为健康数据处理者
（GDPR 特殊类别数据）；中转服务宕机 24 小时 = 用户**永久**丢失那批 FIT。这两条都
指向「用户自建接入服务」值得认真做。

代码结构：`DataFetcher` 现在硬依赖具体类型 `ZeppConnector`，先抽 trait，再把现有
连接器封成 `LegacyZeppProvider`，新增 `OfficialZeppProvider`（内部分 Pull / Webhook /
FIT 三个入口），两者汇入同一归一化与查询核心。

## 6. 后端

**保留不动**（主分支花大代价换来的，重写性价比为负）：`contract.rs` 单一契约、
四出口适配器模式、`storage::write_lock` 跨进程写锁、备份与排队恢复、`provenance`
三阶段、`coverage` 账本骨架、`decoder` 差分解码（旧连接器仍需要）。

**schema v22**（`storage/migrations.rs` **只能追加**，已发布 DDL 永不修改）：
- `raw_records` / `metric_samples` / `daily_metrics` / `workouts` / `sleep_sessions`
  加 `provider TEXT NOT NULL DEFAULT 'legacy'`
- 重建唯一索引把 provider 并入键（沿用现有 `COALESCE(device_id,'')` 写法）
- 新表 `raw_objects`：原始 FIT 二进制 + sha256 + byte_len + received_at
  ——**不要 Base64 塞进 JSON**
- 新表 `delivery_receipts`：event_key / received_at / persisted_at / 游标；
  **本机写成功才确认领取**
- `sleep_sessions` 加可空列 `rem_seconds` / `nap_total_seconds` /
  `unmeasurable_seconds` / `validation`
- `coverage_ledger.status` 是 TEXT，**无需 DDL**，只加取值：`accepted` /
  `awaiting_delivery` / `partial_received` / `completion_unverified` / `expired`

**不要 bump `NORMALIZER_REVISION`。** 官方数据是新增的，没有历史可重放；误 bump 会让
每个老用户白等约 15 分钟重放。

**收紧完整性判定。** `coverage.rs` 里 `complete = total > 0 && completed == total`
在官方渠道下不成立——202、收到几条、等一会儿没消息，都不是完整证据。
**「完整本机副本」这个措辞在官方渠道暂时不能用。**

**锁与内存。** 现在同步在**联网前**就拿跨进程写锁，运动明细攒成 Vec 再落库；大量历史
FIT 会同时放大锁持有时间和内存峰值 → 拆成「获取/暂存」与「批量提交」，只在写库期间
占写锁，每个 FIT 校验完就写盘释放。

## 7. 前端

**保留**：深色单主题与全部 token（背景 `#131519` / 卡片 `#1D2026` / 品牌
`#7DA33E`）、路由懒加载、首屏预算（`bundle-budget.json`）、**手写 i18n
`defineMessages`**（vue-i18n 是实测后否决的：+18.6 kB、超预算 7.6 kB，**不要推翻**）、
四道 i18n 门禁。官方接入**不需要**改成 Zepp 官网的紫蓝渐变。

**重做**：
1. **数据状态成为一等公民**：五档——已申请 / 已到云端 / 正在转交 / 已存本机 /
   官方未提供。需要统一的类型贯穿 bridge → composable → 组件，且每档都带可执行动作
   （「查看授权范围」「等待 Zepp 交付」「重试本机处理」「已保留原有历史」）。
   缺失必须带动作，**不能全都显示「无数据」**。
2. **来源标签用文字，不用绿/红**——不能暗示哪个数据天然更对。状态色只表达任务状态。
3. **请求序号保护**：`BodyStatus.vue` 与 `TrainingStatus.vue` 的 load 在范围切换时没有
   序号守卫，快速切 7/30/180 天会让旧响应覆盖新范围。复用 `WorkoutDetail.vue` 已有的
   模式，抽成共享 composable。
4. **优雅降级**：`/body` 与 `/training` 在只有官方源时会大面积空——按「生理测量 /
   体成分 / 饮食」分组，整组为空时一句话说明原因，**不铺 Upcoming 占位卡**。
5. **bridge 分组**：95 个方法按域重组。**新增 command 仍要同时改四处**：
   `commands/` → `lib.rs` 的 `invoke_handler` → `lib/bridge/types.ts` →
   `tauri.ts` 与 `web.ts`（接口是全量的，漏一个 `npm run build` 就挂）。

## 8. 分批

| 批次 | 内容 | 完成标准 | 状态 |
|---|---|---|---|
| **B0 建仓** | clone、删 origin、补 ignored 目录、`npm ci`、独立 target、修文档漂移 | 全部门禁绿；主仓库不受影响 | **已完成**（`22e2715`） |
| **B1 本地 FIT 解码** | 用 `rustyfit` 解 Session/Record/Lap/Event/Length/Set/TimeInZone + developer fields；脱敏 fixture | 能从真实 FIT 还原出可与现有解码器比对的序列；未知 developer field 不导致已知字段全丢 | 下一步 |
| **B2 provider 抽象 + v22** | 抽 trait、封 `LegacyZeppProvider`、加 provider 维度、重建索引 | 开发库升级后历史、设备指认、自定义运动名全可读；不 bump normalizer revision | |
| **B3 云端最小闭环** | OAuth + 刷新 + 单安装实例绑定 + 推送持久收件箱 + 领取确认 | 一位测试用户：一条睡眠推送 + 一条 FIT 落本机；重复投递不重复计数；离线可补领 | |
| **B4 睡眠与运动接入** | 官方睡眠（REM/小睡/validation）+ FIT 导入；双源并列 | 同一天同一条记录，官方 / 旧源 / Zepp App 三方对照一致 | |
| **B5 前端重构** | 五档状态、来源标签、序号守卫、降级、bridge 分组 | 首屏预算不超；`i18n:check` 绿；快速切范围无旧响应覆盖 | |
| **B6 补拉与账本** | 30 天子请求拆分、新状态机、限额调度、过期重试 | 31 天月份、跨时区、包含式边界不重不漏；202 不当成完成 | |
| 独立后续 | Training Plan（**真写入**，独立模块，MCP 保持只读） | 权限、单位、清空语义经官方确认 | |

**排序理由**（改动排序前先读）：
- **B1 排在 B3 之前**：FIT 能不能解是整条官方运动链路的地基，而它不需要审批、不碰
  用户数据、不需要云端。若 `rustyfit` 对 Zepp 的 developer fields 支持不足，早知道能
  省掉后面全部返工。
- **B5 排在 B4 之后**：让界面重构面对已经跑通的真实双源数据，而不是想象中的形状。
  前后端同时大改是本项目最大的风险源。

## 9. 验收

Rust 四道门禁（**必须走脚本**，它会设置隔离的 target 目录）：

```powershell
pwsh scripts\v3-gates.ps1            # fmt / check / clippy -D warnings / test
pwsh scripts\v3-gates.ps1 -Frontend  # 顺带 build / test / i18n:check / version:check
```

`--workspace` 不能省：仓库是 cargo workspace（应用 + core + cli + mcp）。

其余：`npm run budget:check`（需先 build）。数据库改动对着 v3 自己的 `data/` 副本跑
升级与回滚，**任何情况下都不碰主仓库的 `release\data\`**（那是用户真实的 452 MB 库）。
`functions/` 下新增端点必须有「未启用时安全拒绝」的测试。

## 10. 待官方答复的问题

前 8 条会改架构，属于关键路径。

1. 本应用**实际已开通**哪些数据类型？六个 Upcoming 能否开通测试？
2. **50 次/小时能否提高或改成 per-user 作用域？**
3. 健康推送与撤权事件有没有**可用的来源校验**（可配置鉴权头 / 签名 / mTLS / 源 IP 段）？
4. `webhook.userId` 与 OAuth `user_id`、`profile.userId` 是否恒等？
   （Activity 示例是十六进制，profile 示例是数字串）
5. Backfill 有没有完成 / 空结果通知或 requestId 关联？
6. FIT 一次性链接下载中断或过期后**如何重新签发**？
7. 新 partner 还能不能用 Legacy `/users/-/activities`？否则全天步数没有官方路径。
8. 独立开源桌面应用能否在过渡期保留原有连接方式？**用户自建接入是否需各自申请 App？**
9. HRV `lastNightAvg` 的算法、单位、统计窗口？
10. 压力、准备度、Charge、PAI、呼吸率、血氧 ODI 与夜间评分、日度训练负荷、
    全天总热量与活动时长，官方有无对应接口或计划？
11. `body-data-pull` 各字段单位，特别是 `muscleRate` 是 kg 还是 %？
12. `training_load_peak` / `threshold_heart_rate` 是否存在？`hyrox_type` 是 40 还是 41？
