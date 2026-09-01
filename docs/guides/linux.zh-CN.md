# Linux

ZeppBridge 在 Linux 上提供 Flatpak、`.deb`、`.rpm` 和 AppImage 四种包。另外还有一个给 CLI 和 MCP 用的[无头容器镜像](docker.zh-CN.md)，那是另一件事，单独一篇。

[English version](linux.md)

## 什么被验证过，什么没有

决定要不要依赖它之前，先看这张表。

| | 状态 |
|---|---|
| 在 Linux 上能编译、clippy 干净、Rust 测试通过 | 每次推送都由 CI 覆盖 |
| Flatpak 包能构建出来，元数据能通过校验 | 每次推送都由 CI 覆盖 |
| 无头镜像能构建、能运行、数据目录落在挂载的卷上 | 每次推送都由 CI 覆盖 |
| 真实 Linux 桌面上的登录、同步、密钥环行为 | **还没有任何人验证过** |

最后一行才是要紧的那行。没有人在 Linux 桌面上完整走过一遍「登录并同步」。Linux 特有的那部分代码——Secret Service 凭据后端和 XDG 数据目录——只被单元测试和一个容器跑过，没有被一个戴着手表的人跑过。如果你试了，一条写清发生了什么的 issue 是最有用的东西。

这和 README 里对 macOS 的态度是同一个：没人查过却说「已支持」，是数据丢失的开始。

## 安装

### Flatpak

目前还没有发布现成的包，从仓库构建：

```bash
git clone https://github.com/lingcang728/ZeppBridge.git
cd ZeppBridge
./packaging/flatpak/build-flatpak.sh
flatpak run com.zeppbridge.app
```

脚本只要求宿主机上有 `flatpak` 和 `flatpak-builder`，别的都不需要——Rust 和 Node 来自 Flatpak 的 SDK 扩展，不会往系统里装任何工具链。全程 `--user`，不需要 root。

加 `--bundle` 还会额外产出一个可直接安装的单文件：`release/ZeppBridge_<版本>_x86_64.flatpak`。

### deb / rpm / AppImage

从 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载：

```bash
sudo apt install ./ZeppBridge_<版本>_amd64.deb      # Debian、Ubuntu
sudo dnf install ./ZeppBridge_<版本>_x86_64.rpm     # Fedora、RHEL
chmod +x ZeppBridge_<版本>_x86_64.AppImage && ./ZeppBridge_<版本>_x86_64.AppImage
```

这些包没有签名。Linux 上没有和 Windows/macOS 对应的代码签名体系，所以请用发布页的 `SHA256SUMS.txt` 核对下载。

AppImage 需要 FUSE。只带 FUSE 3 的系统上，要么装 `libfuse2`，要么用 `--appimage-extract-and-run` 运行。

## 数据放在哪

| | 路径 |
|---|---|
| Flatpak | `~/.var/app/com.zeppbridge.app/data/zeppbridge/data/` |
| deb / rpm | `~/.local/share/zeppbridge/data/` |
| AppImage、解包的 tarball | 可执行文件旁边的 `data/` |
| 设了就用它 | `$ZEPPBRIDGE_DATA_DIR` |

这个分叉是刻意的。`/usr/bin` 属于包管理器，Flatpak 的 `/app/bin` 是只读的，这两种情况下数据没法放在程序旁边，所以走 XDG 数据目录。AppImage 待的那个目录确实属于你，所以保持和 Windows 一样的「安装目录旁边」布局。`ZEPPBRIDGE_DATA_DIR` 设成绝对路径会覆盖上面全部；相对路径会被拒绝，而不是按当时的工作目录展开。

`zeppbridge-cli` 和 `zeppbridge-mcp` 按同一套规则解析同一个目录，不用配置就能读到应用写的那个库。

## 令牌存在哪

App Token 存进 **Secret Service**——GNOME Keyring 或 KWallet，走 D-Bus。数据库旁边的 `auth.json` 只保存不敏感的元数据（用户 ID、区域地址）。这和 Windows 凭据管理器、macOS 钥匙串是对齐的。

