<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>把 Zepp 穿戴设备的健康数据，同步到你自己的 Windows 电脑。</strong></p>
  <p>Local-first desktop bridge for Zepp / Amazfit health data.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
  [![Windows](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white)](#系统要求)
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

## 0.4.0 这一版

- 删掉旧的手机证书 / 局域网代理捕获。
- 应用内打开 `watchface.zepp.com` 官方登录，抽出账号后再同步。
- 界面按桌面参考图重做：概览、交给 AI、设置、睡眠/运动详情与列表。
- 同步时尝试读取绑定设备（名称、固件、序列号），详情页如实展示。

## 当前能力

| 领域 | 说明 |
| --- | --- |
| 连接 | 官方网页登录；token 过期后再点一次「连接」 |
| 同步 | 增量约 7 天；历史补拉 1–365 天（默认 30）；托盘驻留时约 15 分钟检查；可取消 |
| 数据 | 心率、静息心率、HRV、睡眠、步数、运动、训练负荷、VO₂max 等已识别字段 |
| 界面 | 概览仪表盘、睡眠/运动列表与详情、交给 AI（9 种类型勾选）、设置 |
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

## 系统要求

- Windows 10 或 Windows 11（x64）
- 能在网页上登录的 Zepp 账号
- 开发构建：Node.js 20+、Rust stable、WebView2

## 安装

安装包尚未签名。正式签名前建议从源码构建：

```powershell
git clone git@github.com:lingcang728/ZeppBridge.git
cd ZeppBridge
npm ci
npm run tauri build
```

构建出的安装包会复制到仓库里的 `release\`。日常开发用：

```powershell
npm ci
npm run tauri dev
```

## 第一次连接

1. 打开 ZeppBridge，进入「设置」。
2. 点「连接」，在弹出窗口登录 Zepp 账号。
3. 显示「已连接」后窗口会关。本机没有数据时会自动同步一次。
4. 之后用顶栏「立即同步」即可。

不要把登录窗截图、token 或完整请求发到公开渠道。细节见 [连接指南](docs/guides/connection.md)。

## 隐私

- 同步时会访问你授权的 Zepp 区域服务，所以这不是离线软件。
- `auth.json` 只留用户 ID、区域主机等元数据，不含 token。
- 健康库目前是本机明文 SQLite。共用电脑请用独立 Windows 账户。
- Issue 里不要贴 token、数据库、原始响应或未脱敏日志。

更多见 [安全与隐私](docs/reference/security-and-privacy.md)。安全问题请走 GitHub 私密漏洞报告。

## 开发

```powershell
npm ci
npm run build
npm run tauri dev

cargo test --manifest-path src-tauri/Cargo.toml --locked --jobs 1
```

```text
src/                 Vue 界面、路由、本机/桌面适配
src-tauri/src/       登录、同步、标准化、SQLite
docs/                连接、架构、安全、开发说明
```

- [连接指南](docs/guides/connection.md)
- [架构摘要](docs/reference/architecture.md)
- [安全与隐私](docs/reference/security-and-privacy.md)
- [开发与门禁](docs/development/development.md)

涉及 Zepp 响应的测试数据必须脱敏或改成合成 fixture。不要提交真实 token、用户 ID 或完整健康记录。

## 许可证

[MIT License](LICENSE)。Zepp、Amazfit 及相关商标属于各自权利人。
