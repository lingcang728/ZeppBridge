# 能力成熟度清单（v3，2026-09-30）

[English](capability-maturity.md)

> 每项能力在 core / 桌面 / CLI / MCP / 本机 REST 里接通到哪一步、任务范围（MCP `--scope task`）管不管得到、在哪些平台上验过、还有什么已知限制。
> 改动某项能力时顺手更新这一行；「验证」一栏只写真跑过的，推断的不写。

## 一览

| 能力 | core | 桌面 | CLI | MCP | 本机 REST | 任务范围 |
|---|---|---|---|---|---|---|
| 旧通道同步 / 历史补拉 | ✓ | ✓ 手动、自动、首连后补 180 天 | ✓ `sync` | — 只读 | — | 不适用 |
| 官方开放平台授权与拉取 | ✓ | ✓ 授权经 Cloudflare 中转 | ✗ 未接 | — 只读 | — | 不适用 |
| 本地重解析 | ✓ | ✓ 启动时按修订号自动、设置里手动 | ✓ `reprocess` | — | — | 不适用 |
| 数据导出（JSON / CSV / GPX / FIT） | ✓ | ✓ | ✓ `export` | — | — | 不适用 |
| 交给 AI（单个 `.md` 任务包） | ✓ | ✓ | ✗ | 共享任务定义 task 范围 | — | 是它的来源 |
| 只读查询：运动 / 指标 / 睡眠 / 饮食 / 生活事件 / 数据健康 | ✓ | ✓ 各页面 | `status` 只给概况 | ✓ 15 个工具 | 部分：`/health`、`/workouts/{id}/series` | 只管 MCP |
| 备份、校验、排队恢复 | ✓ | ✓ | ✗ | — | — | 不适用 |
| 生活事件记录 | ✓ | ✓ 读写 | ✗ | ✓ 只读（任务范围拒绝） | — | 拒绝 |
| 训练计划起草 / 发到手表 | ✓ | ✓ 粘贴 AI 回复、周视图、单天精调 | ✗ | ✓ 起草；发布要用户打开「允许 AI 直接发布」 | — | 拒绝 |
| 账号归属（一个库一个账号） | ✓ | ✓ | ✓ 同步前核对 | — | — | 不适用 |

图例：✓ 已接通；✗ 没接、要用得去桌面；— 按设计不做。

## 任务范围（MCP `--scope task`）的口径

只对以 `--scope task` 启动的 MCP 生效；默认的 `full-readonly` 不受任务开关收窄，本机 REST 也不看任务。细则见[命令行与 MCP](cli-and-mcp.zh-CN.md) 的「访问范围」一节，这里只列每个工具的处理方式：

| 工具 | 任务范围里 |
|---|---|
| `list_workouts`、`get_workout_insight`、`get_workout_detail` | 只看授权的运动；排除的字段不出去（`get_workout_detail` 连心率区间、步幅这类能算回来的也去掉）；洞察基线按授权集重算 |
| `get_workout_series` | 精确轨迹一律不给；任务排除了任一字段的运动，逐点各段整段拒绝 |
| `get_metric_series`、`get_metric_records`、`list_sleep_sessions`、`get_sleep_detail` | 裁到授权日期窗；排除的指标拒绝、排除的字段不出现；归不进任何类别的指标拒绝 |
| `get_food_data` | 只给按天摄入合计（归身体类），不给逐条饮食 |
| `list_available_metrics`、`list_life_events`、`get_data_health` | 整库视角，整体拒绝 |
| `get_training_context`、`get_athlete_profile`、`get_training_plan`、`draft_training_plan`、`publish_training_plan` | 跨类别跨日期或训练计划账本，整体拒绝 |

没选运动的任务（「最近 N 天」）窗口截止到今天，导出和 MCP 用同一个函数算（`ai_tasks::coverage::task_window`）。

## 平台

| 平台 | 验证到哪一步 |
|---|---|
| Windows 11 | 真机日常使用（便携版 `release\ZeppBridge.exe`，用户本人账号、真实库）；CI 检查与全部测试 |
| macOS | CI（run 36687163675，`6ef2767`）格式、检查、Clippy、全部测试通过，dmg / app.tar.gz 能打出来；**没上过真机** |
| Linux | 同上，deb / rpm / AppImage / Flatpak / Docker 能打出来，Docker 镜像有无网自检；**没上过真机** |

只有真机才验得出、目前都没验的：Mac / Linux WebView 里的毛玻璃效果；Wayland 下把文件拖进 AI 对话框（拖文件插件在 Linux 走 X11）；「在资源管理器里显示」在 Mac 应叫「访达」、Linux 应叫「文件管理器」。Windows 的 MSI 不接受 `3.0.0-beta.N` 这种预发布版本号，而 CI 的 Windows 打包一次同时出 NSIS 和 MSI，所以只有 `3.0.0` 这种纯数字版本号才打得过。

## 已知限制

- **官方开放平台**：压力、血氧、经期、体重秤、房颤要找 Zepp 商务单独申请；长日期范围会被静默截断，按 ≤90 天分块拉；每小时步数官方不全，以旧通道逐分钟为主。
- **换账号**：一个 `data` 只装一个账号，换号只能关程序、挪走 `data` 文件夹。双通道同开且账号不同时，官方补充同步只记日志、不提示用户。
- **官方运动明细**：某条永久拿不到时会先放下、隔段时间再试（`7df3252`）。
- **自更新**：静默——打开就查，有新版本就在后台下载（验签），左上角标志外圈画进度、下好后一圈绿环常亮；用户点「更新」才替换，替换前先等同步 / 补拉结束。安装版走 NSIS（passive），便携版原地换 exe，Apple 芯片的 macOS 换 `.app`；Linux 和 Intel Mac 交给包管理器 / 手动下载。便携版要求每次发版都带 `windows-x86_64-portable` 包（`scripts/release/package-portable.ps1`）。
- **升级**：单向，升上去回不去；回 2.x 只能用升级前快照，而快照在库完好后会自动删掉。
