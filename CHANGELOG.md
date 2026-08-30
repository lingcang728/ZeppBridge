# 更新日志

本文件记录每个版本的实际改动。写给使用者看，不是施工日志：只写用户能感知到的变化，以及为什么这么改。

## 1.1.0

The first build an English-speaking user can actually sit down and use. The desktop UI follows the system language (Chinese or English) and has a switch in Settings.

这一版是第一次能给英文用户直接用的正式包。桌面界面跟随系统语言（中/英），设置页可以切换。

### New / 新增

- **English and Chinese UI.** Overview, workouts, sleep, devices, insights, weekly report, export, Hand to AI, settings, health check, backups and history backfill. Dates and numbers follow the interface language. Prompts handed to an AI are translated too — an English user should not get a Chinese prompt that makes the model answer in Chinese.
- **桌面界面中英双语。** 概览、运动、睡眠、设备、洞察、周报、导出、交给 AI、设置、数据健康、快照和历史补拉。日期和数字跟着界面语言走。交给 AI 的提示词也翻译了——英文用户不该拿到一段中文提示词，然后看 AI 用中文回答。
- **Public landing page is bilingual**, with a language toggle. 落地页同样中英双语，有语言开关。
- CI now fails the build if someone hard-codes Chinese into a Vue file. A leftover Chinese string is exactly the kind of bug an English-speaking user cannot report.
  CI 现在会拦住界面里的硬编码中文。漏翻一句，只有看不懂中文的用户会看到它——而他没法告诉你。

### Fixes / 修复

- **"Pending normalisation" counted already-parsed workout details.** A health-page counter that would never go down, and kept suggesting another replay. It now recognises workout-detail output sitting in the sample / route / pause tables.
- **「待归一化」把已经解析好的运动详情也算进去了。** 这个数字永远降不下来，健康页还一直劝你再重放一次。现在会把落在逐点样本 / 轨迹 / 暂停表里的运动详情认回来。
- **Re-identifying a device could show the old model after you had just assigned one.** A request that started before the write could land afterwards and overwrite the screen.
- **刚指认完型号，界面可能又闪回旧的。** 写入前发出去的请求稍后回来，会把屏幕盖回旧数据。

### Still in Chinese / 仍是中文

- CLI and MCP output stays Chinese: the four exits (GUI / CLI / MCP / export) must give the same answer to the same question, so the backend sends codes and the GUI translates. CLI/MCP still print the original Chinese string.
  CLI 和 MCP 的输出仍是中文：四个出口对同一个问题必须给同一份回答，所以后端发码、界面翻译；CLI/MCP 继续打印原来的中文。
- A few failure-path messages from the backend (some errors, disk-estimate stop reasons, snapshot blockers) still arrive as Chinese. They are on exception paths.
  少数异常路径上的后端文案（部分错误、磁盘估算的停止原因、快照拦截原因）仍是中文。

### Upgrade / 升级说明

- Overlay-install from 1.0.x. Local data, backups and settings are untouched. No schema change.
- 从 1.0.x 覆盖安装即可。本地数据、备份和设置都不会动。数据库结构没有变化。

## 1.0.1

修一个只在**从旧版本升级上来**时才会出现的问题。全新安装不受影响。

### 修复

- **升级后第一次启动会弹一行红色警告**：「另一个 ZeppBridge 写入操作正在进行（清理旧数据），请等它结束」。
  三件事叠在一起造成的：
  - 后台压缩历史报文时借用了「清理旧数据」这个名字——它一个字节都没删，这句话本身就不对；
  - 应用启动时会自动同步一次，正好和后台压缩撞上，抢不到写锁就报错。现在它会像遇到数据重建时一样让路，并在稍后自动重试；
  - 本该显示的「正在压缩历史报文」提示条从未出现过——它依赖的通知在界面开始监听之前就发出去了，所以没人收到。现在改成随时可读的状态，不再依赖时机。

  结果：升级后第一次启动看到的是一条正常的进度提示，而不是一行看不懂的红字。

### 其它

- 版本号一致性检查现在也管架构文档开头那句「本文描述 vX.Y.Z 的产品边界」——漏改之后它会变成一句假话。

## 1.0.0

