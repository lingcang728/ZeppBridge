# ZeppBridge UI 设计与交互约束

[English](ui-guidelines.md)

更新时间：2026-09-05（对齐无障碍与可读性调整）。ZeppBridge 是用户的穿戴健康数据桥梁，不是臃肿的分析 App。

视觉是**冷灰底 + 橄榄绿**的系统。深色是基准套：品牌色 `--brand: #7DA33E`，界面底色 `#0C0E11`（卡片 `#16191E`）；浅色套在暖白底上保持同一组角色（`--brand: #2F6B4F`，底色 `#EAEDE5`）。不使用泛滥的紫色或高饱和荧光色。分类色（心率红、配速蓝、睡眠紫、活动青等）只用于标记数据类别，不作装饰。

界面有**深色、浅色两套，外加跟随系统**，见下方「双主题」。

## 核心原则

- **同步可信**：云端拉取时间、同步状态和设备时序健康样本时间必须明确分开表达。
- **真实优先**：缺失值显示 `未提供` / `—` 或明确空状态，绝不使用假数据、零值或模拟曲线填空。没有采样点就展示空态文案（如「同步后展示真实的 24 小时心率波动」），不画占位曲线。
- **分析外置**：专业医学与运动建议交给用户自由选择的 AI 工具，应用自身专注数据采集、标准化存储、脱敏保护与 AI-ready 导出。
- **隐私底线**：
  - 导出到 AI 时默认执行不可逆脱敏（`redact_ai_export`，抹除 device_id、MAC、IMEI、精确 GPS 等字段，并在 JSON 里回写 `redactions` 清单）；精确轨迹需用户显式勾选 `include_precise_route` 才注入；
  - 数据包 > 2 MiB（`AI_HANDOFF_INLINE_LIMIT_BYTES`）时自动写入系统桌面 `zeppbridge-ai-handoff.json`，剪贴板只放拖入提示；
  - GPS 轨迹仅在本地用内联 SVG 绘制（`WorkoutDetail.vue` 的 `routeCanvas`），绝不请求第三方在线地图瓦片。
- **渐进披露**：日常使用展示核心指标与快捷导出；界面缩放放在设置的「显示与语言」卡，数据文件夹、清除认证、同步诊断收进「高级与维护」卡。

## 设计 token

**唯一来源是 `src/styles/tokens.css`**：`:root` 放深色值，`html[data-theme="light"]` 覆写同一组变量。页面里不要再硬编码同义色值（hero、panel 的渐变背景是有意的局部例外）。

| 用途 | token |
| --- | --- |
| 层级底色 | `--bg` `#0C0E11` / `--sidebar` `#08090C` / `--canvas` `#0D0F12` / `--surface` `#16191E` / `--surface-raised` `#1D2128` / `--surface-hover` `#262B33` |
| 文字 | `--ink` `#F2F4EE` / `--muted` `#B4BBC3` / `--subtle` `#949CA5` / `--faint` 复用 `--subtle` |
| 描边 | `--line` / `--line-strong` 用于安静的结构线，`--line-control` 用于交互控件边界 |
| 字号阶梯 | `--fs-2xs` 13px / `--fs-xs` 14.5px / `--fs-sm` 15.5px / `--fs-md` 16.5px / `--fs-lg` 17.5px / `--fs-xl` 18.5px / `--fs-2xl` 20px / `--fs-3xl` 22px |
| 品牌与动作 | `--brand` `#7DA33E` = `--accent`，`--accent-hover` `#93B952`、`--accent-soft`、`--accent-ink` `#12170A`、`--action-green` |
| 分类色 | `--heart` `#F0616A`、`--pace` / `--cadence` `#4AA8E8`、`--calories` `#F5860B`、`--altitude` `#F5C33B`、`--activity` `#2BB3C0`、`--training` / `--readiness` `#A3CC5C`（浅色 `#4E8A2E`，与品牌青柠同一家族），各自配 `*-wash` 半透明底 |
| 睡眠阶段 | `--sleep-deep` `#6477D7` / `--sleep-light` `#7C8FF0` / `--sleep-rem` `#8B5CF6` / `--sleep-awake` `#E8833A` |
| 状态 | `--danger` `#F0616A`、`--warning` `#F5C33B`、`--focus` `#7DA33E` |
| 轨迹配速色谱 | `--route-neutral` / `-mint` / `-cyan` / `-amber` / `-coral` |
| 间距 / 圆角 | `--space-1…8`、`--radius-sm` 10px / `-md` 14px / `-lg` 18px |

