# ZeppBridge 网站部署

[English](website-deployment.md)

zeppbridge.com 是 Cloudflare Pages 项目 `zeppbridge`。同一份构建产物在浏览器里显示落地页，在 Tauri 桌面运行时显示完整应用。页面里内嵌的体验跑的是当前应用代码和内存里的演示数据，不连真实账户，也不碰本地数据库。

## 本地构建

构建脚本不安装任何工具，复用已有的 Python Playwright、Chromium、ffmpeg 和 ffprobe；需要时用 `LANDING_PYTHON`、`LANDING_CHROMIUM`、`PLAYWRIGHT_BROWSERS_PATH` 指到已有的安装。

- `npm run build:web`：类型检查、跑相关测试、本地起应用、检查演示路由，并按 14 种界面语言、深浅两套主题录制功能演示。源文件没变的素材按指纹复用。
- 产物在 `.site-cache/site-dist`，录像和验收截图在 `.site-cache/media`、`.site-cache/verification`，都不进 Git。普通的 `npm run build` 仍只产出桌面应用用的 `dist`，不带网站视频。
- `npm run site:media` 单独重录素材（加 `--force` 全部重录）；`npm run site:verify -- --url <预览地址>` 对着正在运行的预览（`npm exec vite -- preview --mode site --host 127.0.0.1 --port 1536`）检查排版、内嵌交互、视频和深色模式。
- 收尾一步（`scripts/site/finish-dist.mjs`）生成 `/changelog`、`/letters`、`/privacy`、404 页和 `_routes.json`。更新日志只收打了 `v*` 标签的版本，所以要在带标签的完整克隆里构建；一个标签都找不到时会直接报错。

网站允许搜索引擎收录（`robots.txt` 不拦）。

## 部署

在已登录 Wrangler 的机器上：`npm run site:deploy`（先跑收尾一步，再 `wrangler pages deploy`）。

也可以在 GitHub Actions 里手动运行 **Deploy website to Cloudflare Pages**。它只能手动触发，推送不会自动部署。流程是 `npm ci && npm run test:functions && npm run build:web`，应用 `zeppbridge-feedback` 的 D1 迁移，然后部署 `.site-cache/site-dist`。

## 接口、数据库和密钥

`functions/` 里是 `/api/*` 背后的 Pages Functions：

| 路由 | 用途 |
|---|---|
| `/api/feedback` | 应用内一键报错（D1 `FEEDBACK_DB`） |
| `/api/letters/*` | 作者来信与回信 |
| `/api/release` | 最新版下载链接（读最新 GitHub Release 的 `latest.json` 和 `SHA256SUMS.txt`） |
| `/api/zepp/oauth/*`、`/api/zepp/data/callback` | Zepp 官方开放平台的授权中转和数据回调（D1 `OFFICIAL_DB`） |

`zeppbridge.pages.dev` 上的 `/api/*` 永不跳转：旧版应用和在 Zepp 登记的回调地址都用这个域名。

项目需要的绑定和变量（`wrangler.jsonc` 与 Pages 项目设置）：

- D1 `FEEDBACK_DB`（`zeppbridge-feedback`，迁移在 `migrations/`）和 `OFFICIAL_DB`（`zeppbridge-official`，迁移在 `migrations-official/`）。工作流只应用反馈库的迁移；`migrations-official` 有变化时用有权限的 Wrangler 会话手动应用。
- `ZEPP_CLIENT_ID`、`ZEPP_CLIENT_SECRET`、`RELAY_KEY`：缺任何一个，官方开放平台中转就不可用。

工作流用到的 GitHub Actions 密钥：

- `CLOUDFLARE_API_TOKEN`：有 Cloudflare Pages 编辑权限。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
- `CLOUDFLARE_D1_API_TOKEN`（可选）：有 D1 编辑权限。没有它时工作流跳过迁移、照常部署。
