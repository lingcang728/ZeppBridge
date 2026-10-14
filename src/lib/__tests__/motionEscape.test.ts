import { describe, expect, it } from 'vitest';
import { deferSettle, escapeMotion, onMotionEscape, onMotionSkip, settleMotion } from '../motion/interrupt';

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

  it('lets a reversing motion skip the settle that the following navigation triggers', () => {
    let skipped = 0;
    const forget = onMotionSkip(() => { skipped += 1; });
    deferSettle(1000);
    expect(settleMotion()).toBe(false);
    expect(skipped).toBe(0);
    forget();
  });
});
