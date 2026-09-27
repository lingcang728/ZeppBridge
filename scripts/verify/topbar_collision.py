"""顶栏碰撞矩阵：每种界面语言 × 多种窗口宽度，断言顶栏的品牌 / 导航胶囊 / 右侧一簇
两两不相交、都不出窗口。大原则：任何语言、任何宽度都不许盖住别的组件。

需要先起 ui-fixture 开发服务器（见 .claude/launch.json）。
    python scripts/verify/topbar_collision.py [--url http://localhost:5188]
退出码 0 = 全部通过。
"""
import argparse
import asyncio
import sys

from playwright.async_api import async_playwright

LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr']
WIDTHS = [780, 900, 1000, 1100, 1280, 1400, 1650, 1920]
PATHS = ['/', '/heart']  # 概览（品牌）与详情页（返回键）两种左侧

PROBE = """() => {
  const bar = document.querySelector('.app-topbar');
  if (!bar) return { error: 'no topbar' };
  const r = (sel) => { const el = bar.querySelector(sel); if (!el || !el.offsetWidth) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const parts = { left: r('.brand, .quick-back'), nav: r('.pill-nav'), actions: r('.topbar-actions') };
  const kids = [...bar.querySelectorAll('.topbar-actions > *')].filter((el) => el.offsetWidth).map((el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, cls: el.className }; });
  return { parts, kids, width: window.innerWidth, fit: [...bar.classList].find((c) => c.startsWith('fit-')) || 'fit-0' };
}"""


def problems(data):
    out = []
    parts = {k: v for k, v in data['parts'].items() if v}
    width = data['width']
    for name, box in parts.items():
        if box['l'] < -0.5 or box['r'] > width + 0.5:
            out.append(f'{name} 出窗口 ({box["l"]:.0f}–{box["r"]:.0f} / {width})')
    names = list(parts)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = parts[names[i]], parts[names[j]]
            if a['l'] < b['r'] - 0.5 and b['l'] < a['r'] - 0.5:
                out.append(f'{names[i]} 与 {names[j]} 相交')
    kids = sorted(data['kids'], key=lambda k: k['l'])
    for a, b in zip(kids, kids[1:]):
        if b['l'] < a['r'] - 0.5:
            out.append(f'右簇内 {a["cls"][:20]} 与 {b["cls"][:20]} 相交')
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:5188')
    args = ap.parse_args()
    failures = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', headless=True)
        for loc in LOCALES:
            ctx = await browser.new_context(viewport={'width': 1650, 'height': 900})
            await ctx.add_init_script(f"localStorage.setItem('zeppbridge-locale', '{loc}')")
            page = await ctx.new_page()
            for path in PATHS:
                await page.goto(args.url + path, wait_until='networkidle')
                await page.wait_for_timeout(1500)
                row = []
                for w in WIDTHS:
                    await page.set_viewport_size({'width': w, 'height': 900})
                    await page.wait_for_timeout(450)
                    data = await page.evaluate(PROBE)
                    bad = problems(data)
                    row.append(f'{w}:{data["fit"][4:]}{"✗" if bad else ""}')
                    if bad:
                        failures += 1
                        print(f'  ✗ {loc} {path} {w}px {data["fit"]}: ' + '；'.join(bad))
                print(f'{loc:6} {path:7} ' + ' '.join(row))
            await ctx.close()
        await browser.close()
    print('失败', failures)
    sys.exit(1 if failures else 0)


asyncio.run(main())
