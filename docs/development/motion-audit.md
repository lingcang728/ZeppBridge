# 动效与选择控件审计（2026-10-07）

对照 [ui-guidelines.md](ui-guidelines.md)「Hard rules」四条（从哪来回哪去、切换渐变加模糊、二到五选一用玻璃分段、
不用下拉 / 卡片式选择 / 裸复选框），审计「交给 AI」以外的页面。「交给 AI」与训练计划在精修批次 1–7 已经改过，
不在这张表里。

> **2026-10-07 第二轮：13 项全部修完**（见文末「修复记录」）。新增的同类问题照这里的做法修，别再另写一套。

审计方法：搜 `<select`、`<details`、`type="checkbox"` / `type="radio"`、带 `aria-pressed` 的按钮组、
`role="listbox"`、点击切换的 `v-if` 面板，再逐个读组件确认是不是用户点出来的。弹窗统一走
`ModalDialog` + `dialogFlight`，已经从触发处长出（隐私说明、更新说明、置顶指标选择、运动类型纠正、生活事件、
清空计划都达标）。没有任何页面还在用 `<select>`。

## 一、违反「不用下拉 / 卡片式选择 / 裸复选框」

| # | 位置 | 现状 | 应改成 | 优先级 |
|---|---|---|---|---|
| A1 | `components/DevicePicker.vue` 顶部类型筛选（设置 → 设备、设备详情的「指认型号」） | 一排 `filter-chip` + `aria-pressed`，自己画的选中态 | `SegmentTrack compact`（项数 ≤ 5） | 中 |
| A2 | `components/DevicePicker.vue` 「把这次指认贡献给设备目录」 | 原生 `<input type="checkbox">` | 玻璃两档开关（`SegmentTrack` 两项，或和「精确路线」同款） | 中 |
| A3 | `components/HeartRateZonePicker.vue` 心率区间依据（最大心率 / 静息心率…候选） | 卡片式行列表，点一行选中 | 候选 ≤ 5 时用 `SegmentTrack`，数值写在标签里；更多时 `CapsuleWheel` | 中 |
| A4 | `views/landing/LocalePicker.vue` 落地页语言 | 下拉列表（`role="listbox"` 弹层） | `CapsuleWheel loop`（和设置里的语言滚轮一致）。落地页不在桌面应用里，优先级最低 | 低 |

例外（保留）：`components/workout/TypePicker.vue` 运动类型纠正——类型太多，规范明确允许。

## 二、违反「切换渐变加模糊，不许硬切」

| # | 位置 | 现状 | 应改成 | 优先级 |
|---|---|---|---|---|
| B1 | `components/workout/WorkoutSidePanels.vue` 「交给 AI / 导出」两档 | 分段本身是玻璃的，但下面两块内容用 `v-if` 硬换 | 两块交叉淡化 + 静态模糊，高度用 `useWidthMorph` 同款思路平滑 | 高 |
| B2 | `views/DeviceDetail.vue` 「指认型号」 | 按钮行和 `DevicePicker` 用 `v-if` 互换，瞬间出现一大块 | 选择器从「指认型号」按钮长出来（`dialogFlight` 或页面内展开过渡），取消时缩回 | 高 |
| B3 | `views/settings/sections/AuthSection.vue` 「手动填写凭据」 | 点按钮后表单 `v-if` 瞬间插入，下面的内容被推下去 | 展开过渡（高度 + 淡入），收起反向 | 中 |
| B4 | `components/HistoryArchivePanel.vue` 起点选「自定义」 | 日期行 `v-if` 瞬间出现 | 同 B3 | 中 |
| B5 | 原生 `<details>` 折叠：`HistoryArchivePanel`（估算明细）、`InsightCard`（基线说明）、`MissingMetricsRow`、`WorkoutHero`（类型说明）、`HeartRateZonePicker`（设定区）、设置 `AdvancedSection`（诊断）、`AuthSection`、`CapabilitySection`（探测诊断）、`McpSection`（提示词）、`ai/CoverageDetails` | 原生展开是瞬间的 | 抽一个共享的折叠组件（`<details>` 语义 + `::details-content` / 高度过渡 + 淡入），十处换成它 | 中 |
| B6 | `views/HealthCheck.vue`、`settings/sections/DevicesSection.vue` 等处的提示条（`inline-alert`、`alert`、`api-error`） | 状态一变就 `v-if` 冒出来，把下面的内容推下去 | 统一走一个提示条过渡（淡入 + 高度），和顶栏状态胶囊的 `.notice-*` 同一套 | 低 |
| B7 | `components/LifeEventsPanel.vue`、`views/RecentRecords.vue` 「再显示 N 条」 | 新的行瞬间出现 | 新行逐条淡入（`TransitionGroup`，只动 opacity / transform） | 低 |

## 三、违反「从哪来回哪去」

