# packaging/

[English](README.md)

把这个仓库变成可安装产物所需的一切，针对打包配置不在 `src-tauri/tauri.conf.json` 里的那些平台。

| 路径 | 是什么 | 指南 |
|---|---|---|
| `arch/PKGBUILD`、`arch/.SRCINFO` | `zeppbridge-git` 的 Arch 原生包配方，跟踪远端 `main`；AUR 提交准备文件，尚未发布到 AUR。 | [Linux 指南](../docs/guides/linux.zh-CN.md#arch-linux) |
| `arch/build-local.sh` | 快照当前工作区源码（含未提交修改），在独立缓存中调用 `makepkg`，产物写入 `release-arch/`。 | |
| `flatpak/com.zeppbridge.app.yml` | Flatpak 清单 | [docs/guides/linux.zh-CN.md](../docs/guides/linux.zh-CN.md) |
| `flatpak/com.zeppbridge.app.desktop` | 桌面入口。Flatpak 要求文件名是 `$FLATPAK_ID.desktop`，所以放在这里而不是生成。 | |
| `flatpak/com.zeppbridge.app.metainfo.xml` | AppStream 元数据。没有它，应用在 GNOME 软件里装上后是个没名字的条目。 | |
| `flatpak/build-flatpak.sh` | 为当前用户构建并安装。只需要 `flatpak` 和 `flatpak-builder`；Rust 和 Node 来自 SDK 扩展。 | |
| `docker/Dockerfile` | 无界面运行时：`zeppbridge-cli` + `zeppbridge-mcp`，没有 GUI。 | [docs/guides/docker.zh-CN.md](../docs/guides/docker.zh-CN.md) |
| `docker/Dockerfile.build` | 固定版本的 Linux 工具链，用于可复现的 deb/rpm/AppImage 构建。 | |
| `docker/docker-compose.yml` | 一次性的 `sync` / `status` / `mcp` 服务，全部放在 profile 后面。 | |
| `docker/entrypoint.sh` | 把真正会发生的两种失败——卷不可写、没连账号——变成能照着做的提示。 | |

Windows（NSIS、MSI）和 macOS（app、dmg）在 `src-tauri/tauri.conf.json` 里配置，由
`.github/workflows/ci.yml` 构建；这个目录里的东西都不参与。

Linux 的 `deb` 和 `rpm` 依赖清单也在 `tauri.conf.json` 的 `bundle.linux` 下——它们是 Tauri
配置，不是单独的清单。

Arch 配方面向 `x86_64`，使用系统 GTK / WebKit，通过 Tauri `--no-bundle` 构建桌面程序，
另编译 CLI / MCP；三个程序安装到 `/usr/bin`，复用现有桌面入口、AppStream 元数据和图标，
附带 MIT 与字体许可证，不使用 AppImage 工具。准备阶段安装锁定依赖并显式应用
`postinstall` 补丁，Rust 构建阶段冻结依赖并离线运行。

本地开发先在仓库根目录执行 `nvm use`，再运行 `./packaging/arch/build-local.sh`。
源码快照、依赖和 Rust target 位于 `$XDG_CACHE_HOME/zeppbridge/arch/`（默认
`~/.cache/zeppbridge/arch/`），不会复制用户数据库。默认不安装系统依赖或成品；
`--syncdeps` 会转交给 `makepkg`。原始配方中的 `makepkg -si` 则构建远端已提交的
`main` 并安装，不包含本地未提交修改。

## 验证到哪一步

本机 Arch `x86_64` 已完成原生包构建、桌面入口校验及 CLI 版本检查；尚未进行洁净
chroot 构建、系统安装或 GUI 完整功能验证。AUR 尚未发布，CI 尚未覆盖 Arch。

`.github/workflows/ci.yml` 每次推送都会构建 Flatpak 包、校验桌面入口和 AppStream 文件，并构建
无界面镜像且**做冒烟测试**。任何 CI 都覆盖不了真实的 Linux 桌面：那里的登录、同步和密钥环行为
仍没有人实测过。见
[docs/guides/linux.zh-CN.md](../docs/guides/linux.zh-CN.md#什么被验证过什么没有)。
