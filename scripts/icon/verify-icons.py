"""Verify the generated Tauri icon family.

Requires Pillow (`pip install pillow`).
"""

from __future__ import annotations

import hashlib
import re
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


def assert_small_preview(path: Path, size: int) -> tuple[tuple[int, int], int]:
    """Downsample the real generated icon and check its small-size signal."""

    image = Image.open(path).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    if image.size != (size, size):
        raise AssertionError(f"{path.name}: {size}px preview has wrong dimensions {image.size}")
    alpha = image.getchannel("A")
    if alpha.getextrema()[1] == 0:
        raise AssertionError(f"{path.name}: {size}px preview is fully transparent")

    # The dark board is intentionally quiet; the angular rails must still
    # contribute a high-luminance signal at every requested UI size.
    rail_pixels = sum(
        1
        for red, green, blue, pixel_alpha in image.getdata()
        if pixel_alpha >= 160 and red + green + blue >= 300
    )
    minimum = max(2, size // 2)
    if rail_pixels < minimum:
        raise AssertionError(f"{path.name}: {size}px preview lost the angular rails ({rail_pixels} bright pixels)")
    return alpha.getextrema(), rail_pixels


def assert_angular_double_rail(source: str) -> None:
    symbol_match = re.search(r'<symbol\s+id="brand-mark"[^>]*>([\s\S]*?)</symbol>', source)
    if not symbol_match:
        raise AssertionError("icon-source.svg is missing the brand-mark symbol")
    symbol = symbol_match.group(1)
    if 'data-shape="angular-double-rail-z"' not in source:
        raise AssertionError("icon-source.svg is missing the angular double-rail marker")
    if symbol.count("<path") != 2:
        raise AssertionError("brand-mark must contain exactly two rail paths")
    if "<circle" in symbol:
        raise AssertionError("brand-mark must not contain legacy connection points")
    path_data = re.findall(r'<path\b[^>]*\bd="([^"]+)"', symbol)
    if len(path_data) != 2 or any(re.search(r"[CQSAcqsa]", data) for data in path_data):
        raise AssertionError("brand-mark rails must use angular M/H/L commands only")
    widths = [float(width) for width in re.findall(r'stroke-width="([0-9.]+)"', symbol)]
    if widths != [3.1, 3.1]:
        raise AssertionError(f"brand-mark rails must share stroke-width 3.1, got {widths}")


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
    required_frames = {(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)}
    missing = required_frames.difference(frames)
    if missing:
        raise AssertionError(f"icon.ico missing frames {sorted(missing)}; found {frames}")

    if not PUBLIC.exists():
        raise AssertionError(f"missing generated public icon: {PUBLIC}")
    if hashlib.sha256((ICONS / "icon.png").read_bytes()).digest() != hashlib.sha256(PUBLIC.read_bytes()).digest():
        raise AssertionError("public/zeppbridge-icon.png is not the generated icon.png")
    source = (ICONS / "icon-source.svg").read_text(encoding="utf-8")
    assert_angular_double_rail(source)
    previews = {size: assert_small_preview(ICONS / "icon.png", size) for size in (16, 20, 24)}

    print("Icon verification passed")
    print(f"PNG sizes: {', '.join(f'{w}x{h}' for w, h in sorted(set(expected.values())))}")
    print(f"ICO frames: {', '.join(f'{w}x{h}' for w, h in frames)}")
    print("Alpha: verified on every generated PNG")
    print(
        "Small previews: "
        + ", ".join(f"{size}px ({rails} rail pixels)" for size, (_alpha, rails) in previews.items())
    )
    print("Master: angular double-rail Z verified; legacy curves and points absent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"Icon verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
    except ImportError as error:
        print(
            f"Icon verification requires Pillow ({error}). Install with: pip install pillow",
            file=sys.stderr,
        )
        raise SystemExit(1)
    except OSError as error:
        print(f"Icon verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
