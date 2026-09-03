"""Verify the local device catalog, transparent art, and 48-card audit.

This gate is intentionally offline: it never trusts a runtime URL and checks
the bundled WebP/PNG bytes and catalog hashes instead.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "src" / "assets" / "devices" / "catalog.json"
ASSET_DIR = CATALOG_PATH.parent
AUDIT_PATH = ROOT / "docs" / "reference" / "device-catalog-audit.json"
EXPECTED_ENTRY_COUNT = 53
EXPECTED_SUPPORTED_COUNT = 52
EXPECTED_CANONICAL_COUNT = 50
# 资源数比条目数少两个：GTR 4 的配色卡和标准款共用一张图（见 audit 里的
# merge relation），而 Balance 2 XT 还没有产品图（issue #42，见下面的
# `image_key is None` 分支）。
EXPECTED_ASSET_COUNT = 51


def normalized(value: str) -> str:
    return re.sub(r"[^\w\d]+", "", value.casefold(), flags=re.UNICODE)


def fail(message: str) -> None:
    raise SystemExit(f"DEVICE_ASSET_VERIFY_FAIL {message}")


def check_image_quality(path: Path, *, kind: str, catalog_id: str) -> None:
    """Run conservative visual-quality checks on one bundled RGBA asset."""

    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3].astype(np.int16)
    height, width = alpha.shape
    foreground = alpha > 8
    bbox = Image.fromarray(alpha).getbbox()
    if bbox is None:
        fail(f"{catalog_id} has no visible pixels")
    left, top, right, bottom = bbox
    # Every generated asset is cropped with transparent padding. A one-pixel
    # accidental crop would make the product look glued to its card edge.
    padding = min(left, top, width - right, height - bottom)
    if padding < 8:
        fail(f"{catalog_id} insufficient transparent padding bbox={bbox} size={(width, height)}")
    border = np.concatenate([alpha[:2].ravel(), alpha[-2:].ravel(), alpha[:, :2].ravel(), alpha[:, -2:].ravel()])
    if (border == 0).mean() < 0.995:
        fail(f"{catalog_id} edge alpha residual={(border > 0).mean():.3f}")

    minimum = rgb.min(axis=2)
    maximum = rgb.max(axis=2)
    saturation = maximum - minimum
    near_neutral = foreground & (minimum >= 180) & (saturation <= 35)
    # A large edge-connected neutral component is the signature of the old
    # gray/white rectangular background failure. Product highlights and white
    # screens are enclosed and therefore do not touch the alpha bbox border.
    yy, xx = np.indices(alpha.shape)
    bbox_border = (xx <= left + 4) | (xx >= right - 5) | (yy <= top + 4) | (yy >= bottom - 5)
    residual_ratio = float((near_neutral & bbox_border).sum()) / max(1, int(foreground.sum()))
    if residual_ratio > 0.12:
        fail(f"{catalog_id} neutral edge/background residual={residual_ratio:.3f}")

    # Tiny high-saturation islands are common after a bad JPEG/GrabCut pass
    # (the previous ring output had red/yellow speckle). Legitimate coloured
    # dial details are connected and do not trip this ratio.
    saturated = (saturation > 100) & foreground
    count, labels, stats, _ = cv2.connectedComponentsWithStats(saturated.astype(np.uint8), 8)
    tiny_area = 0
    for index in range(1, count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        if area < max(30, int(foreground.sum() * 0.002)):
            tiny_area += area
    tiny_ratio = tiny_area / max(1, int(foreground.sum()))
    if tiny_ratio > 0.08:
        fail(f"{catalog_id} saturated noise ratio={tiny_ratio:.3f}")

    # Watches should not have a large enclosed alpha hole; strap/ring/band
    # products intentionally contain openings and are exempt. The GTS 4 Mini
    # is a watch-shaped strap whose central opening is also intentional after
    # removing the source card's white background.
    intentional_opening = catalog_id in {"amazfit-gts-4-mini"}
    if kind not in {"strap", "ring", "band"} and not intentional_opening:
        holes = (alpha == 0).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(holes, 8)
        largest_inner_hole = 0
        for index in range(1, count):
            x, y, hole_width, hole_height, area = stats[index]
            if x > 0 and y > 0 and x + hole_width < width and y + hole_height < height:
                largest_inner_hole = max(largest_inner_hole, int(area))
        if largest_inner_hole / max(1, int(foreground.sum())) > 0.06:
            fail(f"{catalog_id} unreasonable enclosed alpha hole={largest_inner_hole}")


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    entries = catalog.get("devices")
    if not isinstance(entries, list):
        fail("catalog.devices is not an array")
    active = [entry for entry in entries if entry.get("supported") is True and entry.get("status") == "active"]
    canonical = {entry.get("canonical_device_key", entry.get("catalog_id")) for entry in active}
    if len(entries) != EXPECTED_ENTRY_COUNT:
        fail(f"catalog entries={len(entries)}, expected {EXPECTED_ENTRY_COUNT}")
    if len(active) != EXPECTED_SUPPORTED_COUNT:
        fail(f"supported active entries={len(active)}, expected {EXPECTED_SUPPORTED_COUNT}")
    if len(canonical) != EXPECTED_CANONICAL_COUNT:
        fail(f"supported canonical models={len(canonical)}, expected {EXPECTED_CANONICAL_COUNT}")

    ids: dict[str, list[str]] = defaultdict(list)
    aliases: dict[str, list[str]] = defaultdict(list)
    model_codes: dict[str, list[str]] = defaultdict(list)
    for entry in entries:
        catalog_id = entry.get("catalog_id")
        if not isinstance(catalog_id, str) or not catalog_id:
            fail("entry has empty catalog_id")
        ids[normalized(catalog_id)].append(catalog_id)
        for alias in entry.get("aliases", []):
            if not isinstance(alias, str) or not alias.strip():
                fail(f"{catalog_id} has empty alias")
            aliases[normalized(alias)].append(catalog_id)
        for model_code in entry.get("model_codes", []):
            if not isinstance(model_code, str) or not model_code.strip():
                fail(f"{catalog_id} has empty model code")
            model_codes[normalized(model_code)].append(catalog_id)

        for field in ("canonical_name", "display_name", "name_zh", "kind", "official_page", "asset_source", "provenance", "checked_at"):
            if not entry.get(field):
                fail(f"{catalog_id} missing {field}")
        key = entry.get("image_key")
        # 没有产品图的条目是合法的，但两个字段必须一起缺：只缺一个说明有人手改
        # 漏了半边，那会让下面的哈希核对静默跳过一款真有图的表。
        if key is None or entry.get("asset_hash") is None:
            if key is not None or entry.get("asset_hash") is not None:
                fail(f"{catalog_id} has half of an image pair (image_key={key!r} asset_hash={entry.get('asset_hash')!r})")
            # 型号是真的，只是官方还没有可下载的产品图；界面渲染内联 SVG 占位。
            # 见 build-device-catalog.py 里 Balance 2 XT 那条的注释。
            if entry.get("asset_source") != "pending-official-art":
                fail(f"{catalog_id} has no art but asset_source={entry.get('asset_source')!r}, expected pending-official-art")
            continue
        if not isinstance(key, str) or not key:
            fail(f"{catalog_id} missing image_key")
        if not entry.get("asset_hash"):
            fail(f"{catalog_id} missing asset_hash")
        webp = ASSET_DIR / f"{key}.webp"
        thumb = ASSET_DIR / f"{key}-thumb.png"
        if not webp.is_file() or not thumb.is_file():
            fail(f"{catalog_id} missing asset pair for {key}")
        digest = f"sha256:{hashlib.sha256(webp.read_bytes()).hexdigest().upper()}"
        if digest != entry["asset_hash"]:
            fail(f"{catalog_id} hash mismatch expected={entry['asset_hash']} actual={digest}")
        for path, minimum in ((webp, 120), (thumb, 40)):
            image = Image.open(path)
            if image.mode != "RGBA":
                fail(f"{path.name} mode={image.mode}, expected RGBA")
            if min(image.size) < minimum:
                fail(f"{path.name} size={image.size} is too small")
            alpha = image.getchannel("A")
            if alpha.getbbox() is None:
                fail(f"{path.name} has no visible pixels")
            if all(value > 0 for value in alpha.getdata()):
                fail(f"{path.name} has no transparent background")
        check_image_quality(webp, kind=str(entry.get("kind", "")), catalog_id=catalog_id)

    duplicate_ids = {key: values for key, values in ids.items() if len(values) > 1}
    duplicate_aliases = {key: values for key, values in aliases.items() if len(set(values)) > 1}
    duplicate_codes = {key: values for key, values in model_codes.items() if len(set(values)) > 1}
    if duplicate_ids:
        fail(f"duplicate ids={duplicate_ids}")
    if duplicate_aliases:
        fail(f"alias collision={duplicate_aliases}")
    if duplicate_codes:
        fail(f"model code collision={duplicate_codes}")

    image_keys = {entry["image_key"] for entry in entries if entry.get("image_key")}
    webp_keys = {path.stem for path in ASSET_DIR.glob("*.webp")}
    thumb_keys = {path.name.removesuffix("-thumb.png") for path in ASSET_DIR.glob("*-thumb.png")}
    if len(image_keys) != EXPECTED_ASSET_COUNT:
        fail(f"catalog image keys={len(image_keys)}, expected {EXPECTED_ASSET_COUNT}")
    if webp_keys != image_keys:
        fail(f"WebP keys do not exactly match catalog: orphan={sorted(webp_keys - image_keys)} missing={sorted(image_keys - webp_keys)}")
    if thumb_keys != image_keys:
        fail(f"thumbnail keys do not exactly match catalog: orphan={sorted(thumb_keys - image_keys)} missing={sorted(image_keys - thumb_keys)}")

    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    if len(audit) != 48:
        fail(f"audit cards={len(audit)}, expected 48")
    entry_by_id = {entry["catalog_id"]: entry for entry in entries}
    seen_positions: set[tuple[int, int]] = set()
    for expected_order, row in enumerate(audit, 1):
        position = (int(row["row"]), int(row["column"]))
        if row.get("card_order") != expected_order or position in seen_positions:
            fail(f"audit order/position invalid at card {expected_order}")
        seen_positions.add(position)
        catalog_id = row.get("catalog_id")
        if catalog_id not in entry_by_id:
            fail(f"audit references unknown catalog_id={catalog_id}")
        entry = entry_by_id[catalog_id]
        if row.get("asset_key") != entry.get("image_key"):
            fail(f"audit asset mismatch for {catalog_id}")
        source_capture = ROOT / str(row.get("source_capture", "")).replace("/", "\\")
        if not source_capture.is_file():
            fail(f"audit source capture missing {source_capture}")
        if not row.get("variant") or not row.get("merge_relation"):
            fail(f"audit missing variant/merge relation for {catalog_id}")

    if catalog.get("active_supported_count") != EXPECTED_SUPPORTED_COUNT:
        fail("catalog active_supported_count is stale")
    if catalog.get("canonical_device_count") != EXPECTED_CANONICAL_COUNT:
        fail("catalog canonical_device_count is stale")
    print(
        f"DEVICE_ASSETS_OK active_supported={len(active)} canonical={len(canonical)} "
        f"entries={len(entries)} assets={len(image_keys)} audit_cards={len(audit)}"
    )


if __name__ == "__main__":
    main()
