"""Build the icon review board from the running Vite app and generated assets.

The icon samples in the board are cloned from the real rendered Vue SVGs. No
review-only brand geometry is authored here; the only exception is extracting
the already-implemented heart-max branch so the full health matrix can be
shown even when no workout record is present in the local browser preview.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "docs" / "design"
DESIGN.mkdir(parents=True, exist_ok=True)
REFERENCE_CANDIDATES = [
    Path(r"C:\Users\example\AppData\Local\Temp\codex-clipboard-621580b8-19ba-4209-89f4-611fef624672.png"),
    ROOT / "design_picture" / "ChatGPT Image Aug 13, 2026, 03_36_09 PM (1).png",
]
REF = next((path for path in REFERENCE_CANDIDATES if path.exists()), REFERENCE_CANDIDATES[-1])
PORT = "http://127.0.0.1:1420"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def extract(page, selector: str) -> list[str]:
    return page.locator(selector).evaluate_all("els => els.map(el => el.outerHTML)")


def icon_panel(page, nav_icons: list[str], health_icons: list[tuple[str, str]]) -> Path:
    nav_markup = "".join(
        f'<div class="cell nav-cell"><div class="svg-box">{svg}</div><small>{html.escape(label)}</small></div>'
        for label, svg in nav_icons
    )
    health_markup = "".join(
        f'<div class="health-cell"><span class="health-label">{html.escape(label)}</span>'
        + "".join(f'<span class="svg-box size-{size}">{svg}</span>' for size in (16, 20, 24, 32))
        + "</div>"
        for label, svg in health_icons
    )
    markup = f"""
    <style>
      * {{ box-sizing: border-box; }} html, body {{ margin: 0; background: #0f1512; color: #e8eaed; font-family: 'Segoe UI', sans-serif; }}
      .review {{ width: 1380px; padding: 30px; background: #0f1512; }} h2 {{ margin: 0 0 12px; font-size: 22px; }}
      .sub {{ color: #8b919a; font-size: 12px; margin-bottom: 18px; }} .nav-grid {{ display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 30px; }}
      .cell {{ width: 116px; height: 88px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; border: 1px solid #2a2e36; border-radius: 10px; background: #181b21; color: #a8e6c3; }}
      .cell small {{ color: #8b919a; font-size: 11px; }} .svg-box {{ display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; color: inherit; }}
      .svg-box svg {{ width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }} .health-grid {{ display: grid; gap: 7px; }}
      .health-cell {{ display: grid; grid-template-columns: 110px repeat(4, 1fr); align-items: center; min-height: 54px; padding: 7px 14px; border: 1px solid #2a2e36; border-radius: 9px; background: #181b21; color: #8fc b9b; color: #8fc b9b; }}
      .health-label {{ color: #d7dbe0; font-size: 12px; }} .health-cell:nth-child(1), .health-cell:nth-child(4) {{ color: #e88a8e; }}
      .health-cell:nth-child(2), .health-cell:nth-child(9), .health-cell:nth-child(10) {{ color: #9aa0e8; }}
      .health-cell:nth-child(6) {{ color: #d4a05a; }} .health-cell:nth-child(7) {{ color: #b07ad4; }}
      .health-cell .svg-box svg {{ width: 24px; height: 24px; }} .health-cell .size-16 svg {{ width: 16px; height: 16px; }} .health-cell .size-20 svg {{ width: 20px; height: 20px; }} .health-cell .size-32 svg {{ width: 32px; height: 32px; }}
      .health-cell .svg-box {{ width: 48px; height: 40px; }}
    </style>
    <main class="review"><h2>Rendered implementation samples</h2><p class="sub">Vue SVG output captured from the running Vite app · navigation 24px · health matrix 16 / 20 / 24 / 32px</p>
      <div class="nav-grid">{nav_markup}</div><div class="health-grid">{health_markup}</div>
    </main>
    """
    # Correct the intentional readability typo in the CSS before loading.
    markup = markup.replace("#8fc b9b", "#8fcb9b")
    page.set_content(markup, wait_until="networkidle")
    output = DESIGN / "icon-implementation-panel.png"
    page.screenshot(path=str(output), full_page=True)
    return output


def make_review(brand_path: Path, panel_path: Path, dark_path: Path, ai_dark_path: Path) -> Path:
    canvas = Image.new("RGB", (2200, 1680), "#0f1512")
    draw = ImageDraw.Draw(canvas)
    title_font = font(34, True)
    section_font = font(20, True)
    body_font = font(14)
    small_font = font(12)
    draw.text((56, 42), "ZeppBridge icon system · visual review", fill="#e8eaed", font=title_font)
    draw.text((58, 92), "Actual master-derived platform assets and Vite-rendered UI samples", fill="#8b919a", font=body_font)

    ref = Image.open(REF).convert("RGB")
    # The user-supplied crop is already isolated; the repository reference is not.
    ref_crop = ref if ref.width < 400 else ref.crop((15, 62, 224, 132))
    ref_crop.save(DESIGN / "reference-logo-crop.png")
    draw.text((58, 152), "Reference crop", fill="#72c994", font=section_font)
    canvas.paste(ImageOps.contain(ref_crop, (300, 104)), (58, 190))

    draw.text((405, 152), "Transparent sidebar mark", fill="#72c994", font=section_font)
    mark = Image.open(brand_path).convert("RGBA")
    bbox = mark.getchannel("A").getbbox()
    mark = mark.crop(bbox) if bbox else mark
    mark_panel = Image.new("RGB", (250, 150), "#181b21")
    for sample_size, x in ((28, 45), (48, 150)):
        sample = mark.resize((sample_size, sample_size), Image.Resampling.LANCZOS)
        mark_panel.paste(sample, (x, 28), sample)
        ImageDraw.Draw(mark_panel).text((x, 94), f"{sample_size}px", fill="#8b919a", font=small_font)
    canvas.paste(mark_panel, (405, 180))
    draw.text((405, 345), "actual BrandMark · transparent on dark", fill="#8b919a", font=small_font)

    draw.text((650, 152), "Windows app icon · generated from icon-source.svg", fill="#72c994", font=section_font)
    icon_sizes = (16, 20, 24, 32, 48, 128, 256)
    source = Image.open(ROOT / "src-tauri" / "icons" / "icon.png").convert("RGBA")
    x = 660
    for size in icon_sizes:
        sample_size = max(32, min(128, size))
        tile = Image.new("RGB", (sample_size + 22, sample_size + 40), "#181b21")
        resized = source.resize((sample_size, sample_size), Image.Resampling.LANCZOS)
        tile.paste(resized, (11, 6), resized)
        ImageDraw.Draw(tile).text((11, sample_size + 12), str(size), fill="#8b919a", font=small_font)
        canvas.paste(tile, (x, 185))
        x += tile.width + 12

    draw.text((58, 405), "Dark Vite page · sidebar, navigation, health cards", fill="#72c994", font=section_font)
    dark = Image.open(dark_path).convert("RGB")
    dark_thumb = ImageOps.contain(dark, (920, 690))
    canvas.paste(dark_thumb, (58, 445))
    draw.text((1000, 405), "AI data-type page · real icon context", fill="#72c994", font=section_font)
    ai = Image.open(ai_dark_path).convert("RGB")
    canvas.paste(ImageOps.contain(ai, (1120, 690)), (1000, 445))

    draw.text((58, 1165), "Icon family samples", fill="#72c994", font=section_font)
    panel = Image.open(panel_path).convert("RGB")
    panel_thumb = ImageOps.contain(panel, (2080, 450))
    canvas.paste(panel_thumb, (58, 1205))
    draw.text((58, 1640), "Review board generated 2026-08-13 · source: icon-source.svg + running Vue components", fill="#5c636c", font=small_font)

    output = DESIGN / "zeppbridge-icon-review.png"
    canvas.save(output, optimize=True)
    return output


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1448, "height": 1086}, device_scale_factor=1)
        page.goto(PORT + "/", wait_until="networkidle")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
        page.wait_for_timeout(350)
        dark_path = DESIGN / "icon-browser-dark.png"
        page.screenshot(path=str(dark_path), full_page=True)
        brand_html = page.locator(".brand-mark").first.evaluate("el => el.outerHTML")
        brand_path = DESIGN / "sidebar-mark-transparent.png"
        page.set_content(f"<style>html,body{{margin:0;background:transparent}}svg{{width:150px;height:150px;fill:none;stroke:#72c994;stroke-linecap:round;stroke-linejoin:round;color:#72c994}}svg path{{stroke:currentColor}}svg circle{{fill:currentColor;stroke:none}}</style>{brand_html}")
        page.screenshot(path=str(brand_path), omit_background=True)

        page.goto(PORT + "/", wait_until="networkidle")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
        page.wait_for_timeout(250)
        nav_raw = extract(page, ".desktop-nav svg")
        nav_raw += extract(page, ".connection-chip svg") + extract(page, ".sync-chip svg") + extract(page, ".sync-button svg")
        nav_labels = ["overview", "ai", "settings", "link", "cloud", "sync"]
        nav_icons = list(zip(nav_labels, nav_raw[: len(nav_labels)]))
        page.goto(PORT + "/ai", wait_until="networkidle")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
        page.wait_for_timeout(300)
        ai_dark_path = DESIGN / "icon-browser-ai-dark.png"
        page.screenshot(path=str(ai_dark_path), full_page=True)
        health_raw = extract(page, ".type-icon svg")
        health_labels = ["heart", "moon", "run", "steps", "spo2", "stress", "hrv", "training-load", "vo2"]
        health_icons = list(zip(health_labels, health_raw))
        page.goto(PORT + "/", wait_until="networkidle")
        page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
        page.wait_for_timeout(250)
        resting = extract(page, ".metric-card.tone-heart svg")
        if resting:
            health_icons.insert(1, ("heart-rest", resting[0]))

        # Include the health branch even when the preview has no local record.
        icon_source = (ROOT / "src" / "components" / "Icon.vue").read_text(encoding="utf-8")
        heart_max = re.search(r"(<g v-else-if=\"name === 'heart-max'\"[\s\S]*?</g>)", icon_source)
        if heart_max:
            health_icons.insert(2, ("heart-max", f'<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">{heart_max.group(1).replace(":stroke-width=\"stroke\"", "stroke-width=\"1.75\"")}</svg>'))
        panel_path = icon_panel(page, nav_icons, health_icons)
        browser.close()

    output = make_review(brand_path, panel_path, dark_path, ai_dark_path)
    print(f"Created {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - surfaced as a review build failure
        print(f"Review build failed: {error}", file=sys.stderr)
        raise SystemExit(1)
