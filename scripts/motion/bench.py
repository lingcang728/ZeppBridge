"""动效测量台（修复计划 A0，2026-11-12）：逐帧采样写信信封、概览卡 ↔ 详情页、设置卡叠三类转场，输出数字表。

用法（先 `npm run build`）：
    G:\\python\\python.exe scripts/motion/bench.py [--only letter,page,deck] [--throttle 4] [--json out.json]

每个场景的指标见 harness.summarize，另有场景自己的：
  env_start   信封第一帧可见（不透明度 > 0.05）距点击的毫秒
  env_from    那一帧信封中心离按钮中心多远（px）；从按钮里飞出来的应当很近
  tail_ms     关信封：背景已经清楚（遮罩 < 0.05）以后信封还挂着多久（正数 = 留了个小信封）
  empty       窗口比卡大 1.5 倍以上、而卡拷贝和页内容都几乎看不见（< 0.2）的帧数（空板）
  holes       原卡被藏、窗口却不在它那里的帧数（空洞）
  back_ms     打断后回到静止用了多久；ratio = back_ms / 打断前已走的时间
  cut         设置卡收起途中，大卡还很大（> 1.6 倍目标高）就一帧消失
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import click, go, open_app, record, run, summarize  # noqa: E402

ARGS = None
RESULTS: dict[str, dict] = {}


def first(row, key):
    v = row.get(key) or []
    return v[0] if v else None


def area(w):
    return (w or {}).get('w', 0) * (w or {}).get('h', 0)


# ---------------------------------------------------------------- 写信信封

LETTER_PROBES = {
    'veil': 'before:.dialog-backdrop',
    'env': 'fn:() => document.querySelector(".dialog-panel.is-bare .letter-stage")',
    'paper': 'fn:() => document.querySelector(".dialog-panel.is-bare .pad-shell")',
}


def letter_metrics(rows, t0, pen):
    out = summarize(rows, t0, ['veil', 'env', 'paper'], 'env')
    post = [r for r in rows if r['t'] >= t0]
    vis = next((r for r in post if (first(r, 'env') or {}).get('op', 0) > 0.05 and (first(r, 'env') or {}).get('w')), None)
    if vis:
        e = first(vis, 'env')
        out['env_start'] = round(vis['t'] - t0, 1)
        cx, cy = e['l'] + e['w'] / 2, e['t'] + e['h'] / 2
        out['env_from'] = round(((cx - pen[0]) ** 2 + (cy - pen[1]) ** 2) ** 0.5)
        out['env_w0'] = e['w']
    return out


def close_metrics(rows, t0):
    out = summarize(rows, t0, ['veil', 'env', 'paper'], 'env')
    post = [r for r in rows if r['t'] >= t0]
    clear = next((r['t'] for r in post if (first(r, 'veil') or {'op': 0})['op'] < 0.05), None)
    gone = next((r['t'] for r in post if (first(r, 'env') or {'op': 0}).get('op', 0) < 0.02), None)
    if clear is not None and gone is not None:
        out['tail_ms'] = round(gone - clear, 1)
    return out


async def pen_center(page, selector):
    box = await page.locator(selector).first.bounding_box()
    return (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)


async def outside(page):
    await page.mouse.click(12, 880)


async def bench_letter(play):
    for label, route, opener in [
        ('pen', '/', '.write-pill'),
    ]:
        browser, page, _ = await open_app(play, route=route, throttle=ARGS.throttle)
        pen = await pen_center(page, opener)
        rows, t0 = await record(page, LETTER_PROBES, lambda: click(page, opener), 2400)
        RESULTS[f'letter.{label}.open'] = letter_metrics(rows, t0, pen)
        rows, t0 = await record(page, LETTER_PROBES, lambda: outside(page), 1600)
        RESULTS[f'letter.{label}.close'] = close_metrics(rows, t0)

        async def open_then_out():
            await click(page, opener)
            await page.wait_for_timeout(200)
            await outside(page)
        rows, t0 = await record(page, LETTER_PROBES, open_then_out, 2000)
        RESULTS[f'letter.{label}.open200_out'] = close_metrics(rows, t0)
        await browser.close()

    # 设置 › 反馈卡里的「动笔写信」：按钮在展开的设置卡里。
    browser, page, _ = await open_app(play, route='/settings/feedback', throttle=ARGS.throttle)
    await page.wait_for_timeout(800)
    opener = '#feedback .write-author, .feedback-write, [data-write-author]'
    btn = await page.evaluate("""() => { const b = [...document.querySelectorAll('.open-card button')].find(x => /动笔写信/.test(x.textContent || '')); if (!b) return null; b.dataset.benchPen = '1'; return true; }""")
    if btn:
        sel = '[data-bench-pen]'
        pen = await pen_center(page, sel)
        rows, t0 = await record(page, LETTER_PROBES, lambda: click(page, sel), 2400)
        RESULTS['letter.settings.open'] = letter_metrics(rows, t0, pen)
        rows, t0 = await record(page, {**LETTER_PROBES, 'card': '.open-card'}, lambda: outside(page), 1600)
        m = close_metrics(rows, t0)
        m['card_still_open'] = bool(await page.evaluate("!!document.querySelector('.deck-stage:not(.is-parked) .open-card')"))
        RESULTS['letter.settings.close'] = m
    await browser.close()


# ---------------------------------------------------------------- 概览卡 ↔ 详情页

# 返回：只在不在概览时退一步（退过头会离开应用）。
BACK = "(() => { if (location.pathname !== '/') history.back(); })()"

PAGE_PROBES = {
    'pages': '.page-host > *',
    'replica': '.page-host > * > .window-replica',
    'head': 'fn:() => [...document.querySelectorAll(".page-host > *")].map(p => [...p.children].find(c => !c.hasAttribute("data-morph-layer"))).filter(Boolean)',
    'hidden': 'fn:() => [...document.querySelectorAll(".page-host a, .page-host .metric-panel")].filter(e => e.getAnimations().some(a => a.effect && a.effect.getKeyframes().length === 2 && a.effect.getKeyframes().every(k => k.opacity === "0")))',
}


def moving(row):
    """在动的那一页：带裁切的那一页（窗口比整页小）。"""
    pages = row.get('pages') or []
    if not pages:
        return None
    return min(pages, key=lambda p: area(p) if p.get('w') else 1e12)


def page_metrics(rows, t0, card):
    out = summarize(rows, t0, ['pages', 'replica', 'head'], None)
    post = [r for r in rows if r['t'] >= t0]
    empty = holes = 0
    jump = 0.0
    prev = None
    card_area = card['width'] * card['height']
    for r in post:
        w = moving(r)
        rep = max([x.get('op', 0) for x in r.get('replica') or []] or [0])
        heads = r.get('head') or []
        content = max([x.get('op', 0) for x in heads] or [0]) if len(heads) == 1 else min([x.get('op', 0) for x in heads] or [0])
        if w and area(w) > card_area * 1.5 and area(w) < 0.95 * 1440 * 900 and rep < 0.2 and content < 0.2:
            empty += 1
        if r.get('hidden') and not r.get('replica'):
            holes += 1
        if prev and w:
            jump = max(jump, abs(w['l'] - prev['l']) + abs(w['t'] - prev['t']) + abs(w['w'] - prev['w']) + abs(w['h'] - prev['h']))
        prev = w
    out['empty'] = empty
    out['holes'] = holes
    return out


def turn_metrics(rows, t0, card):
    """开到一半返回：窗口开始长 → 开始缩（掉头）→ 落回卡上。走了多久（out_ms）、回来花了多久（back_ms）、比值。
    只看在动的那一页的窗口，不看 Vue 换页之后的收尾。"""
    card_area = card['width'] * card['height']
    post = [(r['t'] - t0, moving(r)) for r in rows if r['t'] >= t0]
    post = [(t, w) for t, w in post if w and w.get('w')]
    grow = next((t for t, w in post if area(w) > card_area * 1.03 and area(w) < 0.95 * 1440 * 900), None)
    if grow is None:
        return {'out_ms': None}
    peak_t, peak = grow, 0
    turn = None
    for t, w in post:
        if t < grow:
            continue
        if area(w) >= peak:
            peak, peak_t = area(w), t
        elif area(w) < peak * 0.97:
            turn = peak_t
            break
    if turn is None:
        return {'out_ms': None}
    # 落回卡上：窗口缩到卡那么大，或者在动的那一页已经撤掉（剩下的是整页）。
    land = next((t for t, w in post if t > turn and (area(w) < card_area * 1.03 or area(w) > peak * 1.05)), None)
    if land is None:
        return {'out_ms': round(turn - grow)}
    out_ms, back_ms = round(turn - grow), round(land - turn)
    return {'out_ms': out_ms, 'back_ms': back_ms, 'ratio': round(back_ms / max(out_ms, 1), 2)}


async def card_box(page, href, nth=0):
    sel = f'#main-content a[href="{href}"]'
    return sel, await page.locator(sel).nth(nth).bounding_box()


async def bench_page(play):
    for label, href in [('big', '/heart'), ('small', '/sleep')]:
        browser, page, _ = await open_app(play, route='/', throttle=ARGS.throttle)
        sel, box = await card_box(page, href)
        rows, t0 = await record(page, PAGE_PROBES, lambda: click(page, sel, top=28), 2000)
        RESULTS[f'page.{label}.open'] = page_metrics(rows, t0, box)
        rows, t0 = await record(page, PAGE_PROBES, lambda: page.evaluate(BACK), 2000)
        RESULTS[f'page.{label}.back'] = page_metrics(rows, t0, box)
        await page.wait_for_timeout(600)
        for frac in (0.15, 0.4, 0.8):
            wait = int(624 * frac)

            async def open_back():
                await click(page, sel, top=28)
                await page.wait_for_timeout(wait)
                await page.evaluate(BACK)
            rows, t0 = await record(page, PAGE_PROBES, open_back, 2400)
            m = page_metrics(rows, t0, box)
            m['turn_at_ms'] = wait
            m.update(turn_metrics(rows, t0, box))
            RESULTS[f'page.{label}.back@{int(frac * 100)}'] = m
            await page.wait_for_timeout(700)

        async def flurry():
            for _ in range(5):
                await click(page, sel, top=28)
                await page.wait_for_timeout(140)
                await page.evaluate(BACK)
                await page.wait_for_timeout(140)
        rows, t0 = await record(page, PAGE_PROBES, flurry, 2600)
        m = page_metrics(rows, t0, box)
        m['final_path'] = await page.evaluate('location.pathname')
        m['pages_left'] = await page.evaluate("document.querySelectorAll('.page-host > *').length")
        m['layers_left'] = await page.evaluate("document.querySelectorAll('[data-morph-layer]').length")
        RESULTS[f'page.{label}.flurry5'] = m
        await browser.close()


# ---------------------------------------------------------------- 设置卡叠

DECK_PROBES = {
    'card': '.deck-stage .open-card',
    'body': '.deck-stage .open-card > .deck-body',
    'source': 'fn:() => document.querySelector(`[data-deck-card="${window.__benchCard}"]`)',
    'stage': '.deck-stage',
    'scroll': 'fn:() => document.getElementById("main-content")',
    'head': '.settings-page > .page-header',
}


def deck_metrics(rows, t0, closing):
    out = summarize(rows, t0, ['card', 'body', 'source'], 'card')
    post = [r for r in rows if r['t'] >= t0]
    src = next((first(r, 'source') for r in reversed(post) if first(r, 'source')), None)
    target_h = (src or {}).get('h') or 80
    cut = 0
    empty = 0
    for a, b in zip(post, post[1:]):
        ca, cb = first(a, 'card'), first(b, 'card')
        if closing and ca and ca.get('op', 0) > 0.5 and ca.get('h', 0) > target_h * 1.6 and (not cb or cb.get('op', 0) < 0.1 or cb.get('h', 0) < 1):
            cut += 1
            out.setdefault('cut_at', []).append([round(a['t'] - t0), ca.get('h'), cb and cb.get('h'), cb and cb.get('op')])
        body = first(a, 'body')
        if ca and ca.get('op', 0) > 0.5 and ca.get('h', 0) > target_h * 2.5 and body and body.get('op', 1) < 0.15:
            empty += 1
    out['cut'] = cut
    out['empty'] = empty
    # 页头一帧里跳了多少（滚动区被路由拉回顶部时它会「冒」出来）。
    tops = [(first(r, 'head') or {}).get('t') for r in post]
    tops = [t for t in tops if t is not None]
    out['head_jump'] = round(max((abs(b - a) for a, b in zip(tops, tops[1:])), default=0), 1)
    return out


async def reset_deck(page):
    if await page.evaluate('location.pathname') != '/settings':
        await go(page, '/settings')
        await page.wait_for_timeout(1200)


async def bench_deck(play):
    browser, page, _ = await open_app(play, route='/settings', throttle=ARGS.throttle)
    await page.wait_for_timeout(600)
    for card in ('guide', 'ai', 'feedback'):
        await page.evaluate(f'window.__benchCard = "{card}"')
        sel = f'[data-deck-card="{card}"] .list-open'
        rows, t0 = await record(page, DECK_PROBES, lambda: click(page, sel, top=28), 1600)
        RESULTS[f'deck.list.{card}.open'] = deck_metrics(rows, t0, False)
        rows, t0 = await record(page, DECK_PROBES, lambda: click(page, '.deck-close'), 1600)
        RESULTS[f'deck.list.{card}.close_x'] = deck_metrics(rows, t0, True)
        await page.wait_for_timeout(400)
    # 点外面、Esc 关；开到一半关；连点
    await reset_deck(page)
    await page.evaluate('window.__benchCard = "sync"')
    sel = '[data-deck-card="sync"] .list-open'
    await click(page, sel, top=28)
    await page.wait_for_timeout(1200)
    rows, t0 = await record(page, DECK_PROBES, lambda: page.keyboard.press('Escape'), 1600)
    RESULTS['deck.list.sync.close_esc'] = deck_metrics(rows, t0, True)
    await page.wait_for_timeout(400)
    await click(page, sel, top=28)
    await page.wait_for_timeout(1200)
    rows, t0 = await record(page, DECK_PROBES, lambda: page.mouse.click(30, 700), 1600)
    RESULTS['deck.list.sync.close_outside'] = deck_metrics(rows, t0, True)
    await page.wait_for_timeout(400)

    async def open_half_close():
        await click(page, sel, top=28)
        await page.wait_for_timeout(200)
        await page.keyboard.press('Escape')
    rows, t0 = await record(page, DECK_PROBES, open_half_close, 1800)
    RESULTS['deck.list.sync.open200_esc'] = deck_metrics(rows, t0, True)
    await page.wait_for_timeout(400)

    swallowed = []

    async def toggles():
        # 开（点卡头）→ 160ms 后关（点卡外面）× 5：每一下都该生效（不吞）。
        for _ in range(5):
            await click(page, sel, top=28)
            await page.wait_for_timeout(80)
            if await page.evaluate('location.pathname') != '/settings/sync':
                swallowed.append('open')
            await page.wait_for_timeout(80)
            await page.mouse.click(30, 700)
            await page.wait_for_timeout(80)
            if await page.evaluate('location.pathname') != '/settings':
                swallowed.append('close')
            await page.wait_for_timeout(80)
    rows, t0 = await record(page, DECK_PROBES, toggles, 2400)
    m = deck_metrics(rows, t0, True)
    m['final_path'] = await page.evaluate('location.pathname')
    m['swallowed'] = len(swallowed)
    RESULTS['deck.list.sync.toggle5'] = m
    await page.wait_for_timeout(400)

    # 滚到底再开最后一张：页头不该冒出来（滚动不被拉回顶部）。
    await page.evaluate('window.__benchCard = "advanced"')
    await page.evaluate("document.getElementById('main-content').scrollTop = 1e6")
    await page.wait_for_timeout(300)
    before = await page.evaluate("document.getElementById('main-content').scrollTop")
    rows, t0 = await record(page, DECK_PROBES, lambda: click(page, '[data-deck-card="advanced"] .list-open', top=28), 1600)
    m = deck_metrics(rows, t0, False)
    m['scroll_before'] = before
    RESULTS['deck.list.advanced.open_scrolled'] = m
    await browser.close()


async def main(play):
    only = set((ARGS.only or 'letter,page,deck').split(','))
    if 'letter' in only:
        await bench_letter(play)
    if 'deck' in only:
        await bench_deck(play)
    if 'page' in only:
        await bench_page(play)
    keys = sorted({k for v in RESULTS.values() for k in v})
    print('| 场景 | ' + ' | '.join(keys) + ' |')
    print('|' + '---|' * (len(keys) + 1))
    for name, values in RESULTS.items():
        print(f'| {name} | ' + ' | '.join('' if values.get(k) is None else str(values.get(k)) for k in keys) + ' |')
    if ARGS.json:
        Path(ARGS.json).write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--only')
    parser.add_argument('--throttle', type=float, default=4)
    parser.add_argument('--json')
    ARGS = parser.parse_args()
    run(main)
