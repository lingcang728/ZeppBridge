<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>把 Zepp 穿戴设备的健康数据，同步到你自己的 Windows / macOS 电脑。</strong></p>
  <p>Local-first desktop bridge for Zepp / Amazfit health data.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
  [![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](#下载与安装)
  [![macOS](https://img.shields.io/badge/platform-macOS-333333?logo=apple&logoColor=white)](#下载与安装)
</div>

> [!IMPORTANT]
> ZeppBridge 是独立的非官方开源项目，与 Zepp Health、Huami、Amazfit 无隶属或背书关系。只用于你本人有权访问的账号和数据。

## 它做什么

Zepp 手机 App 把数据放在区域云端。ZeppBridge 在电脑上登录你的账号，把心率、睡眠、运动、恢复、压力、血氧等记录拉到本机 SQLite，用桌面界面查看趋势，再按需通过本机 REST API 或 JSON / CSV / GPX 导出交给你自己的工具。

- **电脑直接读云**：设置里点「连接」，在弹出的官方登录页登入即可。
- **数据只在本机**：没有 ZeppBridge 自建云，也没有产品遥测。token 存系统凭据管理器（Windows Credential Manager / macOS 钥匙串）。
- **不编造**：没有采样就不画曲线，没有轨迹就不画地图，缺失值写「未提供」而不是补 0；哪几天没有记录会直接说出来，曲线在那里断开。
- **认不出就不接**：读不懂语义的字段留在原始报文里标记为未验证，不会猜一个名字塞进数据库。
- **分析外置**：应用不做健康解读。到「交给 AI」勾选数据流，复制标准化 JSON 或另存文件。
- **本机 API 网关**：其他本机程序可直接请求标准化的运动序列，无需理解 Zepp 的原始差分字符串。
- **关窗口不停**：主窗口关掉后留在托盘，自动同步继续。再次打开会唤醒已有进程，不会出现两个托盘图标。

## 界面一览

| 页面 | 内容 |
| --- | --- |
| **概览** | 24 小时心率曲线、今日步数圆环、昨晚睡眠结构、静息心率，以及「身体状态」「训练状态」两张入口卡（当日值 + 7 天走势） |
| **身体状态** | 恢复、压力、血氧、夜间血氧 ODI、HRV (SDNN)、HRV (RMSSD)、呼吸率、静息心率；7 天 / 1 个月 / 6 个月切换 |
| **训练状态** | VO₂max、训练负荷、PAI、乳酸阈值（心率 + 配速双轴）、7 天与 28 天负荷及急慢比，以及心率区间选择器 |
| **最近记录** | 睡眠与运动合并查看，一键进入详情 |
| **睡眠详情** | 时长、评分、四阶段构成、觉醒次数、来源与设备 |
| **运动详情** | 距离、时长、消耗、心率、配速、每公里分段、GPS 轨迹、暂停区间；跑步另有功率与跑姿指标 |
| **交给 AI** | 提示词模板 + 按四组勾选数据流，复制或另存为 JSON / CSV / GPX |
| **设置** | 连接、账户、设备、隐私、保留天数、导出偏好、本机 API、更新、自动同步 |

界面统一深色（按设计取舍不做浅色模式）；缩放 80%–125%（Ctrl + / Ctrl - / Ctrl 0）。

## 当前能力

**已接入的数据**

| 分类 | 指标 |
| --- | --- |
| 活动 | 步数、距离、卡路里、活动分钟数 |
| 睡眠 | 分期时间线、觉醒次数、睡眠评分、夜间血氧 ODI |
| 身体 | 心率、静息心率、HRV (SDNN)、HRV (RMSSD)、压力、呼吸率、血氧、恢复与能量 |
| 训练 | 运动摘要、每公里分段、GPS 轨迹、训练负荷、VO₂max、乳酸阈值、PAI |
| 跑步细节 | 逐秒心率 / 速度 / 步频 / 步幅、跑步功率、触地时间、垂直振幅、垂直步幅比、等效配速 |

设置页的「你的设备能提供什么」按 18 项能力逐条给出结论：15 项直接从本机库判定，**零请求**；只有血压、体重、情绪在本机没有任何痕迹，需要真实请求，同步时静默检查、每周一次。目前这三项在本账号一年内确无记录。**「没数据」不等于「设备不支持」**：Zepp 的接口对不存在的数据流也返回空响应，只有接口明确拒绝时界面才会写「你的设备不提供」。

**其余能力**

| 领域 | 说明 |
| --- | --- |
| 连接 | 官方网页登录；token 过期后再点一次「连接」 |
| 同步 | 增量约 7 天重叠；历史补拉 1–365 天；托盘驻留时约 15 分钟检查；可取消 |
| 心率区间 | 最大心率 / 储备心率 / 乳酸阈值三种算法，五个**实测**基准各自标注出处与测量日期；不预设默认，也不使用 220−年龄 之类的估算 |
| 导出 | JSON（完整结构化）、CSV（长表汇总，不含逐点序列）、GPX 1.1（仅含 GPS 轨迹的运动）；15 类数据流按活动 / 睡眠 / 身体状态 / 训练分组勾选 |
| 本机 API | `GET /workouts/{id}/series` 返回标准化运动序列；只监听 `127.0.0.1:43921` |
| 保留 | 本地 1–365 天（默认 365）；可清理过期记录、重解析本地报文、打开数据文件夹 |
| 更新 | 内置更新器，`latest.json` 由发布流程签名 |

## 本机 REST API

ZeppBridge 运行时会在 `http://127.0.0.1:43921` 启动只读 API。设置页会显示监听状态；退出托盘进程后接口随即停止。

```powershell
curl.exe http://127.0.0.1:43921/health
curl.exe "http://127.0.0.1:43921/workouts/<WORKOUT_ID>/series"
```

第二个接口直接返回 `workout_id`、`samples`、`route`、`pauses`、`splits` 与 `summary`。不存在的运动返回 `404` JSON。接口只绑定本机回环地址、不提供 CORS、不会暴露 token；返回内容可能包含精确 GPS 和健康数据，请只交给你信任的本机程序。

## 怎么工作

```text
手表  →  官方 Zepp App  →  Zepp 区域云
                              ↓
                    ZeppBridge 桌面应用
                              ↓
              本机 SQLite  →  界面 / REST API / 导出
```

手表仍由官方 App 同步到云。电脑只读云，不依赖手机一直开着。

原始报文会连同派生数据一起留在本机：解析逻辑升级时，应用在后台重放这些报文来纠正旧数据，**不需要重新联网**。大库重放期间自动同步会主动让路并稍后重试。

## 下载与安装

**Windows**

1. 在 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 页面下载最新版安装包：`ZeppBridge_<版本>_x64-setup.exe` 或 `.msi`。
2. 安装包尚未签名，Windows 可能提示「未知发布者」，选择「仍要运行」即可。
3. 直接覆盖安装即可升级，本地数据会保留。

**macOS（Apple Silicon）**

1. 在 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 页面下载 `ZeppBridge_<版本>_aarch64.dmg`，双击打开后把 `ZeppBridge.app` 拖入「应用程序」。
2. 应用为 ad-hoc 签名，没有 Apple Developer ID 也未公证，首次打开会提示「无法验证开发者」。右键（或按住 Control 点按）应用 → 打开 → 再点「打开」即可；也可在终端执行 `xattr -dr com.apple.quarantine /Applications/ZeppBridge.app`。
3. 本地数据保留在 `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`，覆盖升级不影响数据。

> macOS 端由 CI 保证编译、静态检查与测试通过，并有贡献者在 Apple Silicon 上做过冒烟；仓库维护者没有 macOS 设备，无法独立复核同步与钥匙串行为。

## 第一次连接

1. 打开 ZeppBridge，进入「设置」。
2. 点「连接」，在弹出窗口登录 Zepp 账号。
3. 显示「已连接」后窗口会自动关闭。本机没有数据时会自动同步一次，约 40 秒后概览就有内容。
4. 之后用顶栏「立即同步」，或让托盘里的自动同步接手。

首次同步只补拉最近 30 天。想要更长的历史，到设置「导出与补拉偏好」里调整天数再补拉一次——设置页会先估算体积和磁盘占用。

登录失败或想改用 HAR 导入 / 手动填 token，见 [连接指南](docs/guides/connection.md)。不要把登录窗截图、token 或完整请求发到公开渠道。

## 隐私

- 同步时会访问你授权的 Zepp 区域服务，所以这不是离线软件。
- token 存系统凭据管理器；`auth.json` 只留用户 ID、区域主机等元数据，不含 token。
- 健康库是本机明文 SQLite。共用电脑请使用独立的系统账户。
- 交给 AI 时默认执行不可逆脱敏：抹除 device_id、MAC、IMEI、精确 GPS 等字段，并在 JSON 里回写脱敏清单。精确轨迹需要你显式勾选才会注入。
- GPS 轨迹只在本地用内联 SVG 绘制，不请求任何第三方在线地图。
- 本机 REST API 只监听 `127.0.0.1` 且不开放浏览器跨域，但电脑上的其他本机进程仍可读取接口返回的健康数据与精确路线。
- 应用没有自建云、没有产品遥测，数据只保存在你的电脑上。

更多见 [安全与隐私](docs/reference/security-and-privacy.md)。安全问题请走 GitHub 私密漏洞报告。

## 文档

- [架构摘要](docs/reference/architecture.md) — 产品边界、Zepp 事件接口映射、已验证与未验证清单
- [开发文档](docs/development/development.md) — 构建门禁、command 契约、验收顺序
- [UI 约束](docs/development/ui-guidelines.md) — 设计 token、页面结构、组件清单
- [连接指南](docs/guides/connection.md) — 三种连接方式与排错

## 致谢

Zepp 的移动端接口没有公开文档，也没有能力发现接口——某个数据流是否存在，只能靠已经把它跑通的人写下来。ZeppBridge 的接口映射站在这些项目的肩膀上：

- **[m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli)** — 事件接口面的划分与各自的时间参数形态，以及血氧、压力、呼吸率、皮温、血压、PAI 的真实 `eventType`/`subType` 取值。ZeppBridge 此前自行猜测的名字（`stress/real_data`、`skin_temp/real_data`、`bloodpressure/real_data`）**无一命中**；正确的是 `Charge/stress_data`、`skinTemp/real_data`、`blood_pressure/real_data`。
- **[Thejuampi/icu](https://github.com/Thejuampi/icu)** — 独立复现了同一组接口，两者逐条一致，使这份映射可以当作交叉验证过的事实而非孤证。
- **[H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)** (Apache-2.0) — `/v1/sport/run/detail.json` 差分串的解码算法。

这些项目本身不含在发行物内，ZeppBridge 参考的是它们记录下来的接口事实。

## 许可证

ZeppBridge 以 [MIT License](LICENSE) 发布。

发行物内含第三方素材，署名见 [NOTICE](NOTICE)，许可证原文随包附在 `src/assets/fonts/`：

- **MiSans**（小米）— 免费商用、可嵌入，需在软件中署名，设置页已注明。
- **Inter**（Rasmus Andersson）— SIL Open Font License 1.1。
- 差分串解码算法参考 **zepp-fit-extractor**（Apache-2.0），见上方致谢。

Zepp、Amazfit 及相关商标属于各自权利人。
