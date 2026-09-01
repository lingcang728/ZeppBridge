# packaging/

Everything needed to turn this repository into something installable, for the
platforms whose packaging does not live in `src-tauri/tauri.conf.json`.

| Path | What it is | Guide |
|---|---|---|
| `flatpak/com.zeppbridge.app.yml` | Flatpak manifest | [docs/guides/linux.md](../docs/guides/linux.md) |
| `flatpak/com.zeppbridge.app.desktop` | Desktop entry. Flatpak requires the filename to be `$FLATPAK_ID.desktop`, which is why it is here rather than generated. | |
| `flatpak/com.zeppbridge.app.metainfo.xml` | AppStream metadata. Without it the app installs as a nameless entry in GNOME Software. | |
| `flatpak/build-flatpak.sh` | Build and install for the current user. Needs only `flatpak` and `flatpak-builder`; Rust and Node come from SDK extensions. | |
| `docker/Dockerfile` | Headless runtime: `zeppbridge-cli` + `zeppbridge-mcp`. No GUI. | [docs/guides/docker.md](../docs/guides/docker.md) |
| `docker/Dockerfile.build` | Pinned Linux toolchain, for reproducible deb/rpm/AppImage builds. | |
| `docker/docker-compose.yml` | One-shot `sync` / `status` / `mcp` services, all behind profiles. | |
| `docker/entrypoint.sh` | Turns the two failures that actually happen — unwritable volume, no account connected — into actionable messages. | |

Windows (NSIS, MSI) and macOS (app, dmg) are configured in
`src-tauri/tauri.conf.json` and built by `.github/workflows/ci.yml`; nothing in
this directory is involved in those.

The Linux `deb` and `rpm` dependency lists also live in `tauri.conf.json`, under
`bundle.linux` — they are Tauri configuration, not a separate manifest.

## What is verified

`.github/workflows/ci.yml` builds the Flatpak bundle, validates the desktop and
AppStream files, and builds *and smoke-tests* the headless image on every push.
What no CI job can cover is a real Linux desktop: sign-in, sync and keyring
behaviour there are still unverified by a person. See
[docs/guides/linux.md](../docs/guides/linux.md#what-is-verified-and-what-is-not).
