# ZeppBridge v3

本目录 `MyProject\ZeppBridge` 是 `lingcang728/ZeppBridge` 的仓库本体，当前检出 `v3` 分支（2026-10-02 起，原来旁边的 `ZeppBridge-v3` worktree 已并回这里）。`main`（2.x）不常驻本机，要出 2.x hotfix 时用 `git worktree add ..\ZeppBridge-main main` 临时开一份。

## 测试版 exe 叫 ZeppBridge（2026-09-30 起）

用户决定本机不再并行跑 2.x（2.x 程序文件已清掉，2.4.4 也打不开 v34 的库），
v3 测试版改回叫 ZeppBridge：

- exe：`release\ZeppBridge.exe`
- 快捷方式：`ZeppBridge.lnk`（桌面 / 开始菜单）
- Win+R / App Paths：`ZeppBridge`

`publish-local.ps1` 会撤掉指向本目录的旧 `ZeppBridge3` 入口。
本目录 `release\data` 是真实库（和 exe 同目录，2026-10-02 起不再有 junction），
只能复制出来只读查询；本目录同时是 git 仓库本体，整个文件夹不能删。

## ⛔ Beta1 只本地自测，绝不发包（2026-09-23 用户命令）

- **禁止** push 任何 `v*` tag——CI（`.github/workflows/ci.yml`）看到 `v*` 就会打包并创建 GitHub Release。里程碑 tag 用 `beta1-local` 这类非 v 前缀名。
- **禁止** `gh release create` / 把 v3 产物当正式发布。
- 分支 `v3` 本身的 push 不触发打包，但也先等用户发话再推。
- 当前状态（2026-09-30）：桌面 / 开始菜单 `ZeppBridge.lnk` 与 App Paths `ZeppBridge.exe` 指向 `release\ZeppBridge.exe`；`release\data` 是真实库本体（schema 34；beta.28 首次打开会升到 35）。2.x 程序文件与升级前快照已按用户要求清进回收站。