概览 24 小时心率折线下方的四段标注用**绝对阈值**，只是给曲线一个粗读的刻度，不是个体化区间：休息 0–99 / 燃脂 100–139 / 有氧 140–169 / 无氧 170+（`Overview.vue` 的 `HR_ZONES`）。

个体化的心率区间是另一回事，在 `/training` 的选择器里：三种算法（最大心率 / 储备心率 / 乳酸阈值）、五个实测基准，**不预设默认**，每个基准都要标出处和测量日期。禁止用 220−年龄 之类的公式估算。算法与百分比的来源见[架构摘要](../reference/architecture.zh-CN.md)。

### 双主题：深色、浅色、跟随系统

- ZeppBridge v3 提供**深色、浅色、跟随系统**三套选择。选择持久化在 `localStorage` 的 `zeppbridge-theme`（`light` / `dark` / `system`）；`src/composables/useTheme.ts` 负责解析实际生效的一套，`initializeTheme()` 在 `main.ts` 里于首次渲染前执行，不会先闪一帧另一套。
- 解析结果写在 `<html data-theme="light|dark">`（`data-theme-preference` 保留原始选择便于排查），`color-scheme` 跟着走，滚动条与原生控件自动换色；`theme-color` meta 也随之更新。
- **组件只消费 token，不按主题分支。** 个别实在换不成 token 的深色硬编码，在 `tokens.css` 底部的补丁表里加一条窄作用域的 `html[data-theme="light"] …` 覆写——这张表是过渡手段，应当逐渐清空。
- 分类色两套之间只调明度饱和、不换色相（浅色心率红 `#C93F49`、品牌绿 `#2F6B4F`……）；同一个 token 在两套里角色一致，语义不漂移。
### 材质：克制玻璃（2026-09-26）

- 全应用只有**一种卡片材质**：两色渐变底 + 顶边高光（`inset 0 1px 0`）+ 两层柔和投影。token 在 `tokens.css` 的 `--mat-*`（`--mat-card`、`--mat-line`、`--mat-rim`、`--mat-shadow`，凸起件 `--mat-raised*`，凹槽 `--mat-inset*`，浮层 `--mat-glass*`），深浅各一份；基元类在 `src/styles/material.css`：`.surface-card` / `.mat-card`、`.button` 各变体（按下沉 1px）、`.mat-inset`、`.mat-field`、`.mat-switch`、`.chip`、`.glass`。
- **真正的毛玻璃（`backdrop-filter`）只给浮在上层的东西**：顶栏、导航胶囊、下拉菜单、日期选择、弹窗。普通卡片不模糊。
- 类别色只在卡片角落留一点微光（`color-mix` 约 5%，`--entry-tone` / `--card-tone`），**不给卡片写死背景色**；卡片里图形和曲线用同一个类别色（身体 = 心率红、训练 = 青柠、睡眠 = 靛紫、活动 = 青）。
- 动效用 `--dur-*` / `--ease-*`，并尊重 `prefers-reduced-motion`。
- 导航胶囊（`SegmentTrack.vue`）的文字画两层：底层普通字，上层「选中字」按滑块形状裁切，所以拖到一半也不会出现半截深色字；焦点环画在滑块上，←/→/Home/End 可用；拖动时滑块变成玻璃透镜。
- 落地页自带一套局部作用域的暗色色板（`.landing-page { --site-* }`）——那是应用外壳之外的品牌美术，不算第三套主题。

### 景深、胶囊与动效（v3 重设计，2026-09-27）

