import { describe, expect, it } from 'vitest';
import { dragThumb, navigationBranch, snapStop } from '../navigation';

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
