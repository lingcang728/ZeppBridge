# ZeppBridge UI 设计与交互约束

更新时间：2026-08-25（对齐第二轮 UI：身体状态 / 训练状态两页、心率区间选择器、导出数据流选择器）。ZeppBridge 是用户的穿戴健康数据桥梁，不是臃肿的分析 App。

视觉是**冷灰底 + 橄榄绿**的暗色系统：品牌色 `--brand: #7DA33E`，界面底色 `#131519`（侧栏 `#0F1114`、卡片 `#1D2026`），不使用泛滥的紫色或高饱和荧光色。分类色（心率红、配速蓝、睡眠紫、活动青等）只用于标记数据类别，不作装饰。

界面**只有深色一套**，这是已定的取舍，见下方「只做深色」。

## 核心原则

- **同步可信**：云端拉取时间、同步状态和设备时序健康样本时间必须明确分开表达。
- **真实优先**：缺失值显示 `未提供` / `—` 或明确空状态，绝不使用假数据、零值或模拟曲线填空。没有采样点就展示空态文案（如「同步后展示真实的 24 小时心率波动」），不画占位曲线。
- **分析外置**：专业医学与运动建议交给用户自由选择的 AI 工具，应用自身专注数据采集、标准化存储、脱敏保护与 AI-ready 导出。
- **隐私底线**：
  - 导出到 AI 时默认执行不可逆脱敏（`redact_ai_export`，抹除 device_id、MAC、IMEI、精确 GPS 等字段，并在 JSON 里回写 `redactions` 清单）；精确轨迹需用户显式勾选 `include_precise_route` 才注入；
  - 数据包 > 2 MiB（`AI_HANDOFF_INLINE_LIMIT_BYTES`）时自动写入系统桌面 `zeppbridge-ai-handoff.json`，剪贴板只放拖入提示；
  - GPS 轨迹仅在本地用内联 SVG 绘制（`WorkoutDetail.vue` 的 `routeCanvas`），绝不请求第三方在线地图瓦片。
- **渐进披露**：日常使用展示核心指标与快捷导出；界面缩放、数据文件夹、清除认证、同步诊断收进设置页底部的「高级与维护」折叠区。

## 设计 token

**唯一来源是 `src/App.vue` 的 `:root` 块**，页面里不要再硬编码同义色值（hero、panel 的渐变背景是有意的局部例外）。

| 用途 | token |
| --- | --- |
| 层级底色 | `--bg` `#131519` / `--sidebar` `#0F1114` / `--canvas` `#14161A` / `--surface` `#1D2026` / `--surface-raised` `#24272F` / `--surface-hover` `#2C3039` |
| 文字 | `--ink` `#F2F4EE` / `--muted` `#9AA1A9` / `--subtle` `#6E757D` / `--faint` `#4B5158` |
| 描边 | `--line` / `--line-strong`（都是低透明度冷白） |
| 品牌与动作 | `--brand` `#7DA33E` = `--accent`，`--accent-hover` `#93B952`、`--accent-soft`、`--accent-ink` `#12170A`、`--action-green` |
| 分类色 | `--heart` `#F0616A`、`--pace` / `--cadence` `#4AA8E8`、`--calories` `#F5860B`、`--altitude` `#F5C33B`、`--activity` `#2BB3C0`、`--training` / `--readiness` `#3DD84C`，各自配 `*-wash` 半透明底 |
| 睡眠阶段 | `--sleep-deep` `#4458B8` / `--sleep-light` `#7C8FF0` / `--sleep-rem` `#8B5CF6` / `--sleep-awake` `#E8833A` |
| 状态 | `--danger` `#F0616A`、`--warning` `#F5C33B`、`--focus` `#7DA33E` |
| 轨迹配速色谱 | `--route-neutral` / `-mint` / `-cyan` / `-amber` / `-coral` |
| 间距 / 圆角 | `--space-1…8`、`--radius-sm` 10px / `-md` 14px / `-lg` 18px |

概览 24 小时心率折线下方的四段标注用**绝对阈值**，只是给曲线一个粗读的刻度，不是个体化区间：休息 0–99 / 燃脂 100–139 / 有氧 140–169 / 无氧 170+（`Overview.vue` 的 `HR_ZONES`）。

个体化的心率区间是另一回事，在 `/training` 的选择器里：三种算法（最大心率 / 储备心率 / 乳酸阈值）、五个实测基准，**不预设默认**，每个基准都要标出处和测量日期。禁止用 220−年龄 之类的公式估算。算法与百分比的来源见[架构摘要](../reference/architecture.md)。

### 只做深色（已定的设计取舍）

- ZeppBridge **只提供深色界面**，不做浅色模式，也不跟随系统。`:root` 只维护这一套 token，不要新增 `@media (prefers-color-scheme)` 或 `[data-theme="light"]` 分支，也不要加主题切换 UI。
- 因此写样式时可以直接假定深色底：不需要为浅色兜底，但仍要用 token 而不是硬编码色值，以便整体调色。
- 浅色模式的残留（`useTheme.ts` 与 `zeppbridge-light` ECharts 主题）已于 2026-08-24 删除，不要再重新引入。

