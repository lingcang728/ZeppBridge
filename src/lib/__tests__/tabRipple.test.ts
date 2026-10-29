import { describe, expect, it } from 'vitest';
import { coversView, RIPPLE, RIPPLE_FADE_AT, rippleDelay, rippleDistance, rippleShift } from '../motion/tabRipple';

const view = { left: 0, top: 0, width: 1400, height: 800 };
const tab = { x: 700, y: 40 };

describe('tab ripple', () => {
  it('reaches blocks under the clicked tab first and the far corners last', () => {
    expect(rippleDelay({ left: 600, top: 30, width: 200, height: 100 }, tab, view)).toBe(0);
    const near = rippleDelay({ left: 600, top: 120, width: 200, height: 100 }, tab, view);
    const far = rippleDelay({ left: 0, top: 700, width: 100, height: 100 }, tab, view);
    expect(near).toBeLessThan(far);
    expect(rippleDelay({ left: 0, top: 800, width: 0, height: 0 }, tab, view)).toBe(RIPPLE.spread);
  });

  it('measures to the nearest edge, so a wide block starts as soon as the front touches it', () => {
    expect(rippleDistance({ left: 0, top: 100, width: 1400, height: 50 }, tab)).toBe(60);
  });

  it('pushes blocks outward from the tab; straight down when right under it', () => {
    expect(rippleShift({ left: 690, top: 30, width: 20, height: 20 }, tab)).toEqual({ x: 0, y: 12 });
    const left = rippleShift({ left: 0, top: 30, width: 20, height: 20 }, tab);
    expect(left.x).toBeLessThan(0);
  });

  it('lets the old block go transparent before the new one starts showing (no ghosting)', () => {
    expect(RIPPLE.lag).toBeGreaterThanOrEqual(RIPPLE.out * RIPPLE_FADE_AT);
  });

  it('treats a full-screen layer (the sheet blur) as a veil, not a block', () => {
    expect(coversView({ left: 0, top: 0, width: 1400, height: 800 }, view)).toBe(true);
    expect(coversView({ left: 100, top: 100, width: 900, height: 500 }, view)).toBe(false);
  });
});
