# ZeppBridge UI 设计与交互约束

[English](ui-guidelines.md)

更新时间：2026-09-27（第四到七批：胶囊统一、卡组可打断形变、立体概览与时间线）。ZeppBridge 是用户的穿戴健康数据桥梁，不是臃肿的分析 App。

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
- 胶囊控件（`SegmentTrack.vue`）的文字画两层：底层普通字，上层「选中字」按滑块裁切。滑块位置是两个注册过的 CSS 长度（`--thumb-l` / `--thumb-w`，`@property` 在 `material.css`），过渡只写在轨道上，滑块、上层裁切、以及**把滑块下面那段底层字挖掉**的遮罩逐帧同步。（以前玻璃滑块是半透明的，底下的常规体和上面的粗体叠在一起，切成德语后每个拉丁字母标签都有重影。）焦点环画在滑块上，←/→/Home/End 可用；拖动时滑块变成玻璃透镜。
- **次要动作一律是 `.pill-button`**（「添加事件」「查看全部」「管理」「再看 6 条」）：和选中的那格同一种凸起胶囊，图标用品牌色；`.pill-button.quiet` 不带底。不再有裸文字链接和描边方块。
- **一格一格的信息是凸起的小板，不是描边的平面磁贴**：周报的每一项、数据内容、覆盖账本、设置里的事实小板（`settings-base.css` 的 `.s-tile`）都是亮一点的板 + 顶边高光 + 柔和投影；没有数据的那一格反过来凹进槽里（`.is-sunken`）。
- 落地页自带一套局部作用域的暗色色板（`.landing-page { --site-* }`）——那是应用外壳之外的品牌美术，不算第三套主题。

### 景深、胶囊与动效（v3 重设计，2026-09-27）

