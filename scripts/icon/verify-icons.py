"""Verify the generated Tauri icon family without adding a Python dependency."""

from __future__ import annotations

import hashlib
import struct
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "src-tauri" / "icons"
PUBLIC = ROOT / "public" / "zeppbridge-icon.png"


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        signature = stream.read(24)
    if signature[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path.name}: not a PNG")
    return struct.unpack(">II", signature[16:24])


def ico_frames(path: Path) -> list[tuple[int, int]]:
    raw = path.read_bytes()
    if raw[:4] != b"\x00\x00\x01\x00":
        raise AssertionError(f"{path.name}: not an ICO")
    count = struct.unpack_from("<H", raw, 4)[0]
    frames: list[tuple[int, int]] = []
    for index in range(count):
        offset = 6 + index * 16
        width = raw[offset] or 256
        height = raw[offset + 1] or 256
        frames.append((width, height))
    return frames


def assert_alpha(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    if alpha.getextrema() == (255, 255):
        raise AssertionError(f"{path.name}: no alpha channel variation")


def main() -> int:
    expected = {
        "32x32.png": (32, 32),
        "64x64.png": (64, 64),
        "128x128.png": (128, 128),
        "128x128@2x.png": (256, 256),
        "icon.png": (512, 512),
        "StoreLogo.png": (50, 50),
        "Square30x30Logo.png": (30, 30),
        "Square44x44Logo.png": (44, 44),
        "Square71x71Logo.png": (71, 71),
        "Square89x89Logo.png": (89, 89),
        "Square107x107Logo.png": (107, 107),
        "Square142x142Logo.png": (142, 142),
        "Square150x150Logo.png": (150, 150),
        "Square284x284Logo.png": (284, 284),
        "Square310x310Logo.png": (310, 310),
    }
    for name, size in expected.items():
        path = ICONS / name
        if not path.exists():
            raise AssertionError(f"missing generated icon: {path}")
        actual = png_size(path)
        if actual != size:
            raise AssertionError(f"{name}: expected {size}, got {actual}")
        assert_alpha(path)

    frames = ico_frames(ICONS / "icon.ico")
    required_frames = {(16, 16), (24, 24), (32, 32), (48, 48), (256, 256)}
    missing = required_frames.difference(frames)
    if missing:
        raise AssertionError(f"icon.ico missing frames {sorted(missing)}; found {frames}")

    if hashlib.sha256((ICONS / "icon.png").read_bytes()).digest() != hashlib.sha256(PUBLIC.read_bytes()).digest():
        raise AssertionError("public/zeppbridge-icon.png is not the generated icon.png")
    source = (ICONS / "icon-source.svg").read_text(encoding="utf-8")
    if 'id="brand-mark"' not in source or "stroke-width=\"3.6\"" not in source:
        raise AssertionError("icon-source.svg does not contain the expected curved master brand symbol")
    if source.count("<circle") != 2:
        raise AssertionError("icon-source.svg must contain exactly two brand connection points")

    print("Icon verification passed")
    print(f"PNG sizes: {', '.join(f'{w}x{h}' for w, h in sorted(set(expected.values())))}")
    print(f"ICO frames: {', '.join(f'{w}x{h}' for w, h in frames)}")
    print("Alpha: verified on every generated PNG")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"Icon verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
