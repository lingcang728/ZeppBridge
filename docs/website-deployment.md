# ZeppBridge 网站部署

浏览器访问构建产物时显示产品落地页；Tauri 桌面运行时仍显示完整应用。页面中内嵌的体验使用当前应用代码，以及独立的内存数据，不会连接真实账户或修改本地数据库。

## 本地构建与验收

先复用已安装的 Python Playwright、Chromium、ffmpeg 和 ffprobe。构建脚本不会安装或下载工具；必要时用 `LANDING_PYTHON`、`LANDING_CHROMIUM`、`PLAYWRIGHT_BROWSERS_PATH` 指定现有安装。

`npm run build:web` 会进行类型检查与相关测试，启动本地应用，检查演示路由，并录制五个完整功能流程的十种语言、明暗主题版本。视频为 2560 × 1600，配套封面与首页静态素材。脚本根据源代码内容指纹复用未变化的素材；应用、语言、演示数据或录制流程发生变化后，会更新受影响的版本。

网站构建输出到 `.site-cache/site-dist`；录像、指纹清单与验收截图分别保存在 `.site-cache/media`、`.site-cache/media/manifest.json` 和 `.site-cache/verification`。这些目录不进入 Git。普通 `npm run build` 仍输出桌面应用所用的 `dist`，不打包网站演示视频。

本地预览可运行 `npm exec vite -- preview --mode site --host 127.0.0.1 --port 1536`。预览启动后，用 `npm run site:verify -- --url http://127.0.0.1:1536` 验收响应式布局、内嵌操作、视频和强制深色模式。验收脚本额外复用 Python Pillow。`npm run site:media -- --url http://127.0.0.1:1532` 可单独刷新正在运行的本地开发服务器素材；加 `--force` 可强制重录。

构建只生成本地产物。当前输出带 `noindex`，正式上线前需另外决定搜索引擎收录策略。

## Cloudflare Pages

仓库的 `Deploy website to Cloudflare Pages` workflow 可从 GitHub Actions 手动执行：

1. `npm ci`
2. `npm run build:web`
3. 将 `.site-cache/site-dist` 发布到 Cloudflare Pages 项目 `zeppbridge`

该 workflow 为手动触发，独立准备录制工具并缓存已有视频；不会由 v3 分支推送自动发布。首次全量录制比复用缓存耗时更长。

首次部署前，需要在 GitHub 仓库的 Actions secrets 中配置：

- `CLOUDFLARE_API_TOKEN`：具备 Cloudflare Pages 编辑权限的令牌。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。

下载区只在找到完整的 v3 正式版资源时启用下载，测试版或 v2 不会被当作 v3 正式版。Star 按钮直接链接 GitHub 仓库。