- **圆角给足**：`--radius-sm/md/lg/xl` = 12 / 20 / 26 / 34 px。卡片是有厚度的一块板：`--mat-rim` 顶边高光 + 底边暗线，`--mat-shadow` 多一层远投影。画布有一层固定的淡色环境光（`--ambient`，由 `.app-body::before` 画），毛玻璃才有东西可折射；浮层玻璃（`--glass-rim`）带镜面顶边和底部回光。
- **舞台没有硬边**：卡组、滚轮用横向 `mask-image` 渐隐进背景，不在一条边线上戛然而止。
- **选项是胶囊，不是下拉——而且只有一种样子。** 凹槽（`--cap-track`）里托一块凸起胶囊（`--cap-thumb`），选中字用 `--cap-ink`；浮在玻璃上时（导航、顶栏）胶囊是一块更亮的玻璃（`--cap-glass-thumb`）。两到五项 → 可拖的 `SegmentTrack`（也可以只放图标，比如月亮 / 太阳）；更长的列表（语言、运动类型、AI 服务商）→ `CapsuleWheel.vue`：选项按各自宽度排在圆柱面上，选中项永远在正中的镜片下，两边像传送带转过拐角一样侧转；`loop` 首尾相接，停在第一项时左边也不空；`lens-icon` 把图标钉在镜片里（语言旁的地球）。拖动（临界阻尼吸附）、滚轮、方向键、点邻项都可以；值在停稳后才提交。`SelectMenu` 已删除。
- **主题是月亮 / 太阳两枚图标**，顶栏和「显示与语言」里同一个样子：默认跟随系统，拨到与系统一致的那一格即回到跟随系统（`useTheme.pickTheme`）。新主题**从被点的那枚图标处扩散开**：View Transition 给新快照套一个羽化的圆形遮罩（`material.css` 的 `html[data-theme-morph]`），不再整屏硬切。
- **宽度变化要有过渡**：胶囊里的字一变（同步胶囊「今天 10:30」→「数据已备好 · 交给 AI」、撤销胶囊），`useWidthMorph` 让宽度平滑伸缩，不跳。
- **切页永远不经过空白帧**：新旧两页同时在场（不用 `out-in`）。`lib/navigation.ts#pageMotion` 决定方向——`forward` 聚焦进详情、`back` 退出来、`left` / `right` 按导航胶囊的顺序横移，都带模糊。离场页钉在它当时的滚动位置，不会先跳回顶部。
- **从卡点进详情页 = 和设置卡叠同一套**（`composables/usePageMorph.ts`，2026-10-03）：新页自己从那张卡里裁出来（`translate` + 定圆角的 `clip-path`，1:1 不缩放），左上角从卡的左上角滑回原位，页头落在卡所在处；卡和页的内容先后交替、只在交接处叠一小段（卡拷贝 0–24% 淡掉、页头 16–42%、其余 20–56%；收回时卡拷贝 40–68% 回来），不叠成重影；来处页缩到 .94、淡到 .32 退后。**先备好再展开**：页面代码块和首屏数据在悬停、按下、应用空闲时就读好（`lib/pageQueries.ts` + `lib/readCache.ts`，跟着数据版本作废），新页第一帧就是真内容、等它画好才开始形变；同步落了新数据也先用上一次读好的画（之后原地换新），形变途中不重读。小卡带 `?focus=指标名`（置顶指标、「这一周」）时窗口直接从小卡长成详情页里那张趋势卡，落定后圈一下（`lib/motion/focusTarget.ts`）。滚下去再返回，缩回卡的是此刻看得见的那一段，节奏和没滚时一样。垫底和卡拷贝是页面的子元素，一道裁切动画管三样。返回是逆过程，落地那一帧拷贝就是真卡。时长曲线与卡叠共用 `lib/motion/timing.ts`（2026-10-03 放慢到开 500ms / 收 440ms，曲线 `cubic-bezier(.4, .6, .2, 1)`，像 iOS 那样慢慢落定）；形变期间 `lib/motion/budget.ts` 让图表挂载、骨架换内容这类重活等它放完，链接悬停时预取页面代码块（`lib/motion/prefetch.ts`）。
- **`.ready-glow`**（沿边流动的品牌渐变细环 + 会呼吸的外光）只留给一个时刻：「数据好了，去交给 AI」。同一屏不许有第二样东西发光。玻璃控件本身是层叠上下文，所以环用 mask 只留边、外光用外阴影——都不许把胶囊内部染色。

### 硬规则：从哪来回哪去、选项长什么样（2026-10-07）

下面四条每一页都适用。违反任何一条都算缺陷，不算风格取舍；还没达标的页面清单在
[`motion-audit.md`](motion-audit.md)。

1. **点了以后出现的新东西，一律从被点的元素长出来、关的时候缩回去。** 二级页、弹窗、浮层、菜单、详情：页面走路由 + `usePageMorph`（来源元素标 `data-morph-card`，小于 140×56 的行和胶囊也能当来源），弹窗走 `ModalDialog` + `lib/motion/dialogFlight.ts`，牌桌走 `lib/motion/cards`。时长曲线统一用 `lib/motion/timing.ts`（开 500ms、收 440ms、`cubic-bezier(.4, .6, .2, 1)`）。半路按 Esc 从此刻的计算样式原路撤回——不许先跳到「开好」再收，也不许对放完的动画 `reverse()`。不要另写一套形变。
2. **一切切换都渐变加模糊，不许硬切。** 展开收起、换标签页内容、骨架换真内容：交叉淡化 + 一层**静态**模糊（模糊只设一次，动的只有 opacity / transform；逐帧改 `filter` / `mask` 会让风扇狂转）。宽度变化走 `useWidthMorph`。原生 `<details>` 是瞬间展开的，常被点开的折叠要包一层过渡。
3. **二到五选一用玻璃 `SegmentTrack`；更长的列表用 `CapsuleWheel`；数值用滚轮列（`WheelColumn`、`WheelDatePicker`）。** 拖、键盘、点都要能用；镜片跟手（`useGlassLens`、`lib/segmentGlass.ts`）。
4. **不用下拉框，不用传统卡片式选择，不用裸复选框 / 单选框。** 唯一例外是运动详情的「运动类型纠正」（`TypePicker`）：类型太多，滚轮放不下。

