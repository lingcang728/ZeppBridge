import { describe, expect, it } from 'vitest';
import { popoverStyle, resolveDropUp, VIEWPORT_MARGIN } from '../popoverPosition';

/* issue #9 的回归门。
   日期选择器原来固定向下展开，触发按钮在窗口底部时日历整块落到视口之外，
   用户既看不见也滚不到。下面几条断言的就是「任何情况下都要看得全」。 */

const viewport = { width: 1280, height: 800 };
const sizing = { maxHeight: 300, width: 240 };

describe('popover positioning', () => {
  it('drops down when there is room below', () => {
    const trigger = { top: 100, bottom: 130, left: 400, width: 120 };
    expect(resolveDropUp(trigger, viewport, sizing)).toBe(false);
    const style = popoverStyle(trigger, viewport, sizing);
    expect(style.top).toBe('134px');
    expect(style.bottom).toBeUndefined();
  });

  it('flips up when the trigger sits near the bottom edge', () => {
    // 触发按钮离底部只剩 30px —— 这正是「快捷范围」那一行在小窗口里的处境。
    const trigger = { top: 740, bottom: 770, left: 400, width: 120 };
    expect(resolveDropUp(trigger, viewport, sizing)).toBe(true);
    const style = popoverStyle(trigger, viewport, sizing);
    expect(style.bottom).toBe(`${800 - 740 + 4}px`);
    expect(style.top).toBeUndefined();
  });

  it('picks the roomier side and shrinks to fit when neither side is generous', () => {
    const short = { width: 1280, height: 400 };
    const trigger = { top: 250, bottom: 280, left: 400, width: 120 };
    // 上方 242px，下方 112px：翻上去，并把高度压到放得下。
    expect(resolveDropUp(trigger, short, sizing)).toBe(true);
    const style = popoverStyle(trigger, short, sizing);
    expect(Number.parseInt(style.maxHeight, 10)).toBeLessThanOrEqual(250 - VIEWPORT_MARGIN);
  });

  it('never lets a wide popover run off the right edge', () => {
    // 触发按钮贴着右边：日历比按钮宽得多，`right: 0` 的老写法在这里会越界。
    const trigger = { top: 100, bottom: 130, left: 1200, width: 60 };
    const style = popoverStyle(trigger, viewport, sizing);
    const left = Number.parseInt(style.left, 10);
    expect(left + 240).toBeLessThanOrEqual(viewport.width - VIEWPORT_MARGIN);
  });

  it('never lets it run off the left edge either', () => {
    const trigger = { top: 100, bottom: 130, left: -40, width: 60 };
    const style = popoverStyle(trigger, viewport, sizing);
    expect(Number.parseInt(style.left, 10)).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it('keeps a usable height even in a very short window', () => {
    // 最小窗口高度是 560；这里比它还苛刻，仍然不能算出 0 高度的浮层。
    const tiny = { width: 520, height: 320 };
    const trigger = { top: 150, bottom: 180, left: 200, width: 120 };
    const style = popoverStyle(trigger, tiny, sizing);
    expect(Number.parseInt(style.maxHeight, 10)).toBeGreaterThan(0);
  });
});
