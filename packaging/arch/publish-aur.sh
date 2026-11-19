#!/usr/bin/env bash
set -euo pipefail

case ${1:-} in
  -h|--help)
    printf 'Usage: %s [--push]\nBuild zeppbridge-git and preview the AUR changes. Pass --push to commit and publish them.\n' "${0##*/}"
    exit 0
    ;;
  --push) push=true ;;
  '') push=false ;;
  *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  printf 'Usage: %s [--push]\n' "${0##*/}" >&2
  exit 2
fi

arch_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cache_root="${XDG_CACHE_HOME:-${HOME}/.cache}/zeppbridge/arch"
aur_url='ssh://aur@aur.archlinux.org/zeppbridge-git.git'
mkdir -p "$cache_root"
workspace=$(mktemp -d "$cache_root/aur.XXXXXX")
trap 'rm -rf -- "$workspace"' EXIT

git -c init.defaultBranch=master clone "$aur_url" "$workspace/package"
cd "$workspace/package"
if [[ $(git symbolic-ref --short HEAD) != master ]]; then
  git switch master
fi

cp -- "$arch_dir/PKGBUILD" "$arch_dir/../../LICENSE" .
unset ZEPPBRIDGE_SOURCE_URL ZEPPBRIDGE_BUILD_SHA
PKGDEST="$PWD" SRCDEST="$PWD" BUILDDIR="$PWD" makepkg
makepkg --printsrcinfo > .SRCINFO
git add -- PKGBUILD .SRCINFO LICENSE

# makepkg updates the VCS version during the build. Upstream commits alone
# do not require a new AUR commit.
if git diff --cached --quiet -I '^(pkgver=|[[:space:]]+(pkgver = |provides = zeppbridge=))' --; then
  printf 'The AUR recipe is up to date.\n'
  exit 0
fi

git --no-pager diff --cached --
if [[ $push == true ]]; then
  git commit -m 'Update zeppbridge-git package'
  git push origin HEAD:refs/heads/master
else
  printf '\nPreview complete. Pass --push to publish to the AUR.\n'
fi
