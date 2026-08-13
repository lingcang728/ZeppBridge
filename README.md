<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>把 Zepp 穿戴设备的健康数据，同步到你自己的 Windows 电脑。</strong></p>
  <p>Local-first desktop bridge for Zepp / Amazfit health data.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
  [![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](#下载与安装)
</div>

> [!IMPORTANT]
> ZeppBridge 是独立的非官方开源项目，与 Zepp Health、Huami、Amazfit 无隶属或背书关系。只用于你本人有权访问的账号和数据。

## 它做什么

Zepp 手机 App 把数据放在区域云端。ZeppBridge 在电脑上登录你的账号，把心率、睡眠、运动等记录拉到本机 SQLite，用桌面界面核对，再按需导出 JSON 交给你自己的 AI 或备份工具。

- **电脑直接读云**：设置里点「连接」，在弹出的官方登录页登入。不装证书，不改 Wi-Fi 代理。
- **数据只在本机**：没有 ZeppBridge 自建云，也没有产品遥测。token 进 Windows Credential Manager。
- **不编造**：没有样本就不画曲线；没有设备信息就写「未提供」；云端拉取时间和健康样本时间分开显示。
- **分析外置**：应用不做解读。到「交给 AI」复制或保存标准化 JSON。
- **关窗口不停**：主窗口关掉后留在托盘，自动同步可以继续。

## 界面一览

- **概览**：近 24 小时心率曲线、今日步数圆环、睡眠 / 静息心率 / 最近运动 / 训练负荷 / VO₂max 一览
- **最近记录**：睡眠与运动记录合并查看，一键进入详情
- **睡眠详情**：时长、评分、阶段构成与来源、设备信息，如实展示
- **运动详情**：距离、时长、消耗、心率、配速、训练负荷等指标矩阵；没有轨迹时不画假地图
- **交给 AI**：选时间范围与 9 类数据，复制或保存标准化 JSON
- **外观**：深色 / 浅色 / 跟随系统；界面缩放 80%–125%（Ctrl + / Ctrl - / Ctrl 0）
- **设置**：连接、自动同步、保留天数、历史补拉与本地数据维护

## 当前能力

| 领域 | 说明 |
| --- | --- |
| 连接 | 官方网页登录；token 过期后再点一次「连接」 |
| 同步 | 增量约 7 天；历史补拉 1–365 天（默认 30）；托盘驻留时约 15 分钟检查；可取消 |
| 数据 | 心率、静息心率、HRV、睡眠、步数、运动、训练负荷、VO₂max 等已识别字段 |
| 界面 | 概览、最近记录、睡眠/运动列表与详情、交给 AI（9 种类型勾选）、设置；深色 / 浅色 / 跟随系统；UI 缩放 80%–125% |
| 导出 | 复制 JSON、保存文件、更新本机 `exports/zeppbridge-ai-feed.json` |
| 保留 | 本地 1–365 天（默认 365）；可清理过期记录、重解析、打开数据文件夹 |

没有真实逐点采样或 GPS 时，不画模拟地图和空曲线。

## 怎么工作

```text
手表  →  官方 Zepp App  →  Zepp 区域云
                              ↓
                    ZeppBridge 桌面应用
                              ↓
                    本机 SQLite + 界面 + JSON
```

手表仍由官方 App 同步到云。电脑只读云，不依赖手机一直开着代理。

## 下载与安装

1. 在 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 页面下载最新版安装包：`ZeppBridge_<版本>_x64-setup.exe` 或 `.msi`。
2. 安装包尚未签名，Windows 可能提示「未知发布者」，选择「仍要运行」即可。
3. 直接覆盖安装即可升级，本地数据会保留。

## 第一次连接

1. 打开 ZeppBridge，进入「设置」。
2. 点「连接」，在弹出窗口登录 Zepp 账号。
3. 显示「已连接」后窗口会关。本机没有数据时会自动同步一次。
4. 之后用顶栏「立即同步」即可。

不要把登录窗截图、token 或完整请求发到公开渠道。细节见 [连接指南](docs/guides/connection.md)。

## 隐私

- 同步时会访问你授权的 Zepp 区域服务，所以这不是离线软件。
- `auth.json` 只留用户 ID、区域主机等元数据，不含 token。
- 健康库目前是本机明文 SQLite。共用电脑请使用独立的 Windows 账户。
- 应用没有自建云、没有产品遥测，数据只保存在你的电脑上。

更多见 [安全与隐私](docs/reference/security-and-privacy.md)。安全问题请走 GitHub 私密漏洞报告。

## 许可证

[MIT License](LICENSE)。Zepp、Amazfit 及相关商标属于各自权利人。
