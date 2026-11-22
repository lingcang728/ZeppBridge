# Docker

两个镜像，两件不同的事：

- **`packaging/docker/Dockerfile`** —— 无头运行时：`zeppbridge-cli` 和 `zeppbridge-mcp`。这是你放在 NAS 或家庭服务器上、让数据库保持同步的那个。
- **`packaging/docker/Dockerfile.build`** —— 版本钉死的 Linux 工具链。它自己不构建任何东西，作用是让 `deb`/`rpm`/`AppImage` 在 CI 之外也能构建出同样的结果。

[English version](docker.md)

## 运行时镜像不是什么

它不包含桌面应用。GUI 需要 WebView、需要显示、需要一个登录窗口，这些都不该放进容器。于是这个镜像没法登录，也就带来了它去不掉的那个前提：

**先用桌面应用连接一次账号，再把凭据交给容器。** 绕不过去——登录需要一个真实会话上的浏览器窗口。见[连接指南](connection.zh-CN.md)。

## 怎么把凭据送进去

容器支持高级数据和官方同步。官方令牌没法从环境变量传进来：用下面的文件存储，把采用文件存储的桌面端的 `official.json` 和配套的 `credentials.json` 一并拷入。CLI 通过 `zeppbridge.com` 续期，新凭据写回挂载的数据目录。

高级数据同步要把两样东西送进容器：`auth.json`（不敏感的元数据——用户 ID 和区域地址）和 App Token（秘密）。

```bash
mkdir -p ./data
# 从 Linux 桌面安装里拿；其他平台的路径见 Linux 那篇。
cp ~/.local/share/zeppbridge/data/auth.json ./data/
```

桌面应用从不显示已保存的令牌。从浏览器取：在 `https://watchface.zepp.com/` 登录，从开发者工具里复制 `apptoken`（见 [Linux 指南](linux.zh-CN.md#把已有的库从-windows-或-macos-搬过来)）。然后二选一：

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

用 `/data/credentials.json`（权限 0600，目录 0700）。初始文件从采用文件存储的桌面端拷入。
该文件须保持私有，且服务用户可以写入。CLI 会将续期得到的官方凭据写回这里。这是相对密钥环的降级：保护它的只有文件权限，而且它和你的备份在同一个卷里。
渠道报告与按日期补拉官方睡眠的用法见 [CLI 同步](../reference/cli-and-mcp.zh-CN.md#同步与历史)。

`credentials.json` 在那里，运行时会自己认出文件存储，不必带那个变量。

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

`packaging/docker/docker-compose.yml` 里有 `sync`、`status`、`mcp`、`serve` 四个服务。每一个都在 profile 后面，光敲 `docker compose up` 不会启动任何东西；前三个都是跑一次就退出：

```bash
export ZEPPBRIDGE_APP_TOKEN=...
docker compose -f packaging/docker/docker-compose.yml run --rm sync
```

如果你的 uid 不是 1000，在它旁边的 `.env` 里设 `ZEPPBRIDGE_UID`/`ZEPPBRIDGE_GID`。compose 文件里的路径相对 `packaging/docker/`，所以它的 `./data` 是 `packaging/docker/data`，不是上面用的 `./data`。`sync` 使用 App Token，`serve` 使用独立的拉取令牌。

`serve` 是唯一常驻的服务：只读 REST API，给 SparkyFitness 这类工具来拉数据。它不发布端口、只在内部网络里；用 `docker compose --profile serve up -d` 启动前先看[自托管拉取](self-hosted-pull.zh-CN.md)。

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

`-i` 是必须的：没有 stdin，服务端读不到任何东西，客户端会立刻看到 EOF。此示例禁用了网络，适用于查询和本地操作。默认 MCP 也能写入本地记录，并提供需要网络的同步和训练发布工具。

## 工具链镜像

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build:local .
docker run --rm -v "$PWD:/src" -w /src zeppbridge-build:local \
  bash -c 'npm ci && npm run tauri build -- \
    --config src-tauri/tauri.linux.conf.json --bundles deb,rpm,appimage'
```

刻意用 Debian bookworm 而不是滚动版本：二进制链接的 glibc 就是它能运行的最低 glibc，在最新的发行版上构建，产出的包会在人们实际在用的 LTS 上拒绝启动。Node 和 Rust 的版本作为构建参数钉死——要升就明确地升。

## 隐私

运行时镜像只在和 Zepp 云同步时需要网络（用官方授权令牌时，刷新还会经过 `zeppbridge.com`）。其余都能在 `--network none` 下工作；不用 `sync_now` 和 `publish_training_plan` 的话，MCP 服务就这么跑。没有遥测。
