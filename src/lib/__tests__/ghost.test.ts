import { describe, expect, it } from 'vitest';
import { ghostInset } from '../motion/ghost';

describe('ghostInset', () => {
  const page = { left: 100, top: 60, width: 1000, height: 700 };

  it('crops the plate down to the source card', () => {
    const card = { left: 140, top: 120, width: 300, height: 180 };
    expect(ghostInset(card, page, 22)).toBe('inset(60px 660px 460px 40px round 22px)');
  });

  it('is fully open when source equals target', () => {
    expect(ghostInset(page, page, 0)).toBe('inset(0px 0px 0px 0px round 0px)');
  });

  it('never produces negative insets when the card pokes outside the viewport', () => {
    const card = { left: 80, top: 20, width: 300, height: 180 };
    expect(ghostInset(card, page, 10)).toBe('inset(0px 720px 560px 0px round 10px)');
  });
});
