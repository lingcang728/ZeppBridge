# Microsoft Store 包

ZeppBridge 商店包部署版本为 **3.1.3.0**，应用/PE 版本为 **3.1.1**。`scripts/windows/build-store-msix.ps1` 构建未签名 MSIX；默认输出为 `release/store-msix/ZeppBridge-3.1.3.0.msix`。脚本不会签名或安装。

每次部署内容不同的包都必须递增包版本；`ForceUpdateFromAnyVersion` 不能覆盖同版本不同内容。3.1.2.0 暴露了将 Cargo 应用版本当成包登记版本的问题；3.1.3.0 改用 Windows 当前进程及当前用户包登记 API，仍严格匹配产品、发布者、架构、SID 和实际包卷。运行检查分别校验包版本、PE 版本、候选文件哈希和新进程时间。进程存在不等于成功进入主界面，启动错误对话框必须另外判为失败。

## 数据与凭据（D6）

GitHub 版继续把库放在程序旁边的 `data/`。商店版使用独立目录：

```text
%LOCALAPPDATA%\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState\ZeppBridge\data
```

卸载 MSIX 时，Windows 会一并删除这份 LocalState 数据库。

首次启动时，用户可以导入一个本机 GitHub 版数据目录，或选择从空库开始。导入前需要关闭 GitHub 版及其他正在使用该库的进程。导入只读取源文件：通过独占只读句柄复制数据库、WAL 和 SHM 到商店版暂存目录，再用 SQLite online backup 生成快照并检查完整性。数据库最后发布；失败或进程中断时会回滚暂存项并允许重试。源目录不会被移动、覆盖或创建锁文件。

Zepp 登录凭据、官方账号元数据、凭据文件和本机 API 密钥/设置不跨版本复制。两版使用不同的系统凭据服务，因此导入后需在商店版重新登录，并为使用本机 API 的客户端重新配置密钥。

## CLI 与 MCP（D7）

清单注册两套执行别名：

| 通道 | CLI | MCP |
|---|---|---|
| 通用名称 | `zeppbridge-cli.exe` | `zeppbridge-mcp.exe` |
| 商店专用名称 | `zeppbridge-store-cli.exe` | `zeppbridge-store-mcp.exe` |

Windows 对同名别名按注册状态选择启动目标，所以通用名称不能保证始终指向某一个已安装版本。需要明确选择商店版时使用 `zeppbridge-store-*`；选择 GitHub 版时使用其程序旁边的绝对路径。设置页生成的商店 MCP 配置使用商店专用 WindowsApps 别名的绝对路径，并传入经过 LocalState 路径校验的数据目录。若 MCP 子进程继承了其他包身份，只接受指向 ZeppBridge 商店包 LocalState 的配置路径；其他路径会被拒绝。

## 更新渠道

普通 GitHub 构建仍启用 `github-updater`。商店包使用 `--no-default-features --features store`，不包含 GitHub 更新器；商店版通过 Microsoft Store 更新。

## 应用升版时

GitHub 版发版不受商店包影响：`v*` 标签打出的安装包仍是默认特性（带 GitHub 更新器），商店包只在手动触发 CI 或本机运行 `build-store-msix.ps1` 时构建。

`check-version-consistency.mjs <版本>` 会一并改 `tauri.store.conf.json`。`build-store-msix.ps1` 故意把应用版本钉在 3.1.1、把包版本钉在 3.1.3.0：应用升到新版本后，脚本会拒绝构建，直到有人确认下一次提交商店用的包版本（必须大于已提交过的版本），同时改脚本里的两处钉值、`AppxManifest.xml` 的 `Version` 和本文开头的说明。
