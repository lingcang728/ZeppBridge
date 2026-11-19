# Linux

ZeppBridge on Linux ships as a Flatpak, a `.deb`, an `.rpm` and an AppImage.
Arch Linux users can install `zeppbridge-git` from the AUR. The CLI and MCP
server are also available as a [headless container image](docker.md).

[简体中文](linux.zh-CN.md)

## Install

### Flatpak

Download `ZeppBridge-<version>-Linux-x64.flatpak` from
[Releases](https://github.com/lingcang728/ZeppBridge/releases) and install it
for your user:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user ./ZeppBridge-<version>-Linux-x64.flatpak
flatpak run com.zeppbridge.app
```

To build it yourself, see the [Linux packaging notes](../development/linux-packaging.md).

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

### Arch Linux

Install [`zeppbridge-git` from the AUR](https://aur.archlinux.org/packages/zeppbridge-git)
on Arch Linux x86_64. It builds the desktop app, `zeppbridge-cli` and
`zeppbridge-mcp` from upstream `main` using system libraries.

```bash
paru -S zeppbridge-git
# With yay: yay -S zeppbridge-git
```

To install directly from the AUR Git repository with `makepkg`, including when
an AUR helper cannot find the package:

```bash
sudo pacman -S --needed base-devel git
git clone https://aur.archlinux.org/zeppbridge-git.git
cd zeppbridge-git
makepkg -si
```

For working-tree builds, see the [Linux packaging notes](../development/linux-packaging.md#arch-linux).

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
# Use the credentials.json the desktop app wrote (after you agreed to file
# storage) or one you copied in. The CLI never asks for a token itself.
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

# A desktop with no keyring daemon: sign in in the app and agree to keep the
# token in credentials.json (0600). A headless box: copy that credentials.json
# from a machine where you did this, then:
ZEPPBRIDGE_CREDENTIAL_STORE=file zeppbridge-cli sync

# A container, or anything where the token comes from a secret manager.
ZEPPBRIDGE_CREDENTIAL_STORE=env ZEPPBRIDGE_APP_TOKEN=... zeppbridge-cli sync
```

Two ways to get the App Token itself:

- The desktop app never shows a saved token, so it cannot be read back there.
- From a browser: sign in at `https://watchface.zepp.com/`, then read `apptoken`
  and `userid` out of the developer tools. This is the same pair the app's own
  sign-in window collects.

The command line deliberately has no `login` command. Signing in means a
browser, a password and sometimes a one-time code — the CLI is meant to be run
by cron and by containers, where nobody is there to answer any of that.

[issue-40]: https://github.com/lingcang728/ZeppBridge/issues/40

## If the window is blank, or the app will not start

**A white, empty window, or a freeze after changing the theme or language.**
WebKitGTK's rendering depends on the graphics driver, display server and
compositor. ZeppBridge picks a compatible path automatically (for example, it
turns WebKit's DMABUF renderer off on NVIDIA and on old Wayland libraries); you
can override that. Close the app, then try:

```bash
# The compatibility path for a startup white screen.
WEBKIT_DISABLE_DMABUF_RENDERER=1 zeppbridge
# WebKit's default path, overriding the automatic choice.
WEBKIT_DISABLE_DMABUF_RENDERER=0 zeppbridge
# Turn accelerated compositing off as a last resort (slower on high-DPI screens).
WEBKIT_DISABLE_COMPOSITING_MODE=1 zeppbridge
# X11 through XWayland, if XWayland is installed.
GDK_BACKEND=x11 ./ZeppBridge-<version>-Linux-x64.AppImage
```

For Flatpak, pass them with `--env`:

```bash
flatpak run --env=WEBKIT_DISABLE_DMABUF_RENDERER=0 com.zeppbridge.app
```

When reporting a failure, launch from a terminal and include the startup line
that begins with `Linux rendering:`, any WebKit crash output, the package type,
distribution, GPU and driver, Wayland or X11, and which overrides helped:

```bash
printf 'Session: %s\n' "$XDG_SESSION_TYPE"
pkg-config --modversion webkit2gtk-4.1 wayland-client
lspci -nnk | grep -E -A3 'VGA|3D|Display'
env | grep -E '^(WEBKIT_|GDK_BACKEND=|APPIMAGE=)'
```

How the automatic choice works is described in the
[Linux packaging notes](../development/linux-packaging.md#rendering-policy).

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

## If the interface feels slow

WebKitGTK struggles with full-page frosted glass and morphing animations. On
Linux, **Settings → Display and language → Visual effects** set to **Auto**
already means **Low** (no frosted glass, no morphing). If you switched it to
**Full**, switch it back.

## Updates

Linux updates use the original installation method. For `zeppbridge-git`, run
`paru -S zeppbridge-git` again to build from the latest upstream `main`. For
`.deb`, `.rpm` and Flatpak bundles, download the new file from
[Releases](https://github.com/lingcang728/ZeppBridge/releases) and repeat the
installation command above. For AppImage, download and replace the file.

## Sandbox permissions (Flatpak)

| Permission | Why |
|---|---|
| `--share=network` | Syncing from the Zepp cloud, the official-platform authorization relay (`zeppbridge.com`), letters and voluntary problem reports. |
| `--socket=wayland`, `--socket=fallback-x11`, `--device=dri`, `--share=ipc` | Drawing a window. |
| `--talk-name=org.freedesktop.secrets` | Storing the App Token in the keyring. Without it sign-in completes but the token cannot be saved. |
| `--talk-name=org.kde.StatusNotifierWatcher` | The tray icon. On GNOME this also needs the AppIndicator shell extension; KDE supports it natively. |

Not granted, on purpose: `--filesystem=home` (exports and backups go through the
XDG file-chooser portal, so you grant one directory at the moment you pick it)
and `--socket=session-bus` (the two `--talk-name` rules above are enough; the
whole bus would be a hole in the sandbox).

## Building from source

See the [Linux packaging notes](../development/linux-packaging.md).
