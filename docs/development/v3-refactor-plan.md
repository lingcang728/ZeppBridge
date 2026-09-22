# ZeppBridge 3.0 全面重构初版方案

## Context

用户希望基于桌面公开信、官方 API 指导材料、用户反馈和仓库现状，先形成一份可审议的 v3.0.0 全面重构方案，覆盖官方/旧数据通道、Rust/Tauri 后端、Cloudflare 中转、SQLite 契约、Vue 前端、UI 视觉、性能、MCP/AI、FIT/GPS 和发布验收。当前目标是方案，不执行代码修改；所有关键产品取舍需由用户确认。

## 已确认的关键事实与边界

- 官方 API 是推送、Ping-Pull、异步 Backfill 的新交付模型，不是简单替换旧 URL；OAuth client secret 和 webhook 使服务端中转不可避免。
- 官方数据更规范但存在明确缺口；连续心率、详细 SDNN/RMSSD、压力、PAI、Charge、ODI、日训练负荷等不能凭空替代，因此采用官方为主、旧连接器可选补充的双通道策略，保留旧档案和能力。
- Webhook 无签名，撤权事件不能直接删除本地档案；身份绑定、限流、可恢复暂停和官方反查必须纳入安全设计。
- FIT 是官方运动链路的输入，需先脱敏 fixture/真实样本验证解码、单位、坐标系、暂停、多 session 和 developer fields。
- 官方 Backfill 有 30 天窗口、异步 202、应用级限额疑点且无明确完成信号；UI 和覆盖账本不得把申请或部分到达说成完整。
- 本地健康档案、归一化契约、写锁、备份恢复、provenance、CLI/MCP/REST 出口应复用并保持契约边界；官方新数据不能触发历史 normalizer replay。
- OSM 反馈应作为可选在线地图层：保留本地隐私轨迹，Leaflet 仅在运动详情动态加载，显示 attribution，不做整区离线地图或预下载。
- 官方接入资料位于仓库外，绝不能提交到仓库或 GitHub。

## 推荐实施路线

### B0：证据、决策和基线

1. 建立机器可读 capability matrix，分开文档状态、应用权限、真实样本验证、来源、delivery model、单位和时间。
2. 向 Zepp 先确认会改变架构的 P0 问题：实际开通类型、userId 映射、Webhook 来源校验、Backfill 完成/限额、FIT 重新签发、Legacy/Transitional 是否可用、地区端点、refresh 规则和历史保留。
3. 记录 ADR：双通道、云端职责和保留期、撤权语义、来源裁决、契约兼容策略、AI 写入权限边界。
4. 修正文档漂移，但只写已验证事实；不把审批截图或未实测样本当作上线能力。

### B1：本地 FIT 地基

1. 新增隔离的 FIT 解码模块，评估现有依赖的许可证、CRC/scale/offset/semicircle/压缩时间戳和动态 developer field 支持。
2. 逐步支持 Session、Record、Event、Lap、Length、Set、TimeInZone、MaxMetData、DeviceInfo 和多 session；未知扩展保留原始文件且不丢已知字段。
3. 建立脱敏 fixture 和 FIT→入库→导出回环/字段级对照测试；明确 WGS-84/GCJ-02 和跑步/骑行/游泳 cadence 语义。

### B2：Provider 抽象与数据库演进

1. 将 fetcher/sync 从具体 `ZeppConnector` 抽为 provider trait；现有连接器封装为 Legacy provider，新建 Official provider（OAuth/Pull、Webhook mailbox、FIT、Backfill）。
2. 追加 schema migration（不得改已发布 DDL）：记录 provider/account/channel、raw FIT objects、delivery receipts、official activity pings、backfill requests、睡眠扩展和版本/修订信息；唯一键和索引显式隔离来源与账号。
3. 采用业务键+payload hash 幂等，修订保留版本；不跨来源静默合并字段。默认显示官方但允许用户切换，导出/MCP 默认一条且提供 both/channel 选择。
4. 保持 `contract.rs` 为单一契约，新增官方夜间 HRV/LifeLoad 等独立语义，禁止把官方 HRV 填入 SDNN/RMSSD，禁止用 hybridCharge 替代 Charge，禁止从稀疏血氧反算 ODI。

### B3：云端官方最小闭环