### 界面文案：中英各一份，不许硬编码

- **界面上出现的每一个字都要有中英两份。** 写法是在用它的模块里 `defineMessages(zh, en)`，
  大页面（Settings、Explore）放同名的 `*.i18n.ts`。不要建全局大字典：懒加载页面的 chunk
  应该只带自己那份文案。
- `defineMessages` 用 `NoInfer` 把形状钉在中文那份上——英文漏一个键、多一个键、参数对不上
  都会编译不过。漏翻在 `npm run build` 就会红，不用等用户看到。
- **不要用显示名做分支判断。** `label === '骑行'`、`seriesName === '阈值配速'` 这种写法一换
  语言就悄悄失效，而且不会报错。用 key、id 或索引。
- **日期和数字用 `intlLocale()`**，不要再写 `'zh-CN'`；也不要把 `Intl.*` 实例缓存成模块级
  常量，那会把语言钉死在模块加载的那一刻。
- 后端发来的文案（数据流名、动作、同步进度、洞察原因、心率区间…）一律**按它给的稳定码或
  键在界面查表**，不要直接显示后端那份中文——那份是给 CLI 和 MCP 的，它们不跟界面语言走。
- `npm run i18n:check` 会挡住硬编码。确实该留中文的地方（比如语言开关那个双语标签）在
  `scripts/release/check-i18n.mjs` 的 `ALLOWED` 里逐条列，并写清为什么。

## 字体与排版

- 打包字体：MiSans（中文，仅 400 / 700）+ Inter（拉丁与数字，400 / 500 / 600 / 700），定义在 `src/styles/fonts.css`。
- `--font-sans: 'MiSans', 'Segoe UI', 'Microsoft YaHei UI', sans-serif`；`--font-mono: 'Cascadia Code', ...` 用于所有数值。
- 中文不使用 500 / 600 中间字重（MiSans 只打包了 400/700，用中间值会触发伪粗体发糊），层级靠字号与明度划分。
- 数值一律等宽 + `tabular-nums`，避免刷新时跳动。基准 `font-size: 13px`。

## 页面架构

主导航三项：**概览** (`/`)、**交给 AI** (`/explore`)、**设置** (`/settings`)。导航保持三项——新页面进入口卡片，不进侧栏。

二级页面不进主导航：`/body`（身体状态）、`/training`（训练状态）、`/recent`（最近记录）、`/sleep`、`/workouts` 列表，以及 `/sleep/:sleepId`、`/workouts/:workoutId` 详情，由概览的入口卡片与「查看全部」进入。

### 1. 概览 (`/`)

- Hero 卡：品牌标语 + 三张价值卡（安全 / 私密 / AI-ready）+ 右侧「已识别设备 → 流动虚线 → 云端 AI」示意；设备来自真实识别结果，没有设备就不画这条流。
- 12 列 dashboard 网格：24 小时心率折线（span 6）、今日步数圆环（span 3）、昨晚睡眠结构（span 3）、静息心率 mini 卡 + 身体状态 / 训练状态两张入口卡（各 span 4）、最近记录两列列表（整行）。
- 两张入口卡各带当日数值与 7 天 `Sparkline`，点进 `/body` 与 `/training`。它们取代了原来的训练负荷 / VO₂ Max mini 卡——同一屏不重复展示同一个数字。
- `Sparkline` 少于两个点时不画：一个读数是数值不是趋势，画成一条平线等于宣称了没测过的稳定性。
- 每张卡片都有独立空态；加载中用 `SkeletonBlock` 占位，失败给可重试的 `EmptyState`。
- 不在概览做恢复度、训练建议一类解读。入口卡只给数字和形状，解读留给用户自选的 AI。

### 2. 交给 AI (`/explore`)

三列布局：

- 左列：模板分类 + 可搜索的提示词模板列表。
- 中列：当前模板的提示词编辑框（可改、可复制）、数据感知摘要四格（时间范围 / 记录条数 / 数据类型数 / 预估体积）、快捷范围 pill 与自绘日历弹层（不用原生 date input）。
- 右列：导出格式、目标 AI（7 家：ChatGPT、Claude、Gemini、Kimi、豆包、DeepSeek、Grok，走 `AI_PROVIDERS` 白名单，非白名单地址直接拒绝打开）、另存 / 复制提示词 / 发送三个动作。
- 三种格式各走各自真实的转换，卡片副标题必须说明差异，不允许「选了 CSV 实际给 JSON」：JSON = 完整结构化；CSV = 长表汇总（不含逐点采样与轨迹）；GPX = 只含有 GPS 轨迹的运动。没有可导出内容时报错，不落空文件。
- 可选数据类型 15 项（`exportTypeOptions`），在右列按 `exportTypeGroups` 的四组呈现：活动 / 睡眠 / 身体状态 / 训练。组标题可整组全选或全不选，单项是复选框。模板只负责**预填**选择，不锁定它——勾了什么，导出就是什么，摘要里的条数与体积始终描述用户马上会拿到的那个文件。
- 体积与条数是异步预览，计算中显示 `…` 而不是 `0`。

