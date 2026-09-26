import { describe, expect, it } from 'vitest';
import { dragThumb, navigationBranch, segmentClip, snapStop } from '../navigation';

const stops = [
  { left: 3, width: 70, value: '/' },
  { left: 75, width: 110, value: '/ai' },
  { left: 187, width: 70, value: '/settings' },
];
describe('navigation gestures', () => {
  it('keeps overview details selected through nested routes', () => {
    for (const path of ['/body', '/training', '/heart', '/sleep/42', '/activity', '/workouts/1', '/recent']) {
      expect(navigationBranch(path)).toBe('/');
    }
    expect(navigationBranch('/ai')).toBe('/ai');
    expect(navigationBranch('/health-check')).toBe('/settings');
    expect(navigationBranch('/devices/2')).toBe('/settings');
    expect(navigationBranch('/settings/archive')).toBe('/settings');
  });
  it('interpolates width between unequal labels and contains both edges', () => {
    expect(dragThumb(stops, 84).width).toBeCloseTo(90);
    expect(dragThumb(stops, -100, -2).left).toBe(3);
    const right = dragThumb(stops, 400, 2);
    expect(right.left + right.width).toBe(257);
  });
  it('projects a fast flick while a stationary release snaps locally', () => {
    expect(snapStop(stops, 70, 0).value).toBe('/');
    expect(snapStop(stops, 70, 0.8).value).toBe('/ai');
    expect(snapStop(stops, 195, -0.7).value).toBe('/ai');
  });
});

describe('segment ink clip', () => {
  it('reveals exactly the span the thumb covers', () => {
    // 选中字只在滑块底下露出来：左边界 = 滑块左沿，右边界 = 轨道宽 − 滑块右沿。
    expect(segmentClip({ left: 75, width: 110, visible: true }, 260)).toBe('inset(3px 75px 3px 75px round 999px)');
  });
  it('grows with the drag lens so no ring of plain text shows around it', () => {
    // 透镜横向放大 1.1 倍：110px 宽的滑块两边各多出 5.5px，纵向顶满轨道。
    expect(segmentClip({ left: 75, width: 110, visible: true }, 260, 3, 1.1)).toBe('inset(0px 69.5px 0px 69.5px round 999px)');
  });
  it('hides the ink layer until the thumb has been measured', () => {
    expect(segmentClip({ left: 0, width: 0, visible: false }, 260)).toBe('inset(50%)');
    expect(segmentClip({ left: 10, width: 40, visible: true }, 0)).toBe('inset(50%)');
  });
  it('never produces a negative inset while the thumb overshoots', () => {
    expect(segmentClip({ left: -4, width: 280, visible: true }, 260)).toBe('inset(3px 0px 3px 0px round 999px)');
  });
});
