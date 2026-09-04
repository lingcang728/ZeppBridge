# Linux

ZeppBridge on Linux ships as a Flatpak, a `.deb`, an `.rpm` and an AppImage.
There is also a [headless container image](docker.md) for the CLI and the MCP
server, which is a different thing and documented separately.

[简体中文](linux.zh-CN.md)

## What is verified, and what is not

Read this before deciding whether to rely on it.

| | Status |
|---|---|
| Compiles, clippy-clean, Rust tests pass on Linux | Covered by CI on every push |
| Flatpak bundle builds and its metadata validates | Covered by CI on every push |
| The headless image builds, runs, and resolves its data directory | Covered by CI on every push |
| Sign-in, sync, keyring behaviour on a real Linux desktop | **Not verified by anyone yet** |

The last row is the one that matters. Nobody has run a full sign-in-and-sync
cycle on a Linux desktop. The Linux-specific code — the Secret Service
credential backend and the XDG data directory — is exercised by unit tests and
by a container, not by a person with a watch. If you try it, an issue saying
what happened is the most useful thing you can send.

This is the same posture the README takes for macOS, and for the same reason:
saying "supported" when nobody has checked is how people lose data.

## Install

### Flatpak

No release bundle is published yet, so build it from the repository:

```bash
git clone https://github.com/lingcang728/ZeppBridge.git
cd ZeppBridge
./packaging/flatpak/build-flatpak.sh
flatpak run com.zeppbridge.app
```

The script needs `flatpak`, `flatpak-builder` and `elfutils` on the host and
nothing else —
Rust and Node come from Flatpak SDK extensions, so no toolchain is installed
system-wide. Everything is `--user`; it never asks for root.

`--bundle` also writes a single installable file to
`release/ZeppBridge_<version>_x86_64.flatpak`.

### deb / rpm / AppImage

