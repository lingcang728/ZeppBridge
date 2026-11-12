"""逐帧条带（给人看编排）：动画放慢 5 倍，按真实时间点截图，拼成一张图。

    G:\\python\\python.exe scripts/motion/strip.py <场景> <输出.png> [时间点毫秒,逗号分隔]

场景：letter-open、letter-close、page-open、page-back、deck-open、deck-close
（见 SCENES）。截图在 dist + 演示数据上跑，不降速（放慢的是动画本身，见记忆 frame-capture-slow-animations）。
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import click, open_app, run  # noqa: E402

SLOW = 5
TIMES = [0, 60, 120, 200, 300, 420, 560, 720]


async def prepare(page, name):
    if name.startswith('letter-close'):
        await click(page, '.write-pill')
        await page.wait_for_timeout(3500)
    if name == 'page-back':
        await click(page, '#main-content a[href="/sleep"]', top=28)
        await page.wait_for_timeout(2500)
    if name == 'deck-close':
        await click(page, '[data-deck-card="guide"] .list-open', top=28)
        await page.wait_for_timeout(2000)


async def act(page, name):
    if name == 'letter-open':
        await click(page, '.write-pill')
    elif name.startswith('letter-close'):
        await page.mouse.click(12, 880)
    elif name == 'page-open':
        await click(page, '#main-content a[href="/sleep"]', top=28)
    elif name == 'page-back':
        await page.evaluate('history.back()')
    elif name == 'deck-open':
        await click(page, '[data-deck-card="guide"] .list-open', top=28)
    elif name == 'deck-close':
        await click(page, '.deck-close')


async def main(play):
    name, out = sys.argv[1], sys.argv[2]
    times = [int(v) for v in sys.argv[3].split(',')] if len(sys.argv) > 3 else TIMES
    route = '/settings' if name.startswith('deck') else '/'
    browser, page, cdp = await open_app(play, route=route, throttle=1, dpr=1)
    await prepare(page, name)
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', {'playbackRate': 1 / SLOW})
    shots = []
    t0 = await page.evaluate('performance.now()')
    await act(page, name)
    for t in times:
        now = await page.evaluate('performance.now()')
        wait = t * SLOW - (now - t0)
        if wait > 0:
            await page.wait_for_timeout(wait)
        png = await page.screenshot()
        shots.append((t, Image.open(io.BytesIO(png)).convert('RGB')))
    await browser.close()
    w, h = shots[0][1].size
    scale = 0.5
    cols = 2
    tw, th = int(w * scale), int(h * scale)
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols, (th + 24) * rows), 'white')
    draw = ImageDraw.Draw(sheet)
    for i, (t, img) in enumerate(shots):
        x, y = (i % cols) * tw, (i // cols) * (th + 24)
        sheet.paste(img.resize((tw, th)), (x, y + 24))
        draw.text((x + 8, y + 4), f'{name}  {t} ms', fill='black')
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    run(main)
