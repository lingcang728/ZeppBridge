"""Build the local Amazfit device catalog and transparent product art.

The 48 Japanese-store cards are the audit baseline.  Product cards are cropped
from the supplied official-store captures; four additional currently listed
products are downloaded from the official US Shopify CDN so the canonical
model count is not inflated by the repeated GTR 4 colour card.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SCREENSHOT_DIR = ROOT / "design_picture" / "Product"
ASSET_DIR = ROOT / "src" / "assets" / "devices"
CATALOG_PATH = ASSET_DIR / "catalog.json"
AUDIT_JSON_PATH = ROOT / "docs" / "reference" / "device-catalog-audit.json"
AUDIT_CSV_PATH = ROOT / "docs" / "reference" / "device-catalog-audit.csv"
CHECKED_AT = "2026-08-15"


SCREENSHOTS = [
    "屏幕截图 2026-08-15 144308.png",
    "屏幕截图 2026-08-15 144316.png",
    "屏幕截图 2026-08-15 144326.png",
    "屏幕截图 2026-08-15 144333.png",
    "屏幕截图 2026-08-15 144343.png",
    "屏幕截图 2026-08-15 144351.png",
    "屏幕截图 2026-08-15 144359.png",
    "屏幕截图 2026-08-15 144405.png",
    "屏幕截图 2026-08-15 144411.png",
    "屏幕截图 2026-08-15 144418.png",
    "屏幕截图 2026-08-15 144424.png",
    "屏幕截图 2026-08-15 144430.png",
]


# Zepp 设备列表里的 `deviceSource` 数字 -> catalog_id。
#
# 华米不公开对照表，而有些账号的设备响应里除了这些数字什么都没有（issue #4）。
# 这一列全部来自用户在应用里主动指认的型号，由 Cloudflare 反馈库汇总。
#
# 收录规则（2026-09-01 那一轮的 104 份带指认报告上逐条验证过）：
#   * 只收 deviceSource，绝不收 deviceType —— 后者是族码，光 deviceType:0
#     一个值就横跨 20 款表；
#   * 只收高位段 >= 1_000_000 —— 低位段（15/101/102/104）在数据里就是自相
#     矛盾的，同一个数字被指认成四款不同的表；
#   * 每个数字至少两份互相独立的报告。
#
# 同一款表有多个相邻数字是正常的：低位是配色/尺寸变体。
DEVICE_SOURCE_CODES: dict[str, list[int]] = {
    "amazfit-t-rex-3": [8716544, 8716545, 8716547],
    "amazfit-balance-46mm": [8519936, 8519937, 8519939],
    # 9568513 是人工裁决：相邻的 9568512 / 9568515 一致指向 Balance 2，而 8 份
    # 报告里指认成 Helio Strap 的那 2 份，同一份报告里还指认了另一块表——是
    # 在设备选择器里挑错了那一台，不是这个数字有歧义。
    "amazfit-balance-2": [9568512, 9568513, 9568515, 10486017],
    "amazfit-active-2-44mm": [10092800, 10092801, 10092807],
    "amazfit-active-2-square": [10223873],
    "amazfit-bip-6": [10158337],
    "amazfit-cheetah-2-ultra": [9978113],
    # 10289411 同样是人工裁决：17 份里 14 份 Helio Strap，相邻的 10289410
    # 三份一致，3 份异议同样来自「一个账号两块表、挑错了」。
    "amazfit-helio-strap": [10289410, 10289411],
    "amazfit-t-rex-3-pro-48-44mm": [10551552],
    # 11145472 是 2026-09-01 那批新增的：3 份报告一致指向 Balance 3，和已经
    # 收了的相邻编号 11141379 同族。
    "amazfit-balance-3": [11141379, 11145472],
    "amazfit-gtr-4-46mm": [7930113],
    # 下面两个上一轮还只有一份报告，这一轮凑够了独立第二份：
    #   10944769 -> Active 3 Premium（3 份，无异议）
    #   10879233 -> T-Rex Ultra 2（2 份，无异议）
    "amazfit-active-3-premium": [10944769],
    "amazfit-t-rex-ultra-2": [10879233],
}
# 明确不收（2026-09-01 的 142 行反馈快照上复核过）：
#   * 10813699 —— Active MAX 2 份 vs Active 2 44mm 2 份，平票不是证据；
#   * 只有一份报告的高位编号（8913155、10813697、11141376、11141377、
#     10223872、10223875、10682624、8323329、11206915）——等第二份；
#   * 全部低位段编号和全部 deviceType。


def card(
    catalog_id: str,
    title: str,
    kind: str,
    row: int,
    column: int,
    *,
    asset_key: str | None = None,
    canonical_device_key: str | None = None,
    variant: str = "standard",
    merge_relation: str = "独立可识别型号",
    name_zh: str | None = None,
    aliases: list[str] | None = None,
    model_codes: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "catalog_id": catalog_id,
        "canonical_name": f"Amazfit {title}",
        "display_name": f"Amazfit {title}",
        "name_zh": name_zh or f"Amazfit {title}",
        "kind": kind,
        "model_codes": model_codes or [],
        "device_source_codes": DEVICE_SOURCE_CODES.get(catalog_id, []),
        "aliases": aliases or [f"Amazfit {title}", title],
        "region": ["jp"],
        "status": "active",
        "supported": True,
        "official_page": "https://www.amazfit.jp/",
        "official_url": "https://www.amazfit.jp/",
        "image_source_url": f"design_picture/Product/{SCREENSHOTS[row - 1]}",
        "asset_key": asset_key or catalog_id,
        "asset_source": "screenshot-derived",
        "provenance": (
            f"Official Amazfit Japan store card capture {SCREENSHOTS[row - 1]}, row {row}, column {column}; "
            "product-only crop with store labels, prices, award badges, and UI removed; white background removed. "
            "Bundled as internal/local product-reference art pending release-license review."
        ),
        "screenshot_card": {
            "row": row,
            "column": column,
            "display_name": f"Amazfit {title}",
            "variant": variant,
            "merge_relation": merge_relation,
        },
        "canonical_device_key": canonical_device_key or catalog_id,
        "asset_hash": None,
        "checked_at": CHECKED_AT,
    }


# The exact 48 cards visible in the user-provided official-store captures.
CARDS: list[dict[str, Any]] = [
    card("amazfit-balance-3", "Balance 3", "watch", 1, 1, name_zh="Amazfit 跃我 Balance 3"),
    card("amazfit-balance-ultra", "Balance Ultra", "watch", 1, 2),
    card("amazfit-cheetah-2-pro", "Cheetah 2 Pro", "watch", 1, 3),
    card("amazfit-cheetah-2-ultra", "Cheetah 2 Ultra", "watch", 1, 4),
    card("amazfit-bip-max", "Bip Max", "watch", 2, 1),
    card("amazfit-active-3-premium", "Active 3 Premium", "watch", 2, 2),
    card("amazfit-t-rex-ultra-2", "T-Rex Ultra 2", "watch", 2, 3),
    card("amazfit-active-max", "Active MAX", "watch", 2, 4, aliases=["Active MAX", "Active Max"]),
    card(
        "amazfit-t-rex-3-pro-48-44mm",
        "T-Rex 3 Pro 48mm/44mm",
        "watch",
        3,
        1,
        variant="48mm/44mm",
        aliases=["Amazfit T-Rex 3 Pro", "T-Rex 3 Pro", "Amazfit T-Rex 3 Pro 48mm/44mm", "T-Rex 3 Pro 48mm", "T-Rex 3 Pro 44mm"],
    ),
    card("amazfit-balance-2", "Balance 2", "watch", 3, 2, name_zh="Amazfit 跃我 Balance 2"),
    card("amazfit-active-2-square", "Active 2 Square", "watch", 3, 3, variant="square"),
    card(
        "amazfit-active-2-44mm",
        "Active 2 44mm",
        "watch",
        3,
        4,
        canonical_device_key="amazfit-active-2-round",
        variant="round 44mm",
        aliases=["Amazfit Active 2 44mm", "Active 2 44mm", "Amazfit Active 2 Round"],
    ),
    card("amazfit-bip-6", "Bip 6", "watch", 4, 1),
    card(
        "amazfit-t-rex-3",
        "T-Rex 3 48mm",
        "watch",
        4,
        2,
        model_codes=["A2322", "A2323"],
        aliases=["Amazfit T-Rex 3", "Amazfit T-Rex 3 48mm", "T-Rex 3 48mm", "T-Rex 3"],
        name_zh="Amazfit 跃我 T-Rex 3 48mm",
    ),
    card("amazfit-helio-strap", "Helio Strap", "strap", 4, 3, name_zh="Amazfit Helio 表带", aliases=["Amazfit Helio Strap", "Helio Strap", "Helio 表带"]),
    card("amazfit-balance-46mm", "Balance 46mm", "watch", 4, 4, canonical_device_key="amazfit-balance", variant="46mm", aliases=["Amazfit Balance 46mm", "Balance 46mm", "Amazfit Balance"]),
    card("amazfit-active-edge-46mm", "Active Edge 46mm", "watch", 5, 1, aliases=["Amazfit Active Edge 46mm", "Active Edge 46mm", "Amazfit Active Edge"]),
    card("amazfit-up", "UP", "earbuds", 5, 2, name_zh="Amazfit UP 开放式耳机", aliases=["Amazfit UP", "Amazfit Up Open-Ear Earbuds", "UP Open-Ear Earbuds"]),
    card("amazfit-bip-5-unity-46mm", "Bip 5 Unity 46mm", "watch", 5, 3, aliases=["Amazfit Bip 5 Unity 46mm", "Bip 5 Unity 46mm", "Amazfit Bip 5 Unity"]),
    card("amazfit-active-42mm", "Active 42mm", "watch", 5, 4, canonical_device_key="amazfit-active", variant="42mm", aliases=["Amazfit Active 42mm", "Active 42mm", "Amazfit Active"]),
    card("amazfit-bip-5-46mm", "Bip 5 46mm", "watch", 6, 1, canonical_device_key="amazfit-bip-5", variant="46mm", aliases=["Amazfit Bip 5 46mm", "Bip 5 46mm", "Amazfit Bip 5"]),
    card("amazfit-cheetah-pro-47mm", "Cheetah Pro 47mm", "watch", 6, 2, canonical_device_key="amazfit-cheetah-pro", variant="47mm", aliases=["Amazfit Cheetah Pro 47mm", "Cheetah Pro 47mm", "Amazfit Cheetah Pro"]),
    card("amazfit-cheetah-47mm", "Cheetah 47mm", "watch", 6, 3, variant="47mm"),
    card("amazfit-falcon-49mm", "Falcon 49mm", "watch", 6, 4, canonical_device_key="amazfit-falcon", variant="49mm", aliases=["Amazfit Falcon 49mm", "Falcon 49mm", "Amazfit Falcon"]),
    card("amazfit-t-rex-ultra-47mm", "T-Rex Ultra 47mm", "watch", 7, 1, canonical_device_key="amazfit-t-rex-ultra", variant="47mm", aliases=["Amazfit T-Rex Ultra 47mm", "T-Rex Ultra 47mm", "Amazfit T-Rex Ultra"]),
    card("amazfit-gtr-mini-43mm", "GTR Mini 43mm", "watch", 7, 2, variant="43mm"),
    card("amazfit-bip-3", "Bip 3", "watch", 7, 3),
    card("amazfit-gts-4-43mm", "GTS 4 43mm", "watch", 7, 4, variant="43mm"),
    card("amazfit-gtr-4-46mm", "GTR 4 46mm", "watch", 8, 1, variant="46mm", aliases=["Amazfit GTR 4 46mm", "GTR 4 46mm", "Amazfit GTR 4"]),
    card("amazfit-band-7", "Band 7", "band", 8, 2),
    card("amazfit-gts-4-mini", "GTS 4 Mini", "watch", 8, 3, variant="online exclusive", aliases=["Amazfit GTS 4 Mini", "GTS 4 Mini", "Amazfit GTS 4 Mini Online Exclusive"]),
    card("amazfit-bip-3-pro", "Bip 3 Pro", "watch", 8, 4),
    card("amazfit-gts-2-new-43mm", "GTS 2 new 43mm", "watch", 9, 1, variant="new 43mm", aliases=["Amazfit GTS 2 new 43mm", "GTS 2 new 43mm", "Amazfit GTS 2 New"]),
    card(
        "amazfit-gtr-4-46mm-black",
        "GTR 4 46mm Black",
        "watch",
        9,
        2,
        asset_key="amazfit-gtr-4-46mm",
        canonical_device_key="amazfit-gtr-4-46mm",
        variant="black colour",
        merge_relation="同一 GTR 4 46mm 规范型号的颜色变体；与第 29 卡共享素材，不计为新增 canonical 型号",
        aliases=["Amazfit GTR 4 46mm Black", "GTR 4 46mm Black", "Amazfit GTR 4 Black"],
    ),
    card("amazfit-t-rex-2-47mm", "T-Rex 2 47mm", "watch", 9, 3, variant="47mm"),
    card("amazfit-gtr-2-new-46mm", "GTR 2 new 46mm", "watch", 9, 4, variant="new 46mm", aliases=["Amazfit GTR 2 new 46mm", "GTR 2 new 46mm", "Amazfit GTR 2 New"]),
    card("amazfit-gts-3-42mm", "GTS 3 42mm", "watch", 10, 1, variant="42mm"),
    card("amazfit-gtr-3-46mm", "GTR 3 46mm", "watch", 10, 2, variant="46mm"),
    card("amazfit-gtr-3-pro-46mm", "GTR 3 Pro 46mm", "watch", 10, 3, variant="46mm"),
    card("amazfit-gtr-2e", "GTR 2e", "watch", 10, 4),
    card("amazfit-gts-2e", "GTS 2e", "watch", 11, 1),
    card("amazfit-t-rex-pro", "T-Rex Pro", "watch", 11, 2),
    card("amazfit-bip-u-series", "Bip U series", "watch", 11, 3, aliases=["Amazfit Bip U series", "Bip U series", "Amazfit Bip U"]),
    card("amazfit-gts", "GTS", "watch", 11, 4),
    card("amazfit-gts-2", "GTS 2", "watch", 12, 1),
    card("amazfit-gts-2-mini", "GTS 2 mini", "watch", 12, 2),
    card("amazfit-gtr-42mm", "GTR 42mm", "watch", 12, 3, variant="42mm"),
    card("amazfit-band-5", "Band 5", "band", 12, 4),
]


EXTRAS: list[dict[str, Any]] = [
    {
        "catalog_id": "amazfit-helio-strap-pro",
        "canonical_name": "Amazfit Helio Strap Pro",
        "display_name": "Amazfit Helio Strap Pro",
        "name_zh": "Amazfit Helio Strap Pro",
        "kind": "strap",
        "model_codes": [],
        "aliases": ["Amazfit Helio Strap Pro", "Helio Strap Pro"],
        "region": ["global", "us"],
        "official_page": "https://us.amazfit.com/products/helio-strap-pro",
        "official_url": "https://us.amazfit.com/products/helio-strap-pro",
        "image_source_url": "https://cdn.shopify.com/s/files/1/0406/4500/1379/files/HSP_Gallery_1_opt.jpg?v=1781810291",
        "asset_key": "amazfit-helio-strap-pro",
        "asset_source": "official-cdn",
        "canonical_device_key": "amazfit-helio-strap-pro",
        "provenance": "Official Amazfit US product page/CDN checked 2026-08-15; downloaded at maintenance time and background-removed to local RGBA WebP. Bundled as internal/local product-reference art pending release-license review.",
    },
    {
        "catalog_id": "amazfit-helio-core",
        "canonical_name": "Amazfit Helio Core",
        "display_name": "Amazfit Helio Core",
        "name_zh": "Amazfit Helio Core",
        "kind": "strap",
        "model_codes": [],
        "aliases": ["Amazfit Helio Core", "Helio Core"],
        "region": ["global", "us"],
        "official_page": "https://us.amazfit.com/products/helio-core",
        "official_url": "https://us.amazfit.com/products/helio-core",
        "image_source_url": "https://cdn.shopify.com/s/files/1/0406/4500/1379/files/Frame47972.jpg?v=1766569128",
        "asset_key": "amazfit-helio-core",
        "asset_source": "official-cdn",
        "canonical_device_key": "amazfit-helio-core",
        "provenance": "Official Amazfit US product page/CDN checked 2026-08-15; downloaded at maintenance time and background-removed to local RGBA WebP. Bundled as internal/local product-reference art pending release-license review.",
    },
    {
        "catalog_id": "amazfit-helio-armband",
        "canonical_name": "Amazfit Helio Armband",
        "display_name": "Amazfit Helio Armband",
        "name_zh": "Amazfit Helio 臂带",
        "kind": "strap",
        "model_codes": [],
        "aliases": ["Amazfit Helio Armband", "Helio Armband", "Helio Arm Strap"],
        "region": ["global", "us"],
        "official_page": "https://us.amazfit.com/products/helio-arm-bands",
        "official_url": "https://us.amazfit.com/products/helio-arm-bands",
        "image_source_url": "https://cdn.shopify.com/s/files/1/0406/4500/1379/files/Frame47963_900eac98-b7cb-4b3b-9d68-53e73f1a3919.jpg?v=1754537296",
        "asset_key": "amazfit-helio-armband",
        "asset_source": "official-cdn",
        "canonical_device_key": "amazfit-helio-armband",
        "status": "accessory",
        "supported": False,
        "provenance": "Official Amazfit US product page/CDN checked 2026-08-15; downloaded at maintenance time and background-removed to local RGBA WebP. Bundled as internal/local product-reference art pending release-license review.",
    },
    {
        "catalog_id": "amazfit-helio-ring",
        "canonical_name": "Amazfit Helio Ring",
        "display_name": "Amazfit Helio Ring",
        "name_zh": "Amazfit Helio Ring",
        "kind": "ring",
        "model_codes": ["A2321"],
        "aliases": ["Amazfit Helio Ring", "Helio Ring", "Amazfit Helio Smart Ring"],
        "region": ["global", "us", "cn", "tw"],
        "official_page": "https://us.amazfit.com/products/amazfit-helio-ring",
        "official_url": "https://us.amazfit.com/products/amazfit-helio-ring",
        "image_source_url": "https://cdn.shopify.com/s/files/1/0406/4500/1379/files/galaxyfront.jpg?v=1716349460",
        "asset_key": "amazfit-helio-ring",
        "asset_source": "official-cdn",
        "canonical_device_key": "amazfit-helio-ring",
        "provenance": "Official Amazfit US product page/CDN checked 2026-08-15; downloaded at maintenance time and background-removed to local RGBA WebP. Bundled as internal/local product-reference art pending release-license review.",
    },
]


def edge_connected_background(rgb: np.ndarray) -> np.ndarray:
    """Return edge-connected neutral background, retaining enclosed light products."""
    channels = rgb.astype(np.int16)
    minimum = channels.min(axis=2)
    maximum = channels.max(axis=2)
    neutral = ((maximum - minimum) <= 38) & (minimum >= 70)
    neutral = cv2.morphologyEx(neutral.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(neutral, 8)
    background = np.zeros(neutral.shape, dtype=bool)
    height, width = neutral.shape
    for index in range(1, count):
        x, y, component_width, component_height, _ = stats[index]
        if x == 0 or y == 0 or x + component_width == width or y + component_height == height:
            background[labels == index] = True
    background |= ((maximum - minimum) <= 24) & (minimum >= 246)
    return background


def remove_component_noise(mask: np.ndarray, rgb: np.ndarray | None = None) -> np.ndarray:
    """Keep the main product and nearby detached straps, dropping badges."""
    binary = (mask > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count <= 1:
        return binary.astype(bool)
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    main_x, main_y, main_w, main_h, main_area = stats[largest]
    margin = max(24, round(max(main_w, main_h) * 0.12))
    keep = np.zeros(binary.shape, dtype=bool)
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if index == largest:
            keep[labels == index] = True
            continue
        gap_x = max(main_x - (x + width), x - (main_x + main_w), 0)
        gap_y = max(main_y - (y + height), y - (main_y + main_h), 0)
        if gap_x > margin or gap_y > margin or area < max(120, main_area * 0.015):
            continue
        if rgb is not None:
            pixels = rgb[labels == index].astype(np.int16)
            mean_min = float(pixels.min(axis=1).mean())
            mean_sat = float((pixels.max(axis=1) - pixels.min(axis=1)).mean())
            # A broad neutral strip is a store shadow/stand, not a product.
            if mean_min >= 180 and mean_sat <= 38 and (width >= height * 2.8 or height >= width * 2.8):
                continue
            # Tiny vivid components are badge fragments or capture artefacts.
            if area < main_area * 0.012 and mean_sat > 70:
                continue
        keep[labels == index] = True
    return keep


def remove_near_white(image: Image.Image) -> Image.Image:
    """Remove the white store/CDN background while preserving light products."""

    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3].astype(np.int16)
    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    neutral = (maximum - minimum) <= 12
    # Screenshot antialiasing can leave an almost-white one-pixel frame.  It is
    # safer to make that frame transparent than to retain a visible rectangle;
    # product straps and light watch cases remain well below this threshold.
    fully_white = neutral & (minimum >= 247)
    fade = neutral & (minimum >= 239) & ~fully_white
    alpha[fully_white] = 0
    alpha[fade] = np.minimum(alpha[fade], ((247 - minimum[fade]) * 28).clip(0, 255))
    rgba[:, :, 3] = alpha.clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def remove_border_neutral_background(image: Image.Image) -> Image.Image:
    """Drop gray/white drop-shadows that remain connected to the crop edge."""

    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3].astype(np.int16)
    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    # Store captures use neutral white/gray shadows.  Restrict the flood-fill
    # to neutral pixels touching an edge so bright screens and silver cases
    # enclosed by a dark bezel remain intact.
    neutral_background = ((maximum - minimum) <= 32) & (minimum >= 120)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(neutral_background.astype(np.uint8), 8)
    for index in range(1, count):
        x, y, width, height, _ = stats[index]
        touches_edge = x == 0 or y == 0 or x + width == image.width or y + height == image.height
        if touches_edge:
            rgba[labels == index, 3] = 0
    return Image.fromarray(rgba, "RGBA")


def grabcut_foreground(image: Image.Image) -> Image.Image:
    """Segment a white-background product without global colour thresholding."""

    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3]
    height, width = rgb.shape[:2]
    if width < 32 or height < 32:
        return image.convert("RGBA")

    channels = rgb.astype(np.int16)
    minimum = channels.min(axis=2)
    maximum = channels.max(axis=2)
    saturation = maximum - minimum

    # Build a tight initial rectangle from dark/coloured product pixels. This
    # excludes the gray page shadow that can be connected to the outer crop,
    # while the generous expansion keeps silver cases and white straps.
    core = ((minimum < 190) | (saturation > 35)).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    candidates: list[tuple[int, tuple[int, int, int, int]]] = []
    center_x, center_y = width / 2, height / 2
    for index in range(1, count):
        x, y, component_width, component_height, area = stats[index]
        if area < max(80, width * height * 0.004):
            continue
        component_center_x = x + component_width / 2
        component_center_y = y + component_height / 2
        distance = abs(component_center_x - center_x) / max(1, width) + abs(component_center_y - center_y) / max(1, height)
        candidates.append((int(area * (1.0 - min(0.8, distance))), (int(x), int(y), int(x + component_width), int(y + component_height))))
    if candidates:
        _, bounds = max(candidates, key=lambda item: item[0])
        x0, y0, x1, y1 = bounds
        # Include detached straps that line up with the main case. They are
        # often separate dark components on white cards (notably Active 2
        # Square), while award badges sit to the side and are excluded.
        for _, candidate_bounds in candidates:
            cx0, cy0, cx1, cy1 = candidate_bounds
            overlap_x = max(0, min(x1, cx1) - max(x0, cx0))
            min_width = max(1, min(x1 - x0, cx1 - cx0))
            gap_y = max(y0 - cy1, cy0 - y1, 0)
            if overlap_x / min_width >= 0.25 and gap_y <= height * 0.18:
                x0, y0 = min(x0, cx0), min(y0, cy0)
                x1, y1 = max(x1, cx1), max(y1, cy1)
        pad = max(24, round(max(x1 - x0, y1 - y0) * 0.11))
        x0, y0 = max(1, x0 - pad), max(1, y0 - pad)
        x1, y1 = min(width - 1, x1 + pad), min(height - 1, y1 + pad)
    else:
        x0, y0, x1, y1 = 1, 1, width - 1, height - 1

    mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    strong = (minimum < 120) | (saturation > 55)
    strong[:y0, :] = False
    strong[y1:, :] = False
    strong[:, :x0] = False
    strong[:, x1:] = False
    mask[strong] = cv2.GC_FGD

    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(rgb, mask, None, background_model, foreground_model, 5, cv2.GC_INIT_WITH_MASK)
    foreground = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    # GrabCut can keep a one-pixel white rim around dark products because the
    # initial rectangle deliberately contains a little padding. Erode only
    # bright neutral pixels that touch the outside; enclosed white displays
    # and pale straps are not affected.
    for _ in range(3):
        outside = ~foreground
        boundary = foreground & (cv2.dilate(outside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
        light = (minimum >= 205) & (saturation <= 42)
        foreground[boundary & light] = False
    foreground = remove_component_noise(foreground, rgb)
    rgba[:, :, 3] = np.where(foreground, 255, 0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def trim_alpha(image: Image.Image, padding: int = 18) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("image has no visible alpha after background removal")
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def remove_large_white_hole(image: Image.Image) -> Image.Image:
    """Remove the enclosed white centre of the Helio Ring source.

    Unlike a watch display, the ring's centre is physically empty and must stay
    transparent. It is a large, neutral, enclosed component after GrabCut;
    small highlights and pale product details are left untouched.
    """

    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3]
    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    white = (alpha > 0) & ((maximum - minimum) <= 28) & (minimum >= 220)
    # The CDN hero image includes a broad white display stand under the ring.
    # It is not part of the product and is easy to identify by its wide,
    # neutral rows near the bottom of the crop.
    bottom_start = round(image.height * 0.68)
    for y in range(bottom_start, image.height):
        visible = alpha[y] > 8
        if not visible.any():
            continue
        row_rgb = rgb[y]
        neutral_bright = visible & ((row_rgb.max(axis=1) - row_rgb.min(axis=1)) <= 35) & (row_rgb.min(axis=1) >= 150)
        if neutral_bright.sum() >= image.width * 0.28:
            alpha[y, :] = 0
    count, labels, stats, _ = cv2.connectedComponentsWithStats(white.astype(np.uint8), 8)
    visible = max(1, int((alpha > 8).sum()))
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if area < visible * 0.04 or area < 500:
            continue
        touches_edge = x == 0 or y == 0 or x + width == image.width or y + height == image.height
        if touches_edge:
            continue
        # The ring opening is tall and wide; tiny white specular patches are
        # rejected by the area/aspect checks.
        ratio = width / max(1, height)
        if 0.18 <= ratio <= 5.5:
            alpha[labels == index] = 0
    # Any remaining tiny component is a shadow/stand fragment; the ring body
    # itself is the only substantial visible component after the centre hole is
    # removed.
    component_count, component_labels, component_stats, _ = cv2.connectedComponentsWithStats((alpha > 8).astype(np.uint8), 8)
    if component_count > 2:
        largest = 1 + int(np.argmax(component_stats[1:, cv2.CC_STAT_AREA]))
        largest_area = component_stats[largest, cv2.CC_STAT_AREA]
    for index in range(1, component_count):
        if index != largest and component_stats[index, cv2.CC_STAT_AREA] < largest_area * 0.02:
            alpha[component_labels == index] = 0

    # The same CDN frame has a thin, detached white stand/shadow line below
    # the ring.  Its pixels are neutral and wide but disconnected from the
    # ring body; remove only bottom components with a clearly horizontal
    # footprint so the pale metal rim remains intact.
    stand_mask = (alpha > 8) & (minimum >= 180) & ((maximum - minimum) <= 45)
    stand_count, stand_labels, stand_stats, _ = cv2.connectedComponentsWithStats(stand_mask.astype(np.uint8), 8)
    for index in range(1, stand_count):
        x, y, width, height, area = stand_stats[index]
        if y < image.height * 0.82 or area < 40 or width < 28 or height > 32:
            continue
        if width / max(1, height) < 1.8:
            continue
        alpha[stand_labels == index] = 0
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def remove_gts4_mini_white_hole(image: Image.Image) -> Image.Image:
    """Remove the enclosed white card background between the GTS 4 Mini straps."""

    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3]
    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    neutral = (alpha > 8) & (minimum >= 200) & ((maximum - minimum) <= 42)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(neutral.astype(np.uint8), 8)
    visible = max(1, int((alpha > 8).sum()))
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if area < max(400, visible * 0.04) or height < width * 1.8:
            continue
        if x <= 0 or y <= 0 or x + width >= image.width or y + height >= image.height:
            continue
        # The strap opening is a tall, enclosed card-white component.  Keep
        # small neutral highlights and the watch's pale hardware untouched.
        alpha[labels == index] = 0
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def decontaminate_white_halo(image: Image.Image) -> Image.Image:
    """Fade white source bleed at a product edge without eroding metal details."""

    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    alpha = rgba[:, :, 3].astype(np.uint8)
    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    saturation = maximum - minimum
    # First discard neutral near-white components that touch transparent
    # outside pixels. This catches a broad GrabCut fringe even when it is more
    # than three pixels thick; dark textile and the gray buckle stay intact.
    neutral = (alpha > 8) & (minimum >= 205) & (saturation <= 60)
    neutral_count, neutral_labels, neutral_stats, _ = cv2.connectedComponentsWithStats(neutral.astype(np.uint8), 8)
    visible = alpha > 8
    outside = ~visible
    outside_neighbour = cv2.dilate(outside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    for index in range(1, neutral_count):
        component = neutral_labels == index
        if np.any(component & outside_neighbour):
            alpha[component] = 0
    for _ in range(6):
        visible = alpha > 8
        outside = ~visible
        boundary = visible & (cv2.dilate(outside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
        neutral = boundary & (saturation <= 55) & (minimum >= 185)
        # White/near-white antialias pixels are background contamination; a
        # gradual cap avoids cutting pale metal below the 185 threshold while
        # still fading the gray fringe that remains after the hard pass.
        cap = np.clip((195 - minimum[neutral]) * 17, 0, 255).astype(np.uint8)
        alpha[neutral] = np.minimum(alpha[neutral], cap)
    rgba[:, :, 3] = alpha
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def normalize_asset(
    image: Image.Image,
    *,
    keep_largest_component: bool = False,
    use_grabcut: bool = False,
    preserve_centre_hole: bool = False,
    remove_watch_hole: bool = False,
    decontaminate_halo: bool = False,
) -> Image.Image:
    # All current sources are white-background captures/CDN images. Always use
    # the conservative edge-connected/GrabCut path; the old global near-white
    # threshold created the gray bars and erased pale product surfaces.
    source = image.convert("RGBA")
    segmentation_scale = min(1.0, 1400 / max(source.width, source.height))
    if segmentation_scale < 1:
        source = source.resize(
            (round(source.width * segmentation_scale), round(source.height * segmentation_scale)),
            Image.Resampling.LANCZOS,
        )
    image = grabcut_foreground(source)
    image = trim_alpha(image.convert("RGBA"))
    if keep_largest_component:
        rgba = np.asarray(image).copy()
        mask = (rgba[:, :, 3] > 8).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        if count > 1:
            largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            main_x, main_y, main_w, main_h, main_area = stats[largest]
            margin = max(24, round(max(main_w, main_h) * 0.08))
            for index in range(1, count):
                if index == largest:
                    continue
                x, y, width, height, area = stats[index]
                gap_x = max(main_x - (x + width), x - (main_x + main_w), 0)
                gap_y = max(main_y - (y + height), y - (main_y + main_h), 0)
                close_to_main = gap_x <= margin * 3 and gap_y <= margin * 3
                substantial = area >= max(180, main_area * 0.05)
                if not (close_to_main and substantial):
                    rgba[labels == index, 3] = 0
            image = trim_alpha(Image.fromarray(rgba, "RGBA"), padding=18)
    if preserve_centre_hole:
        image = remove_large_white_hole(image)
    if remove_watch_hole:
        image = remove_gts4_mini_white_hole(image)
    scale = min(1.0, 900 / max(image.width, image.height))
    if scale < 1:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    # Do not retain source-white/gray RGB in transparent pixels. Some image
    # viewers and GPU paths inspect RGB before applying alpha, which would make
    # an otherwise transparent background appear as bars or stripes.
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    image = Image.fromarray(rgba, "RGBA")
    if decontaminate_halo:
        image = decontaminate_white_halo(image)
    return image


def extract_card(path: Path, column: int) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    left = width * column // 4
    right = width * (column + 1) // 4
    crop_height = round(height * 0.82)
    crop = image.crop((left, 0, right, crop_height))
    rgb = np.asarray(crop.convert("RGB"))
    mask = (np.min(rgb, axis=2) < 245).astype(np.uint8) * 255
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    candidates = []
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        center = x + width / 2
        if area >= 15_000 and 0.12 * crop.width < center < 0.88 * crop.width:
            candidates.append((int(area), (int(x), int(y), int(x + width), int(y + height))))
    if not candidates:
        raise ValueError(f"no product component found in {path.name} column {column + 1}")
    _, bounds = max(candidates, key=lambda item: item[0])
    left, top, right, bottom = bounds
    left = max(0, left - 18)
    top = max(0, top - 18)
    right = min(crop.width, right + 18)
    bottom = min(crop.height, bottom + 18)
    return crop.crop((left, top, right, bottom))


def download_image(url: str) -> Image.Image:
    request = urllib.request.Request(url, headers={"User-Agent": "ZeppBridge device catalog maintenance"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return Image.open(io.BytesIO(response.read())).convert("RGBA")


def crop_extra_source(key: str, image: Image.Image) -> Image.Image:
    """Crop multi-product CDN collages to the named accessory.

    Helio Core and Helio Armband gallery files place a second charger/device to
    the right of the strap. Keeping that collage edge produced gray bars in the
    bundled art, so these two maintenance-time crops deliberately select the
    strap itself while retaining generous padding.
    """

    boxes = {
        "amazfit-helio-core": (0.30, 0.02, 0.56, 0.98),
        "amazfit-helio-armband": (0.36, 0.00, 0.64, 1.00),
    }
    box = boxes.get(key)
    if box is None:
        return image
    width, height = image.size
    left, top, right, bottom = box
    cropped = image.crop((round(width * left), round(height * top), round(width * right), round(height * bottom)))
    # Keep enough white source margin for trim_alpha() to leave transparent
    # padding even when the photographed strap reaches the gallery edge.
    return ImageOps.expand(cropped, border=32, fill=(255, 255, 255, 255))


def write_asset(
    image: Image.Image,
    key: str,
    *,
    use_grabcut: bool = False,
    keep_largest_component: bool = True,
) -> str:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    image = normalize_asset(
        image,
        keep_largest_component=keep_largest_component,
        use_grabcut=use_grabcut,
        preserve_centre_hole=key == "amazfit-helio-ring",
        remove_watch_hole=key == "amazfit-gts-4-mini",
        decontaminate_halo=key == "amazfit-helio-strap-pro",
    )
    webp_path = ASSET_DIR / f"{key}.webp"
    thumb_path = ASSET_DIR / f"{key}-thumb.png"
    # ``exact=True`` is important for transparent RGB: without it libwebp can
    # bleed source-white/gray colours into alpha-zero pixels on decode, which
    # reappears as bars in some GPU/viewer paths.
    image.save(webp_path, "WEBP", lossless=True, method=6, exact=True)
    thumb = image.copy()
    thumb.thumbnail((240, 240), Image.Resampling.LANCZOS)
    thumb.save(thumb_path, "PNG", optimize=True)
    digest = hashlib.sha256(webp_path.read_bytes()).hexdigest().upper()
    return f"sha256:{digest}"


def enrich_entry(entry: dict[str, Any], hash_value: str) -> dict[str, Any]:
    entry = dict(entry)
    entry["asset_hash"] = hash_value
    entry["image_key"] = entry.pop("asset_key")
    entry["asset_source"] = entry.get("asset_source", "screenshot-derived")
    entry.setdefault("status", "active")
    entry.setdefault("supported", True)
    entry.setdefault("region", ["global"])
    entry["checked_at"] = CHECKED_AT
    return entry


def build_catalog() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-official", action="store_true", help="download the four extra official CDN images")
    args = parser.parse_args()

    hashes: dict[str, str] = {}
    # One physical image per canonical asset key; the GTR 4 colour card shares
    # the standard GTR 4 image as documented in the audit relation.
    for entry in CARDS:
        key = entry["asset_key"]
        if key in hashes:
            continue
        screenshot = SCREENSHOT_DIR / SCREENSHOTS[entry["screenshot_card"]["row"] - 1]
        image = extract_card(screenshot, entry["screenshot_card"]["column"] - 1)
        hashes[key] = write_asset(image, key, use_grabcut=False, keep_largest_component=True)

    for entry in EXTRAS:
        key = entry["asset_key"]
        target = ASSET_DIR / f"{key}.webp"
        if args.refresh_official or not target.exists():
            image = download_image(entry["image_source_url"])
            image = crop_extra_source(key, image)
            hashes[key] = write_asset(image, key, use_grabcut=False, keep_largest_component=False)
        else:
            hashes[key] = f"sha256:{hashlib.sha256(target.read_bytes()).hexdigest().upper()}"

    devices = [enrich_entry(entry, hashes[entry["asset_key"]]) for entry in [*CARDS, *EXTRAS]]
    # EXTRAS 是手写的条目，不经过 card()，所以在这里统一补一次。
    for device in devices:
        device.setdefault("device_source_codes", DEVICE_SOURCE_CODES.get(device["catalog_id"], []))
    unknown = sorted(set(DEVICE_SOURCE_CODES) - {device["catalog_id"] for device in devices})
    if unknown:
        raise SystemExit(f"DEVICE_SOURCE_CODES 指向了目录里没有的型号: {unknown}")
    document = {
        "version": 3,
        "checked_at": CHECKED_AT,
        "sources": [
            "https://www.amazfit.jp/",
            "https://us.amazfit.com/products.json?limit=250",
            "https://os.zepp.com/compatibility-zepp-os-5",
        ],
        "audit_baseline": "Official Amazfit Japan store captures in design_picture/Product (12 rows x 4 cards)",
        "active_supported_count": sum(1 for device in devices if device.get("supported") and device["status"] == "active"),
        "canonical_device_count": len({device["canonical_device_key"] for device in devices if device.get("supported") and device["status"] == "active"}),
        "devices": devices,
    }
    CATALOG_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    audit = []
    for order, entry in enumerate(CARDS, 1):
        card_info = entry["screenshot_card"]
        audit.append(
            {
                "card_order": order,
                "row": card_info["row"],
                "column": card_info["column"],
                "display_name": card_info["display_name"],
                "variant": card_info["variant"],
                "merge_relation": card_info["merge_relation"],
                "catalog_id": entry["catalog_id"],
                "canonical_device_key": entry["canonical_device_key"],
                "asset_key": entry["asset_key"],
                "asset_source": entry["asset_source"],
                "source_capture": entry["image_source_url"],
            }
        )
    AUDIT_JSON_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with AUDIT_CSV_PATH.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(audit[0]))
        writer.writeheader()
        writer.writerows(audit)

    print(f"DEVICE_CATALOG_BUILT entries={len(devices)} active_supported={document['active_supported_count']} canonical={document['canonical_device_count']} assets={len(hashes)}")


if __name__ == "__main__":
    build_catalog()
