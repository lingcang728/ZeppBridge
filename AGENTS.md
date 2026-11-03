# ZeppBridge

本目录 `MyProject\ZeppBridge` 是 `lingcang728/ZeppBridge` 的仓库本体。

## 分支与发版（2026-10-14 起）

- 3.0.0 已发布（PR #126 把 v3 压缩合进 main，标签 `v3.0.0`）。**从此直接在 `main` 上开发**，本目录检出的就是 `main`。
- `v3` 分支冻结：不再往上提交，不从它开新分支，也不再合回 main。2.x 不再维护。
- 仓库主人直接提交推送 `main`，不开 PR（2026-10-19 定）：动手前 `git pull --rebase origin main`，本地门禁跑完再推；push 会自动跑 CI，打 `v*` 标签前确认 main 最新 CI 是绿的。分支保护（Documentation and CI routing、Windows / macOS verification）只拦外部 PR，管理员不受限。
- 普通 README、文档 Markdown 和文档图片改动只跑轻量文档检查，三平台构建及 Docker 跳过。参与 Rust 契约测试的 `docs/reference/cli-and-mcp*.md`、代码、配置、脚本及未知文件仍跑完整验证。发布标签与手动 CI 始终跑完整流程。
- **推 `v*` 标签就会触发 CI 打包并创建 GitHub Release**，已装用户随即收到更新。推送、打标签、发版先问用户。

## 本地测试包

- exe：`release\ZeppBridge.exe`（`npm run package:release` 产出）
- 快捷方式：`ZeppBridge.lnk`（桌面 / 开始菜单）；Win+R / App Paths：`ZeppBridge`
- `release\data` 是用户的真实库（和 exe 同目录），只能复制出来只读查询；本目录同时是 git 仓库本体，整个文件夹不能删。
- Rust 门禁走 `pwsh scripts\v3-gates.ps1`（cargo target 隔离在 `G:\build_cache\cargo-target-v3`）。

## 多语言翻译规则

- 翻译多语言任务时，必须为每种语言单独派发一个独立的 Agent 并行执行（例如 7 种语言派 7 个 Agent），禁止将多种语言打包给单个 Agent，以最大化并行效率。
