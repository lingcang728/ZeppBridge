"""文字重叠矩阵：每种界面语言 × 主要页面，断言看得见的文字两两不压在一起。

起因（2026-10-07 用户截图）：法语里指标卡的标题「Stress」和「Above usual by 14 pts」叠在一起、
「Ask AI」被挤成两行。顶栏有 topbar_collision.py 守着，页面里的卡片头、胶囊、按钮以前没人守。

做法：演示模式（?demo=1，不需要真实库）打开页面，等动画放完，用 Range 量每一段可见文字的每一行的矩形；
两段不同元素的文字矩形相交超过较小那块的 25% 就算重叠（祖孙关系、同一个元素的多行不算）。
浮层、提示气泡这类本来就盖在上面的（role=tooltip、[data-ash-skip]、不可见的）跳过。

需要先起不带夹具的开发服务器（.claude/launch.json 的 landing-dev，端口 5190）：
    python scripts/verify/text_overlap.py [--url http://127.0.0.1:5190] [--locales fr,de] [--width 1440]
退出码 0 = 全部通过。全量十种语言 × 九页约五分钟，单线程、不会满载。
"""
import argparse
import asyncio
import sys

from playwright.async_api import async_playwright

LOCALES = ['zh', 'en', 'es', 'nl', 'pt-BR', 'pt-PT', 'de', 'ru', 'hi-IN', 'fr']
PATHS = ['/', '/body', '/training', '/heart', '/activity', '/ai', '/ai/exchanges', '/ai/check', '/settings']
# 点开以后才出现的整屏层（第三轮 A8：牌桌展开后头部、范围胶囊、提示条不能和牌压在一起）。
OVERLAYS = {'/body': ('.pick-days', '牌桌')}

PROBE = """() => {
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const visible = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      if (n.matches('[role=tooltip], [data-ash-skip], .sr-only, .visually-hidden')) return false;
      // 收起的 <details>：里面的内容不画，但 Range 仍量得到矩形。
      if (n.parentElement?.matches('details:not([open])') && n.tagName !== 'SUMMARY') return false;
    }
    return true;
  };
  /* 看得见的部分：文字矩形和每一层 overflow 不是 visible 的祖先求交（省略号截掉的、滚轮两边被遮掉的不算）。
     层：最近的 fixed / sticky 祖先（浮层、底栏、顶栏）。只比同一层里的文字——浮层盖住页面是设计，不是重叠。 */
  const clipAndLayer = (el) => {
    let box = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    let layer = document.body;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' || s.maskImage !== 'none') {
        const r = n.getBoundingClientRect();
        box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
      }
      if (layer === document.body && (s.position === 'fixed' || s.position === 'sticky')) layer = n;
    }
    return { box, layer };
  };
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent || !node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || !visible(el)) continue;
    const { box, layer } = clipAndLayer(el);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const raw of range.getClientRects()) {
      const r = { left: Math.max(raw.left, box.l), right: Math.min(raw.right, box.r), top: Math.max(raw.top, box.t), bottom: Math.min(raw.bottom, box.b) };
      if (r.right - r.left < 3 || r.bottom - r.top < 6) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      boxes.push({ el, layer, l: r.left, r: r.right, t: r.top, b: r.bottom, text: node.textContent.trim().slice(0, 30) });
    }
  }
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.layer !== b.layer) continue;
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w <= 0 || h <= 0) continue;
      const small = Math.min((a.r - a.l) * (a.b - a.t), (b.r - b.l) * (b.b - b.t));
      if (w * h > small * 0.25) out.push(`「${a.text}」×「${b.text}」`);
    }
  }
  return [...new Set(out)].slice(0, 12);
}"""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:5190')
    ap.add_argument('--locales', default=','.join(LOCALES))
    ap.add_argument('--width', type=int, default=1440)
    args = ap.parse_args()
    failures = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', headless=True)
        for loc in args.locales.split(','):
            page = await browser.new_page(viewport={'width': args.width, 'height': 900})
            for path in PATHS:
                await page.goto(f'{args.url}/?demo=1&theme=dark&lang={loc}&route={path}')
                await page.wait_for_timeout(2600)
                found = await page.evaluate(PROBE)
                if found:
                    failures += 1
                    print(f'✗ {loc:6} {path:12} ' + '；'.join(found))
                else:
                    print(f'✓ {loc:6} {path}')
                if path in OVERLAYS:
                    selector, label = OVERLAYS[path]
                    trigger = page.locator(selector).first
                    if await trigger.count():
                        await trigger.click()
                        await page.wait_for_timeout(2200)
                        found = await page.evaluate(PROBE)
                        name = f'{path}+{label}'
                        if found:
                            failures += 1
                            print(f'✗ {loc:6} {name:12} ' + '；'.join(found))
                        else:
                            print(f'✓ {loc:6} {name}')
                        await page.keyboard.press('Escape')
                        await page.wait_for_timeout(1500)
            await page.close()
        await browser.close()
    print(f'\n{failures} 处页面有文字重叠' if failures else '\n全部通过：没有文字压在一起')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
