import { describe, expect, it } from 'vitest';
import { backDestination, cardCloseDestination, dragThumb, navigationBranch, pageMotion, snapStop } from '../navigation';

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

describe('back navigation', () => {
  it('returns to wherever the page was opened from', () => {
    // 概览「数据来源 · 管理」→ 设置的账号卡：返回回概览，不是设置首页。
    expect(backDestination('/settings/account', '/')).toEqual({ path: '/', viaHistory: true });
    expect(backDestination('/sleep/42', '/recent')).toEqual({ path: '/recent', viaHistory: true });
  });
  it('falls back to the tab root when there is nowhere to go back to', () => {
    expect(backDestination('/sleep/42', null)).toEqual({ path: '/', viaHistory: false });
    expect(backDestination('/settings/account', '/settings/account')).toEqual({ path: '/settings', viaHistory: false });
  });
  it('closes a settings card back to its origin', () => {
    expect(cardCloseDestination('/settings')).toEqual({ path: '/settings', viaHistory: true });
    expect(cardCloseDestination('/')).toEqual({ path: '/', viaHistory: true });
    expect(cardCloseDestination('/health-check')).toEqual({ path: '/health-check', viaHistory: true });
    expect(cardCloseDestination('/settings/sync')).toEqual({ path: '/settings', viaHistory: false });
    expect(cardCloseDestination(null)).toEqual({ path: '/settings', viaHistory: false });
  });
});

describe('pageMotion', () => {
  it('focuses into a detail page and backs out of it', () => {
    expect(pageMotion('/', '/sleep/42')).toBe('forward');
    expect(pageMotion('/sleep/42', '/')).toBe('back');
    expect(pageMotion('/settings', '/health-check')).toBe('forward');
  });

  it('slides between tabs in the order the nav capsule shows them', () => {
    expect(pageMotion('/', '/ai')).toBe('left');
    expect(pageMotion('/settings', '/ai')).toBe('right');
    // 从概览的详情页跳到设置也是向左：方向看入口，不看深度。
    expect(pageMotion('/workouts/7', '/settings')).toBe('left');
  });
});
