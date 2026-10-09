import { describe, expect, it } from 'vitest';
import { REEL_IDS, reelRoute, reelSize } from '../reel';

describe('landing motion reel', () => {
  it('keeps the same presentation canvas across every chapter', () => {
    for (const id of [...REEL_IDS, 'ai', 'overview', 'sleep', 'workouts']) expect(reelSize(id)).toEqual({ width: 1280, height: 800 });
  });
  it('opens complete stories on the appropriate native app route', () => {
    expect(reelRoute('glass')).toBe('/');
    expect(reelRoute('notes')).toBe('/');
    expect(reelRoute('poker')).toBe('/');
    expect(reelRoute('ai')).toBe('/ai');
    expect(reelRoute('box')).toBe('/');
    expect(reelRoute('sleep')).toBe('/sleep');
  });
});
