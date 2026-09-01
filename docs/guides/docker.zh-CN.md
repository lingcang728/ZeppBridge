# Docker

两个镜像，两件不同的事：

- **`packaging/docker/Dockerfile`** —— 无头运行时：`zeppbridge-cli` 和 `zeppbridge-mcp`。这是你放在 NAS 或家庭服务器上、让数据库保持同步的那个。
- **`packaging/docker/Dockerfile.build`** —— 版本钉死的 Linux 工具链。它自己不构建任何东西，作用是让 `deb`/`rpm`/`AppImage` 在 CI 之外也能构建出同样的结果。

[English version](docker.md)

## 运行时镜像不是什么

它不包含桌面应用。GUI 需要 WebView、需要显示、需要一个登录窗口，这些都不该放进容器。于是这个镜像没法登录，也就带来了它去不掉的那个前提：

**先用桌面应用连接一次账号，再把凭据交给容器。** 绕不过去——登录需要一个真实会话上的浏览器窗口。见[连接指南](connection.zh-CN.md)。

## 怎么把凭据送进去

有两样东西要进到容器里：`auth.json`（不敏感的元数据——用户 ID 和区域地址）和 App Token（秘密）。

```bash
mkdir -p ./data
# 从 Linux 桌面安装里拿；其他平台的路径见 Linux 那篇。
cp ~/.local/share/zeppbridge/data/auth.json ./data/
```

令牌在你桌面机器的凭据存储里，从那里取出来（设置页只显示打码后的样子，值在存储里）。然后二选一：

### 环境变量（推荐）

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/data" \
  -e ZEPPBRIDGE_CREDENTIAL_STORE=env \
  -e ZEPPBRIDGE_APP_TOKEN \
  -e TZ="$(cat /etc/timezone)" \
  zeppbridge:local \
  zeppbridge-cli sync --mode incremental --json
```

只读：不落盘，进程也改不了它。注意 `-e ZEPPBRIDGE_APP_TOKEN` 后面没有值——那是把 shell 里的变量透传进去，而不是把令牌写在命令里；写在命令里它会进你的 shell 历史。

能连上 Docker daemon 的人都能用 `docker inspect` 读到容器的环境变量。如果这一点在你那台机器上要紧，请改用 Docker/Swarm 的 secret 并在自己的包装脚本里读文件，或者用下面的文件存储。

### 文件

```bash
docker run --rm ... -e ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge:local ...
```

令牌写到 `/data/credentials.json`，权限 0600，所在目录收紧到 0700。这是相对密钥环的明摆着的降级：保护它的只有文件权限，而且它和你的备份在同一个卷里。它存在的理由是：在一台无头机器上，替代品不是「更安全的存储」，而是「根本用不了」。

`credentials.json` 一旦在那里，后面的运行会自己认出文件存储——不必每次都带上那个变量。只在写入令牌的那一次设置它。

## 构建与运行

```bash
docker build -f packaging/docker/Dockerfile -t zeppbridge:local .
```

大约 95 MB。里面是两个 binary、`ca-certificates`（同步走 HTTPS）、`libdbus-1-3`（Secret Service 后端被链接进来了，即便容器里从不用它）和 `tzdata`。

```bash
# 库里现在有什么。这也是默认命令。
docker run --rm -v "$PWD/data:/data" --user "$(id -u):$(id -g)" \
  zeppbridge:local

# 导出一个月。--json 时 stdout 只有载荷，所以重定向是干净的。
docker run --rm -v "$PWD/data:/data" --user "$(id -u):$(id -g)" \
  zeppbridge:local \
  zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv \
    --out /data/exports/january.csv
