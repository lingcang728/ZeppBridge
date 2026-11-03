# Linux

ZeppBridge 在 Linux 上提供 Flatpak、`.deb`、`.rpm` 和 AppImage 包，另有 Arch 原生包的本地构建配方。另外还有一个给 CLI 和 MCP 用的[无头容器镜像](docker.zh-CN.md)，那是另一件事，单独一篇。

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

脚本只要求宿主机上有 `flatpak`、`flatpak-builder` 和 `elfutils`（提供 `eu-strip`，flatpak-builder 剥调试信息时要用），别的都不需要——Rust 和 Node 来自 Flatpak 的 SDK 扩展，不会往系统里装任何工具链。全程 `--user`，不需要 root。

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

### Arch Linux

`packaging/arch/` 提供 `zeppbridge-git` 的 `PKGBUILD` 和 `.SRCINFO`，目前配方面向
`x86_64`。它使用系统 GTK / WebKit，生成原生 `.pkg.tar.zst`，将桌面应用、CLI 和 MCP
三个程序安装到 `/usr/bin`，不经过 AppImage 工具。配方尚未提交到 AUR，不能直接用
`yay -S zeppbridge-git` 安装。本机 Arch `x86_64` 已完成原生包构建、桌面入口校验及
CLI 版本检查；尚未进行洁净 chroot 构建、系统安装或 GUI 完整功能验证，CI 尚未覆盖 Arch。

要打包当前工作区（包括未提交修复），在仓库根目录运行：

```bash
nvm use
./packaging/arch/build-local.sh
# 若需要由 makepkg 安装缺少的系统构建依赖，明确加上此选项：
./packaging/arch/build-local.sh --syncdeps
```

脚本把受版本控制及未被忽略的源码快照到 `$XDG_CACHE_HOME/zeppbridge/arch/`
（未设时为 `~/.cache/zeppbridge/arch/`）的独立 Git 仓库，隔离源码、依赖和 Rust target，
不复制用户数据库。默认不安装系统依赖或成品；完成后在 `release-arch/` 中取得包。
确认要安装时自行执行：

```bash
sudo pacman -U release-arch/zeppbridge-git-*.pkg.tar.zst
```

若要使用原始配方构建并安装远端已提交的 `main`，则运行：

```bash
cd packaging/arch
makepkg -si
```

这条命令不包含本地未提交修改，并会请求安装依赖及成品。配方的准备阶段通过
`npm ci --ignore-scripts` 安装前端依赖，再显式运行 `postinstall` 应用项目补丁，
并用 `cargo fetch --locked` 准备 Rust 依赖；构建阶段冻结 Rust 依赖并离线编译。
本地快照脚本通过 `ZEPPBRIDGE_SOURCE_URL` 覆盖配方的默认远端源码地址。

## 数据放在哪

| | 路径 |
|---|---|
| Flatpak | `~/.var/app/com.zeppbridge.app/data/zeppbridge/data/` |
| deb / rpm / Arch 原生包 | `~/.local/share/zeppbridge/data/` |
| AppImage、解包的 tarball | 可执行文件旁边的 `data/` |
| 设了就用它 | `$ZEPPBRIDGE_DATA_DIR` |

这个分叉是刻意的。`/usr/bin` 属于包管理器，Flatpak 的 `/app/bin` 是只读的，这两种情况下数据没法放在程序旁边，所以走 XDG 数据目录。AppImage 待的那个目录确实属于你，所以保持和 Windows 一样的「安装目录旁边」布局。`ZEPPBRIDGE_DATA_DIR` 设成绝对路径会覆盖上面全部；相对路径会被拒绝，而不是按当时的工作目录展开。

`zeppbridge-cli` 和 `zeppbridge-mcp` 按同一套规则解析同一个目录，不用配置就能读到应用写的那个库。

## 令牌存在哪

App Token 存进 **Secret Service**——GNOME Keyring 或 KWallet，走 D-Bus。数据库旁边的 `auth.json` 只保存不敏感的元数据（用户 ID、区域地址）。这和 Windows 凭据管理器、macOS 钥匙串是对齐的。