1. 独立接入 Worker/Functions 与专用 D1/R2/队列边界，不复用反馈库权限；中转只负责 OAuth、token 刷新、Webhook 持久登记/加密、FIT 抢窗和短期 mailbox 交付，不做图表、分析或长期健康库。
2. 桌面生成安装实例密钥，OAuth state 与实例绑定；client secret 只在服务端；token/私钥进安全存储；采用签名请求、公钥加密收件箱、游标领取和“本机成功写入后 ack”。
3. Webhook 支持 text/plain 双层 JSON、混合用户批次、大小/类型/绑定/限流/幂等校验；无可靠来源证明时只能标记 unsigned，撤权进入可恢复暂停并反查。
4. FIT 下载严格验证官方允许的 HTTPS host/path/redirect，流式校验落盘，处理一次性 URL、过期、重试和 outbox 补偿；明文 payload/token 不进日志。

### B4：官方睡眠、运动、HRV 与双源交付

1. 先上线正式 Sleep、Activity FIT，再接 HRV 独立字段；逐流记录 received/downloaded/persisted 时间和 provenance。
2. 官方与旧源同存时可追溯、可切换、不重复统计；旧档案升级不覆盖、不归属到新账号。
3. Backfill 按 30 天子窗口和公平队列调度，状态为已申请/等待/部分到达/未证实完成/过期/失败；没有完成证据就不用“完整副本”。

### B5：前端、导航和体验

1. 保留品牌识别、路由懒加载、手写 i18n 和四道 i18n 门禁；将 `App.vue` 现有 token 演进为完整深浅双主题，覆盖图表、弹层、加载、错误与空状态。统一字体回退、字号、字重、行高、间距和动效，验证中英文、缩放、键盘操作和减少动态效果偏好。将官方连接、能力矩阵、来源标签、分层数据状态、mailbox/backfill 状态和错误动作贯穿 bridge→composable→view。用户此次明确决定取代 v3 原“仅深色”约束，实施时须同步更新相关规范。
2. 将桌面侧边主导航替换为顶部悬浮主导航，移除首页 Hero Page；重新安置连接状态、数据来源、账户、同步动作、隐私入口和版本信息。建立桌面、窄屏和移动端单一导航层级，完成滚动容器、键盘焦点、根元素缩放、Teleport 浮层、触控尺寸和减少动态效果验证，避免三套同级导航并存。
3. Overview 采用模块注册表和预设，未启用模块不 import、不发 IPC、不建图表；运动详情提供本地隐私轨迹与可选在线 OSM 地图两种视图，Leaflet 动态 import、Canvas 轨迹、销毁释放、明确隐私提示和 attribution。
4. 缺失状态必须区分未授权、未到达、未提供、无测量、解析失败和本机写入失败，并提供可执行动作；来源用文字，不用颜色暗示数据天然正确。
5. 复用 WorkoutDetail 的请求序号守卫模式，抽共享 composable，修正 Body/Training 快速切换旧响应覆盖问题；新增 command 同步修改 commands、invoke_handler、bridge types、tauri/web 两个实现。

### B6：性能与内存专项

1. 先建立冷启动、常驻托盘、页面切换、大库趋势、大 FIT、并发同步和堆内存基线，再按证据优化。
2. 同步拆成获取/暂存与短事务写入；FIT 流式解析、逐文件落库释放内存；网络阶段不持跨进程写锁；后端对图表做带缺口/峰值保真的降采样，导出保留全量。
3. ECharts 只在详情/可视区域创建，小卡优先 SVG，离路由销毁；大列表虚拟化；评估托盘驻留时销毁 WebView，但必须确认 Tauri 生命周期与同步行为后实施。
4. 继续隔离 v3 cargo target，守首屏 bundle budget，新增运行时/数据库/云端容量指标，不用未经测量的“不卡顿”承诺。

### B7：MCP/AI、文档与后续写入

1. 先稳定 canonical data model、来源/质量/单位/时间语义，再扩 MCP 只读查询：底层序列、跨活动比较、睡眠/训练关联、FIT/GPS 查询；AI 导出采用明确 allowlist，默认去除身份、精确 GPS、原始 FIT、token 和生活自述。
2. Training Plan 作为独立后续模块：本机草稿、完整七日预览、权限确认、明确发布/撤销/冲突记录；MCP 默认保持只读，AI 不能直接获得发布权限。
3. 同步更新 README、connection、data-availability、architecture、security/privacy、MCP 说明、用户授权与暂存保留期；删改过时的“数据绝不经过服务器”等承诺，说明 Cloudflare 元数据与实际保留策略。

## 已冻结的产品决策