```

### 关于 `--user`

镜像以 uid 1000 运行，那是大多数 Linux 桌面用户拿到的第一个 uid，所以绑定挂载通常直接就能用。不能用的时候，容器会告诉你它是哪个 uid、以及 `--user` 就是解法，而不是丢一个指向数据库的权限错误。用具名卷则完全不会遇到这个问题。

### 时区

请设 `TZ`。数据库存的是**本地**日期，所以一个留在 UTC 的容器会把 00:30 的读数记到前一天，而这个错在你拿图表和手机对照之前是看不见的。

## 定时执行

CLI 同步完就退出——它不是守护进程。请从宿主机来调度，而不是在容器里跑 cron：容器里多一个 init 系统，就多一个自己的日志去处，还会出现一个「看起来健康但什么都没做」的容器。

一个以你自己用户身份运行的 systemd timer：

```ini
# ~/.config/systemd/user/zeppbridge-sync.service
[Unit]
Description=ZeppBridge incremental sync
After=network-online.target

[Service]
Type=oneshot
Environment=ZEPPBRIDGE_APP_TOKEN=
EnvironmentFile=%h/.config/zeppbridge/token.env
ExecStart=/usr/bin/docker run --rm \
  --user %U:%U \
  -v %h/zeppbridge/data:/data \
  -e ZEPPBRIDGE_CREDENTIAL_STORE=env \
  -e ZEPPBRIDGE_APP_TOKEN \
  -e TZ=Asia/Shanghai \
  zeppbridge:local \
  zeppbridge-cli sync --mode incremental --json
# 4 的意思是「桌面应用正在写库」——稍后重试，不是失败。
SuccessExitStatus=4
```

```ini
# ~/.config/systemd/user/zeppbridge-sync.timer
[Unit]
Description=Sync ZeppBridge daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=30m

[Install]
WantedBy=timers.target
```

```bash
chmod 600 ~/.config/zeppbridge/token.env
systemctl --user enable --now zeppbridge-sync.timer
```

`SuccessExitStatus=4` 是值得照抄的那一行。退出码 4 表示另一个进程占着写锁；把它当成失败，就会在桌面应用恰好开着的每一次都得到一个红色的 timer。[完整的退出码表](../reference/cli-and-mcp.zh-CN.md)是一份约定——已有的码的含义永远不变。

要用 `cron` 的话同一条命令也可以；记得 cron 的环境几乎是空的，所以要传 `TZ`，并且用绝对路径。

## docker compose

`packaging/docker/docker-compose.yml` 里有 `sync`、`status`、`mcp` 三个服务。每一个都在 profile 后面，`docker compose up` 不会启动任何东西——因为它们都不是守护进程：

```bash
export ZEPPBRIDGE_APP_TOKEN=...
docker compose -f packaging/docker/docker-compose.yml run --rm sync
```

如果你的 uid 不是 1000，在它旁边的 `.env` 里设 `ZEPPBRIDGE_UID`/`ZEPPBRIDGE_GID`。

## MCP

`zeppbridge-mcp` 走 stdio，不监听任何端口，所以它不是一个你让它一直跑着的服务——MCP 客户端会把它拉起来，通过管道对话。把客户端指向一条 `docker run`：

```json
{
  "mcpServers": {
    "zeppbridge": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--network", "none",
        "--user", "1000:1000",
        "-v", "/home/you/zeppbridge/data:/data",
        "zeppbridge:local",
        "zeppbridge-mcp"
      ]
    }
  }
}
```

`-i` 是必须的：没有 stdin，服务端读不到任何东西，客户端会立刻看到 EOF。`--network none` 是安全的、也值得加上——MCP 服务只读、从不联网，加上它就把这件事变成了结构上的事实，而不是一句承诺。

## 工具链镜像

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build:local .
docker run --rm -v "$PWD:/src" -w /src zeppbridge-build:local \
  bash -c 'npm ci && npm run tauri build -- --bundles deb,rpm,appimage'
```

刻意用 Debian bookworm 而不是滚动版本：二进制链接的 glibc 就是它能运行的最低 glibc，在最新的发行版上构建，产出的包会在人们实际在用的 LTS 上拒绝启动。Node 和 Rust 的版本作为构建参数钉死——要升就明确地升。

## 隐私

运行时镜像需要网络只为了一件事：`zeppbridge-cli sync` 和 Zepp 云对话。其余一切都能在 `--network none` 下工作，而 MCP 服务应当一直这么运行。没有遥测，除了你自己 Zepp 账号的 API 之外不向任何地方发送任何东西。
