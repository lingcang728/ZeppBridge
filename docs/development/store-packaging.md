# Microsoft Store 包（维护者用）

面向用户的说明见 [Microsoft Store 指南](../guides/microsoft-store.zh-CN.md)。

当前商店包版本 **3.1.3.0**，应用 / PE 版本 **3.1.1**。`scripts/windows/build-store-msix.ps1` 构建未签名 MSIX，默认输出 `release/store-msix/ZeppBridge-<包版本>.msix`；脚本不签名、不安装。

- 普通 GitHub 构建带 `github-updater` 特性；商店包用 `--no-default-features --features store`，不含 GitHub 更新器。
- 商店包只在手动触发 CI 或本机跑 `build-store-msix.ps1` 时构建；`v*` 标签打出的安装包不受影响。
- 内容不同的包必须递增包版本（同版本不同内容无法覆盖安装）。包版本和应用版本是两回事：3.1.2.0 曾把 Cargo 应用版本当成包登记版本，3.1.3.0 起改用 Windows 当前进程 / 当前用户的包登记 API，严格匹配产品、发布者、架构、SID 和实际包卷。
- 运行检查分别校验包版本、PE 版本、候选文件哈希和新进程时间。进程存在不等于进了主界面，启动错误对话框要另外判为失败。
- 数据导入：独占只读句柄复制数据库、WAL、SHM 到暂存目录，再用 SQLite online backup 生成快照并检查完整性；数据库最后发布，失败回滚暂存项。凭据类文件不复制。实现在 `src-tauri/crates/core/src/paths/store.rs`。
- MCP 子进程继承了别的包身份时，只接受指向 ZeppBridge 商店包 LocalState 的数据目录。

## 应用升版时

`check-version-consistency.mjs <版本>` 会一并改 `tauri.store.conf.json`。`build-store-msix.ps1` 故意把应用版本和包版本钉死：应用升版后脚本拒绝构建，直到确认下一次提交商店用的包版本（必须大于提交过的），同时改脚本里的两处钉值、`AppxManifest.xml` 的 `Version` 和本文开头的版本。
