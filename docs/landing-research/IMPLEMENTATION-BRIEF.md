# ZeppBridge 落地页重构方案

## 设计判断

参考池是使用/收入排名，不是设计评奖。采用各报告中有现场证据且适合本地健康档案的做法；被阻挡的网站不提供可用的视觉/动效证据。详细证据在 batch-01 至 batch-10 和 supplement-01 至 supplement-05；基线在 local-audit.md。两个修改 Agent 开始前必须读取全部十五份已完成报告，以及 synthesis.md、supplement-synthesis.md，确认这一方案的取舍。新增 50 个参考与最初研究同等纳入决策，而不是只附在文档末尾。

主题是「手表记录，自己的档案」。保留暖纸、橄榄绿、冷灰暗色、现有 MiSans 与真实应用。参考 Anthropic 的克制编辑层级，Cursor/Suno 的真实产品证明，Descript/Evoto 的任务动词，Meshy/ElevenLabs/Synthesia 的少量明确模式，Google 产品页面的条件说明。不要照搬色板、文案、动画或企业菜单。

## 页面与交互

1. 固定且始终可读的价值主张；不把 H1 藏进滚动切换。首屏文案缩短、左右比例合理、减少无意义空白。手机顺序是标题/说明/操作，再演示。
2. 明确区分「查看示例」「下载公开版」「源码」。保留一扇真实应用，不制造仿造数据 UI，不让体验依赖滚满五屏。五个功能章节可直接选择，有清晰的当前章节和解释，键盘可用，必要滚动尊重减少动态；所有章节内容可被理解/访问。
3. 导航按职责分为演示、连接、数据隐私、常见问题、下载。手机同样能够访问主要章节。导航用于去往真实章节，不伪装成复杂产品目录；如使用二到五项选择器应复用 SegmentTrack。
4. 演示首屏与交接处说明是合成的示例数据、开发中的 v3，并与公开稳定下载区分。未测到保持空白；不编造疗效、增长数字、用户评价或背书。
5. 隐私块说明正常同步的健康数据路径，档案保存在自己的电脑，主动导出到 AI 才产生额外目的地。网站有授权回调/更新/主动错误报告服务，不宣称整个项目没有服务器。图表和文字同样可访问。
6. 连接方式改为明显的推荐路径加两条高级备选，避免三个等重卡片让新人误以为必须全做；条件、指标范围与设备差异放在旁边。
7. 加简洁 FAQ：账号、设备/指标、离线使用、缺失、AI/导出、稳定版与演示。回答短而准确，深入内容链接到现有官方项目文档。
8. 下载区按平台/渠道分层，保留受信任 release URL 验证、API 失败回退、Linux 实验性状态、未签名安装说明。停止声称点击即完成下载；不要以弹窗打断下载索要 Star。

新增研究进一步确认：用 Signal/Things 的清晰承诺、Linear 的阅读节奏、Resend 的稳定标题配可切换真实证据、Screen Studio 的可逆探索、Apple Health/Ente 的档案与隐私结构、Exist 的具体来源覆盖、Gentler Streak 的个人历史语气。不要模仿它们的品牌视觉，也不要搬入健康评分或诊断。HandoffOverlay 的合成示例只讨论记录、来源和缺失，不编造精确改善、因果结论或疗效。

菜单和演示须 Escape 退出、焦点可见且返回触发点；iframe 消息校验 origin 和实际 source 窗口；手机/键盘与鼠标功能一致。按钮真实计算色彩需复核，H1 始终唯一且可读，所有锚点可到达，320–1920px 无横向溢出。减少动态不得残留自动循环或隐藏内容。详细采样限制见 supplement-synthesis.md。

## 动效和视觉质量

动画解释真实状态，章节/说明交叉淡化、来源清楚、控件使用既有组件，触屏无磁吸，减少动态可立即使用。移动端不能 sticky 缩略桌面堵住标题。离屏循环停止，禁止滚动劫持、自动轮播文字、全屏背景视频和新增依赖。修复实际按钮前景、正文可读性、锚点偏移、焦点/隐藏内容和浏览器降级。

## 两个修改 Agent 的独占文件

**A：主体验与导航**：`src/views/LandingPage.vue`、`src/views/landing/StorySection.vue`、`StageWindow.vue`、`SiteNav.vue`、`landing.css`、`motion.ts`、`HandoffOverlay.vue`，必要的仅落地页行为回归测试。不要编辑其他既有桌面/共享组件文件；DeviceMarquee 可通过父作用域约束其行为，不编辑共享组件。

**B：信任、文案与下半页**：`src/views/landing/copy.ts`、`types.ts`、八份懒加载语言包、`PrivacyFlow.vue`、`ConnectPaths.vue`、`FinalCta.vue`、新建 `FaqSection.vue`。允许仅修改 `src/composables/useLandingLocale.ts` 的网站元信息（已有机制不变）。不要编辑 A 的文件、`useDownloads.ts`、release 服务或应用 i18n。

### 共享文案契约（B 新增，A 消费）

- `nav.connect: string`，`nav.faq: string`；保留现有字段。
- `hero.demo: string`（查看示例 CTA），`hero.edition: string`（v3 示例 vs 公开下载边界）。
- `explore: { kicker: string; title: string; lead: string; tabs: [string,string,string,string,string] }`；tabs 顺序为同步、缺失、AI、计划、设置，对应既有 beats 和真实 demo routes。
- `faq: { heading: string; lead: string; items: Array<{ question: string; answer: string }> }`。
- 新 `FaqSection` 接收 `copy: LandingCopy['faq']`，以 `id="faq"` 为锚点。
- B 保留现有 beats 的五项数量与顺序，所有十种语言都补齐这些字段。hero/beat/隐私/最终渠道措辞同步到所有语言，不能新 UI 半英半其他语言。
- A 在 `LandingPage.vue` 接入 `FaqSection :copy="t.faq"`（连接后、下载前）。NavTarget 可扩展为 story/ai/privacy/connect/faq；每项具有真实目的地。

两个 Agent 都使用 GPT-6.1 Sol high，无额外子 Agent。必要集成修正仍交给这两个 Agent，主调度负责研究汇总、审阅和浏览器验收。完成后本地打开，部署等用户明确同意。
