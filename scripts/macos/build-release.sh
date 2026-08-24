#!/usr/bin/env bash
# Build the macOS (Apple Silicon) release bundle: ZeppBridge.app + .dmg.
#
# Usage:
#   scripts/macos/build-release.sh          # local verification build
#   TAURI_SIGNING_PRIVATE_KEY=... \
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD=... \
#   scripts/macos/build-release.sh          # publishable build (updater-signed)
#
# Without a signing key the updater artifacts are skipped, so a local build
# never fails just because the private key is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v cargo >/dev/null 2>&1; then
  echo "错误：未找到 cargo，请先安装 Rust（https://rustup.rs）" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm" >&2
  exit 1
fi

echo "==> 前端构建"
npm run build

echo "==> 图标校验"
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import PIL' 2>/dev/null; then
  echo "（跳过 icons:verify：需要 python3 + Pillow）"
else
  npm run icons:verify
fi

echo "==> Rust 格式与测试"
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked

BUNDLES="app,dmg"
EXTRA_ARGS=()
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  echo "==> 未检测到 updater 签名私钥，跳过 updater artifacts（本地验证构建）"
  EXTRA_ARGS+=(--config '{"bundle":{"createUpdaterArtifacts":false}}')
else
  echo "==> 检测到 updater 签名私钥，生成可发布产物"
fi

echo "==> Tauri 打包（aarch64-apple-darwin）"
npx tauri build --bundles "$BUNDLES" "${EXTRA_ARGS[@]}"

echo
echo "构建完成，产物："
echo "  app: src-tauri/target/release/bundle/macos/ZeppBridge.app"
echo "  dmg: src-tauri/target/release/bundle/dmg/ZeppBridge_*.dmg"
