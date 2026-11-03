#!/usr/bin/env bash
# Package the current workspace, including uncommitted source fixes, without
# changing its Git history or copying node_modules, target caches, or user data.
set -euo pipefail

repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cache_root="${XDG_CACHE_HOME:-${HOME}/.cache}/zeppbridge/arch"
mkdir -p "$cache_root"
build_root=$(mktemp -d "$cache_root/build.XXXXXX")
snapshot="$build_root/snapshot"
mkdir -p "$snapshot" "$build_root/package"

# Whitelist build inputs so real data and release directories are never copied.
# Reading the working files includes local edits; ignore rules exclude caches.
git -C "$repo_root" ls-files --cached --others --exclude-standard -z -- \
  src src-tauri scripts public tests docs/releases docs/reference packaging/flatpak \
  package.json package-lock.json LICENSE index.html vite.config.ts vitest.config.ts \
  tsconfig.json tsconfig.node.json env.d.ts .gitignore .nvmrc |
  while IFS= read -r -d '' file; do
    if [[ -f "$repo_root/$file" || -L "$repo_root/$file" ]]; then
      printf '%s\0' "$file"
    fi
  done |
  tar -C "$repo_root" --null -T - -cf - |
  tar -C "$snapshot" -xf -

# This commit exists only in the build cache. Nothing is committed or pushed in
# the user's repository, and no local snapshot is sent to a remote server.
git -C "$snapshot" init --quiet --initial-branch=main
git -C "$snapshot" add --force --all
git -C "$snapshot" -c user.name='ZeppBridge local build' \
  -c user.email='local-build@localhost' -c commit.gpgsign=false \
  commit --quiet -m 'Local source snapshot'
cp "$repo_root/packaging/arch/PKGBUILD" "$build_root/package/PKGBUILD"

export ZEPPBRIDGE_SOURCE_URL="git+file://${snapshot}#branch=main"
export ZEPPBRIDGE_BUILD_SHA
ZEPPBRIDGE_BUILD_SHA=$(git -C "$repo_root" rev-parse --short HEAD)
export PKGDEST="${ZEPPBRIDGE_ARCH_OUTPUT_DIR:-${repo_root}/release-arch}"
mkdir -p "$PKGDEST"
printf 'Build workspace: %s\nPackage output: %s\n' "$build_root" "$PKGDEST"
cd "$build_root/package"
# Forward makepkg options (e.g. --syncdeps or --install) only when requested.
makepkg "$@"
