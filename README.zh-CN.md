<div align="center">
  <img src="src-tauri/icons/icon.png" width="88" height="88" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>留住每一次记录，安排下一次出发。</strong></p>
  <p>把 Zepp 健康数据存到电脑，查看趋势、交给 AI，再把训练计划带回手表。</p>
  <p>免费开源 · Windows / macOS / Linux · 本地存储</p>
  <p><a href="#开始使用">开始使用</a> · <a href="https://zeppbridge.com/">观看一分钟短片</a> · <a href="README.md">English</a></p>
</div>

> [!IMPORTANT]
> **macOS 首次打开提示「已损坏，无法打开」？** 拖入「应用程序」后，请按[macOS 首次打开](#macos-首次打开)中的步骤处理。

[![ZeppBridge V3 概览：个人指标、心率、步数与睡眠](docs/assets/readme/overview-zh.png)](https://zeppbridge.com/)

*点击上图观看中文短片，了解界面、卡片交互与训练计划。本文图片和视频均使用示例数据。*

## 从记录到下一步

ZeppBridge 是一款面向 Zepp / Amazfit 用户的桌面应用。手表通过手机 Zepp App 上传记录，ZeppBridge 再将可获取的数据同步到本机。已同步的记录可以离线查看、备份和导出。

### 看清自己的状态

把关心的指标固定在概览，查看今天的状态和长期变化。从一张卡片进入一晚睡眠、一次运动，或某段时间的详细趋势。

- **睡眠与恢复**：睡眠时长、评分、分期，以及静息心率、HRV、准备度等趋势。
- **运动与训练**：配速、心率、分段、训练负荷与 GPS 轨迹；有对应数据时，还能查看跑步功率和跑姿。
- **日常活动**：步数、活动热量、压力、血氧等记录，配合个人周报回看变化。
- **生活记录**：记下旅行、作息或身体状况，为指标变化补上自己的背景。

![睡眠详情：时长、评分与分期时间轴](docs/assets/readme/sleep-zh.png)

跑后洞察和周报以你自己的历史为参照。没有采样的时段保留空白，缺少的指标不补零，样本不足时明确提示。

### 带着记录与 AI 讨论

不用手动整理一堆截图。选择日期、运动和数据类别，写下问题，ZeppBridge 会生成一份包含记录、单位和数据覆盖说明的 Markdown 文件。

![交给 AI：选择历史记录、AI 工具和本次问题](docs/assets/readme/ai-zh.png)

- 从趋势中挑选日子放进收集箱，集中讨论一次变化或几场训练。
- 自定义问题、补充个人背景，发送前检查带了哪些数据、缺了哪些日期。
- 打开你选择的 AI 网站，粘贴或拖入文件；Windows 还可选择自动粘贴与发送。
- 保存任务和往返记录，下次接着讨论。

可以搭配 ChatGPT、Claude、DeepSeek 等工具使用。ZeppBridge 负责准备数据，你使用自己的 AI 账号；AI 服务的费用和数据处理规则由对应提供方决定。

### 把讨论变成训练计划

把 AI 按约定格式生成的回复粘贴回来，计划就会排成一周的日卡。逐日检查，拖动交换日期，再调整每次训练的热身、主训练、间歇和放松。

![训练计划周视图：休息日、轻松跑、骑行与间歇训练](docs/assets/readme/plan-zh.png)

- 编辑训练时长、距离、强度目标和重复组。
- 把常用训练存成模板，或导入 `.zwo`、训练计划 `.fit` 文件。
- 恢复状态较差时，可将当天的间歇训练改为轻松训练。
- 确认后通过 Zepp 发送到兼容手表，并查看发送状态。

目前可发送跑步、骑行、泳池游泳和公开水域游泳计划。休息与睡眠建议留在本机；手表是否接收和显示计划取决于设备支持及同步状态。

### 让浏览记录更顺手

V3 重新设计了整套界面：玻璃导航、可翻转的日卡、可拖动的计划和分组设置卡。支持深色、浅色与跟随系统，提供中文、英文、西班牙语等 10 个语言与地区选项，也能调整单位、时区和界面缩放。

[观看中文短片：翻牌、拖动、主题切换与页面动效 →](https://zeppbridge.com/)

## 数据由你保管

**同步与归档。** 支持 Zepp 官方授权，并可连接高级数据补充更多指标。历史记录可以分批补拉、暂停和继续；本机覆盖范围与同步失败会分别说明。

**备份与恢复。** 创建整库快照，校验完整性，恢复前预览记录差异。长期保存的备份建议另存到其他磁盘。

**自由导出。** JSON 用于程序处理，CSV 用于表格分析，GPX 用于运动轨迹，FIT 用于运动记录交换。导出内容以实际取得的数据为准。

**接入自己的工具。** MCP 可让兼容 AI 客户端查询本机记录，健康数据只读；训练计划支持起草，直接发布需单独开启授权。另有 CLI 和默认关闭的本机只读 REST API，方便脚本与自动化使用。详见[命令行与 MCP](docs/reference/cli-and-mcp.zh-CN.md)。

## 开始使用

### 下载安装

安装包与版本说明统一放在 [Releases](https://github.com/lingcang728/ZeppBridge/releases)。请确认下载的是你要使用的版本。

| 平台 | 安装方式 | 验证情况 |
| --- | --- | --- |
| Windows 10/11 · x64 | 运行 `.exe` 安装包 | 主要开发与日常使用平台 |
| macOS · Apple Silicon | 打开 `.dmg`，拖入「应用程序」 | V3 尚缺真机完整验证 |
| Linux · x86_64 | 按发行版选择 `.deb`、`.rpm`、AppImage 或 Flatpak | V3 尚缺真机完整验证；见 [Linux 指南](docs/guides/linux.zh-CN.md) |

当前安装包未做系统代码签名。Windows 可能提示未知发布者；macOS 可能拦截打开。仅在确认下载来源并信任应用后，按系统提示允许运行。V3 源码构建见[开发文档](docs/development/development.zh-CN.md)。

从 2.x 迁移前，请另存一份旧版数据库备份；V3 升级后的数据库不能直接交给 2.x 使用。

### macOS 首次打开

1. 从[本仓库 Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载 `.dmg`，确认来源并信任此应用后，打开安装包，将 ZeppBridge 拖入「应用程序」。
2. 如果打开时提示「已损坏，无法打开」，打开「终端」，执行：

   ```sh
   xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
   ```

3. 执行完成后，再次打开 ZeppBridge。

这条命令仅移除 ZeppBridge 应用的隔离标记。若仍无法打开，请[反馈问题](https://github.com/lingcang728/ZeppBridge/issues)，并附上系统版本和完整提示。

### 第一次连接

1. 首次打开可先体验示例数据，熟悉界面。
2. 在「设置 → 账号与设备」点击「连接」，在浏览器中完成 Zepp 官方授权。
3. 回到应用等待同步，在概览查看已取得的记录。
4. 如需 HRV、压力、血氧等补充数据，再连接「高级数据」。该方式使用 Zepp 邮箱或手机号与密码，不支持第三方登录。

两种连接应使用同一个 Zepp 账号。可用指标取决于设备测量、云端保存内容和授权范围；「暂未获取到」不等于设备不支持。

### 数据放在哪里

在设置中使用「打开数据文件夹」可找到当前数据目录。

| 平台 | 默认位置 |
| --- | --- |
| Windows | `ZeppBridge.exe` 旁边的 `data` 文件夹 |
| macOS | `~/Library/Application Support/com.zeppbridge.ZeppBridge/data` |
| Linux | 通常为 `~/.local/share/zeppbridge/data`；Flatpak、AppImage 见 [Linux 指南](docs/guides/linux.zh-CN.md) |

Windows 安装目录不可写时会使用用户数据目录；自定义目录以应用显示为准。

## 隐私与连接

- 健康记录保存在本机数据库中，数据库默认不加密。
- 同步需要连接 Zepp；官方授权的回调与令牌交换经过项目的授权中转服务。
- 交给 AI 前会移除账号、设备标识等信息，精确 GPS 默认排除。主动提供的记录会由所选 AI 服务处理，MCP 查询结果也一样。
- 轨迹默认在本地绘制。开启在线地图后，会向地图服务请求对应区域的地图。
- 健康记录同步只读；你确认发送的训练计划会写入 Zepp。MCP 的「允许 AI 直接发布」是独立开关。
- 错误报告由你主动确认提交，没有自动遥测或后台崩溃上报。

ZeppBridge 是已获得 Zepp 官方认证的独立开源项目。

## 文档与反馈

- [备份、恢复与完整历史](docs/guides/backup-and-restore.zh-CN.md)
- [命令行与 MCP](docs/reference/cli-and-mcp.zh-CN.md) · [Docker](docs/guides/docker.zh-CN.md)
- [开发文档](docs/development/development.zh-CN.md) · [更新日志](CHANGELOG.md)
- [反馈问题或建议](https://github.com/lingcang728/ZeppBridge/issues)

## 致谢与许可证

接口研究参考了 [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli)、[Thejuampi/icu](https://github.com/Thejuampi/icu)；运动明细解码参考了 [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)。

项目采用 [MIT License](LICENSE)。第三方代码与素材署名见 [NOTICE](NOTICE)，相关商标属于各自权利人。