机器上没有 Secret Service 时——无头服务器、容器、没有密钥环守护进程的极简窗口管理器——就没有可写的地方，登录会失败，报错里会写出另外两个选项：

```bash
# 改成写在数据目录里的 credentials.json，权限 0600。
# 这是明摆着的降级：保护它的只有文件权限。
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# 或者由环境把令牌交进来。只读：不落盘，进程也改不了它。
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

`ZEPPBRIDGE_CREDENTIAL_STORE` 接受 `secret-service`（默认）、`file`、`env`。认不出来的值是错误，不会回落到默认——一处拼写错误不该安静地改变令牌存到哪里去。

不设这个变量时，按机器上已经存在的事实推断：`ZEPPBRIDGE_APP_TOKEN` 里有令牌优先，其次是数据目录里已有的 `credentials.json`，最后才是 Secret Service。倒数第二条是为了不让一个容器在第二次运行时报「未连接账号」——只因为环境变量只在第一次带上了。

## 更新

Linux 上应用内的更新检查是关掉的，设置页会直接这么说，而不是显示一次失败的检查。更新从这个包的来处走：

```bash
flatpak update com.zeppbridge.app     # Flatpak
sudo apt install --only-upgrade ...   # deb，等有了软件源之后
```

AppImage 用户手动换文件。为什么没有自更新：更新清单里没有 linux 的条目，而往 `/app` 或 `/usr/bin` 里写文件会和包管理器打架。一句意思是「这里没什么可查的」的红色「更新失败」，比没有按钮更糟。

## 沙箱权限（Flatpak）

| 权限 | 为什么 |
|---|---|
| `--share=network` | 从 Zepp 云同步。这是这个程序唯一要联网的理由。 |
| `--socket=wayland`、`--socket=fallback-x11`、`--device=dri`、`--share=ipc` | 画一个窗口。 |
| `--talk-name=org.freedesktop.secrets` | 把 App Token 存进密钥环。没有它，登录能走完但令牌存不下去。 |
| `--talk-name=org.kde.StatusNotifierWatcher` | 托盘图标。GNOME 上还要装 AppIndicator 扩展才看得见，KDE 原生支持。 |

刻意没给的：`--filesystem=home`（导出和备份走 XDG 文件选择器 portal，你点哪个目录才在那一刻给哪个目录）和 `--socket=session-bus`（上面两条 `--talk-name` 已经够了，整条总线等于沙箱开了个洞）。

## 从源码构建

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libxdo-dev patchelf
npm ci
npm run tauri build -- --bundles deb,rpm,appimage
```

`libdbus-1-dev` 是容易漏的那一个：它不在 Tauri 自己的前置依赖清单里。它在这里是因为 Secret Service 凭据后端链接 libdbus。运行时要 `libdbus-1-3`，deb 和 rpm 都已经声明了它。

不想往系统里装这些的话，用那个版本钉死的工具链容器——编译器、webkit、glibc 都和 CI 一致：

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build .
docker run --rm -v "$PWD:/src" -w /src zeppbridge-build \
  bash -c 'npm ci && npm run tauri build -- --bundles deb,rpm,appimage'
```

## Flathub

没有提交。`packaging/flatpak/com.zeppbridge.app.yml` 这份清单构建时要联网，而 Flathub 不允许。要走到那一步，还需要：

1. 用 [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools) 生成 `cargo-sources.json` 和 `node-sources.json`，把每一个依赖都变成声明出来的 source；
2. 从 `build-args` 里去掉 `--share=network`；
3. AppStream 元数据里至少要有一张托管的截图——仓库里一张都没有，所以 `<screenshots>` 是刻意缺着的，而不是指向一个会 404 的地址。

那两个生成出来的文件很大，而且每次动依赖都会过期。为一次还没发生的提交而把它们提交进来，不值得。
