# ZeppBridge v3 worktree

本目录是 `lingcang728/ZeppBridge` 的 `v3` 分支。旁边 `../ZeppBridge` 是 `main`（2.x）。

## 测试版 exe 必须叫 ZeppBridge3

从本文件夹打包出来的 Windows 测试版：

- exe：`release\ZeppBridge3.exe`
- 快捷方式：`ZeppBridge3.lnk`（桌面 / 开始菜单）
- Win+R / App Paths：`ZeppBridge3`

**禁止**产出或改写 2.x 日常入口：

- `ZeppBridge.exe`
- 桌面 / 开始菜单的 `ZeppBridge.lnk`
- `HKCU\...\App Paths\ZeppBridge.exe`
- `../ZeppBridge/release/` 里的任何文件（尤其是 `data\zepp.db`）

`src-tauri/tauri.conf.json` 的 `productName` 必须保持 `ZeppBridge3`。
打包脚本看到它变回 `ZeppBridge` 会失败。

测 3.0：点 ZeppBridge3，或 Win+R 输入 `ZeppBridge3`。
日常 2.x：继续用 `ZeppBridge`。

## ⛔ Beta1 只本地自测，绝不发包（2026-09-23 用户命令）

- **禁止** push 任何 `v*` tag——CI（`.github/workflows/ci.yml`）看到 `v*` 就会打包并创建 GitHub Release。里程碑 tag 用 `beta1-local` 这类非 v 前缀名。
- **禁止** `gh release create` / 把 v3 产物当正式发布。
- 分支 `v3` 本身的 push 不触发打包，但也先等用户发话再推。
- 当前例外状态（用户主动切换，勿擅自改回）：桌面/开始菜单 `ZeppBridge.lnk` 与 App Paths `ZeppBridge.exe`/`ZeppBridge3.exe` 现都指向 `release\ZeppBridge3.exe`；`release\data` 是 junction → `..\ZeppBridge\release\data`（共享真实库，已迁 schema 33）。v2 exe 已打不开该库；备份在 `..\ZeppBridge\release\data.v2-backup-20260923`。
