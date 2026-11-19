# packaging/

[English](README.md)

把这个仓库变成可安装产物所需的一切，针对打包配置不在 `src-tauri/tauri.conf.json` 里的那些平台。

| 路径 | 是什么 | 指南 |
|---|---|---|
| `arch/PKGBUILD`、`arch/.SRCINFO` | [`zeppbridge-git` 的 AUR 配方](https://aur.archlinux.org/packages/zeppbridge-git)，面向 Arch x86_64，跟踪上游 `main`。 | [Linux 指南](../docs/guides/linux.zh-CN.md#arch-linux) |
| `arch/build-local.sh` | 快照当前工作区源码（含未提交修改），在独立缓存中调用 `makepkg`，产物写入 `release-arch/`。 | |
| `arch/publish-aur.sh` | 构建 `zeppbridge-git`，重新生成 `.SRCINFO`，预览 AUR 提交。加 `--push` 发布。 | |
| `flatpak/com.zeppbridge.app.yml` | Flatpak 清单 | [docs/guides/linux.zh-CN.md](../docs/guides/linux.zh-CN.md) |
| `flatpak/com.zeppbridge.app.desktop` | 桌面入口。Flatpak 要求文件名是 `$FLATPAK_ID.desktop`，所以放在这里而不是生成。 | |
| `flatpak/com.zeppbridge.app.metainfo.xml` | AppStream 元数据。没有它，应用在 GNOME 软件里装上后是个没名字的条目。 | |
| `flatpak/build-flatpak.sh` | 为当前用户构建并安装。需要 `flatpak`、`flatpak-builder` 和 `elfutils`；Rust 和 Node 来自 SDK 扩展。 | |
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
`~/.cache/zeppbridge/arch/`），不会复制用户数据库。默认只构建、不安装任何东西；
额外参数原样转发给 `makepkg`，`--syncdeps` 安装缺少的构建依赖，`--install` 在构建
成功后安装成品。原始配方中的 `makepkg -si` 则构建远端已提交的 `main` 并安装，
不包含本地未提交修改。

`zeppbridge-git` 的 AUR 发布当前由 [@Jax-Tsai-zero](https://github.com/Jax-Tsai-zero) 提供支持。
需要 AUR 共同维护权限的项目成员，请联系他并提供自己的 AUR 用户名。

维护者配置好 AUR SSH 公钥并安装 Arch 构建依赖后，可运行
`./packaging/arch/publish-aur.sh` 构建并查看暂存差异。发布需要配置 Git 提交身份。确认后运行
`./packaging/arch/publish-aur.sh --push`，脚本会重新构建并将配方、`.SRCINFO` 和许可证推到 AUR。

## CI

完整 CI 流程会校验桌面入口和 AppStream 元数据，并构建和冒烟测试无界面镜像。
发布标签、手动触发和向 `main` 推送打包相关变更时会构建 Flatpak 安装包。
Arch x86_64 原生包已完成构建验证。
