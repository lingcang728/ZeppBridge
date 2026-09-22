import { describe, expect, it, vi } from 'vitest';
import { effectiveReducedMotion, systemReducedMotion, watchReducedMotion } from '../motion';

describe('orbit reduced-motion detection', () => {
  it('systemReducedMotion is false where no window/matchMedia exists', () => {
    // vitest runs in the node environment — no DOM at all.
    expect(systemReducedMotion()).toBe(false);
  });

  it('effectiveReducedMotion: an explicit prop always wins over the system', () => {
    const yes = () => true;
    const no = () => false;
    expect(effectiveReducedMotion(true, no)).toBe(true);
    expect(effectiveReducedMotion(false, yes)).toBe(false);
    expect(effectiveReducedMotion(undefined, yes)).toBe(true);
    expect(effectiveReducedMotion(undefined, no)).toBe(false);
    expect(effectiveReducedMotion(undefined)).toBe(false); // node env → system=false
  });

  it('watchReducedMotion is a harmless no-op without a DOM', () => {
    const spy = vi.fn();
    const stop = watchReducedMotion(spy);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
