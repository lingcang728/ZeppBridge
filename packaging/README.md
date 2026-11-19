# packaging/

[简体中文](README.zh-CN.md)

Everything needed to turn this repository into something installable, for the
platforms whose packaging does not live in `src-tauri/tauri.conf.json`.

| Path | What it is | Guide |
|---|---|---|
| `flatpak/com.zeppbridge.app.yml` | Flatpak manifest | [docs/guides/linux.md](../docs/guides/linux.md) |
| `flatpak/com.zeppbridge.app.desktop` | Desktop entry. Flatpak requires the filename to be `$FLATPAK_ID.desktop`, which is why it is here rather than generated. | |
| `flatpak/com.zeppbridge.app.metainfo.xml` | AppStream metadata. Without it the app installs as a nameless entry in GNOME Software. | |
| `flatpak/build-flatpak.sh` | Build and install for the current user. Needs `flatpak`, `flatpak-builder` and `elfutils`; Rust and Node come from SDK extensions. | |
| `arch/PKGBUILD`, `arch/.SRCINFO` | Native x86_64 [`zeppbridge-git` AUR package](https://aur.archlinux.org/packages/zeppbridge-git) tracking upstream `main`. | [docs/guides/linux.md](../docs/guides/linux.md#arch-linux) |
| `arch/build-local.sh` | Snapshot the current working tree, including uncommitted source changes, and build a native package into `release-arch/`; extra arguments such as `--syncdeps` or `--install` are forwarded to makepkg. | |
| `arch/publish-aur.sh` | Build `zeppbridge-git`, regenerate `.SRCINFO`, and preview the AUR changes. Pass `--push` to publish. | |
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
[Linux guide](../docs/guides/linux.md#arch-linux) for installation
and the distinction between local and upstream source.

[@Jax-Tsai-zero](https://github.com/Jax-Tsai-zero) currently supports AUR
publishing for `zeppbridge-git`. Project members who need AUR co-maintainer
access should contact them with their AUR username.

Set up your AUR SSH key and install the Arch build dependencies, then run
`./packaging/arch/publish-aur.sh` to build and preview the changes. Configure
your Git commit identity before running `./packaging/arch/publish-aur.sh --push`
to rebuild and push the recipe, `.SRCINFO`, and license to the AUR.

## CI

Full CI runs validate desktop and AppStream metadata and build and smoke-test
the headless image. Release tags, manual runs, and pushes to `main` that change
packaging inputs build Flatpak. Arch builds have been verified on x86_64.
