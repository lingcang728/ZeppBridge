"""界面性能基线：同一套场景、多项指标一起看，防止「拆东墙补西墙」。

用法（需要先起 ui-fixture 开发服务器，见 .claude/launch.json；夹具数据不进仓库）：
    python scripts/perf/ui_perf.py [--url http://localhost:5188] [--out result.json] [--runs 3]

视口 1650×1040 @DPR2，贴近 3300×2080 物理像素的真实窗口——模糊、重绘的成本按像素放大，
小窗口下测不出问题。用系统 Chrome 无头跑（channel=chrome），GPU 相关数字只作相对比较。

每个场景录一段 trace，统计：
  frames     合成出的帧数（静止时应当接近 0：没有东西在动就不该出帧）
  paints     Paint 事件数与总耗时（重绘）
  raster     栅格化耗时（GPU/光栅线程的代理指标）
  style      样式重算次数与耗时
  layout     布局次数与耗时
  main       主线程任务总耗时
  long       >50ms 的主线程任务数
另外记录概览页的 JS 堆、DOM 节点数。
"""
import argparse
import asyncio
import json
import statistics

from playwright.async_api import async_playwright

CATS = ','.join([
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'blink', 'cc', 'viz', 'gpu',
])


def summarize(trace_bytes: bytes) -> dict:
    data = json.loads(trace_bytes)
    events = data['traceEvents'] if isinstance(data, dict) else data
    renderer_pids = {e['pid'] for e in events if e.get('name') == 'TracingStartedInBrowser' or e.get('name') == 'SetLayerTreeId'}
    out = {'frames': 0, 'paints': 0, 'paint_ms': 0.0, 'raster_ms': 0.0, 'style': 0, 'style_ms': 0.0,
           'layout': 0, 'layout_ms': 0.0, 'main_ms': 0.0, 'long': 0}
    main_threads = set()
    for e in events:
        if e.get('name') == 'thread_name' and e.get('args', {}).get('name') == 'CrRendererMain':
            main_threads.add((e['pid'], e['tid']))
    for e in events:
        name = e.get('name')
        dur = e.get('dur', 0) / 1000.0
        if name == 'DrawFrame' and e.get('ph') in ('I', 'n', 'X', 'b'):
            out['frames'] += 1
        elif name == 'Paint' and e.get('ph') == 'X':
            out['paints'] += 1
            out['paint_ms'] += dur
        elif name in ('RasterTask', 'GpuRasterization') and e.get('ph') == 'X':
            out['raster_ms'] += dur
        elif name in ('UpdateLayoutTree', 'RecalculateStyles') and e.get('ph') == 'X':
            out['style'] += 1
            out['style_ms'] += dur
        elif name == 'Layout' and e.get('ph') == 'X':
            out['layout'] += 1
            out['layout_ms'] += dur
        elif name == 'RunTask' and e.get('ph') == 'X' and (e['pid'], e['tid']) in main_threads:
            out['main_ms'] += dur
            if dur > 50:
                out['long'] += 1
    return {k: (round(v, 1) if isinstance(v, float) else v) for k, v in out.items()}


async def traced(browser, page, action):
    await browser.start_tracing(page=page, categories=CATS.split(','))
    await action()
    raw = await browser.stop_tracing()
    return summarize(raw)


async def go(page, path):
    """应用内跳转：推一条历史再发 popstate，vue-router 按当前地址渲染。"""
    await page.evaluate("p => { history.pushState(history.state, '', p); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }", path)


async def settle(page, ms=6000):
    await page.wait_for_timeout(ms)


async def run_once(url: str) -> dict:
    result = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', headless=True, args=['--enable-gpu-rasterization'])
        ctx = await browser.new_context(viewport={'width': 1650, 'height': 1040}, device_scale_factor=2, color_scheme='dark')
        page = await ctx.new_page()
        await page.goto(url + '/', wait_until='networkidle')
        # 等启动同步跑完、一次性的提示动画放完：量的是稳态
        await settle(page, 16000)
        result['backgrounded'] = await page.evaluate("document.documentElement.classList.contains('is-backgrounded')")

        cdp = await ctx.new_cdp_session(page)
        await cdp.send('HeapProfiler.collectGarbage')  # 先回收，否则堆大小只是噪声
        await cdp.send('Performance.enable')
        metrics = {m['name']: m['value'] for m in (await cdp.send('Performance.getMetrics'))['metrics']}
        result['overview_heap_mb'] = round(metrics['JSHeapUsedSize'] / 1048576, 1)
        result['overview_nodes'] = int(metrics['Nodes'])

        # 静止：什么都不做，看各页会不会自己出帧、重绘。应用内跳转（不整页重载，
        # 否则每次都重跑启动同步和它的一次性提示动画，量到的不是稳态）。
        for path in ['/', '/ai', '/settings', '/heart', '/training']:
            await go(page, path)
            await settle(page, 3500)
            result[f'idle{path}'] = await traced(browser, page, lambda: page.wait_for_timeout(5000))

        # 指针横扫概览（悬停倾斜、高光）
        await go(page, '/')
        await settle(page, 2500)

        async def sweep():
            for row in range(4):
                y = 260 + row * 180
                for i in range(60):
                    await page.mouse.move(80 + i * 25, y)
                    await page.wait_for_timeout(16)

        result['sweep_overview'] = await traced(browser, page, sweep)

        # 滚动概览
        async def scroll():
            await page.mouse.move(800, 500)
            for _ in range(30):
                await page.mouse.wheel(0, 120)
                await page.wait_for_timeout(33)
            for _ in range(30):
                await page.mouse.wheel(0, -120)
                await page.wait_for_timeout(33)

        result['scroll_overview'] = await traced(browser, page, scroll)

        # 切页：顶栏导航来回点
        async def switch():
            nav = page.locator('.pill-nav .segment-item')
            count = await nav.count()
            for idx in [1, 2, 0, 2, 1, 0]:
                if idx < count:
                    await nav.nth(idx).click()
                    await page.wait_for_timeout(700)

        result['switch_pages'] = await traced(browser, page, switch)

        # 设置卡：打开再关
        await go(page, '/settings')
        await settle(page, 2500)

        async def deck():
            for card in ['sync', 'display', 'sync']:
                await go(page, f'/settings/{card}')
                await page.wait_for_timeout(900)
                await page.go_back()
                await page.wait_for_timeout(900)

        result['settings_cards'] = await traced(browser, page, deck)
        await browser.close()
    return result


def merge(runs: list[dict]) -> dict:
    out = {}
    for key, value in runs[0].items():
        if isinstance(value, dict):
            out[key] = {k: round(statistics.median(r[key][k] for r in runs), 1) for k in value}
        else:
            out[key] = round(statistics.median(r[key] for r in runs), 1)
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:5188')
    ap.add_argument('--out', default=None)
    ap.add_argument('--runs', type=int, default=3)
    args = ap.parse_args()
    runs = [await run_once(args.url) for _ in range(args.runs)]
    merged = merge(runs)
    text = json.dumps(merged, ensure_ascii=False, indent=1)
    print(text)
    if args.out:
        with open(args.out, 'w', encoding='utf8') as f:
            f.write(text)


asyncio.run(main())