官方授权成功但系统凭据存储失败时，应用会提供密钥环修复指引。打开系统的密码或钱包
管理器，创建并解锁默认密钥环或钱包；Niri 等环境还需确认 GNOME Keyring 或 KWallet
等 Secret Service 提供程序正在运行。修复后可在选择面板中重试保存，无需立即重新授权。
高级数据的内嵌网页登录和手动 App Token 输入也支持同样的密钥环修复与保存重试。
后端将授权结果或手动输入的凭证仅在内存中保留最多 10 分钟，期间无需重新登录或
重新填写。取消、发起新登录、重新提交手动凭证或退出应用都会使待保存凭证失效，
过期后需重新登录或输入。

也可以明确勾选同意以明文保存，再将官方授权的访问令牌与刷新令牌，或高级数据的
App Token 写入数据目录的 `credentials.json`，Unix 文件权限为 `0600`。
以同一用户身份运行的程序仍能读取它。JSON 存储在当前进程立即生效，重启后也会
复用已有文件，但显式环境配置优先；若启动配置与文件存储冲突，界面不会允许切换到
文件存储，需要修复系统凭据存储或调整启动配置。手动输入的凭证保存成功后仍需完成
原有验证，保存成功不代表验证通过。完整 GUI 真实登录流程尚未验证。

无头服务器或容器也可通过启动环境选择存储方式：

```bash
# 改成写在数据目录里的 credentials.json，权限 0600。
# 这是明摆着的降级：保护它的只有文件权限。
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# 或者由环境把令牌交进来。只读：不落盘，进程也改不了它。
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

`ZEPPBRIDGE_CREDENTIAL_STORE` 接受 `secret-service`（默认）、`file`、`env`。认不出来的值是错误，不会回落到默认——一处拼写错误不该安静地改变令牌存到哪里去。

不设这个变量时，按机器上已经存在的事实推断：`ZEPPBRIDGE_APP_TOKEN` 里有令牌优先，其次是数据目录里已有的 `credentials.json`，最后才是 Secret Service。倒数第二条是为了不让一个容器在第二次运行时报「未连接账号」——只因为环境变量只在第一次带上了。

## 把已有的库从 Windows 或 macOS 搬过来

拷数据库，然后重新登录一次。这是两件事，第二件不能省——见 [issue #40][issue-40]。

**数据库能搬。** 两边都关掉应用，把 `zepp.db`（连同旁边的 `auth.json`）拷到
上面那张表里对应你这种安装方式的目录。文件里没有任何和机器绑定的东西。

**系统凭据存储中的令牌搬不过来。** 使用系统存储时，令牌不在你拷的那个文件夹里：Windows
上它在凭据管理器，macOS 上在钥匙串，两者都和那台机器绑定。
`auth.json` 里只有用户 ID 和区域地址。所以拷过来的文件夹是「元数据齐了、密钥
没有」，应用会说凭据管理器里没有这个账号的令牌。这不是拷坏了，是本来就没有
可拷的东西。

按你搬到的机器挑一条：

```bash
# 有 keyring 的 Linux 桌面：在应用里重新登录一次就行，拷过来的库不会被覆盖，
# 同步会从旧机器停下的地方接着走。

# 没有 keyring 守护进程的桌面，或者用命令行驱动的无头机器：
# App Token 填一次，之后存在数据目录里，权限 0600。
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# 容器，或者令牌来自密钥管理器的场合：
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

App Token 本身从哪来，两条路：

- 桌面应用里（任何平台）：**设置 → 手动登录**，可以读出来，也可以填进去。
- 浏览器里：在 `https://watchface.zepp.com/` 登录，然后从开发者工具里读出
  `apptoken` 和 `userid`。应用自己的登录窗口收的就是这一对。

命令行**故意**没有 `login`。登录意味着浏览器、密码，有时还有一次性验证码，
而命令行是给 cron 和容器跑的——那里没有人来回答这些。

[issue-40]: https://github.com/lingcang728/ZeppBridge/issues/40

## 窗口一片空白，或者根本起不来

