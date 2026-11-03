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
| Real-desktop usage (Arch x86_64, AMD, Wayland, WebKitGTK 2.54.1): rendering fixes, UI, sign-in, sync and data display | Confirmed on the machine that reported the white screens — they and the animation aborts are gone |

That row was filled in on a real desktop. The person who reported the white
screens installed a locally built package and confirmed the interface, sign-in,
sync and data display all work, with the blank windows and animation aborts
gone. If you hit a problem on your machine, an issue saying what happened is the
most useful thing you can send.

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
`release/ZeppBridge-<version>-Linux-x64.flatpak`.

### deb / rpm / AppImage

Download from [Releases](https://github.com/lingcang728/ZeppBridge/releases):

```bash
sudo apt install ./ZeppBridge-<version>-Linux-x64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge-<version>-Linux-x64.rpm     # Fedora, RHEL
chmod +x ZeppBridge-<version>-Linux-x64.AppImage && ./ZeppBridge-<version>-Linux-x64.AppImage
```

These builds are not signed. There is no code-signing story on Linux equivalent
to the Windows/macOS one, so verify the download against `SHA256SUMS.txt` on the
release page instead.

The AppImage needs FUSE. On systems that only ship FUSE 3, either install
`libfuse2` or run it with `--appimage-extract-and-run`.

### Arch Linux / AUR recipe

`packaging/arch/PKGBUILD` builds a native x86_64 `zeppbridge-git` package with
the desktop app, `zeppbridge-cli` and `zeppbridge-mcp`. It uses system libraries
and does not pass through AppImage packaging. The recipe and `.SRCINFO` are
provided for AUR submission; they have **not** been published to AUR.

To package the current working tree, including uncommitted fixes, run from the
repository root with the Arch build dependencies installed:

```bash
nvm use
./packaging/arch/build-local.sh
# Extra arguments are forwarded to makepkg unchanged:
#   --syncdeps  let makepkg install missing build dependencies
#   --install   install the finished package with pacman after a successful build
./packaging/arch/build-local.sh --install
```

The helper builds by default and installs nothing, but forwards extra arguments
to `makepkg` unchanged: `--syncdeps` installs missing build dependencies,
`--install` installs the finished package after a successful build. It snapshots
tracked and nonignored source files into a local-only Git repository under
`${XDG_CACHE_HOME:-$HOME/.cache}/zeppbridge/arch`, isolates makepkg and Cargo
build output, and writes packages to the ignored `release-arch/` directory.
That directory can hold several packages from earlier builds, so install an
exact file name rather than a wildcard.

To build the committed upstream `main` branch instead:

```bash
cd packaging/arch
makepkg -si
```

Unlike the local helper, this fetches remote source and does not include your
uncommitted changes; `-i` installs the resulting package. Only x86_64 is targeted.

The native package build completed on Arch x86_64, including desktop-entry
validation and a CLI version check, and the package was installed on the test
machine (`pacman -U`) — the person who reported the white screens confirmed they
were gone with this build. That snapshot predates the upstream 3.1.0 merge, so
A clean-chroot build remains unverified;
there is no Arch CI job.

## Where things go

| | Path |
|---|---|
| Flatpak | `~/.var/app/com.zeppbridge.app/data/zeppbridge/data/` |
| deb / rpm / Arch package | `~/.local/share/zeppbridge/data/` |
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
window manager with no keyring daemon — the default store cannot save tokens.
If credential storage fails after official authorization, Advanced data's
embedded web login or manual App Token submission, the desktop app offers two
recovery options:

- Repair the system credential store and retry saving. Open your password or
  wallet manager, create a default keyring or wallet if needed, and unlock it.
  On desktops such as Niri, ensure a Secret Service provider such as GNOME
  Keyring or KWallet is running.
- Explicitly consent to saving official access and refresh tokens, or the
  Advanced data App Token, as plain text in `credentials.json` in the app data
  directory. The file uses permission `0600`
  on Unix, but programs running as your user can read it. This option is blocked
  when it conflicts with an explicit credential-store or token environment
  setting.

Pending credentials remain only in backend memory for at most 10 minutes while
you choose or retry, so storage failures do not require another login or token
entry. Cancelling recovery, starting a new login, resubmitting manual
credentials, quitting or reaching the timeout clears them. After expiry, sign
in or enter the token again. Successful recovery makes the selected store
available immediately; an existing `credentials.json` preserves the file-store
choice after restart unless the environment explicitly overrides it. Saving a
manually entered App Token does not verify it: the existing verification step
still applies before using Advanced data.

For CLI or headless use, the alternatives remain:

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

**A white, empty window, or a freeze after changing the theme or language.**
WebKitGTK's rendering paths depend on the graphics driver, display server and
compositor. Disabling DMABUF can fix startup white screens on some machines,
but can expose different bugs on others. DMABUF controls how graphics buffers
are shared and presented; disabling it does **not** disable all GPU acceleration.

ZeppBridge follows a targeted compatibility policy, inspired by
[Clash Verge Rev's Linux workarounds](https://github.com/clash-verge-rev/clash-verge-rev/blob/main/src-tauri/src/utils/linux/workarounds.rs):

- When `WEBKIT_DISABLE_DMABUF_RENDERER` is unset, set it to `1` if NVIDIA is
  detected, or if `XDG_SESSION_TYPE=wayland` and
  `pkg-config --modversion wayland-client` reports a numeric version at or below
  `1.23.0`. NVIDIA detection checks `/proc/driver/nvidia/version`,
  `/sys/module/nvidia`, `/sys/module/nvidia_drm` and DRM card vendor IDs
  (`0x10de`). Detection is best effort: missing version information does not
  activate the Wayland rule.
- Otherwise leave DMABUF to WebKit's default. There is no WebKit-version cutoff.
  An explicit value of `0` or `1` always takes precedence over both rules.
- AppImage still defaults `WEBKIT_DISABLE_COMPOSITING_MODE` to `1` when
  `APPIMAGE` is present, unless the user has set it explicitly. This is
  independent of the DMABUF policy and WebKit version.
- When either disabling variable is nonzero, theme and language changes skip
  native View Transition snapshot animations. The changes themselves still work.
  ZeppBridge does not force `GDK_BACKEND`.

On one Arch Linux / AMD / Wayland machine with WebKitGTK 2.54.1, forcing
DMABUF off reproduced a `graphicsLayerFactory()` abort during View Transitions;
the default DMABUF path completed the same interactions. This supports the
animation guard and keeping rendering overrides available, but does not prove
compatibility across all drivers and distributions.
The person who reported these failures installed a locally built package with
this policy and confirmed the blank windows and animation aborts were gone.

Close the app before comparing these settings:

```bash
# Try the compatibility path for a startup white screen.
WEBKIT_DISABLE_DMABUF_RENDERER=1 zeppbridge

# Restore WebKit's default DMABUF path, overriding automatic detection.
WEBKIT_DISABLE_DMABUF_RENDERER=0 zeppbridge

# The same override works in development (run from the repository root).
WEBKIT_DISABLE_DMABUF_RENDERER=0 npm run tauri dev

# AppImage has an independent compositing override. Explicitly clear both
# disabling flags when testing its hardware rendering path.
WEBKIT_DISABLE_DMABUF_RENDERER=0 WEBKIT_DISABLE_COMPOSITING_MODE=0 ./ZeppBridge_<version>_x86_64.AppImage
```

**The AppImage specifically still will not open.** [Issue #32][issue-32]
records a Flatpak startup fixed by disabling DMABUF in 2.1.0, while the CI-built
AppImage still failed. Its bundled Wayland libraries were another compatibility
problem: the AppImage shipped `libwayland-client.so.0`,
`libwayland-cursor.so.0`, `libwayland-egl.so.1` and `libwayland-server.so.0`,
which the packaging now removes so the host copies are used. The AppImage
compositing default above remains an additional compatibility measure.

If those settings do not help, try X11 through XWayland if it is installed:

```bash
# Force X11 through XWayland. Not the app's default: on a pure Wayland system
# with no XWayland installed this trades one failure for another, so it is
# yours to decide, not ours.
GDK_BACKEND=x11 ./ZeppBridge-<version>-Linux-x64.AppImage
# Another explicit fallback, also available for deb/rpm/Flatpak launches.
WEBKIT_DISABLE_COMPOSITING_MODE=1 zeppbridge
```

For Flatpak, pass overrides with `flatpak run --env=NAME=value
com.zeppbridge.app`, for example:

```bash
flatpak run --env=WEBKIT_DISABLE_DMABUF_RENDERER=0 com.zeppbridge.app
```

When reporting a failure, launch from a terminal and include the startup
`Linux rendering:` diagnostic and any WebKit assertion or crash output. Include
the package type, distribution, GPU and driver, whether the session is Wayland
or X11, and which overrides worked. These commands help collect context:

```bash
printf 'Session: %s\n' "$XDG_SESSION_TYPE"
pkg-config --modversion webkit2gtk-4.1 wayland-client
lspci -nnk | rg -A3 'VGA|3D|Display'
env | rg '^(WEBKIT_|GDK_BACKEND=|APPIMAGE=)'
```

The `pkg-config` command may be unavailable or lack metadata; report that too.
Its Wayland version is a detection hint, not proof of the library used at runtime.
For background, see [WebKit's graphics architecture](https://docs.webkit.org/Ports/WebKitGTK%20and%20WPE%20WebKit/Graphics.html).

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

### AppImage packaging on rolling distributions

On the tested Arch Linux environment, the command above compiled the executable
and produced the deb and rpm, then failed while packaging the AppImage. This was
re-confirmed in November 2026 against the source merged with upstream 3.1.0:
compiling and the deb/rpm bundles succeeded, the AppImage still stopped at
linuxdeploy. To retry only packaging the existing executable with detailed output:

```bash
npm run tauri -- bundle --config src-tauri/tauri.linux.conf.json --bundles appimage --verbose
```

Two separate incompatibilities were reproduced:

- The bundler's older `strip` rejected `.relr.dyn` with an unknown section type
  `0x13`. Prefixing the packaging command with `NO_STRIP=true` skips that step.
- After skipping stripping, the GTK packaging plugin failed to copy
  `/usr/lib/gdk-pixbuf-2.0/2.10.0`. The installed `gdk-pixbuf2` 2.44.8 uses
  Glycin and has no external loader directory at that path.

`NO_STRIP=true` only bypasses the first failure; it does not fix the GTK plugin's
loader-directory assumption. These are packaging failures, so for native testing
run `src-tauri/target/release/zeppbridge` directly. To omit AppImage packaging,
build with `--bundles deb,rpm`; those packages are not installable with Arch's
`pacman`. The deb/rpm-only packaging command completed successfully in this
Arch environment.

For a distributable AppImage, use the existing Debian Bookworm toolchain
container and compile and package in that same environment. Keep its dependencies
and Cargo output separate from the host's `node_modules` and target directory:

```bash
docker build -f packaging/docker/Dockerfile.build -t zeppbridge-build .
docker run --rm -v "$PWD:/src" \
  -v zeppbridge-bookworm-node-modules:/src/node_modules \
  -v zeppbridge-bookworm-target:/build-target \
  -e CARGO_TARGET_DIR=/build-target -w /src zeppbridge-build \
  bash -c 'npm ci && npm run tauri build -- \
    --config src-tauri/tauri.linux.conf.json --bundles deb,rpm,appimage'
```

Container packages are written to `/build-target/release/bundle` in the
`zeppbridge-bookworm-target` named volume, rather than the host's
`src-tauri/target` directory.

The container workflow was not revalidated during this Arch diagnosis because
neither Docker nor Podman was installed on the test machine.

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
