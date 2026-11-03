import { describe, expect, it } from 'vitest';
import { addScroll, keyPixels, wheelPixels } from '../scrollGuard';

describe('scroll guard during a page morph', () => {
  it('turns wheel lines and pages into pixels', () => {
    expect(wheelPixels(100, 0, 800)).toBe(100);
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(-1, 2, 800)).toBe(-800);
  });

  it('only counts scrolling keys', () => {
    expect(keyPixels('PageDown', false, 800)).toBe(700);
    expect(keyPixels(' ', true, 800)).toBe(-700);
    expect(keyPixels('End', false, 800)).toBe(Number.POSITIVE_INFINITY);
    expect(keyPixels('a', false, 800)).toBe(0);
  });

  it('lets Home / End override the small scrolls before and after them', () => {
    expect(addScroll(addScroll(0, 100), 60)).toBe(160);
    expect(addScroll(addScroll(120, Number.NEGATIVE_INFINITY), 300)).toBe(Number.NEGATIVE_INFINITY);
  });
});