- **圆角给足**：`--radius-sm/md/lg/xl` = 12 / 20 / 26 / 34 px。卡片是有厚度的一块板：`--mat-rim` 顶边高光 + 底边暗线，`--mat-shadow` 多一层远投影。画布有一层固定的淡色环境光（`--ambient`，由 `.app-body::before` 画），毛玻璃才有东西可折射；浮层玻璃（`--glass-rim`）带镜面顶边和底部回光。
- **舞台没有硬边**：卡组、滚轮用横向 `mask-image` 渐隐进背景，不在一条边线上戛然而止。
- **选项是胶囊，不是下拉。** 两三项 → 可拖的 `SegmentTrack` 胶囊；更长的列表（语言、日期格式、AI 服务商）→ `CapsuleWheel.vue`：选项按各自宽度排在一个圆柱面上（弧长布局），选中项永远在正中的镜片下，两边像传送带转过拐角一样侧转；拖动（临界阻尼吸附）、滚轮、方向键、点邻项都可以。值在滚轮停稳后才提交（切语言会重绘整页）。
- **主题只有深 / 浅两格**：默认跟随系统；拨到与系统一致的那一格即回到跟随系统（`useTheme.pickTheme`），「跟随系统」不必作为一个可见选项。
- **切页永远不经过空白帧**：新旧两页同时在场（不用 `out-in`）。`lib/navigation.ts#pageMotion` 决定方向——`forward` 聚焦进详情、`back` 退出来、`left` / `right` 按导航胶囊的顺序横移，都带模糊。离场页钉在它当时的滚动位置，不会先跳回顶部。
- **`.ready-glow`**（沿边流动的品牌渐变细环 + 会呼吸的外光）只留给一个时刻：「数据好了，去交给 AI」。同一屏不许有第二样东西发光。玻璃控件本身是层叠上下文，所以环用 mask 只留边、外光用外阴影——都不许把胶囊内部染色。

### 界面文案：中英各一份，不许硬编码

- **界面上出现的每一个字都要有中英两份。** 写法是在用它的模块里 `defineMessages(zh, en)`，
  大页面（Settings、Overview）放同名的 `*.i18n.ts`。不要建全局大字典：懒加载页面的 chunk
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
- MiSans 只打包了 400 / 700。正文用 400，强调角色写 600，由字体匹配到已打包的粗体；不要写 500，它会向下匹配到常规体，起不到强调作用。
- 数值一律等宽 + `tabular-nums`，避免刷新时跳动。正文基准是 `--fs-md: 16.5px`。

## 页面架构

主导航三项，在顶栏（`src/components/shell/AppTopBar.vue`）居中的胶囊里：**概览** (`/`)、**交给 AI** (`/ai`)、**设置** (`/settings`)。导航保持三项——新页面进入口卡片，不占导航位。顶栏右侧还有同步状态胶囊、主题切换键和语言 `SelectMenu`；760px 以下胶囊收起，底部 tabbar 覆盖同样的三项。

二级页面不进主导航：`/body`（身体状态）、`/training`（训练状态）、`/recent`（最近记录）、`/sleep`、`/workouts` 列表，以及 `/sleep/:sleepId`、`/workouts/:workoutId` 详情，由概览的入口卡片与「查看全部」进入。

### 1. 概览 (`/`)

- v3 **没有 Hero 卡**；旧 Hero 和「不再显示介绍」偏好一并移除（Overview 挂载时清掉 `zeppbridge.overview.hideHero`）。页面自上而下是周报卡、覆盖度提示、`SourcesStrip`（设备与账户状态横带，从 v2 侧栏搬来），然后是卡片网格。
- 卡片是 `src/components/overview/` 下的模块化组件：`HeartRateCard`（24 小时折线）、`StepsCard`（今日步数圆环）、`SleepCard`（昨晚睡眠结构）、两张 `StatusEntryCard`（身体 / 训练入口）和 `RecentCard`（最近记录两列），排在 12 列 `dashboard-grid` 上。
- 两张入口卡各带当日数值与 7 天 `Sparkline`，点进 `/body` 与 `/training`。它们取代了原来的训练负荷 / VO₂ Max mini 卡——同一屏不重复展示同一个数字。
- `Sparkline` 少于两个点时不画：一个读数是数值不是趋势，画成一条平线等于宣称了没测过的稳定性。
- 每张卡片都有独立空态；加载中用 `SkeletonBlock` 占位，失败给可重试的 `EmptyState`。
- 不在概览做恢复度、训练建议一类解读。入口卡只给数字和形状，解读留给用户自选的 AI。
- 概览是启动同步期间的**等候区**。`components/overview/DataReadyCapsule.vue` 放在页头行本来空着的右半边（行高固定 58px，下面的内容不会动）：同步在跑时是「正在从云端取回你的数据 · 3/8」加进度环；用户在等的那次同步落地后，变成发光的「数据已备好 · 新增 N 条 · 交给 AI」。顶栏同步胶囊同一时刻变成同一句话。只有用户在等的同步会喊（启动、顶栏、托盘、设置），每十五分钟的后台自动同步不喊；deferred 继续等；失败、取消、根本没跑起来一律不说「已备好」（`lib/dataReady.ts`）。进 `/ai` 或点 × 即熄灭。

### 2. 交给 AI (`/ai`)