合入前自检：跑一遍 `python scripts/verify/text_overlap.py`（十种界面语言 × 主要页面，任何两段可见文字压在一起就失败——法语的指标卡头部出过这事）；每个新出现的层在 CPU 降速 4× + DPR 2 下开、关各录一遍，逐帧看——没有亮帧、没有空白帧、起步不跳。

### 扑克牌与收集箱（2026-10-07）

一项指标的一天是一张牌。牌是用户挑「哪几天交给 AI」的方式。

- **动效素材库**（`src/lib/motion/cards/`）：`dealCards` 从来处扇形发牌（中间的先出）、`collectCards` 收回来处、`flipCard` 把牌压成一条线再从另一面弹开（2D `scaleX`——3D 一转字会被栅格化、转到一半是糊的）、`shuffleCards` / `cutDeck` 表示「换了一副」/「重新理过」、`flyToTarget` 拷一张替身沿弧线抛进箱子、`recedeLayer` 推镜头（上一层缩退到后面，换成一份预先模糊好的静态拷贝）、`gatherCards` 把一周收成一叠飞进手表图标（训练计划送达）。弹簧只采样一次成 CSS `linear()`，交给 WAAPI 在合成器上放（`spring.ts` 的 `SPRINGS`）。只动 transform 和 opacity；减少动效时一律退化成短淡入淡出。
- **牌桌**（`components/cards/CardTable.vue`）：7 天 → 七张日牌；1 个月 → 按自然周 4–5 叠（开头那周落在范围里不到 3 天就并进下一叠）；6 个月 → 6 叠月。点一叠往下钻，长按 450ms（带进度环）整叠收进箱子，点空白或 Esc 退回上一层。键盘：空格挑、Enter 展开一叠、Shift+Enter 整层都挑。没有记录的日子照样发牌、写「—」、不能挑——绝不写 0。从指标卡的「挑日子」（`PickDaysButton`）以浮层打开，或嵌在 `/ai/past/:category` 里。
- **收集箱**（`components/cards/CollectionBox.vue`）：右下角、浮在一切之上，空的时候不出现，在 `/ai` 上抬到底栏上方。点它，牌围成一圈、按指标归拢（「睡眠 3 天」）；悬停的牌沿半径抽出一截，× 拿出去。圈中间的箱子变成箭头：点它**新开**一个任务，正好勾上这些「类别 × 天」（`picked_days`），进 `/ai`。箱子存在本机（`card_collection_get/set`），重启还在，真正交给 AI 之后才清空。
- 凡是描述「挑日子」的任务，都说「挑了 N 天」，不说「最近 N 天」（计数只用 `lib/aiTask/pickedDays.ts` 这一份）。

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

主导航三项，在顶栏（`src/components/shell/AppTopBar.vue`）居中的胶囊里：**概览** (`/`)、**交给 AI** (`/ai`)、**设置** (`/settings`)。导航保持三项——新页面进入口卡片，不占导航位。顶栏右侧还有同步状态胶囊、月亮 / 太阳主题切换和首尾相接的语言滚轮（地球在镜片里）；760px 以下胶囊收起，底部 tabbar 覆盖同样的三项。

**返回回到来处。** 左上角返回、设置卡的 × / Esc 都读 vue-router 记在 `history.state.back` 里的上一页（`lib/navigation.ts#backDestination`、`cardCloseDestination`）：概览 →「管理」→ 账号卡 → 返回，回到概览，而不是设置首页。只有没有来处的深链接才退到所在入口的根。

二级页面不进主导航：`/body`（身体状态）、`/training`（训练状态）、`/recent`（最近记录）、`/sleep`、`/workouts` 列表，以及 `/sleep/:sleepId`、`/workouts/:workoutId` 详情，由概览的入口卡片与「查看全部」进入。

