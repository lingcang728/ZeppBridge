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