第一个正式版。相比开发期的 0.10.x，这一版的主题是**把界面上说的每一句话都兑现**，并且让长期使用不再越用越沉。

### 修复

- **单条运动交给 AI 时，实际发出去的不止那一条。** 后端把「单条运动」解析成了「这条运动所在的那一天」，于是整天的心率、睡眠、步数都被一起发了出去；而摘要面板的「时间范围」始终显示页面上那两个无关日期。现在单条运动只包含这条运动本身，加上它进行期间的逐点指标；按天记录的数据流会明确标注为「不在此次范围内」，而不是悄悄少给。
- **设备识别错了改不回来。** 用户的型号指认只在「本机完全认不出这台设备」时才生效。一旦目录靠别名匹配上了（哪怕匹配错了），指认会被存进库但永远不显示。现在无论自动识别得出什么，用户的指认一律优先，并如实标注成「你指认的型号」。
- **每台设备都能重新指认。** 以前只有「未识别」的设备才显示手动指认入口，识别成功就没有退路了。现在每台设备都有独立页面，重选和撤销入口始终可用。
- **提交错误报告时没有可写的地方，也没有成功反馈。** 现在可以写一段说明（500 字上限，发送前自动去掉本机路径、邮箱和长串标识），提交成功会显示报告编号和发送了哪些字段。
- **本机没检测到问题时，错误报告根本提交不了。** 用户遇到的问题不一定是「有未识别的设备」。现在可以自己选反馈类型（设备没识别 / 运动没识别 / 数据对不上 / 其它），选了就能提交。
- **不支持洞察的运动会显示一张只会说「暂不支持」的空卡片。** 现在整块不渲染。
- **首页 24 小时心率把长时间没有采样的时段用一条直线连了起来。** 那条线是插值出来的，不是测出来的。现在断档超过 15 分钟就断开。
- **「检查更新」只告诉你有新版本，不告诉你更新了什么。** 现在会弹出完整的更新说明。

### 新增

- **历史原始报文自动压缩。** 云端原始报文是本机库里最占地方的东西（JSON 文本，压缩后通常只剩五分之一）。装上这一版后第一次启动会在后台压缩存量报文并回收磁盘空间，顶部显示进度，完成后自动消失。实测一个 211 MB 的库压缩后为 55 MB。压缩前会逐字校验能否原样还原，对不上的那条跳过不动——原始报文是本地重放的唯一依据。
- **首页四个指标都能点进去看趋势。** 心率、日常活动各有独立页面；睡眠接到已有的睡眠详情；静息心率并入心率页。
- **每台设备有独立页面**，写明型号从哪来（目录精确匹配 / 别名匹配 / 你指认的 / 没匹配到）、固件、最近数据、本机是否有它的数据。
- **首页会提醒未识别的设备**，点一下直接到那台设备的指认页面。
- **设置里新增 MCP 一节**，附一段可直接复制给 AI 的说明，让 AI 按你的机器给出配置步骤。
- **本地周报改成图表**：每个指标显示「本周 vs 你自己此前 28 天」的对比条，并说明颜色含义。证据不足的指标不画图，只报现状。

### 优化

- **切换页面不再每次重查数据库。** 主要页面会被缓存，只在首次进入和同步产生新数据时读库。
- **按天聚合的指标查询快了一个量级。** 给按本地日期过滤的采样查询补了索引可用的时间戳边界，实测心率 7 天查询从 92 ms 降到 5 ms（结果不变）。
- **全应用统一的下拉选择器**，替换了各处的系统原生下拉。
- **「数据健康检查」和「数据库快照」移入「设置 → 高级与维护」**，主导航回到三项。
- **「你的设备能提供什么」改成指示灯板**，三种状态分开显示：已获取 / 云端有但本机未收录 / 暂未获取。
- 设置页与「交给 AI」页重排，去掉了几处大面积留白。
- 二级页面统一有返回入口。
- 周报和身体状态卡片不再为没有数据的指标占位；趋势卡片右上角的数字明确标注为「最新」一次读数。

### 明确不做

- **体重与血压不支持。** 缺少可核对的真实报文样本，贸然解析只会产出没人能验证的数字。
- 不提供整库加密。健康数据以明文 SQLite 保存在程序目录，依赖系统账户与磁盘加密保护——这一点在设置里写明，不假装提供。