应用的核心页。一屏一个分析任务，布局是**一块舞台 + 三层浮动玻璃**（`views/AiComposer.vue`，子组件在 `components/ai/`）：

- **舞台——`TaskGraph`** 铺满整页（画布右侧让出步骤栏，镜头中心落在可见区域正中）。虚线圈内的类别交给 AI，每个类别有自己的窗口（7 / 14 / 30 天）。展开某一类时**镜头从上方俯冲进去**（`useGraphCamera`、`layout.ts#focusFrame`），其余退成模糊的背景，左上角玻璃面包屑「全部类别 / 睡眠」或 Esc 飞回全景。悬停聚焦要停稳 160ms 并带过渡——以前一碰就把整张图压暗，鼠标扫过密集的指标点时整张图频闪。每个节点有一圈看不见的点击区，起拖门槛 9px。撤销与镜头控件是浮在画布上的玻璃胶囊。
- **左上——`AiTaskHeader`**：一枚玻璃胶囊，里面是可直接改的任务名、已保存任务、新建、保存（有未保存修改时点亮）。
- **右侧——`AiStepRail`**：① 分析对象（`WorkoutPicker`）② 你想问什么（`DirectionPanel`）③ 附件与选项（`TaskExtras`），一次只展开一步；收起的步骤只露一行摘要，整个任务一屏看完不用滚。
- **底部——`HandoffPanel` 交付坞**：整页唯一的主按钮「交给 ChatGPT」、服务商 `CapsuleWheel`（只认 `AI_PROVIDERS` 白名单）、就绪度胶囊（几类数据 · 平均多少天有数据 · 数据包大小 · 提醒数），点开是最终提示词、去重后的提醒和 `CoverageDetails`。预览出错一直露在坞上方。用户在等的同步还没落地时，就绪度胶囊说「最新数据还在路上」；页面跟着 `dataRevision` 重新取运动列表和预览。
- `ai_task_prepare` 生成脱敏数据包；精确 GPS 默认不带，用户显式打开才带。预览是异步的，计算中显示 `…` 而不是 `0`。

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

**三种形态的卡组**，不做左侧目录。八张卡（`views/settings/cards.ts`）：账号与设备 · 同步与更新 · 归档与存储 · 数据内容 · 交给 AI 工具 · 显示与语言 · 隐私与安全 · 高级与维护。同一批卡在形态之间用 View Transitions 形变（每张卡一个 `view-transition-name`）。

- `/settings` 默认是 **coverflow**（`DeckCoverflow.vue`，摆位来自纯函数 `lib/deck/coverflow.ts`）：正中一张立着，两侧的卡侧转约 46° 紧紧叠在两边，越远越小、越糊、越淡；卡组首尾相接，两边永远有卡；舞台两端渐隐进背景。拖动（`useSpringIndex` 按速度吸附）、滚轮、←/→、点侧卡转到正中；点正中那张或回车打开。
- **「展开全部」**把卡从正中往两边依次抽出、纵向平铺成两列；底部浮着醒目的**「收起」**胶囊，按相反顺序插回卡组。用哪种形态记在本机。
- `/settings/:card` 打开一张：它放大成整页，其余的卡下沉、变糊、淡出（`::view-transition-old(*):only-child`），关掉时再浮回来。打开后仍可按住卡头拖动甩出、上一张 / 下一张（按住连翻）、←/→、PageUp/PageDown；Esc 回到总览；开了减少动效就直接切换。卡片都没有描边——边界靠顶边高光和投影。
- 分层：`lib/deck/physics.ts` + `lib/deck/coverflow.ts`（纯函数，有 vitest）→ `composables/useCardDeck.ts` / `useSpringIndex.ts` → `components/deck/`。各卡内容在 `views/settings/sections/`，共享状态经 `composables/settings/context.ts` 注入。
- 卡内排版统一用 `settings-base.css` 的列表行：标签在左、控件在右、行间细线。
- 历史补拉只有一个入口，在「归档与存储」卡里（长期归档开关 → 起点与开始补拉 → 预计体积 → 覆盖账本）。

## 组件与图表