### 1. 概览 (`/`)

- v3 **没有 Hero 卡**；旧 Hero 和「不再显示介绍」偏好一并移除（Overview 挂载时清掉 `zeppbridge.overview.hideHero`）。页面自上而下是周报卡、覆盖度提示、`SourcesStrip`（设备与账户状态横带，从 v2 侧栏搬来），然后是卡片网格。
- 卡片是 `src/components/overview/` 下的模块化组件：`HeartRateCard`（最近几小时）、`StepsCard`（今日步数圆环）、`SleepCard`（昨晚睡眠结构）、两张 `StatusEntryCard`（身体 / 训练入口）和 `RecentCard`，排在 12 列 `dashboard-grid` 上。
- **面板是有厚度的板，不是平面**（`overview/panels.css`）：圆角 28px、顶边高光和投影、不描边；`v-tilt`（`lib/tilt.ts`）让卡朝指针微微倾斜（一到三度，越宽越小），一层镜面高光跟着指针走。触屏和减少动效时不启用。
- `RecentCard` 是一条**横着的时间线**：最近五条睡眠和运动从左（旧）排到右（新），每条是线上的一个节点，上面是时间，下面是名字和时长。底部的生活事件是一条**竖着的时间线**（每个节点是分类色 + 图标，持续中的会呼吸），上面是「全部 / 持续中」胶囊和胶囊形搜索框。
- **拉取时间不等于样本时间。** 云端最近几小时还没有数据时，心率卡说清楚「最新一条在昨天 22:20，手表的数据要先经 Zepp App 传到云端」，而不是刚同步完还说「同步后展示」；步数卡说「今天的步数还没到云端」；数据来源条显示每台设备最新数据的时间，而不是一句「最近有数据」。
- 两张入口卡各带当日数值与 7 天 `Sparkline`，点进 `/body` 与 `/training`。它们取代了原来的训练负荷 / VO₂ Max mini 卡——同一屏不重复展示同一个数字。
- `Sparkline` 少于两个点时不画：一个读数是数值不是趋势，画成一条平线等于宣称了没测过的稳定性。
- 每张卡片都有独立空态；加载中用 `SkeletonBlock` 占位，失败给可重试的 `EmptyState`。
- 不在概览做恢复度、训练建议一类解读。入口卡只给数字和形状，解读留给用户自选的 AI。
- 启动同步的进度只在一处说：顶栏同步胶囊（「同步中 3/8」）。用户在等的那次同步落地后，它变成发光的「数据已备好 · 交给 AI」。只有用户在等的同步会喊（启动、顶栏、托盘、设置），每十五分钟的后台自动同步不喊；失败、根本没跑起来一律不说「已备好」（`lib/dataReady.ts`）。进 `/ai` 即熄灭。同步中界面上不给「取消」：半路停下会留下一部分流更新了、另一部分没更新的库。

### 2. 交给 AI (`/ai`)

总页只做概括；每一处下钻都是路由，从总页对应的缩略卡长出来（`usePageMorph`），草稿在子页之间来回不丢（模块级单例）。