| # | 位置 | 现状 | 应改成 | 优先级 |
|---|---|---|---|---|
| C1 | `views/DeviceDetail.vue` 指认型号（同 B2） | 见上 | 见上 | 高 |
| C2 | 健康检查（`/health-check`）的「重试」、设置「数据能力」卡的「重新探测」结果 | 结果区原地替换 | 结果从被点的按钮处展开；骨架换内容交叉淡化 | 低 |

设置卡叠（`/settings` ↔ `/settings/:card`）、概览卡 → 二级页、运动 / 睡眠列表 → 详情都已经走 `usePageMorph`
或卡叠形变，达标。

## 修的顺序建议

1. B1、B2/C1：用户最常点、硬切最明显。
2. B5：一个共享折叠组件一次修十处。
3. A1–A3：换控件，顺带删掉各自的选中态样式。
4. B3、B4、B6、B7、C2、A4。

每修一条都要在 CPU 降速 4× + DPR 2 下逐帧看一遍（见 ui-guidelines 的「Check before merging」）。

## 修复记录（2026-10-07，交给 AI 精修第二轮 R7）

| # | 怎么修的 |
|---|---|
| A1 | 设备类型筛选 → `CapsuleWheel`（六项，超过五项用滚轮） |
| A2 | 「贡献给设备目录」→ `.mat-switch` 玻璃开关 |
| A3 | 心率区间依据 → 每一槽一条 `SegmentTrack`（超过五个候选用 `CapsuleWheel`），来源和说明写在下面一行 |
| A4 | 落地页语言 → `CapsuleWheel`（和应用顶栏的语言轮同一个组件） |
| B1 | 运动详情「交给 AI / 导出」两块叠在同一格里交叉淡化，高度取高的那块（第三轮起「交给 AI」挪到头部的「问 AI」胶囊，这里只剩导出） |
| B2 / C1 | 设备详情「指认型号」：`FoldTransition origin="top left"`，选择器从按钮所在的角长出、取消时缩回 |
| B3 / B4 / B6 / C2 | 新组件 `components/FoldTransition.vue`（高度 + 淡入，小块专用）：手动凭据表单、补拉自定义起点、各处提示条、健康检查「立即执行」的结果、数据能力的错误 |
| B5 | `material.css` 一条全局规则：`details::details-content` 高度 + 透明度过渡（`interpolate-size: allow-keywords`），十处折叠一起生效 |
| B7 | `material.css` 的 `row-in`：新出现的行淡入上浮，缓存页回场不重放 |

防再犯：`scripts/verify/text_overlap.py`（十种语言 × 九页，任何两段可见文字压在一起就失败）和
`scripts/verify/topbar_collision.py`（顶栏）。改了页面头部、胶囊、按钮的排版就跑一遍。

## 第三轮：全局玻璃审计（2026-10-07 晚，阶段一 1D·D4）

用户 10-07（11.txt 第 8 条）：凡是拖动、二到五选一、开关都换成 Liquid Glass，唯一例外是运动类型纠正。逐个搜了
`role="switch"`、`.mat-switch`、`type="checkbox"` / `type="radio"` / `type="range"`、`role="slider"`、带 `aria-pressed` 的按钮组。

| 控件 | 结论 |
|---|---|
| 二到五选一（`SegmentTrack`）：牌桌周期、回溯范围（`BridgeHandle`）、订阅两档（`SubscriptionList`）、详细程度、同步频率、趋势范围、设置各卡里的分段、顶栏导航与主题 | 已经是 Liquid Glass：`inset` / `glass` / `bare` 三种底都挂了 `thumbLens`，按住浮起成透镜、可拖、可甩 |
| 更多项（`CapsuleWheel`）：语言、AI 服务商、设备类型、心率区间候选 | 已经是 Liquid Glass（镜片折射） |
| **开关**：同步（卡面快捷 + 卡内）、本机 API、MCP 任务共享、精确路线（GPS）、历史补拉两处、生活事件「仍在持续」、设备目录贡献、运动页「带上前 7 天恢复」——共 10 处 | **改了**：新组件 `components/GlassSwitch.vue`。停着白钮；按下白钮化开、同处浮起一块比它宽的折射玻璃（`useGlassLens('thumb')`，透镜按浮起尺寸常驻、停着时缩小隐去，不重建滤镜）；可按住左右拖，轨道颜色按位置淡入，过半松手换档；点一下照常切换；键盘走原生按钮。弹窗里（祖先有毛玻璃）不挂折射，浮起的是一块乳白玻璃边。`material.css` 的 `.mat-switch` 已删 |
| 多选标签 / 置顶 / 牌面勾选（`aria-pressed` 按钮） | 不属于「二到五选一」，保持按钮 |
| `StageBar` 的 `role="slider"` | 睡眠阶段图上的游标，不是选择控件，保持 |
| `components/workout/TypePicker.vue` 运动类型纠正 | 例外（类型太多），保持 |

抽帧验证：`/ai/check` 的精确路线开关，深浅两套 × 停着 / 按住 / 拖到一半 / 松手四帧（DPR 2），按住时透镜折射底下的轨道、拖动时绿色按位置淡入、松手落回白钮。
