import { describe, expect, it } from 'vitest';
import { placeTip } from '../glassTip';

const view = { width: 1000, height: 700 };
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

describe('placeTip', () => {
  it('放在元素正上方、左右对正', () => {
    const at = placeTip(rect(400, 300, 100, 40), { width: 120, height: 30 }, view);
    expect(at.above).toBe(true);
    expect(at.left).toBe(390);
    expect(at.top).toBe(300 - 8 - 30);
  });
  it('上面放不下就放到下面（顶部的按钮）', () => {
    const at = placeTip(rect(400, 10, 100, 40), { width: 120, height: 30 }, view);
    expect(at.above).toBe(false);
    expect(at.top).toBe(58);
  });
  it('左右夹在窗口里，不出界', () => {
    expect(placeTip(rect(0, 300, 20, 20), { width: 200, height: 30 }, view).left).toBe(8);
    expect(placeTip(rect(990, 300, 10, 20), { width: 200, height: 30 }, view).left).toBe(1000 - 8 - 200);
  });
});