- **总页**（`/ai`）：任务名胶囊（→ `/ai/tasks`）、「你的过去」缩略卡（→ `/ai/past`）、「你的下一步」缩略卡（这周几练几休、发没发，→ `/ai/plan`）、「上次发到手表」状态栏、模板胶囊 + 唯一的输入框、往返记录列表（每行 → `/ai/exchanges/:id`）、底栏。
- **你的过去**（`/ai/past`、`/ai/past/:category`）：六类数据各一行细条 + 回溯把手；某一类的页上是这一类的牌桌和逐天列表。缺的日子写「—」。
- **计划**（`/ai/plan`、`/ai/plan/:date`）：周视图自由拖拽（放在卡上交换、放在缝里插入并顺移、过去的日子锁定、有键盘替代）；单天页强度图直接拖（右边缘改时长、上下改心率区间）+ 行内滚轮精调。运动大类和子类型用玻璃分段，旁边一行小字说明手表上还会再选一次子类型（官方限制）。目的和描述没填不让发。发出去的计划过去的日子以外都能改，重新同步会把涉及的每个 7 天窗口都重推。
- **寄出前检查**（`/ai/check`）：带了哪些数据、覆盖多少，附件原件，详细程度，精确路线，每个模型的订阅状态，完整提示词的只读预览（点用户那句飞回总页输入框）。没有「高级选项」折叠。
- **底栏**：就绪度摘要（→ `/ai/check`）+ 一枚可以横拨换模型的服务商胶囊，单击就寄出；订阅状态只是角标。
- 计划与实际只按本地日期和兼容的运动大类配对。演示库显著标记模拟，发送走本地模拟账本，不产生手表请求。

### 3. 最近记录与详情 (`/recent`, `/sleep`, `/workouts`, `/sleep/:id`, `/workouts/:id`)

- `/recent` 是**一条按天分组的竖向时间线**，睡眠（归到醒来那天）和运动排在一起，最新的在上面。胶囊切「全部 / 睡眠 / 运动」，选运动时多一个运动类型滚轮；「全部睡眠」「全部运动」进完整列表。被过滤掉的不完整记录必须显式提示「N 条数据不完整已隐藏」，不能静默消失。
- 运动详情：指标矩阵 + ECharts 心率/配速曲线 + 本地 SVG 轨迹（按配速映射 `--route-*` 色谱）+ 暂停区间。没有轨迹点就不画地图，没有逐点采样就不画曲线。
- 睡眠详情：`StageBar` 阶段构成（用 `--sleep-*` 四色）+「阶段说明」折叠 + 近 7 天睡眠结构堆叠柱状图；时长、评分、来源、设备如实展示，缺失即 `未提供`。

### 4. 身体状态 (`/body`) 与训练状态 (`/training`)

- 两页同构：`PageHeader` 右侧是 7 天 / 1 个月 / 6 个月的 `range-switch`，主体是 `minmax(320px, 1fr)` 自适应卡片网格。
- 身体状态八张 `MetricTrendCard`：恢复、压力、血氧、夜间血氧 ODI、HRV (SDNN)、HRV (RMSSD)、呼吸率、静息心率。有实测区间的（压力、血氧、HRV、呼吸率）在折线后面画当日 min–max 阴影；**没测出区间的当天不画零宽阴影**。
- 训练状态：VO₂max / 训练负荷 / PAI 三张趋势卡，乳酸阈值心率+配速双轴卡（配速轴 `inverse`，让「更快」朝上），运动负荷平衡卡（7 天负荷、28 天周均、急慢比三条线），以及 `HeartRateZonePicker`。
- 生活事件**每页只出现一次**：一排胶囊（添加 / 这段时间里的事件 / 管理）；趋势卡下面不再每张都重复「+ 添加事件 · 管理生活事件」。图上的事件圆点仍可点开。
- **切范围时线条平滑变形**，不清空重画：趋势图用合并模式更新（`metricSeries.ts#SMOOTH_CHART_UPDATE`：`notMerge: false, replaceMerge: ['series']`），更新动画 520ms。
- 每张卡片都写明覆盖度：「30 天里有 12 天记录」。**缺的天曲线直接断开**（`connectNulls: false`），不插值、不补零。只有 1 天数据时不画图，直接说「画不出趋势」。
- 6 个月这一档不是装饰：VO₂max 与乳酸阈值一年只测几次，30 天窗口会把库里已有的数据显示成空。

### 5. 设置 (`/settings`)

