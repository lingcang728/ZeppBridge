import { describe, expect, it } from 'vitest';
import { swipeDestination } from '../pageSwipe';

describe('main page mouse swipe', () => {
  it('switches only adjacent main pages', () => {
    expect(swipeDestination('/', -100, 8)).toBe('/ai');
    expect(swipeDestination('/ai', -100, 8)).toBe('/settings');
    expect(swipeDestination('/settings', 100, 8)).toBe('/ai');
    expect(swipeDestination('/', 100, 8)).toBeNull();
    expect(swipeDestination('/settings', -100, 8)).toBeNull();
  });
  it('ignores short, vertical and secondary page drags', () => {
    expect(swipeDestination('/ai', 70, 0)).toBeNull();
    expect(swipeDestination('/ai', 120, 100)).toBeNull();
    expect(swipeDestination('/sleep/1', 130, 0)).toBeNull();
  });
});
