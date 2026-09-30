# ZeppBridge v3 worktree

本目录是 `lingcang728/ZeppBridge` 的 `v3` 分支。旁边 `../ZeppBridge` 是 `main`（2.x）。

## 测试版 exe 叫 ZeppBridge（2026-09-30 起）

用户决定本机不再并行跑 2.x（2.x 程序文件已清掉，2.4.4 也打不开 v34 的库），
v3 测试版改回叫 ZeppBridge：

- exe：`release\ZeppBridge.exe`
- 快捷方式：`ZeppBridge.lnk`（桌面 / 开始菜单）
- Win+R / App Paths：`ZeppBridge`

`publish-local.ps1` 会撤掉指向本目录的旧 `ZeppBridge3` 入口。
`../ZeppBridge/release/data` 是真实库（本目录 `release\data` 是指向它的
junction），只能复制出来只读查询；`../ZeppBridge` 同时是 git 仓库本体，不能删。

## ⛔ Beta1 只本地自测，绝不发包（2026-09-23 用户命令）

- **禁止** push 任何 `v*` tag——CI（`.github/workflows/ci.yml`）看到 `v*` 就会打包并创建 GitHub Release。里程碑 tag 用 `beta1-local` 这类非 v 前缀名。
- **禁止** `gh release create` / 把 v3 产物当正式发布。
- 分支 `v3` 本身的 push 不触发打包，但也先等用户发话再推。
- 当前状态（2026-09-30）：桌面 / 开始菜单 `ZeppBridge.lnk` 与 App Paths `ZeppBridge.exe` 指向 `release\ZeppBridge.exe`；`release\data` 是 junction → `..\ZeppBridge\release\data`（真实库，schema 34）。2.x 程序文件与升级前快照已按用户要求清进回收站。
