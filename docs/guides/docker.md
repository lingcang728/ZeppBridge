# Docker

Two images, for two different jobs:

- **`packaging/docker/Dockerfile`** — the headless runtime: `zeppbridge-cli` and
  `zeppbridge-mcp`. This is what you run on a NAS or a home server to keep the
  library synced.
- **`packaging/docker/Dockerfile.build`** — the pinned Linux toolchain. Builds
  nothing by itself; it makes `deb`/`rpm`/`AppImage` builds reproducible off CI.

[简体中文](docker.zh-CN.md)

## What the runtime image is not

It does not contain the desktop app. The GUI needs a WebView, a display and a
sign-in window; none of that belongs in a container. So the image cannot sign
in, and that produces the one prerequisite it cannot remove:

**Connect the account once with the desktop app, then hand the container the
credentials.** There is no way around this — signing in requires a browser
window on a real session. See the [connection guide](connection.md).

## Getting the credentials in

Two things have to reach the container: `auth.json` (non-secret metadata — user
ID and region host) and the App Token (secret).

```bash
mkdir -p ./data
# From a Linux desktop install; see the Linux guide for other platforms' paths.
cp ~/.local/share/zeppbridge/data/auth.json ./data/
```

The token is in your desktop machine's credential store, so copy it out of there
(Settings shows it masked; the store itself holds the value). Then pick one of
these:

### Environment (recommended)

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

Read-only: nothing is written to disk and the process cannot change it. Note
`-e ZEPPBRIDGE_APP_TOKEN` with no value — that passes the variable through from
your shell instead of putting the token in the command, which would otherwise
land in your shell history.

Anyone who can reach the Docker daemon can read a container's environment with
`docker inspect`. On a machine where that matters, use a Docker/Swarm secret and
read the file in your own wrapper, or use the file store below.

### File

```bash
docker run --rm ... -e ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge:local ...
```

Writes the token to `/data/credentials.json`, mode 0600, in a directory
tightened to 0700. This is an explicit downgrade from a keyring: file
permissions are the only thing protecting it, and it sits in the same volume as
your backups. It exists because on a headless machine the alternative is not a
safer store, it is nothing at all.

Once `credentials.json` is there, later runs pick the file store up on their own
— you do not have to keep passing the variable. Set it once, on the run that
writes the token.

## Build and run

```bash
docker build -f packaging/docker/Dockerfile -t zeppbridge:local .
```

About 95 MB. It contains the two binaries, `ca-certificates` (sync is HTTPS),
`libdbus-1-3` (the Secret Service backend is linked in even though a container
never uses it) and `tzdata`.

```bash
# What is in the library. This is also the default command.
docker run --rm -v "$PWD/data:/data" --user "$(id -u):$(id -g)" \
  zeppbridge:local

# Export a month. Note --json goes to stdout alone, so redirection is clean.
docker run --rm -v "$PWD/data:/data" --user "$(id -u):$(id -g)" \
  zeppbridge:local \
  zeppbridge-cli export --from 2026-01-01 --to 2026-01-31 --format csv \
    --out /data/exports/january.csv
```

### The `--user` flag

The image runs as uid 1000, which is the first uid most desktop Linux users get,
so a bind mount usually just works. When it does not, the container tells you
which uid it is and that `--user` is the fix, rather than failing with a
permission error pointing at the database. Named volumes avoid the question
entirely.

### Timezone

Set `TZ`. The database stores **local** days, so a container left on UTC files a
reading taken at 00:30 under the previous day, and the mistake is invisible
until you compare a chart against the phone.

## Scheduling

The CLI syncs and exits — it is not a daemon. Schedule it from the host rather
than running cron inside the container: a second init system in there means its
own log destination and a container that looks healthy while doing nothing.

A systemd timer, running as your own user:

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
  -e TZ=Europe/Athens \
  zeppbridge:local \
  zeppbridge-cli sync --mode incremental --json
# 4 means "the desktop app is syncing right now" — retry later, not a failure.
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

`SuccessExitStatus=4` is the part worth copying. Exit code 4 means another
process holds the write lock; treating it as a failure gives you a red timer
every time the desktop app happens to be open. The
[full exit-code table](../reference/cli-and-mcp.md#exit-codes) is a contract —
existing codes never change meaning.

For `cron` instead, the same command works; remember cron's environment is
nearly empty, so pass `TZ` and use absolute paths.

## docker compose

`packaging/docker/docker-compose.yml` has `sync`, `status` and `mcp` services.
Every one is behind a profile and nothing starts on `docker compose up`, because
none of them is a daemon:

```bash
export ZEPPBRIDGE_APP_TOKEN=...
docker compose -f packaging/docker/docker-compose.yml run --rm sync
```

Set `ZEPPBRIDGE_UID`/`ZEPPBRIDGE_GID` in a `.env` file next to it if your uid is
not 1000.

## MCP

`zeppbridge-mcp` speaks stdio and listens on no port, so it is not a service you
leave running — the MCP client spawns it and talks over the pipe. Point the
client at a `docker run`:

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

`-i` is required: without stdin the server has nothing to read and the client
sees an immediate EOF. `--network none` is safe and worth setting — the MCP
server is read-only and never touches the network, so this makes that
structural rather than a promise.

## The toolchain image

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build:local .
docker run --rm -v "$PWD:/src" -w /src zeppbridge-build:local \
  bash -c 'npm ci && npm run tauri build -- --bundles deb,rpm,appimage'
```

Debian bookworm on purpose, not a rolling base: the glibc a binary links against
is the oldest glibc it will run on, so building on the newest distribution
produces packages that refuse to start on the LTS releases people actually run.
Node and Rust versions are pinned as build args — bump them deliberately.

## Privacy

The runtime image needs the network for exactly one thing: `zeppbridge-cli sync`
talking to the Zepp cloud. Everything else works with `--network none`, and the
MCP server should always be run that way. No telemetry, and nothing is sent
anywhere except your own Zepp account's API.