### 3. 最近记录与详情 (`/recent`, `/sleep`, `/workouts`, `/sleep/:id`, `/workouts/:id`)

- `/recent` 两列（睡眠 / 运动），列头标注「共 N 条」，运动列有类型过滤 tab；被过滤掉的不完整记录必须显式提示「N 条数据不完整已隐藏」，不能静默消失。
- 运动详情：指标矩阵 + ECharts 心率/配速曲线 + 本地 SVG 轨迹（按配速映射 `--route-*` 色谱）+ 暂停区间。没有轨迹点就不画地图，没有逐点采样就不画曲线。
- 睡眠详情：`StageBar` 阶段构成（用 `--sleep-*` 四色）+「阶段说明」折叠 + 近 7 天睡眠结构堆叠柱状图；时长、评分、来源、设备如实展示，缺失即 `未提供`。

### 4. 身体状态 (`/body`) 与训练状态 (`/training`)

- 两页同构：`PageHeader` 右侧是 7 天 / 1 个月 / 6 个月的 `range-switch`，主体是 `minmax(320px, 1fr)` 自适应卡片网格。
- 身体状态八张 `MetricTrendCard`：恢复、压力、血氧、夜间血氧 ODI、HRV (SDNN)、HRV (RMSSD)、呼吸率、静息心率。有实测区间的（压力、血氧、HRV、呼吸率）在折线后面画当日 min–max 阴影；**没测出区间的当天不画零宽阴影**。
- 训练状态：VO₂max / 训练负荷 / PAI 三张趋势卡，乳酸阈值心率+配速双轴卡（配速轴 `inverse`，让「更快」朝上），运动负荷平衡卡（7 天负荷、28 天周均、急慢比三条线），以及 `HeartRateZonePicker`。
- 每张卡片都写明覆盖度：「30 天里有 12 天记录」。**缺的天曲线直接断开**（`connectNulls: false`），不插值、不补零。只有 1 天数据时不画图，直接说「画不出趋势」。
- 6 个月这一档不是装饰：VO₂max 与乳酸阈值一年只测几次，30 天窗口会把库里已有的数据显示成空。

### 5. 设置 (`/settings`)

按编号分区，自上而下：1 认证方式（官方网页登录 / HAR 导入 / 手动输入）→ 2 账户与区域 → 3 连接设备与数据来源 → 4 隐私与安全（含隐私原则弹窗）→ 5 本地数据保留 → 6 导出与补拉偏好 → 7 本机 REST API 状态 → 8 软件更新 → 9 自动同步。

底部「高级与维护」折叠：界面缩放、打开数据文件夹、清除认证，内嵌「同步诊断」二级折叠（按 stream 列出状态与云端同步时间）。

## 组件与图表

- 无 UI 框架，组件全部自研，位于 `src/components/`：`BrandMark`、`CategoryMark`、`CircularProgress`、`DesignIcon`、`DeviceCard`、`DeviceMarquee`、`DeviceVisual`、`EmptyState`、`HeartRateZonePicker`、`Icon`、`MetricTrendCard`、`PageHeader`、`RecordRow`、`SkeletonBlock`、`Sparkline`、`StageBar`。新增前先确认这里没有能复用的。
- 按天趋势一律走 `MetricTrendCard` + `lib/metricSeries.ts` 的 `buildSeriesOption`，不要在页面里各写一套 option；`SERIES_RANGES` 是三档范围的唯一来源。
- 两套图标各有分工：`Icon.vue` 是内联 SVG 线性图标（UI 控件、小尺寸），`DesignIcon.vue` 是 `src/assets/design-icons/` 的 PNG 设计图标（导航、大号语义图标）。图片必须走 import 让 Vite 产出实体文件——桌面 CSP 不允许 data URL 与外部图源。
- 图表统一用 `vue-echarts` + `main.ts` 注册的 `zeppbridge-dark` 主题，不要在页面里重复定义配色。

## 交互与可访问性

- 顶部有 `跳到主要内容` skip-link；导航、单选组用 `role` / `aria-*` / `aria-pressed` 标注；图表带 `role="img"` 和中文 `aria-label`。
- 焦点态统一 `:focus-visible` 2px `--focus` 描边，禁止 `outline: none` 了事。
- 触控目标最小 44px（移动菜单按钮、底部导航、`RecordRow`）。
- 主断点 760px：侧边栏切换为顶栏 + 底部 tabbar；概览另有 1180 / 820 两级栅格降列。
- 界面缩放 80 / 90 / 100 / 110 / 125%（`UI_SCALES`），入口在设置「高级与维护」，快捷键 Ctrl + / Ctrl - / Ctrl 0，持久化在 localStorage。
- 时间格式化前先判 `Date.getTime()` 是否有效；错误信息保留可操作内容，不要吞成「加载失败」。

## 这份文档的维护

页面结构以 `src/router/index.ts` 和 `src/App.vue` 的 `navigation` 为准，设计 token 以 `App.vue` 的 `:root` 为准。改导航、改色板、改主题状态时同步改这里；与源码冲突时**以源码为准**，并顺手修正本文。工程门禁见[开发文档](development.md)，产品边界见[架构摘要](../reference/architecture.md)。
