# Linux

ZeppBridge 在 Linux 上提供 Flatpak、`.deb`、`.rpm` 和 AppImage 包，Arch Linux 用户也可从 AUR 安装 `zeppbridge-git`。CLI 和 MCP 另有[无头容器镜像](docker.zh-CN.md)。

[English version](linux.md)

## 安装

### Flatpak

从 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载 `ZeppBridge-<版本>-Linux-x64.flatpak`，装到当前用户：

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user ./ZeppBridge-<版本>-Linux-x64.flatpak
flatpak run com.zeppbridge.app
```

想自己构建，见 [Linux 打包说明](../development/linux-packaging.md)（英文）。

### deb / rpm / AppImage

从 [Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载：

```bash
sudo apt install ./ZeppBridge-<版本>-Linux-x64.deb      # Debian、Ubuntu
sudo dnf install ./ZeppBridge-<版本>-Linux-x64.rpm     # Fedora、RHEL
chmod +x ZeppBridge-<版本>-Linux-x64.AppImage && ./ZeppBridge-<版本>-Linux-x64.AppImage
```

这些包没有签名。Linux 上没有和 Windows/macOS 对应的代码签名体系，所以请用发布页的 `SHA256SUMS.txt` 核对下载。

AppImage 需要 FUSE。只带 FUSE 3 的系统上，要么装 `libfuse2`，要么用 `--appimage-extract-and-run` 运行。

### Arch Linux

Arch Linux x86_64 可从 AUR 安装 [`zeppbridge-git`](https://aur.archlinux.org/packages/zeppbridge-git)。
安装时从上游 `main` 拉取源码，使用系统库编译桌面应用、`zeppbridge-cli` 和 `zeppbridge-mcp`。

```bash
paru -S zeppbridge-git
# 使用 yay：yay -S zeppbridge-git
```

也可以直接从 AUR Git 仓库安装。若 AUR 助手搜不到包名，可用此方式：

```bash
sudo pacman -S --needed base-devel git
git clone https://aur.archlinux.org/zeppbridge-git.git
cd zeppbridge-git
makepkg -si
```

上游 3.2.0 源码已在 Arch x86_64 完成构建，并通过桌面入口校验和 CLI 版本检查。
实际桌面使用已在较早的原生包上验证。洁净 chroot 构建仍待验证，CI 尚未覆盖 Arch。

如需构建当前工作区，请参阅 [Linux 打包说明](../development/linux-packaging.md#arch-linux)。

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
原有验证，保存成功不代表验证通过。

无头服务器或容器也可通过启动环境选择存储方式：

```bash
# 用桌面应用写下的 credentials.json（你同意了文件存储之后），或者从别处拷来的那份。
# 命令行自己从不索要令牌。
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

# 没有 keyring 守护进程的桌面：在应用里登录，并同意把令牌存进 credentials.json（权限 0600）。
# 无头机器：从这样做过的机器拷来那份 credentials.json，然后：
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# 容器，或者令牌来自密钥管理器的场合：
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

App Token 本身从哪来，两条路：

- 桌面应用从不显示已保存的令牌，在那里读不出来。
- 浏览器里：在 `https://watchface.zepp.com/` 登录，然后从开发者工具里读出
  `apptoken` 和 `userid`。应用自己的登录窗口收的就是这一对。

命令行**故意**没有 `login`。登录意味着浏览器、密码，有时还有一次性验证码，
而命令行是给 cron 和容器跑的——那里没有人来回答这些。

[issue-40]: https://github.com/lingcang728/ZeppBridge/issues/40

## 窗口一片空白，或者根本起不来

**白屏，或切换主题、语言后卡死。** WebKitGTK 的渲染受显卡驱动、显示服务器和合成器影响。ZeppBridge 会自动选一条兼容的路径（比如在 NVIDIA 和旧版 Wayland 库上关掉 WebKit 的 DMABUF 渲染），你也可以手动覆盖。先关掉应用，再试：

```bash
# 启动白屏时的兼容路径。
WEBKIT_DISABLE_DMABUF_RENDERER=1 zeppbridge
# 用 WebKit 默认路径，覆盖自动选择。
WEBKIT_DISABLE_DMABUF_RENDERER=0 zeppbridge
# 最后的办法：关掉加速合成（高分屏上会更慢）。
WEBKIT_DISABLE_COMPOSITING_MODE=1 zeppbridge
# 装了 XWayland 的话，走 X11。
GDK_BACKEND=x11 ./ZeppBridge-<版本>-Linux-x64.AppImage
```

Flatpak 用 `--env` 传：

```bash
flatpak run --env=WEBKIT_DISABLE_DMABUF_RENDERER=0 com.zeppbridge.app
```

反馈问题时请从终端启动，附上以 `Linux rendering:` 开头的那行启动日志、WebKit 的崩溃输出、安装包类型、发行版、显卡和驱动、Wayland 还是 X11，以及哪个设置有效：

```bash
printf 'Session: %s\n' "$XDG_SESSION_TYPE"
pkg-config --modversion webkit2gtk-4.1 wayland-client
lspci -nnk | grep -E -A3 'VGA|3D|Display'
env | grep -E '^(WEBKIT_|GDK_BACKEND=|APPIMAGE=)'
```

自动选择的规则见 [Linux 打包说明](../development/linux-packaging.md#rendering-policy)。

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

## 界面卡顿

WebKitGTK 扛不住整页毛玻璃和形变动画。Linux 上 **设置 → 显示与语言 → 界面特效** 选 **自动** 就等于 **低特效**（关掉毛玻璃和形变动画）。如果你改成了 **完整**，改回来。

## 更新

Linux 通过原安装渠道更新。`zeppbridge-git` 可再次运行 `paru -S zeppbridge-git`，从最新的
上游 `main` 重新构建。`.deb`、`.rpm` 和 Flatpak 用户可在
[Releases](https://github.com/lingcang728/ZeppBridge/releases) 下载新包并重复上面的安装命令，
AppImage 用户下载并替换文件即可。

## 沙箱权限（Flatpak）

| 权限 | 为什么 |
|---|---|
| `--share=network` | 从 Zepp 云同步、官方开放平台授权中转（`zeppbridge.com`）、回信和主动错误报告。 |
| `--socket=wayland`、`--socket=fallback-x11`、`--device=dri`、`--share=ipc` | 画一个窗口。 |
| `--talk-name=org.freedesktop.secrets` | 把 App Token 存进密钥环。没有它，登录能走完但令牌存不下去。 |
| `--talk-name=org.kde.StatusNotifierWatcher` | 托盘图标。GNOME 上还要装 AppIndicator 扩展才看得见，KDE 原生支持。 |

刻意没给的：`--filesystem=home`（导出和备份走 XDG 文件选择器 portal，你点哪个目录才在那一刻给哪个目录）和 `--socket=session-bus`（上面两条 `--talk-name` 已经够了，整条总线等于沙箱开了个洞）。

## 从源码构建

见 [Linux 打包说明](../development/linux-packaging.md)（英文）。
