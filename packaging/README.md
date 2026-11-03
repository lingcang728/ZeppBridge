# packaging/

[简体中文](README.zh-CN.md)

Everything needed to turn this repository into something installable, for the
platforms whose packaging does not live in `src-tauri/tauri.conf.json`.

| Path | What it is | Guide |
|---|---|---|
| `flatpak/com.zeppbridge.app.yml` | Flatpak manifest | [docs/guides/linux.md](../docs/guides/linux.md) |
| `flatpak/com.zeppbridge.app.desktop` | Desktop entry. Flatpak requires the filename to be `$FLATPAK_ID.desktop`, which is why it is here rather than generated. | |
| `flatpak/com.zeppbridge.app.metainfo.xml` | AppStream metadata. Without it the app installs as a nameless entry in GNOME Software. | |
| `flatpak/build-flatpak.sh` | Build and install for the current user. Needs only `flatpak` and `flatpak-builder`; Rust and Node come from SDK extensions. | |
| `arch/PKGBUILD`, `arch/.SRCINFO` | Native x86_64 `zeppbridge-git` package recipe tracking upstream `main`; prepared for AUR submission, not published there. | [docs/guides/linux.md](../docs/guides/linux.md#arch-linux--aur-recipe) |
| `arch/build-local.sh` | Snapshot the current working tree, including uncommitted source changes, and build a native package into `release-arch/`; extra arguments such as `--syncdeps` or `--install` are forwarded to makepkg. | |
| `docker/Dockerfile` | Headless runtime: `zeppbridge-cli` + `zeppbridge-mcp`. No GUI. | [docs/guides/docker.md](../docs/guides/docker.md) |
| `docker/Dockerfile.build` | Pinned Linux toolchain, for reproducible deb/rpm/AppImage builds. | |
| `docker/docker-compose.yml` | One-shot `sync` / `status` / `mcp` services, all behind profiles. | |
| `docker/entrypoint.sh` | Turns the two failures that actually happen — unwritable volume, no account connected — into actionable messages. | |

Windows (NSIS, MSI) and macOS (app, dmg) are configured in
`src-tauri/tauri.conf.json` and built by `.github/workflows/ci.yml`; nothing in
this directory is involved in those.

The Linux `deb` and `rpm` dependency lists also live in `tauri.conf.json`, under
`bundle.linux` — they are Tauri configuration, not a separate manifest.

For Arch source builds, use `./packaging/arch/build-local.sh` from the repository
root after `nvm use`. It isolates dependencies and build output in the user
cache; extra arguments are forwarded to `makepkg` unchanged, so `--syncdeps`
installs missing build dependencies and `--install` installs the finished
package after a successful build.
The raw `PKGBUILD` instead fetches committed upstream `main` by default. Both
build the desktop app and CLI/MCP binaries without AppImage packaging. See the
[Linux guide](../docs/guides/linux.md#arch-linux--aur-recipe) for installation
and the distinction between local and upstream source.

## What is verified

The native Arch x86_64 package built successfully on a local Arch machine,
including desktop-entry validation and a CLI version check, and the package was
installed there (`pacman -U`) — the person who reported the white screens
confirmed they were gone with this build. That snapshot predates the upstream
3.1.0 merge. Clean-chroot builds remain unverified.
There is no Arch CI job, and the recipe has not been published to AUR.

`.github/workflows/ci.yml` builds the Flatpak bundle, validates the desktop and
AppStream files, and builds *and smoke-tests* the headless image on every push.
What no CI job can cover is a real Linux desktop — and that part has now been
covered by a person: rendering fixes, the interface, sign-in, sync and data
display are confirmed on the affected machine. See
[docs/guides/linux.md](../docs/guides/linux.md#what-is-verified-and-what-is-not).
