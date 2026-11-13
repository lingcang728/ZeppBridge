"""trace_click.py <route> <selector> <out.json> [close] — 打开（或关闭）一个由按钮触发的弹层 / 形变时抓 Chrome trace；配合 trace_swaps / trace_frames / trace_nest 看。"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import open_app, click, run  # noqa
ROUTE, SEL, OUT = '/' + sys.argv[1].lstrip('/'), sys.argv[2], sys.argv[3]
CLOSE = len(sys.argv) > 4
CATS = 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,viz,gpu,cc,blink,toplevel'


async def main(play):
    browser, page, cdp = await open_app(play, route=ROUTE, throttle=1, dpr=2, size=(1920, 1080))
    await page.wait_for_timeout(1500)
    print('path', await page.evaluate('location.pathname'), 'n', await page.locator(SEL).count())
    # warm the lazy chunk the way a hover would
    await page.hover(SEL)
    await page.wait_for_timeout(600)
    if CLOSE:
        await click(page, SEL)
        await page.wait_for_timeout(3500)
    await browser.start_tracing(page=page, path=OUT, categories=CATS.split(','))
    await page.wait_for_timeout(200)
    if CLOSE:
        await page.mouse.click(12, 1060)
    else:
        await click(page, SEL)
    await page.wait_for_timeout(1600)
    await browser.stop_tracing()
    await browser.close()

run(main)
