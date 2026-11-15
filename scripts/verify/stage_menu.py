"""运动详情舞台：每种界面语言 × 1 / 2 / 3 / 4 张卡，打开每个窗口的「•••」菜单，断言里面没有字叠字、溢出、折行。

起因（2026-11-14 用户截图）：除中文外几乎所有语言里，菜单顶上的布局档（「Grid of four / One over three /
Big one on the left」）三项被等分压窄，字溢出到邻项、和滑块下的选中字叠成一团。修法是档位改画格子图
（LayoutGlyph.vue），分段控件铺满型也走「放不下就退档」的梯子（SegmentTrack.vue）。

做法：演示模式（?demo=1，不需要真实库）进第一条运动，往演示用的 localStorage 写入 4 / 2 / 1 张卡的
布局再进一次，逐个点开「•••」：
  - 菜单里的字不许溢出自己的按钮、轨道不许伸出菜单、档位不许折行、动作行不许折成两行；
  - 菜单内部两段文字不许相交（text_overlap.PROBE 限定在菜单里）；
  - 详情页本体也按 text_overlap.PROBE 查一遍。
截图写到 --out（默认系统临时目录），换了排版要亲眼看一遍。

需要先起不带夹具的开发服务器（.claude/launch.json 的 landing-dev，端口 5190）：
    python scripts/verify/stage_menu.py [--url http://127.0.0.1:5190] [--locales fr,de] [--theme light]
退出码 0 = 全部通过。全量十三种语言约五分钟，单线程、不会满载。
"""
import argparse
import asyncio
import os
import sys
import tempfile

from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from text_overlap import LOCALES, PROBE  # noqa: E402

MENU_PROBE = PROBE.replace(
    "document.createTreeWalker(document.body",
    "document.createTreeWalker(document.querySelector('.stage-menu') || document.body",
)

MENU_FIT = """() => {
  const out = [];
  const menu = document.querySelector('.stage-menu');
  if (!menu) return out;
  for (const b of menu.querySelectorAll('.segment-item, .menu-action')) {
    const label = b.querySelector('.seg-label, span');
    if (!label) continue;
    const br = b.getBoundingClientRect(), lr = label.getBoundingClientRect();
    if (lr.left < br.left - 1 || lr.right > br.right + 1) out.push(`溢出「${label.textContent.trim()}」${Math.round(lr.width)}>${Math.round(br.width)}`);
  }
  const track = menu.querySelector('.segment-track');
  if (track) {
    const mr = menu.getBoundingClientRect(), tr = track.getBoundingClientRect();
    if (tr.right > mr.right + 1 || tr.left < mr.left - 1) out.push('档位伸出菜单');
    for (const item of track.querySelectorAll('.segment-item')) {
      const r = item.getBoundingClientRect();
      if (r.right > tr.right + 1 || r.left < tr.left - 1) out.push('档位伸出轨道');
    }
    if (track.classList.contains('is-wrapped')) out.push('档位折行');
  }
  for (const a of menu.querySelectorAll('.menu-action span')) {
    if (a.getClientRects().length > 1) out.push(`动作折行「${a.textContent.trim()}」`);
  }
  return out;
}"""

# 演示的第一条运动是跑步：舞台布局存在 `zeppbridge-workout-stage:v2:run`（lib/stage/prefs.ts）。3 张是默认布局。
LAYOUTS = [
    ('3', None),
    ('4', ['summary', 'route', 'chart-heart', 'chart-altitude']),
    ('2', ['route', 'chart-heart']),
    ('1', ['route']),
]
WORKOUT_LINK = 'a[href*="/workouts/"], [data-workout-id], .workout-row'
SET_LAYOUT = """([ids]) => {
  localStorage.setItem('zeppbridge-workout-stage:v2:run', JSON.stringify({ v: 1, stage: { ids, snap: 0 }, strip: [], hidden: [] }));
  history.back();
}"""


async def check_menus(page, loc, tag, out_dir, width):
    failures = 0
    grips = page.locator('.window-grip')
    shot = False
    for i in range(await grips.count()):
        grip = grips.nth(i)
        if not await grip.is_visible():
            continue
        await grip.click()
        await page.wait_for_timeout(900)
        menu = page.locator('.stage-menu')
        if not await menu.count():
            continue
        problems = list(dict.fromkeys(await page.evaluate(MENU_FIT) + await page.evaluate(MENU_PROBE)))
        if not shot:
            shot = True
            await menu.screenshot(path=os.path.join(out_dir, f'{loc}-{width}-{tag}cards-menu.png'))
        if problems:
            failures += 1
            print(f'✗ {loc:6} {tag} 张卡·菜单{i} ' + '；'.join(problems))
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(600)
    if not failures:
        print(f'✓ {loc:6} {tag} 张卡')
    return failures


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:5190')
    ap.add_argument('--locales', default=','.join(LOCALES))
    ap.add_argument('--theme', default='dark')
    ap.add_argument('--width', type=int, default=1440)
    ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'zeppbridge-stage-menu'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    failures = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', headless=True)
        for loc in args.locales.split(','):
            page = await browser.new_page(viewport={'width': args.width, 'height': 900})
            await page.goto(f'{args.url}/?demo=1&theme={args.theme}&lang={loc}&route=/workouts')
            await page.wait_for_timeout(2500)
            if not await page.locator(WORKOUT_LINK).count():
                failures += 1
                print(f'✗ {loc:6} 运动列表里没有可点的运动')
                await page.close()
                continue
            await page.locator(WORKOUT_LINK).first.click()
            await page.wait_for_timeout(3000)
            for tag, ids in LAYOUTS:
                if ids is not None:
                    await page.evaluate(SET_LAYOUT, [ids])
                    await page.wait_for_timeout(1800)
                    await page.locator(WORKOUT_LINK).first.click()
                    await page.wait_for_timeout(3000)
                found = await page.evaluate(PROBE)
                if found:
                    failures += 1
                    print(f'✗ {loc:6} {tag} 张卡·详情页 ' + '；'.join(found))
                await page.screenshot(path=os.path.join(args.out, f'{loc}-{args.width}-{tag}cards-page.png'))
                failures += await check_menus(page, loc, tag, args.out, args.width)
            await page.close()
        await browser.close()
    print(f'\n截图在 {args.out}')
    print(f'{failures} 处不通过' if failures else '全部通过：菜单和详情页没有字叠字、溢出、折行')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