Download from [Releases](https://github.com/lingcang728/ZeppBridge/releases):

```bash
sudo apt install ./ZeppBridge_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<version>_x86_64.rpm     # Fedora, RHEL
chmod +x ZeppBridge_<version>_x86_64.AppImage && ./ZeppBridge_<version>_x86_64.AppImage
```

These builds are not signed. There is no code-signing story on Linux equivalent
to the Windows/macOS one, so verify the download against `SHA256SUMS.txt` on the
release page instead.

The AppImage needs FUSE. On systems that only ship FUSE 3, either install
`libfuse2` or run it with `--appimage-extract-and-run`.

## Where things go

| | Path |
|---|---|
| Flatpak | `~/.var/app/com.zeppbridge.app/data/zeppbridge/data/` |
| deb / rpm | `~/.local/share/zeppbridge/data/` |
| AppImage, unpacked tarball | `data/` next to the executable |
| Anywhere, when set | `$ZEPPBRIDGE_DATA_DIR` |
| Built from source | the repository `data/` folder, **not** next to the binary |

The split is deliberate. A package manager owns `/usr/bin` and a Flatpak's
`/app/bin` is read-only, so for those two the data cannot live next to the
program and goes to the XDG data directory. An AppImage sits in a folder that
really is yours, so it keeps the same install-local layout Windows uses. Setting
`ZEPPBRIDGE_DATA_DIR` to an absolute path overrides all of it; a relative path
is rejected rather than resolved against whatever the working directory happened
to be.

If you built from source and are running `src-tauri/target/release/zeppbridge-cli`,
the data directory is **not** the folder the binary sits in. ZeppBridge treats any
`target/debug`, `target/release` or cargo target cache as a build directory and uses
the repository `data/` folder instead, so that `cargo run` never drops a multi-gigabyte
library into a build cache you are about to delete. Put `zepp.db` and `auth.json` in
`<repo>/data/`, or point `ZEPPBRIDGE_DATA_DIR` wherever you want them. Every
"no local database" and "no account connected" message prints the directory it actually
looked in, so you never have to guess which rule applied.

`zeppbridge-cli` and `zeppbridge-mcp` resolve the same directory by the same
rules, so they read the database the app writes without being configured.

## Where the token is stored

The App Token goes into the **Secret Service** — GNOME Keyring or KWallet, over
D-Bus. `auth.json` next to the database keeps only non-secret metadata (user ID,
region host). This matches Windows Credential Manager and the macOS Keychain.

On a machine with no Secret Service — a headless server, a container, a minimal
window manager with no keyring daemon — there is nothing to write to, and
sign-in fails with a message naming the two alternatives:

```bash
# Store the token in the data directory instead, 0600, in credentials.json.
# An explicit downgrade: file permissions are the only thing protecting it.
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# Or hand the token in from the environment. Read-only: nothing is written to
# disk, and the process cannot change it.
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

`ZEPPBRIDGE_CREDENTIAL_STORE` takes `secret-service` (the default), `file` or
`env`. A value it does not recognise is an error, not a fallback to the default
— a typo should not quietly move where your token is kept.

When unset, the choice is inferred from what is already true on the machine: a
token in `ZEPPBRIDGE_APP_TOKEN` wins, then an existing `credentials.json` in the
data directory, then Secret Service. That last-but-one rule is what stops a
container from reporting "not connected" on its second run because the
environment variable was only set the first time.

## Moving an existing library from Windows or macOS

Copy the database. Sign in again. Those are two separate steps, and the second
one is not optional — see [issue #40][issue-40].

**The database travels.** Copy `zepp.db` (and `auth.json` next to it) into
whichever directory the table above says your packaging uses, with the app
closed on both ends. Nothing in the file is machine-specific.

**The token does not travel, and that is deliberate.** It never sat in the
folder you copied. On Windows it is in Credential Manager, on macOS in the
Keychain — both are bound to that machine and neither exports into a file.
`auth.json` holds only the user ID and region host. So a copied folder arrives
with the metadata and no secret, and the app says the credential store has no
token for this account. It is not a corrupt copy; there was never anything to
copy.

Pick whichever of these fits the machine you moved to:

```bash
# A Linux desktop with a keyring. Just sign in again in the app — the copied
# database is not touched, and the sync picks up where the old machine left off.

# A desktop with no keyring daemon, or a headless box you drive with the CLI.
# Paste the App Token once, and it is kept in the data directory at 0600.
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# A container, or anything where the token comes from a secret manager.
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

Two ways to get the App Token itself:

- In the desktop app on any platform: **Settings → sign in manually** and read
  the value back, or paste one in.
- From a browser: sign in at `https://watchface.zepp.com/`, then read `apptoken`
  and `userid` out of the developer tools. This is the same pair the app's own
  sign-in window collects.

The command line deliberately has no `login` command. Signing in means a
browser, a password and sometimes a one-time code — the CLI is meant to be run
by cron and by containers, where nobody is there to answer any of that.

[issue-40]: https://github.com/lingcang728/ZeppBridge/issues/40

## If the window is blank, or the app will not start

Two known Linux failures, both with fixes already applied in the app.

**A white, empty window.** WebKitGTK 2.42 enables a DMABUF renderer by default,
and on a number of driver and compositor combinations it fails without printing
anything — the window opens and stays blank. ZeppBridge now disables it on Linux
by default. If you want the faster path back on a machine where it works:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=0 zeppbridge
```

**The AppImage specifically still will not open.** Disabling DMABUF fixed the
Flatpak — [issue #32][issue-32] has a confirmation on 2.1.0 — but not the
AppImage, and the same thread has the clue that explains why: the same source
built on the reporter's own machine produced an AppImage that ran, and the
reporter guessed it was "something weird with the Wayland display libraries".

That turned out to be exactly right. The AppImage is built on `ubuntu-latest`,
and dumping its bundled `usr/lib` shows it shipped its own
`libwayland-client.so.0`, `libwayland-cursor.so.0`, `libwayland-egl.so.1` and
`libwayland-server.so.0`. `libwayland-client` has to agree with the compositor
actually running on your machine, which is why AppImage's own excludelist marks
it as must-come-from-the-host — and why an AppImage built on your own machine
worked while the CI one did not. (The GL/DRM stack — `libEGL`, `libGL`, `libgbm`,
`libdrm` — turned out not to be bundled at all, so it was never part of this.)

Two changes since 2.1.0. The build now drops those four Wayland libraries so the
host's own copies are used, and the app disables accelerated compositing when it
detects it is running from an AppImage (gated on the `APPIMAGE` variable the
AppImage runtime sets, so the deb, rpm and Flatpak builds — all confirmed
working — do not pay for it).

Neither of those can be verified from a Windows development machine. If it still
will not start, these are the escape hatches, in the order worth trying:

```bash
# Force X11 through XWayland. Not the app's default: on a pure Wayland system
# with no XWayland installed this trades one failure for another, so it is
# yours to decide, not ours.
GDK_BACKEND=x11 ./ZeppBridge_<version>_x86_64.AppImage

# Turn compositing off explicitly (the AppImage build already does this; set it
# here if you are on a deb/rpm/Flatpak install that shows the same symptom).
WEBKIT_DISABLE_COMPOSITING_MODE=1 zeppbridge
```

If none of them work, the Flatpak is the channel a user has actually confirmed
working on 2.1.0, and a comment on that issue saying which distro and compositor
you are on is the most useful thing you can send.

[issue-32]: https://github.com/lingcang728/ZeppBridge/issues/32

**No tray icon, and a line about `libayatana-appindicator3` on stderr.** The tray
icon is drawn by the desktop, through that library. It is not part of the GNOME
Flatpak runtime and some desktops do not install it. ZeppBridge no longer dies
when it is missing — it runs without a tray icon, and closing the window quits
instead of hiding, because hiding into a tray that is not there would leave a
process you cannot get back to. To get the tray:

```bash
sudo apt install libayatana-appindicator3-1     # Debian / Ubuntu
sudo dnf install libayatana-appindicator3       # Fedora
sudo zypper install libayatana-appindicator3-1  # openSUSE
```

The `.deb` and `.rpm` packages declare this dependency, so it should already be
present there. The Flatpak now bundles it too — the manifest builds libdbusmenu,
libayatana-indicator and libayatana-appindicator into the sandbox, because a
Flatpak user has no way to install it themselves. On GNOME the tray also needs
the AppIndicator shell extension; KDE shows it natively.

## Updates

In-app update checking is switched off on Linux, and the Settings page says so
rather than showing a failed check. Updates come from wherever the build came
from:

```bash
flatpak update com.zeppbridge.app     # Flatpak
sudo apt install --only-upgrade ...   # deb, once a repository exists
```

AppImage users replace the file by hand. The reason there is no self-update: the
updater manifest has no Linux entry, and writing into `/app` or `/usr/bin` would
fight the package manager. A red "update failed" that means "there is nothing
here to check" is worse than no button.

## Sandbox permissions (Flatpak)

| Permission | Why |
|---|---|
| `--share=network` | Syncing from the Zepp cloud. The only reason this app needs the network. |
| `--socket=wayland`, `--socket=fallback-x11`, `--device=dri`, `--share=ipc` | Drawing a window. |
| `--talk-name=org.freedesktop.secrets` | Storing the App Token in the keyring. Without it sign-in completes but the token cannot be saved. |
| `--talk-name=org.kde.StatusNotifierWatcher` | The tray icon. On GNOME this also needs the AppIndicator shell extension; KDE supports it natively. |

Not granted, on purpose: `--filesystem=home` (exports and backups go through the
XDG file-chooser portal, so you grant one directory at the moment you pick it)
and `--socket=session-bus` (the two `--talk-name` rules above are enough; the
whole bus would be a hole in the sandbox).

## Building from source

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libxdo-dev patchelf \
  rpm xdg-utils
npm ci
npm run tauri build -- \
  --config src-tauri/tauri.linux.conf.json \
  --bundles deb,rpm,appimage
```

`--config src-tauri/tauri.linux.conf.json` turns off updater artifacts. The base
config enables them for Windows and macOS, and that switch is global — with it
on, the bundler looks for the release signing key and stops with *"A public key
has been found, but no private key"*. Linux builds deliberately produce no
updater artifacts, since in-app updating is off there.

Three of those are easy to miss, and none is on Tauri's own prerequisites list:

- `libdbus-1-dev` — the Secret Service credential backend links libdbus. At
  runtime this is `libdbus-1-3`, which the deb and rpm both declare.
- `rpm` — the rpm bundler shells out to `rpmbuild`.
- `xdg-utils` — the AppImage bundler copies `/usr/bin/xdg-open` into the image.
  Missing it fails *after* the deb and rpm have already been written, which
  makes it look like an AppImage-specific bug rather than a missing package.

To avoid installing any of that, use the pinned toolchain container instead —
same compiler, same webkit, same glibc as CI:

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build .
docker run --rm -v "$PWD:/src" -w /src zeppbridge-build \
  bash -c 'npm ci && npm run tauri build -- \
    --config src-tauri/tauri.linux.conf.json --bundles deb,rpm,appimage'
```

## Flathub

Not submitted. The manifest at `packaging/flatpak/com.zeppbridge.app.yml` builds
with network access, which Flathub does not allow. Getting there needs:

1. `cargo-sources.json` and `node-sources.json` generated with
   [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools), so
   every dependency is a declared source.
2. `--share=network` dropped from `build-args`.
3. At least one hosted screenshot in the AppStream metadata — the repository has
   none, and the `<screenshots>` element is deliberately absent rather than
   pointing at a URL that would 404.

Those two generated files would be large and would go stale on every dependency
bump, so they are not committed for a submission that has not been made.
