#!/usr/bin/env bash
# Build the ZeppBridge Flatpak from the working tree.
#
#   ./packaging/flatpak/build-flatpak.sh              build + install for this user
#   ./packaging/flatpak/build-flatpak.sh --bundle     also write zeppbridge.flatpak
#   ./packaging/flatpak/build-flatpak.sh --no-install just build into build-dir/
#
# Needs flatpak and flatpak-builder on the host. Everything else — the GNOME
# runtime, Rust, Node — is pulled as a Flatpak runtime, so no toolchain has to
# be installed system-wide.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../.." && pwd)
manifest="$here/com.zeppbridge.app.yml"
app_id=com.zeppbridge.app

build_dir="$repo/packaging/flatpak/build-dir"
state_dir="$repo/packaging/flatpak/.flatpak-builder"
bundle=false
install=true

for arg in "$@"; do
  case "$arg" in
    --bundle) bundle=true ;;
    --no-install) install=false ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

for tool in flatpak flatpak-builder; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    cat >&2 <<MSG
$tool is not installed.

  Debian/Ubuntu: sudo apt install flatpak flatpak-builder
  Fedora:        sudo dnf install flatpak flatpak-builder
  Arch:          sudo pacman -S flatpak flatpak-builder
MSG
    exit 1
  fi
done

# --user throughout: building a Flatpak must not need root, and a contributor
# should not have to touch the system-wide installation to test a packaging
# change.
if ! flatpak remotes --user --columns=name | grep -qx flathub; then
  echo "== adding the flathub remote (user) =="
  flatpak remote-add --user --if-not-exists flathub \
    https://dl.flathub.org/repo/flathub.flatpakrepo
fi

# Let flatpak-builder read the runtime, the SDK and the SDK extension versions
# out of the manifest and install them itself. Naming them here instead would
# duplicate four version numbers that have to move together — and the extension
# branch is the *freedesktop* base version, not the GNOME one, which is exactly
# the kind of detail a second copy gets wrong.
builder_args=(
  --force-clean
  --state-dir "$state_dir"
  --ccache
  --install-deps-from=flathub
  --user
)

# One build, whatever the flags. --repo and --install compose, so asking for
# both does not mean compiling the Rust twice — which, at roughly ten minutes a
# go, is the difference worth caring about here.
repo_dir="$repo/packaging/flatpak/repo"
if [[ "$install" == true ]]; then
  builder_args+=(--install)
fi
if [[ "$bundle" == true ]]; then
  builder_args+=(--repo "$repo_dir")
fi

echo "== building =="
# The `type: dir` source is `../..` relative to the manifest, which
# flatpak-builder resolves against the manifest's own directory — so this works
# from anywhere, but run it from the repo root so relative paths in the build
# commands mean what they look like they mean.
(cd "$repo" && flatpak-builder "${builder_args[@]}" "$build_dir" "$manifest")

if [[ "$bundle" == true ]]; then
  echo "== exporting a single-file bundle =="
  version=$(node -p "require('$repo/package.json').version")
  out="$repo/release/ZeppBridge_${version}_x86_64.flatpak"
  mkdir -p "$(dirname "$out")"
  flatpak build-bundle "$repo_dir" "$out" "$app_id"
  echo "wrote $out"
fi

if [[ "$install" == true ]]; then
  cat <<MSG

Installed. Run it with:

  flatpak run $app_id

The database lives at
  ~/.var/app/$app_id/data/zeppbridge/data/zepp.db
MSG
fi
