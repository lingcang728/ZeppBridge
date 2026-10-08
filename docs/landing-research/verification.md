# 修改结果与验收交接

日期：2026-10-07，Asia/Taipei。状态：两名 GPT-6.1 Sol high 修改 Agent 已完成源码修改；主调度完成最终生产构建、浏览器复核和真实示例操作检查。当前仅本地预览，正式部署等待用户认可。

## 最终页面与研究的关联

| 修改 | 为什么这样做 | 主要参考 |
|---|---|---|
| 固定「手表记录，自己的档案」首屏；说明、下载与示例操作清楚分开，手机先文案后应用 | 初次访客先理解产品；价值主张不随滚动消失 | Signal、Things、Obsidian、Anthropic |
| 一扇真实应用，五个直接可选章节；保留现有 SegmentTrack 的 radio 键盘语义 | 同一份真实产品提供证明，用户自己选择探索顺序 | Resend 的可逆选择、Linear 的节奏、Cursor 的产品证明 |
| 五章分别使用 `/`、`/heart`、`/ai`、`/ai/plan`、`/settings` | 修掉已失效的计划区域选择器，确保计划章节展示真正的计划页 | Screen Studio 的具体流程、Intervals.icu 的功能详情 |
| 清楚标注合成数据与开发中的 v3；公开稳定版下载在相邻位置说明差异 | 不让示例界面成为未公开功能的下载承诺 | Google 产品的条件说明、Obsidian 的下载职责 |
| 接管与退出可逆；退出按钮在窗口标题条，不遮挡应用发送按钮；Escape 与焦点返回 | 真正的发送路径能够操作，页面滚动与应用操作有清楚边界 | Screen Studio、Things、已实测的可关闭菜单案例 |
| 同步路径、主动外部 AI 导出、授权/更新/主动诊断服务分开解释 | 精确说明健康档案保存地点，不使用「整个项目没有服务器」这样的绝对句 | Apple Health、Oura、Ente、Tresorit |
| 推荐官方授权，旁边两条高级备选；设备图片收紧为 12 个代表图 | 避免把三个方法理解成必须完成的步骤，避免设备图墙盖过档案叙事 | Exist 的来源覆盖、Garmin 的分类职责 |
| 六项原生 FAQ，连接、隐私与项目文档可深入阅读 | 保持首页简洁，同时回答首次使用的关键条件 | Day One、Intervals.icu、Proton/隐私工具的技术说明 |
| 公开稳定版平台下载、未签名说明、API 失败回退；Linux 实验性标记跟随 API | 保留真实下载边界，删除仅凭点击声称已下载的 Star 弹窗 | Obsidian、Google Fitbit 的相邻条件 |
| 保留暖纸/橄榄绿/MiSans与冷灰暗色；静态设备展示、短状态过渡、减少动态立即可用 | 有产品辨识度，完整内容不依赖自动播放 | Linear、Things、Gentler Streak；Ente/Exist 的持续循环作为反例 |

AI 对话样例现在只整理合成记录的来源、日期和缺失项，明确不连接外部 AI、不说明健康变化的原因。没有采样仍是缺失，没有使用 0、上一值或估算值填空。

## 实际修改范围

主体验：`src/views/LandingPage.vue`，`src/views/landing/StorySection.vue`、`StageWindow.vue`、`SiteNav.vue`、`HandoffOverlay.vue`、`landing.css`、`motion.ts`。

内容与信任：`src/views/landing/copy.ts`、`types.ts`、八份懒加载语言包、`PrivacyFlow.vue`、`ConnectPaths.vue`、`FinalCta.vue`，新增 `FaqSection.vue`；`src/composables/useLandingLocale.ts` 只修改网站元信息。网站语言测试的标题断言随真实文案更新，并新增锚点焦点/减少动态回归测试。

共享 DeviceMarquee/SegmentTrack/CapsuleWheel 的源文件没有修改，设备密度由落地页父作用域约束。`useDownloads.ts`、release URL 校验与 Cloudflare release 服务保留。本任务没有安装新依赖，没有修改健康数据约定，也没有构建或替换桌面 EXE。仓库其他任务的字体、应用 i18n 与桌面组件改动不属于本次落地页范围。

暂停后恢复时发现先前部分网站源文件已回到旧版，因此两名修改 Agent 以实际磁盘为准重新落实保留稿；没有重新收集或省略新增 50 品牌。最终验收针对重落盘并完成修正后的生产构建。

## 构建与自动化检查

- 最终 `npm run build` 成功，包含完整 `vue-tsc --noEmit` 与 Vite 生产构建。
- 定向 Vitest：4 个文件、43 个测试全部通过，覆盖网站语言/元信息、锚点焦点与减少动态、下载 URL 判据、演示缺失数据。
- `node --test tests/release-function.test.mjs`：5 个测试全部通过，覆盖稳定下载投影、缺失包拒绝、GitHub 失败关闭与可选 Linux 包。
- 任务源文件 `git diff --check` 通过。Git 的 LF/CRLF 提醒不是校验错误。
- 既有 bridge 静态/动态导入和 charts 大块警告仍存在。没有把浏览器与桌面应用一起做新的拆包重构，也不把本次构建称为无警告。

