"""Build local, transparent device art from the downloaded official images.

The source images are kept outside the final bundle while this script is run
by maintainers.  A white background is removed conservatively, the subject is
cropped to its alpha bounds, and a large WebP plus a small PNG thumbnail are
written for the catalog.  Pillow is intentionally the only dependency.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def remove_near_white(image: Image.Image, threshold: int = 246) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and red >= threshold and green >= threshold and blue >= threshold:
                pixels[x, y] = (red, green, blue, 0)
            elif alpha and red >= threshold - 10 and green >= threshold - 10 and blue >= threshold - 10:
                # Keep a soft edge while fading the white halo.
                opacity = max(0, min(255, 255 - min(red, green, blue) + threshold - 10))
                pixels[x, y] = (red, green, blue, min(alpha, opacity))
    return rgba


def trim_alpha(image: Image.Image, padding: int = 20) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def build(source: Path, destination: Path, max_size: int = 900) -> None:
    image = trim_alpha(remove_near_white(Image.open(source))).convert("RGBA")
    scale = min(1.0, max_size / max(image.width, image.height))
    if scale < 1.0:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination.with_suffix(".webp"), "WEBP", lossless=True, method=6)
    thumb = image.copy()
    thumb.thumbnail((240, 240), Image.Resampling.LANCZOS)
    thumb.save(destination.with_name(destination.stem + "-thumb.png"), "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.input, args.output)


if __name__ == "__main__":
    main()
