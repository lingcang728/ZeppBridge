import { describe, expect, it } from 'vitest';
import { ARRIVAL_MAX, arrivalDelay } from '../arrival';

const box = (left: number, top: number, width = 20, height = 20) => ({ left, top, width, height });

describe('同步新值的到达延时', () => {
  it('没有来源就不延时', () => {
    expect(arrivalDelay(box(500, 500), null)).toBe(0);
  });

  it('和胶囊同一个中心时不延时', () => {
    expect(arrivalDelay(box(100, 100), box(100, 100))).toBe(0);
  });

  it('按中心距离除以速度，越远越晚', () => {
    expect(arrivalDelay(box(400, 0), box(0, 0))).toBe(100);
    expect(arrivalDelay(box(0, 300), box(400, 0))).toBe(125);
  });

  it('960px 正好封顶，再远也不超过上限', () => {
    expect(arrivalDelay(box(960, 0), box(0, 0))).toBe(ARRIVAL_MAX);
    expect(arrivalDelay(box(4000, 3000), box(0, 0))).toBe(ARRIVAL_MAX);
  });
});