**白屏或切换主题、语言后崩溃。** Linux 的 WebKitGTK 渲染行为会受到显卡驱动、
Wayland / X11 和合成器影响。关闭 DMABUF 是切换缓冲区传递与呈现路径，
不等于关闭全部 GPU 加速；见 [WebKit 图形架构说明](https://docs.webkit.org/Ports/WebKitGTK%20and%20WPE%20WebKit/Graphics.html)。

应用参考 [Clash Verge Rev 的兼容处理](https://github.com/clash-verge-rev/clash-verge-rev/blob/main/src-tauri/src/utils/linux/workarounds.rs)，采用以下默认策略：

- 通常沿用 WebKit 默认渲染路径，不按 WebKitGTK 版本统一开关 DMABUF。
- 检测到 NVIDIA 驱动或 DRM 显卡厂商为 NVIDIA 时，设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`。
- `XDG_SESSION_TYPE=wayland`，且 `pkg-config --modversion wayland-client` 检测到的数值版本不高于 `1.23.0` 时，也设置为 `1`。缺少 `pkg-config` 或版本未知时不触发这一条。
- AppImage 保留默认 `WEBKIT_DISABLE_COMPOSITING_MODE=1` 的兼容措施。

这些探测是尽力而为；用户已经设置的变量始终优先，包括显式设为 `0`。应用不强制
`GDK_BACKEND`。任一禁用变量为非 `0` 时，主题和语言切换会跳过 View Transition
快照动效，切换功能仍然保留。

本机 Arch Linux + AMD + Wayland + WebKitGTK 2.54.1 的复现中，关闭 DMABUF 后执行
快照动效触发了 `graphicsLayerFactory` 中止，默认路径则正常。这只验证了这一组环境，
不能据此保证所有发行版和驱动的行为。

可以分别测试关闭 DMABUF 或恢复默认路径：

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 zeppbridge
WEBKIT_DISABLE_DMABUF_RENDERER=0 zeppbridge

# 在仓库根目录开发时，同样可以显式覆盖。
nvm use
WEBKIT_DISABLE_DMABUF_RENDERER=0 npm run tauri dev

# AppImage 若要测试恢复硬件渲染，还需覆盖其默认禁用合成的设置。
WEBKIT_DISABLE_DMABUF_RENDERER=0 WEBKIT_DISABLE_COMPOSITING_MODE=0 ./ZeppBridge_<版本>_x86_64.AppImage
```

**只有 AppImage 还是打不开。** [issue #32][issue-32] 中，2.1.0 的 Flatpak 在关闭
DMABUF 后恢复正常，AppImage 仍失败；报告者在本机编译的 AppImage 则能启动。
排查发现 CI 构建的包包含了自己的 `libwayland-client.so.0`、`libwayland-cursor.so.0`、
`libwayland-egl.so.1` 和 `libwayland-server.so.0`。之后的构建移除了这四个库，
改用宿主机提供的版本，并保留 AppImage 默认禁用加速合成的措施。这是历史兼容处理，
不能证明其他包格式在所有机器上都正常。

如果仍然起不来，可以分别尝试下面的覆盖；强制 X11 需要系统已经安装 XWayland：

```bash
GDK_BACKEND=x11 ./ZeppBridge_<版本>_x86_64.AppImage
WEBKIT_DISABLE_COMPOSITING_MODE=1 zeppbridge
```

请从终端启动应用，保留 `Linux rendering: policy=...` 这一行和 WebKit 崩溃输出。
该行记录所选策略、两个禁用变量的最终值以及 `skip_view_transitions`，不包含完整的
显卡、会话或 WebKit 版本信息。反馈时另请提供发行版、显卡及驱动、Wayland / X11
会话类型和安装包格式。下面的命令可辅助收集信息：

```bash
pkg-config --modversion webkit2gtk-4.1 wayland-client
lspci -nnk
printenv | rg '^(WEBKIT_|GDK_BACKEND=)'
printf 'XDG_SESSION_TYPE=%s\n' "$XDG_SESSION_TYPE"
```

`pkg-config`、`lspci` 或 `rg` 可能尚未安装。`pkg-config` 报告的是开发元数据中的版本，
不一定是应用运行时实际加载的动态库版本。

[issue-32]: https://github.com/lingcang728/ZeppBridge/issues/32

**没有托盘图标，并且 stderr 上有一行 `libayatana-appindicator3`。** 托盘图标由
桌面环境通过这个库绘制。GNOME 的 Flatpak runtime 里没有它，一些桌面也没装。现在
它不在的时候应用不会再崩——只是没有托盘图标，并且关闭窗口等于退出，因为藏进一个
不存在的托盘会留下一个再也叫不回来的进程。要托盘的话：

```bash
sudo apt install libayatana-appindicator3-1     # Debian / Ubuntu
sudo dnf install libayatana-appindicator3       # Fedora
sudo zypper install libayatana-appindicator3-1  # openSUSE
```

`.deb` 和 `.rpm` 已经声明了这个依赖，这两种包上它应该本来就在。Flatpak 现在也把
它打进去了——manifest 里多了 libdbusmenu、libayatana-indicator 和
libayatana-appindicator 三个模块，因为 Flatpak 用户没有自己装这个库的路子。另外
GNOME 上还需要装 AppIndicator 扩展才看得见，KDE 原生支持。

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
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libxdo-dev patchelf \
  rpm xdg-utils
npm ci
npm run tauri build -- \
  --config src-tauri/tauri.linux.conf.json \
  --bundles deb,rpm,appimage
```

`--config src-tauri/tauri.linux.conf.json` 的作用是关掉 updater 产物。基础配置里
它是开着的（Windows 和 macOS 要用），而那个开关是全局的：开着的时候打包会去找
发布签名私钥，找不到就停在「A public key has been found, but no private key」。
Linux 这边刻意不产出 updater 产物——应用内更新在 Linux 上本来就是关的。

其中三个容易漏，而且都不在 Tauri 自己的前置依赖清单里：

- `libdbus-1-dev` —— Secret Service 凭据后端链接 libdbus。运行时对应 `libdbus-1-3`，deb 和 rpm 都已经声明了它。
- `rpm` —— rpm 打包那一步要调 `rpmbuild`。
- `xdg-utils` —— AppImage 打包会把 `/usr/bin/xdg-open` 复制进镜像。缺了它，失败发生在 deb 和 rpm 都已经写出来**之后**，看起来像是 AppImage 自己的 bug，而不是少装了一个包。

### Arch 上 AppImage 打包失败

本次 Arch 环境中，上面的构建已成功编译原生程序并生成 deb / rpm，失败发生在最后的
AppImage 打包阶段。可以直接运行 `src-tauri/target/release/zeppbridge` 体验本机原生程序；
只需要 deb / rpm 产物时，将构建参数改为 `--bundles deb,rpm` 可跳过 AppImage。
这些包分别面向 Debian / RPM 系发行版，并不是让 Arch 通过 `pacman` 安装。

保留已编译的二进制，只重试 AppImage 打包并查看详细日志：

```bash
npm run tauri -- bundle --config src-tauri/tauri.linux.conf.json --bundles appimage --verbose
```

本机依次复现了两个独立问题：

- linuxdeploy 自带的旧 `strip` 不认识 `.relr.dyn`，报 `unknown type 0x13`。在上述命令前加 `NO_STRIP=true` 可跳过剥离步骤；相关上游问题见 [Tauri #11149](https://github.com/tauri-apps/tauri/issues/11149)。
- 跳过 `strip` 后，GTK 插件继续在复制 `/usr/lib/gdk-pixbuf-2.0/2.10.0` 时失败。本机 `gdk-pixbuf2 2.44.8` 使用 Glycin，没有插件预期的旧外部 loader 目录。

因此，`NO_STRIP=true` 只针对第一类错误，不能单独解决这台机器上的 AppImage 打包。
不要通过创建空 loader 目录或降级系统库来掩盖第二类错误。

### 使用容器构建分发包

对外分发 AppImage 时，建议使用已有的 Bookworm 工具链容器，避免将宿主 Arch 的滚动
更新库带入构建环境。命令同时隔离宿主的 `node_modules` 和 Rust target：

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build .
docker run --rm -v "$PWD:/src" -w /src \
  -v zeppbridge-bookworm-node-modules:/src/node_modules \
  -v zeppbridge-bookworm-target:/build-target \
  -e CARGO_TARGET_DIR=/build-target zeppbridge-build \
  bash -c 'npm ci && npm run tauri build -- \
    --config src-tauri/tauri.linux.conf.json --bundles deb,rpm,appimage'
```

产物位于 `zeppbridge-bookworm-target` volume 内的 `/build-target/release/bundle/`，
不会覆盖宿主的 `src-tauri/target`。当前机器没有 Docker 或 Podman，本轮未验证该容器构建。

## Flathub

没有提交。`packaging/flatpak/com.zeppbridge.app.yml` 这份清单构建时要联网，而 Flathub 不允许。要走到那一步，还需要：

1. 用 [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools) 生成 `cargo-sources.json` 和 `node-sources.json`，把每一个依赖都变成声明出来的 source；
2. 从 `build-args` 里去掉 `--share=network`；
3. AppStream 元数据里至少要有一张托管的截图——仓库里一张都没有，所以 `<screenshots>` 是刻意缺着的，而不是指向一个会 404 的地址。

那两个生成出来的文件很大，而且每次动依赖都会过期。为一次还没发生的提交而把它们提交进来，不值得。
