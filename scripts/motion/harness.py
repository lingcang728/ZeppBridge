"""动效测量台的公共部分：用 dist + 演示数据开一个无头 Chrome，逐帧采样，算指标。

不起开发服务器：`page.route('http://zb.test/**')` 直接从 dist/ 回包，地址带 `?demo=1` 让应用跑演示运行时（合成数据）。
默认 CPU 降速 4×、DPR 2（贴近用户的高分屏 WebView2，见记忆 measure-jank-throttled）。

用全局 Python Playwright（G:\\python），浏览器用系统 Chrome（channel=chrome），项目里不装任何依赖。
"""
from __future__ import annotations

import asyncio
import json
import mimetypes
import os
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'dist'
ORIGIN = 'http://zb.test'

# 每一帧在页面里采的东西：一组「可见签名」。签名在 rAF 里读计算样式（带着动画当前值）。
SAMPLER = r"""
(() => {
  const vis = (el) => {
    if (!el || !el.isConnected) return null;
    let op = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return { op: 0 };
      op *= Number(s.opacity);
    }
    const box = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const m = s.clipPath.match(/^inset\((.*?)(?: round|\))/);
    let w = { l: box.left, t: box.top, w: box.width, h: box.height };
    if (m) {
      const e = m[1].trim().split(/\s+/).map(parseFloat);
      const top = e[0], right = e[1] ?? top, bottom = e[2] ?? top, left = e[3] ?? right;
      w = { l: box.left + left, t: box.top + top, w: box.width - left - right, h: box.height - top - bottom };
    }
    const r = (v) => Math.round(v * 10) / 10;
    return { op: Math.round(op * 1000) / 1000, l: r(w.l), t: r(w.t), w: r(w.w), h: r(w.h) };
  };
  window.__mt = { rows: [], on: false, probes: {}, liteBlocked: 0 };
  // CPU 降速下首启量帧会把档位定成「低」→ 低特效（html[data-effects=lite]）→ 所有形变退成淡入淡出。
  // 测量台要量的是完整动效，挡掉它（记一笔次数）。
  const unlite = () => {
    const html = document.documentElement;
    if (html && html.dataset.effects === 'lite') { delete html.dataset.effects; window.__mt.liteBlocked += 1; }
  };
  const watchLite = () => {
    if (!document.documentElement) { setTimeout(watchLite, 0); return; }
    new MutationObserver(unlite).observe(document.documentElement, { attributes: true, attributeFilter: ['data-effects'] });
    unlite();
  };
  watchLite();
  const tick = (now) => {
    const st = window.__mt;
    if (st.on) {
      const row = { t: Math.round(now * 10) / 10 };
      for (const [key, sel] of Object.entries(st.probes)) {
        if (typeof sel === 'string' && sel.startsWith('before:')) {
          const el = document.querySelector(sel.slice(7));
          row[key] = el ? [{ op: Math.round(Number(getComputedStyle(el, '::before').opacity) * 1000) / 1000 }] : [];
          continue;
        }
        const els = typeof sel === 'function' ? sel() : [...document.querySelectorAll(sel)];
        row[key] = (Array.isArray(els) ? els : [els]).filter(Boolean).map(vis).filter(Boolean);
      }
      st.rows.push(row);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
"""


async def open_app(play, route='/', theme='dark', throttle=4, dpr=2, size=(1440, 900), layout='list'):
    # ZB_MOTION_GPU=1：无头也走真显卡（D3D11）。默认的软件 GL 量不出高分屏上 GPU 光栅那一下卡（记忆 morph-gpu-raster-stalls）。
    gpu = ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] if os.environ.get('ZB_MOTION_GPU') else []
    browser = await play.chromium.launch(channel='chrome', headless=True, args=['--hide-scrollbars=false', *gpu])
    context = await browser.new_context(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=dpr)

    async def serve(route_obj):
        url = route_obj.request.url
        path = url.split(ORIGIN, 1)[1].split('?', 1)[0].split('#', 1)[0]
        file = DIST / path.lstrip('/')
        if not file.is_file():
            file = DIST / 'index.html'
        mime = mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        if file.suffix == '.js' or file.suffix == '.mjs':
            mime = 'text/javascript'
        await route_obj.fulfill(status=200, body=file.read_bytes(), headers={'content-type': mime})

    await context.route(f'{ORIGIN}/**', serve)
    page = await context.new_page()
    # 设置卡叠的布局（演示里 localStorage 是内存版，开局写不进去；卡叠没开时演示存储读不到就用默认 list）。
    await page.add_init_script(SAMPLER)
    cdp = await context.new_cdp_session(page)
    if throttle and throttle > 1:
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': throttle})
    await page.goto(f'{ORIGIN}/?demo=1&lang=zh-CN&theme={theme}&route={route}', wait_until='load')
    await page.wait_for_timeout(2500)
    return browser, page, cdp