**三种形态的卡组**，不做左侧目录。八张卡（`views/settings/cards.ts`）：账号与设备 · 同步与更新 · 归档与存储 · 数据内容 · 交给 AI 工具 · 显示与语言 · 隐私与安全 · 高级与维护。同一批卡在形态之间用 Web Animations 直接动真实元素（FLIP；几何是纯函数 `lib/deck/morph.ts`，编排在 `composables/useDeckMorph.ts`），所以**随时可以打断**：打开到一半关掉就原路倒回（`Animation.reverse()`），展开到一半收起就从半路飞回去。（View Transitions 过渡期间点什么都不算数，快照带模糊逐帧重绘，收起时一顿一顿的。）

- `/settings` 默认是 **coverflow**（`DeckCoverflow.vue`，摆位来自纯函数 `lib/deck/coverflow.ts`）：正中一张立着，两侧的卡侧转约 46° 紧紧叠在两边，越远越小、越糊、越淡；卡组首尾相接，两边永远有卡；舞台两端渐隐进背景。拖动（`useSpringIndex` 按速度吸附）、滚轮、←/→、点侧卡转到正中；点正中那张或回车打开。没有左右箭头按钮——拖就是翻。侧卡没有硬边：外侧那一半按离正中的远近渐隐进背景（`coverflowPose().dissolve`）。
- **「展开全部」**把卡从正中往两边依次抽出（每张相隔 16ms、各 420ms）、纵向平铺成两列；底部浮着醒目的**「收起」**胶囊，按相反顺序插回卡组。用哪种形态记在本机。
- `/settings/:card` 打开一张：它从总览里那张卡的位置长成整页（左上角对齐缩放 + 底部裁成源卡的比例），总览绕顶边中点往后退、变糊、淡出；关掉时准确落回源卡的位置。打开后仍可按住卡头拖动甩出（拖动可以打断正在进行的翻页）、←/→、PageUp/PageDown 或下面的圆点；× / Esc 回到打开它的地方；开了减少动效就直接切换。卡片没有描边、也没有高光线——边界靠厚度和投影。
- 互不相干的几件小事**横着排**成小板（`.s-tiles`）：隐私的三条事实，高级里的数据文件夹 / 数据健康 / 压缩报文。
- 分层：`lib/deck/physics.ts` + `lib/deck/coverflow.ts` + `lib/deck/morph.ts`（纯函数，有 vitest）→ `composables/useCardDeck.ts` / `useSpringIndex.ts` / `useDeckMorph.ts` → `components/deck/`。各卡内容在 `views/settings/sections/`，共享状态经 `composables/settings/context.ts` 注入。
- 卡内排版统一用 `settings-base.css` 的列表行：标签在左、控件在右、行间细线。
- 历史补拉只有一个入口，在「归档与存储」卡里（长期归档开关 → 起点与开始补拉 → 预计体积 → 覆盖账本）。

## 组件与图表

