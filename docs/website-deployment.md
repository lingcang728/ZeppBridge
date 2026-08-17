# ZeppBridge 网站部署

浏览器访问构建产物时显示产品落地页；Tauri 桌面运行时仍显示完整应用。桌面界面的浏览器验收入口为 `/?app-preview=1`，它不会读取账户数据。

## Cloudflare Pages

仓库的 `Deploy website to Cloudflare Pages` workflow 可从 GitHub Actions 手动执行：

1. `npm ci`
2. `npm run build:web`
3. 将 `dist` 发布到 Cloudflare Pages 项目 `zeppbridge`

首次部署前，需要在 GitHub 仓库的 Actions secrets 中配置：

- `CLOUDFLARE_API_TOKEN`：具备 Cloudflare Pages 编辑权限的令牌。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。

落地页的下载和源代码按钮直接指向 GitHub Releases 与仓库，不经过额外的下载中转服务。