以下决定由用户确认，作为 3.0.0 的正式产品边界：

1. **接受官方通道必须经过云端中转**，并在产品、README、隐私声明和连接流程中如实说明云端处理范围、临时保留、元数据和删除机制。
2. **桌面端改为顶部悬浮主导航**，移除现有桌面侧边主导航；首页去掉当前 Hero Page，直接进入更高信息密度、可配置的本地数据概览。主导航仍遵循三项信息架构：概览、交给 AI、设置；二级数据页面通过概览和上下文入口进入。
3. **完整引入深色与浅色两套主题**，同时系统性优化字体、字号、字重、行间距、排版层级、间距、动效、圆角、对比度和阅读舒适度。主题实现必须由统一 token 驱动，并分别完成可访问性对比度验收；不把颜色作为数据来源的唯一表达。
4. **纳入 OSM 在线地图**。采用懒加载、可替换 TileProvider、地图 attribution、轨迹绘制与本地数据分离、明确位置隐私提示；保留本地轨迹视图作为隐私/离线模式，不做整区批量预下载。
5. **MCP/AI 查询列为 3.0 核心交付**，建立在统一 canonical data model、来源、单位、质量和时间语义之上；MCP 继续保持只读，AI 导出继续使用明确 allowlist 和脱敏策略。
6. **训练计划写回纳入 3.0 规划**。用户已确认官方提供 write training plan access；实现仍需遵守七日窗口、单位、完整预览、显式确认、发布结果、冲突和撤销语义，不能让 AI 无确认直接发布。
7. **接受在官方无法提供 Webhook 签名时进行受控 Beta**。Beta 必须限制测试用户和配额，保留 unsigned provenance、限流、绑定校验、异常监控、可恢复撤权暂停及明确风险说明；不得在没有进一步来源校验时直接公开放量。

## 决策带来的实施调整

- B5 前端范围升级为“应用壳层重构”：顶部悬浮主导航、Hero Page 移除、概览模块化、深浅主题、排版/动效系统和响应式导航一起设计，不能只做 CSS 局部替换。
- OSM 进入 3.0 主路线，但必须位于 WorkoutDetail 的懒加载 chunk，使用 `preferCanvas` 和有限轨迹 segment；默认先显示本地轨迹，在线地图由用户主动开启并可随时关闭。
- B7 不再是纯后续探索：canonical model 稳定后，MCP 查询和训练计划写回均进入 3.0 验收矩阵；写回与 MCP 只读权限严格分离。
- 官方 Webhook 采用“受控 Beta Go / 公开发布 No-Go”门槛：在获得签名、鉴权头、mTLS 或可信出口 IP 之前，不能默认向所有用户开放。

## 关键文件与复用点

- 现状约束与批次：[CLAUDE.md](../../CLAUDE.md)、[docs/development/v3-plan.md](v3-plan.md)
- Rust 核心：`src-tauri/crates/core/src/contract.rs`、`auth/`、`connectors/`、`fetcher/`、`normalizer/`、`storage/migrations.rs`、`storage/coverage.rs`、`sync/`
- Tauri/前端桥接：`src-tauri/src/commands/`、`src-tauri/src/lib.rs`、`src/lib/bridge/`
- UI：`src/App.vue`、`src/router/index.ts`、`src/views/BodyStatus.vue`、`src/views/TrainingStatus.vue`、`src/views/WorkoutDetail.vue`、`docs/development/ui-guidelines.zh-CN.md`
- 云端：`functions/api/zepp/`、`wrangler.jsonc`
- 既有 FIT 导出：`src-tauri/crates/core/src/export_fit.rs`

## 验收门禁

- 每批次提供脱敏 fixture、失败/重复/修订/离线/撤权/跨账号测试；数据库迁移用 v3 开发库副本，绝不碰主仓库真实 `release/data`。
- Rust 全部使用 `pwsh scripts/v3-gates.ps1`；前端跑 `npm run build`、`npm test`、`i18n:check`、`npm run budget:check`、`npm run version:check`；新增 Cloudflare 端点有未启用时安全拒绝测试。
- 真实测试闭环：一位测试用户完成 OAuth、睡眠推送、Activity ping/FIT、本机持久化、重复投递恢复、离线补领和旧档案可读；再做官方/旧源/Zepp App 字段级对照。
- 发布前使用 `release/ZeppBridge3.exe` 便携包，在不运行 2.x 的情况下做人工验收；验证版本、快捷方式和数据库隔离。
