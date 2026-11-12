import { describe, expect, it } from 'vitest';
import { escapeMotion, onMotionEscape, onMotionSkip, settleMotion } from '../motion/interrupt';

describe('motion escape', () => {
  it('asks the newest motion first and stops at the one that takes the Esc', () => {
    const calls: string[] = [];
    const forgetOld = onMotionEscape(() => { calls.push('old'); return true; });
    const forgetNew = onMotionEscape(() => { calls.push('new'); return false; });
    expect(escapeMotion()).toBe(true);
    expect(calls).toEqual(['new', 'old']);
    forgetOld();
    forgetNew();
    expect(escapeMotion()).toBe(false);
  });

  it('ends waiting motions once when settled', () => {
    let skipped = 0;
    onMotionSkip(() => { skipped += 1; });
    expect(settleMotion()).toBe(true);
    expect(settleMotion()).toBe(false);
    expect(skipped).toBe(1);
  });
});
