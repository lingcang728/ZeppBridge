# Linux packaging notes

For maintainers and people building ZeppBridge themselves. The user guide is
[Linux](../guides/linux.md).

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

## AppImage packaging on rolling distributions

On rolling distributions such as Arch, the build above can compile the executable
and produce the deb and rpm, then fail while packaging the AppImage (linuxdeploy). To retry only packaging the existing executable with detailed output:

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



## Flatpak

```bash
./packaging/flatpak/build-flatpak.sh            # build and install for your user
./packaging/flatpak/build-flatpak.sh --bundle   # also write release/ZeppBridge-<version>-Linux-x64.flatpak
```

The script needs `flatpak`, `flatpak-builder` and `elfutils` (`eu-strip`) on the
host. Rust and Node come from Flatpak SDK extensions; everything is `--user`.
Full CI runs validate Flatpak metadata. Release tags, manual runs, and pushes
to `main` that change packaging inputs build the bundle.

## Arch Linux

`packaging/arch/PKGBUILD` builds a native x86_64 `zeppbridge-git` package with
the desktop app, `zeppbridge-cli` and `zeppbridge-mcp`. It uses system libraries
and does not pass through AppImage packaging. For installation, see [`zeppbridge-git` on the AUR](https://aur.archlinux.org/packages/zeppbridge-git)
and the [Linux guide](../guides/linux.md#arch-linux). The repository includes
`packaging/arch/publish-aur.sh` for maintainers publishing recipe changes.

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


## Rendering policy

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
- AppImage turns accelerated compositing off only while its AppDir still ships
  the driver-coupled graphics libraries behind [issue #32][issue-32]
  (`libEGL*`, `libGL*`, `libGLX*`, `libOpenGL*`, `libgbm*`, `libdrm*`,
  `libwayland-*`, `libxcb-dri*`, `libva*`). The release AppImage strips that
  layer, so it keeps WebKit's accelerated path; an AppImage built without that
  step, or one whose layout cannot be read, still gets the fallback. An explicit
  value always wins.
- When either disabling variable is nonzero, theme and language changes skip
  native View Transition snapshot animations. The changes themselves still work.
  ZeppBridge does not force `GDK_BACKEND`.

The NVIDIA fallback has one exception: native Wayland on niri keeps WebKit's
default DMABUF path. On a local RTX 5070 Ti / NVIDIA 615.78.08 / WebKitGTK 2.54.2
system, an isolated scrolling test ran at about 26 FPS with DMABUF disabled and
61 FPS with the default path. This is a rendering probe, not an application-wide
performance guarantee. `GDK_BACKEND=x11` still selects the NVIDIA fallback even
inside niri; explicit disabling flags, the old-Wayland rule and the AppImage
compositing workaround still apply.

On one Arch Linux / AMD / Wayland machine with WebKitGTK 2.54.1, forcing
DMABUF off reproduced a `graphicsLayerFactory()` abort during View Transitions;
the default DMABUF path completed the same interactions. This supports the
animation guard and keeping rendering overrides available, but does not prove
compatibility across all drivers and distributions.
The person who reported these failures installed a locally built package with
this policy and confirmed the blank windows and animation aborts were gone.


## AppImage and bundled graphics libraries

**The AppImage specifically still will not open.** [Issue #32][issue-32]
records a Flatpak startup fixed by disabling DMABUF in 2.1.0, while the CI-built
AppImage still failed. Its bundled Wayland libraries were another compatibility
problem: the AppImage shipped `libwayland-client.so.0`,
`libwayland-cursor.so.0`, `libwayland-egl.so.1` and `libwayland-server.so.0`,
which the packaging now removes so the host copies are used. The compositing
fallback above is kept for exactly that condition: an AppDir that still carries
`libEGL`, `libGL`, `libgbm`, `libdrm`, `libwayland` or `libva` keeps it, and a
release AppImage that uses the host graphics stack does not.

Keeping the accelerated path matters on a high-DPI screen. On one Arch Linux /
AMD / Wayland machine with a 2880x1800 120 Hz panel, the same wheel-scroll
gesture over the Overview cost the WebKit web process 5.9 s of CPU per 6.1 s of
scrolling with compositing off, against 1.9 s with it on (GPU busy 11% → 31%);
at rest the same comparison was 56% of a core against 2%. That is a rendering
probe on one machine, not a frame-rate guarantee — but it is why the fallback is
now tied to the condition that caused it instead of to every AppImage.


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

[issue-32]: https://github.com/lingcang728/ZeppBridge/issues/32