- 无 UI 框架，组件全部自研，位于 `src/components/`：`BrandMark`、`CategoryMark`、`CircularProgress`、`CardDeck`（`deck/`）、`DatePicker`、`DeviceMarquee`、`DeviceVisual`、`EmptyState`、`GlyphTile`、`HeartRateZonePicker`、`Icon`、`MetricTrendCard`、`ModalDialog`、`PageHeader`、`RecordRow`、`SegmentTrack`、`SelectMenu`、`SkeletonBlock`、`Sparkline`、`StageBar`；按页面分的子组件在 `components/<页面>/`（`overview/`、`workout/`、`archive/`、`ai/`、`deck/`、`shell/`）。新增前先确认这里没有能复用的。
- 按天趋势一律走 `MetricTrendCard` + `lib/metricSeries.ts` 的 `buildSeriesOption`，不要在页面里各写一套 option；`SERIES_RANGES` 是三档范围的唯一来源。
- 图标：`Icon.vue` 是内联 SVG 线性图标；大号语义图标用 `GlyphTile.vue`——CSS 材质底座 + `Icon.vue` 的图形，颜色按 `tone` 取类别 token（名称到图形的映射在 `lib/glyphs.ts`），深浅两套主题共用。不要再加 PNG 3D 图标；只有品牌图（app-icon、brand-mark、zepp-cloud）仍是图片。图片必须走 import 让 Vite 产出实体文件——桌面 CSP 不允许 data URL 与外部图源。
- 图表统一走 `src/lib/echartsSetup.ts` 的 `vue-echarts`：注册了 `zeppbridge-dark` 与 `zeppbridge-light` 两套主题，并导出响应式的 `CHART_THEME` / `chartPalette`。每个 `VChart` 都绑 `:theme="CHART_THEME"` **和** `:key="CHART_THEME"`（换主题时整图重建），每个 option 都是 `computed`，chrome 色（轴文字、网格线、tooltip、标记、系列语义色）一律从 `chartPalette.value` 取，不写字面量 hex——CSS 变量进不了 canvas，所以色板色值与 `tokens.css` 对齐维护。不要在页面里重复定义配色。
- **首页（概览）不加载 ECharts。** 概览的心率曲线是 `components/overview/HrMiniChart.vue`（SVG，几何在 `lib/miniChart.ts`），入口卡的 7 天走势是 `Sparkline`。图表引擎 580 KB，只给二级页的交互图表用；往概览里加 `VChart` 等于让每次冷启动都多解析一遍它。

## 交互与可访问性

- 顶部有 `跳到主要内容` skip-link；导航、单选组用 `role` / `aria-*` / `aria-pressed` 标注；图表带 `role="img"` 和中文 `aria-label`。
- 焦点态统一 `:focus-visible` 2px `--focus` 描边，禁止 `outline: none` 了事。
- 触控目标最小 44px（移动菜单按钮、底部导航、`RecordRow`）。
- 主断点 760px：顶栏胶囊导航收起，底部 tabbar 覆盖同样的三项；概览另有 1180 / 820 两级栅格降列。
- 界面缩放 80 / 90 / 100 / 110 / 125%（`UI_SCALES`），入口在设置「显示与语言」卡，快捷键 Ctrl + / Ctrl - / Ctrl 0，持久化在 localStorage。
- 时间格式化前先判 `Date.getTime()` 是否有效；错误信息保留可操作内容，不要吞成「加载失败」。

## 这份文档的维护

页面结构以 `src/router/index.ts` 和 `src/App.vue` 的 `navigation` 为准，设计 token 以 `src/styles/tokens.css` 为准。改导航、改色板、改主题状态时同步改这里；与源码冲突时**以源码为准**，并顺手修正本文。工程门禁见[开发文档](development.zh-CN.md)，产品边界见[架构摘要](../reference/architecture.zh-CN.md)。


### 可读性后续优化

- 模板标题、说明与下拉选项完整换行，不用省略号隐藏选择所需的信息。提示词编辑区与弹窗正文使用 `--fs-md`，辅助说明沿用现有字号阶梯。
- 不对说明文字所在容器整体降低透明度。缺失数据卡片保留清晰文字，用虚线边框区分；禁用操作仍可变淡。
- `SelectMenu` 将焦点留在触发按钮，通过 `aria-controls` / `aria-activedescendant` 关联弹层和当前活动选项。选项与触发按钮至少高 44px。
- 设置页的隐私和更新说明共用 `ModalDialog`：包含可访问名称、Tab/Shift+Tab 焦点循环、Esc 关闭、关闭后焦点返回，以及受视口约束的滚动区域。关闭按钮保留中英文名称。
- 搜索框与编辑区内部取消原生轮廓时，由外框的 `:focus-within` 提供可见焦点。