async def go(page, path):
    await page.evaluate("p => { history.pushState(history.state, '', p); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }", path)


async def record(page, probes: dict, action, ms=1600):
    """先采两帧静止，再做 action（可以是 async 函数，里面再定时点别的），共采 ms 毫秒。返回帧行和动作时刻。"""
    await page.evaluate("p => { window.__mt.probes = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.startsWith('fn:') ? new Function('return ' + v.slice(3))() : v])); window.__mt.rows = []; window.__mt.on = true; }", probes)
    await page.wait_for_timeout(120)
    t0 = await page.evaluate('performance.now()')
    await action()
    await page.wait_for_timeout(ms)
    rows = await page.evaluate('(() => { window.__mt.on = false; return window.__mt.rows; })()')
    return rows, t0


async def click(page, selector, nth=0, top=None):
    """真的点下去（pointerdown → click），坐标是元素中心；返回点下去那一刻的 performance.now()。"""
    loc = page.locator(selector).nth(nth)
    box = await loc.bounding_box()
    if not box:
        raise RuntimeError(f'not found: {selector}')
    x, y = box['x'] + box['width'] / 2, box['y'] + (top if top is not None else box['height'] / 2)
    t = await page.evaluate('performance.now()')
    await page.mouse.click(x, y)
    return t


def sig(row, keys):
    return json.dumps([row.get(k) for k in keys], sort_keys=True)


def summarize(rows, t0, keys, main_key=None):
    """指标：
    start_ms   点击到第一帧可见变化
    frames     有变化的那一段一共多少帧
    freeze     变化段里最长连续不动帧数（相邻两帧签名相同；不含收尾以后）；freeze_at 是它结束的时刻
    max_gap    帧间隔最大值（ms）
    jump_px    主窗口一帧里最大的位移（左上角 + 尺寸的变化之和）
    dur_ms     从第一帧变化到最后一帧变化
    """
    if not rows:
        return {}
    pre = [r for r in rows if r['t'] < t0]
    post = [r for r in rows if r['t'] >= t0]
    base = sig(pre[-1], keys) if pre else sig(rows[0], keys)
    first = next((i for i, r in enumerate(post) if sig(r, keys) != base), None)
    if first is None:
        return {'start_ms': None}
    last = max(i for i in range(len(post)) if i == 0 or sig(post[i], keys) != sig(post[i - 1], keys))
    seg = post[first:last + 1]
    freeze = run = 0
    freeze_at = None
    for a, b in zip(seg, seg[1:]):
        run = run + 1 if sig(a, keys) == sig(b, keys) else 0
        if run > freeze:
            freeze = run
            freeze_at = round(b['t'] - t0)
    gaps = [b['t'] - a['t'] for a, b in zip(seg, seg[1:])]
    jump = 0.0
    if main_key:
        def win(r):
            v = r.get(main_key) or []
            v = [x for x in v if x.get('w')]
            return v[0] if v else None
        for a, b in zip(seg, seg[1:]):
            wa, wb = win(a), win(b)
            if wa and wb:
                jump = max(jump, abs(wa['l'] - wb['l']) + abs(wa['t'] - wb['t']) + abs(wa['w'] - wb['w']) + abs(wa['h'] - wb['h']))
    return {
        'start_ms': round(post[first]['t'] - t0, 1),
        'frames': len(seg),
        'freeze': freeze,
        'freeze_at': freeze_at,
        'max_gap': round(max(gaps), 1) if gaps else 0,
        'jump_px': round(jump, 1),
        'dur_ms': round(seg[-1]['t'] - seg[0]['t'], 1),
    }


def run(main):
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', r'G:\build_cache\playwright-browsers')

    async def wrapper():
        async with async_playwright() as play:
            await main(play)
    asyncio.run(wrapper())