## 最终浏览器检查

使用已经安装的 Python Playwright 和本机 Chrome，匿名隔离上下文，生产入口 `http://127.0.0.1:1532/`。没有安装工具或读取真实健康库。

**31 个页面矩阵案例全部通过：**

- zh、en、es、nl、pt-BR、pt-PT、de、ru、hi-IN、fr，各检查 390px 和 1440px。
- 中文额外检查 320、768、1024、1280、1920px。
- 中文深色 390/1440；英文减少动态 390/1440。
- 下载 API 503 回退、有效受信任响应、含不受信任 Linux URL 的响应。

全部案例只有一个可读 H1，没有页面脚本错误和文档横向溢出。各语言的元信息和完整新增内容能够加载。主按钮实际计算对比度：浅色约 6.29:1、深色约 8.07:1；浅色小号说明文字从约 4.23:1 加深为约 4.77:1。按钮平台小字不再通过透明度降低对比度。这些是选定样本的测量，不是完整 WCAG 认证。

**29 项实际交互检查全部通过：**唯一真实 iframe，五条真正路由，键盘方向键选择，外层/应用内 Escape，接管后焦点返回，同源但非实际 iframe 窗口的消息拒绝，实际 iframe 的交接消息接收，模态初始焦点与 Tab 约束，背景 inert 与关闭恢复，真实应用 `.dock .send` 点击打开合成对话且无外部 AI 请求，FAQ 展开/收起，手机五个目的地与菜单 Escape，每个目的地的焦点和固定导航避让，以及下载 Star 弹层已移除。

控制补充：桌面语言滚轮方向键、懒加载语言切换、主题按钮、刷新后语言/主题保存、手机语言滚轮、减少动态下全部揭示内容、设备区没有自动循环，均通过。另有一个颜色采样记录，不把它算作额外行为测试。

**4 个下载条件案例全部通过：**模拟 macOS 访客首按钮选 DMG；只有三个必需资产时仍可直链；Linux preview=true 显示实验性标记；有有效 Linux 包而 preview=false 时不再误标实验性。测试响应的版本号和资产是合成 fixture，不是本次线上最新版核验，也没有下载/安装或验证各平台二进制。

人工视觉复核覆盖中英文首屏、手机、暗色、完整章节节奏、隐私/连接/FAQ/下载区、设备展示和合成交接对话。法语手机和中文桌面信任区也由修改 Agent 单独复核；外语文案未经过所有语言的母语编辑审核。

## 本地预览与证据

- 生产预览：`http://127.0.0.1:1532/`，运行命令 `npm run preview -- --host 127.0.0.1 --port 1532`。
- 已在 Codex 内置浏览器打开并保留预览标签；实际页面标题为「ZeppBridge · 手表记录，自己的档案」。
- 开发预览：`http://127.0.0.1:1531/`，运行命令 `npm run dev -- --host 127.0.0.1 --port 1531`。
- 完整浏览器结果与截图：`C:/Users/15pro/AppData/Local/Temp/zeppbridge-site-after/`，包括 `matrix.json`、`interactions.json`、`controls.json`、`download-cases.json`、`desktop-full-revealed.png`、各主题首屏和 `handoff-desktop.png`。
- 构建日志：`C:/Users/15pro/AppData/Local/Temp/zeppbridge-landing-build-final.log`。
- 原始调研截图/HTML/JSON 各在十五份报告列出的临时证据目录；完整结论和出处保存在仓库与桌面 Markdown，不依赖临时文件永久存在。
- 仓库内的 `verification-evidence.json` 保存精简矩阵结果、行为结果和任务文件哈希，便于后续 Agent 对照。

本地 Vite 预览不运行 Cloudflare Functions，所以没有模拟响应时，下载区会真实回退到 GitHub Releases。接口正常/异常逻辑另经上述 mock 与函数测试验收。此次没有部署 Cloudflare Pages，没有对 zeppbridge.com 作发布操作，没有 push/tag/Release。服务器关闭后可用上述命令重新打开；源码与报告已经保存。

## 后续 Agent 接续顺序

1. 阅读桌面汇编与本文件，保留两个修改 Agent 的文件所有权和其他任务的未提交改动。
2. 用户审阅以 1532 生产预览为准；如改动布局或交互，重建 dist 后再复核受影响路径。
3. 正式上线必须等用户明确认可。部署前重新确认当前 Git 状态、Cloudflare 项目和正式域名，不把 v3 桌面 beta 打成公开发行。
4. 修改研究或验收记录后运行 `G:/python/python.exe docs/landing-research/export_report.py`，更新桌面 `ZeppBridge落地页优化.md`。
