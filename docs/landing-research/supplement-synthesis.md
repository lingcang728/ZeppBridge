# 新增 50 个品牌：证据与改造决策

五个新增 GPT-6 Luna high 收集 Agent 均已完成。完整逐站报告是 supplement-01 至 supplement-05，包含官方网址、导航和详情路径、字体测量、桌面与 390px 手机截图、可逆交互、动态和减少动态抽查、认可来源与访问限制。本文把它们转化成适合 ZeppBridge 的修改依据；不把名气当成页面质量证明。

## 新增范围与适用性

| 组 | 10 个网站 | 与 ZeppBridge 的关系 |
|---|---|---|
| 健康设备 | Oura、WHOOP、Garmin、Withings、Fitbit/Google、Polar、Suunto、Ultrahuman、Eight Sleep、Apple Health | 来源、测量、解释、应用和硬件责任如何分开；健康隐私如何用可读结构说明。 |
| 隐私与个人工具 | Proton、Signal、Obsidian、Ente、Standard Notes、1Password、Bitwarden、Tailscale、Mullvad、Tresorit | 个人档案的拥有权、下载入口、数据路径、信任证明与技术详情。 |
| 桌面精品工具 | Raycast、Things、Craft、Bear、Day One、Fantastical、Alfred、Ulysses、Screen Studio、CleanShot X | 真实界面作为证明；桌面软件下载和功能探索；个人记录的平静语气。 |
| 软件与创作平台 | Linear、Stripe、Vercel、Framer、Webflow、Readymag、Rive、Spline、Resend、Sanity | 层级、章节节奏、稳定标题与可切换证据、菜单职责、具体功能详情。 |
| 训练与个人健康 | Strava、Komoot、AllTrails、TrainingPeaks、Intervals.icu、Athlytic、Gentler Streak、Bevel、Exist.io、Gyroscope | 来源覆盖、缺失、历史记录、技术深度与个人健康措辞的边界。 |

第一轮 112 个产品入口加本轮 50 个品牌形成 162 个研究条目。第一轮合并 OpenAI/ChatGPT 和 Anthropic/Claude 时得到 110 个品牌标签；这不是按全部母公司合并的企业数量。桌面完整文档保留所有条目，不删掉重复品牌下有差异的产品入口。

## 关键参考如何落到具体改动

| 参考与已观察证据 | ZeppBridge 原问题 | 实施决策与验收 |
|---|---|---|
| Signal 的单一人类收益；Things 的真实应用和直接下载；Obsidian 的清晰桌面下载 | 首屏空白大，手机先见缩小应用，承诺随滚动消失 | 固定 H1 和简短说明先出现，示例与公开版下载分开；手机标题和操作在演示前；任何章节仍只有一个稳定 H1。 |
| Linear 的紧凑导航与编辑节奏；Resend 的 SDK 选择会切换真实示例代码 | 演示依赖五屏滚动，访客无法直接找功能 | 五个真实功能直接选择，标题固定、证据和说明随选择变化；键盘支持、状态明确，不冒充后台请求成功。 |
| Screen Studio 的具体工作流程演示和可退出 Explore；Day One 的功能详情可返回 | 演示入口/接管状态不够清楚，退出和弹层焦点不完整 | 保留唯一真实 iframe，明确合成样本与 v3 开发演示；进入、退出、Escape、焦点返回可逆。应用消息核验来源窗口。 |
| Apple Health 的数据领域→应用→隐私；Oura 区分测量与解释；Ente 的个人档案语气 | 绝对宣称没有服务器、数据只有两个地方 | 区分健康档案本地保存、授权/更新辅助服务、用户主动导出外部 AI；用可读的路径图和相邻说明支持同一承诺。 |
| Exist 的来源选择显示具体可导入字段，自动数据与手填字段分开；Intervals.icu 详情逐步加深 | 三种连接方式等重；来源/字段能力容易被 Logo 掩盖 | 主路径明显，两个高级备选弱化；来源条件与指标差异在附近，FAQ 解释缺失和覆盖，不宣称所有连接导入同样字段。 |
| Gentler Streak 的个人历史语气；Day One 的个人记录关怀 | AI 样例容易产生精确结果或因果推断印象 | 展示整理样本记录/来源/缺失的请求和结果；不写诊断、疗效、恢复分数、寿命、因果推断或虚构背书。没有采样就保持缺失。 |
| Google Fitbit 把账号条件放在动作旁；Obsidian 下载与 Sync 详情分开 | v3 演示与公开稳定版下载不一致，点击就提示已下载 | 在演示和下载旁说明版本边界；平台和安装条件清晰；保留 release URL 校验与失败回退，不用 Star 弹层声称下载已经成功。 |
| Stripe/Vercel/Framer/Webflow 菜单 Escape 可关闭；Readymag 同路径 Escape 未关闭；Fantastical 手机横向溢出 | 手机隐藏导航，键盘和宽度未充分检查 | 简单真实章节导航，手机仍可到达；菜单 Escape 和焦点返回必测；320–1920px 无横向溢出。不要照搬企业级巨型菜单。 |

## 动效选择：实测好坏都纳入

新增研究没有证明“知名网站动效一定合格”。Ente 的 35 秒循环文字、Exist 的浮动标签和旋转标题，以及 TrainingPeaks 的视频/跑马灯，在抽查的减少动态模式下仍持续。它们提供的是反例。Gyroscope 的扫描动画在抽样中能关闭，但身体扫描与健康目标不是本产品需要的解释。

采用受用户控制的章节切换、当前状态提示、短暂透明度/位移过渡。静态时也能读完整内容；减少动态时立即到达目标；离屏不持续运行动画；不采用自动换标题、背景视频、滚动劫持或伪造健康可视化。五项能力必须保留，但不意味着必须保留五屏 sticky 阅读方式。

## 认可范围与研究限制

- Gentler Streak 的 Apple Design Award、Things/Day One 等产品认可，以及健康硬件奖项，适用对象是应用/产品，不证明当前官网得过网站奖。
- Strava 有 Awwwards Honorable Mention；它的 Year in Sport Webby 属于独立作品。Stripe DotDev、Vercel Ship、Framer Year in Review 等获认可活动页也不能被称为当前主站奖项。各逐站报告提供具体来源和范围。
- Screen Studio、CleanShot X 的 One Page Love 收录及部分设计编辑案例，有时间与页面范围限制。其他未核实奖项的品牌依照产品相关性和编辑判断纳入，不编造“公认获奖”。
- WHOOP/Withings 的 403、AllTrails 门禁、部分详情点击超时或菜单没有成功展开，均只保留可证实文字或结构。Readymag 字体就绪超时，因此对应字体未知。直接访问详情成功不等于主页点击路径成功。
- 桌面/手机截屏、少量 Tab 和减少动态检查不是完整 WCAG、性能或所有设备认证。研究证据与建议分开；ZeppBridge 自己需要按本次验收矩阵重新实测。

## 后续 Agent 的使用顺序

先读 local-audit.md 与 IMPLEMENTATION-BRIEF.md，再读 synthesis.md、本文件和十五份原始报告。按“本地问题→证据→适合本品牌的原则→可验收行为”推进。保留暖纸/橄榄绿/MiSans、本地健康档案、真实样本和缺失约定。最终结果记录在 verification.md，重建桌面汇编。官网仍为本地预览，正式部署须等用户认可。