- 无 UI 框架，组件全部自研，位于 `src/components/`：`BrandMark`、`CategoryMark`、`CircularProgress`、`CardDeck`（`deck/`）、`DatePicker`、`DeviceMarquee`、`DeviceVisual`、`EmptyState`、`GlyphTile`、`HeartRateZonePicker`、`Icon`、`MetricTrendCard`、`ModalDialog`、`PageHeader`、`RecordRow`、`SegmentTrack`、`CapsuleWheel`、`SkeletonBlock`、`Sparkline`、`StageBar`；按页面分的子组件在 `components/<页面>/`（`overview/`、`workout/`、`archive/`、`ai/`、`deck/`、`shell/`）。新增前先确认这里没有能复用的。
- 按天趋势一律走 `MetricTrendCard` + `lib/metricSeries.ts` 的 `buildSeriesOption`，不要在页面里各写一套 option；`SERIES_RANGES` 是三档范围的唯一来源。
- 图标：`Icon.vue` 是内联 SVG 线性图标；大号语义图标用 `GlyphTile.vue`——CSS 材质底座 + `Icon.vue` 的图形，颜色按 `tone` 取类别 token（名称到图形的映射在 `lib/glyphs.ts`），深浅两套主题共用。不要再加 PNG 3D 图标；只有品牌图（app-icon、brand-mark、zepp-cloud）仍是图片。图片必须走 import 让 Vite 产出实体文件——桌面 CSP 不允许 data URL 与外部图源。
- 图表统一走 `src/lib/echartsSetup.ts` 的 `vue-echarts`：注册了 `zeppbridge-dark` 与 `zeppbridge-light` 两套主题，并导出响应式的 `CHART_THEME` / `chartPalette`。每个 `VChart` 都绑 `:theme="CHART_THEME"` **和** `:key="CHART_THEME"`（换主题时整图重建），每个 option 都是 `computed`，chrome 色（轴文字、网格线、tooltip、标记、系列语义色）一律从 `chartPalette.value` 取，不写字面量 hex——CSS 变量进不了 canvas，所以色板色值与 `tokens.css` 对齐维护。不要在页面里重复定义配色。
- 图表的外观跟着玻璃材质走：tooltip 是圆角、带背景模糊的玻璃；悬停指示是一根细虚线，柱状图不画灰色阴影框（睡眠图完全关掉了）；折线下面垫一层从上往下淡掉的光，有实测区间阴影时不叠。
- **首页（概览）不加载 ECharts。** 概览的心率曲线是 `components/overview/HrMiniChart.vue`（SVG，几何在 `lib/miniChart.ts`），入口卡的 7 天走势是 `Sparkline`。图表引擎 580 KB，只给二级页的交互图表用；往概览里加 `VChart` 等于让每次冷启动都多解析一遍它。

## 交互与可访问性

- 顶部有 `跳到主要内容` skip-link；导航、单选组用 `role` / `aria-*` / `aria-pressed` 标注；图表带 `role="img"` 和中文 `aria-label`。
- 焦点态统一 `:focus-visible` 2px `--focus` 描边，禁止 `outline: none` 了事。
- 触控目标最小 44px（移动菜单按钮、底部导航、`RecordRow`）。
- 主断点 760px：顶栏胶囊导航收起，底部 tabbar 覆盖同样的三项；概览另有 1180 / 820 两级栅格降列。
- 界面缩放 80 / 90 / 100 / 110 / 125%（`UI_SCALES`），入口在设置「显示与语言」卡，快捷键 Ctrl + / Ctrl - / Ctrl 0，持久化在 localStorage。
- 时间格式化前先判 `Date.getTime()` 是否有效；错误信息保留可操作内容，不要吞成「加载失败」。

## 这份文档的维护

页面结构以 `src/router/index.ts` 和 `src/AppShell.vue` 的 `navigation` 为准，设计 token 以 `src/styles/tokens.css` 为准。改导航、改色板、改主题状态时同步改这里；与源码冲突时**以源码为准**，并顺手修正本文。工程门禁见[开发文档](development.zh-CN.md)，产品边界见[架构摘要](../reference/architecture.zh-CN.md)。


### 可读性后续优化

- 模板标题、说明与下拉选项完整换行，不用省略号隐藏选择所需的信息。提示词编辑区与弹窗正文使用 `--fs-md`，辅助说明沿用现有字号阶梯。
- 不对说明文字所在容器整体降低透明度。缺失数据卡片保留清晰文字，用虚线边框区分；禁用操作仍可变淡。
- 胶囊选择器是 `role="radiogroup"`（`SegmentTrack`）或 `role="slider"`（`CapsuleWheel`，`aria-valuetext` 报当前项），方向键、Home/End 可用。
- 设置页的隐私和更新说明共用 `ModalDialog`：包含可访问名称、Tab/Shift+Tab 焦点循环、Esc 关闭、关闭后焦点返回，以及受视口约束的滚动区域。关闭按钮保留中英文名称。
- 搜索框与编辑区内部取消原生轮廓时，由外框的 `:focus-within` 提供可见焦点。
