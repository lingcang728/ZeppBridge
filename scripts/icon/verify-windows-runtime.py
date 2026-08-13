"""Inspect a built Windows executable's embedded icon without installing it."""

from __future__ import annotations

import hashlib
import io
import struct
from pathlib import Path

import pefile
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
EXE = Path(r"G:\build_cache\cargo-target\release\ZeppBridge.exe")
ICO = ROOT / "src-tauri" / "icons" / "icon.ico"
OUT = ROOT / "docs" / "design" / "windows-runtime-icon-check.png"


def font(size: int, bold: bool = False):
    path = Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def resource_icon_frames(path: Path) -> dict[int, bytes]:
    pe = pefile.PE(str(path), fast_load=False)
    group_type = pefile.RESOURCE_TYPE["RT_GROUP_ICON"]
    icon_type = pefile.RESOURCE_TYPE["RT_ICON"]
    group = next(entry for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries if entry.id == group_type)
    group_lang = group.directory.entries[0].directory.entries[0]
    group_bytes = pe.get_data(group_lang.data.struct.OffsetToData, group_lang.data.struct.Size)
    reserved, kind, count = struct.unpack_from("<HHH", group_bytes, 0)
    if (reserved, kind) != (0, 1):
        raise AssertionError("embedded resource is not an icon group")

    icons: dict[int, bytes] = {}
    resource_by_id: dict[int, bytes] = {}
    icon_entry = next(entry for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries if entry.id == icon_type)
    for icon in icon_entry.directory.entries:
        language = icon.directory.entries[0]
        resource_by_id[icon.id] = pe.get_data(language.data.struct.OffsetToData, language.data.struct.Size)

    for index in range(count):
        width_byte, height_byte, _colors, _reserved, _planes, _bits, _size, icon_id = struct.unpack_from(
            "<BBBBHHIH", group_bytes, 6 + index * 14
        )
        size = width_byte or 256
        if height_byte not in (0, width_byte):
            raise AssertionError(f"embedded frame {size}px has inconsistent dimensions")
        icons[size] = resource_by_id[icon_id]
    return icons


def ico_frames(path: Path) -> dict[int, bytes]:
    raw = path.read_bytes()
    reserved, kind, count = struct.unpack_from("<HHH", raw, 0)
    if (reserved, kind) != (0, 1):
        raise AssertionError("source is not an ICO")
    frames: dict[int, bytes] = {}
    for index in range(count):
        offset = 6 + index * 16
        width_byte, height_byte = raw[offset], raw[offset + 1]
        bytes_in_resource, data_offset = struct.unpack_from("<II", raw, offset + 8)
        dimension = width_byte or 256
        frames[dimension] = raw[data_offset : data_offset + bytes_in_resource]
        if len(frames[dimension]) != bytes_in_resource:
            raise AssertionError(f"source ICO frame {dimension}px is truncated")
    return frames


def render_png(data: bytes, size: int) -> Image.Image:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    if image.size != (size, size):
        raise AssertionError(f"frame declares {size}px but decodes as {image.size}")
    return image


def main() -> int:
    if not EXE.exists():
        raise FileNotFoundError(EXE)
    embedded = resource_icon_frames(EXE)
    source = ico_frames(ICO)
    required = (16, 32, 48, 256)
    missing = [size for size in required if size not in embedded]
    if missing:
        raise AssertionError(f"embedded EXE icon missing required frames: {missing}")

    decoded: dict[int, Image.Image] = {}
    matches: dict[int, bool] = {}
    for size in required:
        decoded[size] = render_png(embedded[size], size)
        ico_data = source.get(size)
        # Tauri stores the same PNG payload in the PE icon resources and ICO.
        matches[size] = ico_data is not None and hashlib.sha256(embedded[size]).digest() == hashlib.sha256(ico_data).digest()

    canvas = Image.new("RGB", (1500, 620), "#0f1512")
    draw = ImageDraw.Draw(canvas)
    draw.text((42, 32), "Windows runtime icon resource check", fill="#e8eaed", font=font(30, True))
    draw.text((44, 78), "Embedded PE RT_ICON frames compared with src-tauri/icons/icon.ico", fill="#8b919a", font=font(14))
    x_positions = (70, 320, 590, 940)
    for size, x in zip(required, x_positions):
        sample = decoded[size]
        preview = max(128, min(220, size * 2))
        tile = Image.new("RGB", (preview + 28, preview + 62), "#181b21")
        scaled = sample.resize((preview, preview), Image.Resampling.NEAREST if size <= 32 else Image.Resampling.LANCZOS)
        tile.paste(scaled, (14, 12), scaled)
        td = ImageDraw.Draw(tile)
        td.text((14, preview + 22), f"EXE {size}px", fill="#d7dbe0", font=font(13, True))
        canvas.paste(tile, (x, 142))
        status = "ICO bytes match" if matches[size] else "ICO bytes differ"
        draw.text((x, 510), status, fill="#72c994" if matches[size] else "#e88a8e", font=font(13))

    icon_resource_hash = hashlib.sha256(embedded[256]).hexdigest()[:16]
    ico_hash = hashlib.sha256(source[256]).hexdigest()[:16]
    draw.text((42, 562), f"Embedded frames: {', '.join(f'{size}px' for size in sorted(embedded))} · 256px PNG SHA-256 {icon_resource_hash} · ICO {ico_hash}", fill="#8b919a", font=font(12))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)

    print(f"EXE: {EXE}")
    print(f"Embedded RT_ICON frames: {', '.join(f'{size}px' for size in sorted(embedded))}")
    for size in required:
        print(f"{size}px: embedded PNG decodes {decoded[size].size}; ICO payload match={matches[size]}")
    print(f"Evidence: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
