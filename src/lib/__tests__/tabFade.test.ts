import { describe, expect, it } from 'vitest';
import { coversView, TAB_FADE } from '../motion/tabFade';

const view = { left: 0, top: 0, width: 1400, height: 800 };

describe('tab fade', () => {
  it('fades the old page out before the new one starts, all within the app-wide pace', () => {
    expect(TAB_FADE.out).toBeLessThan(TAB_FADE.in);
    expect(TAB_FADE.out + TAB_FADE.in).toBeLessThanOrEqual(650);
  });

  it('treats a full-screen layer (the sheet blur) as something to look inside, not a layer to fade whole', () => {
    expect(coversView({ left: 0, top: 0, width: 1400, height: 800 }, view)).toBe(true);
    expect(coversView({ left: 100, top: 100, width: 900, height: 500 }, view)).toBe(false);
  });
});
