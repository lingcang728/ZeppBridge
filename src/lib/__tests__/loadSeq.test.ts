import { describe, expect, it } from 'vitest';
import { createLoadSeq } from '../loadSeq';

describe('createLoadSeq', () => {
  it('treats only the latest token as current', () => {
    const seq = createLoadSeq();
    const first = seq.next();
    const second = seq.next();
    expect(seq.isCurrent(first)).toBe(false);
    expect(seq.isCurrent(second)).toBe(true);
    expect(seq.current()).toBe(second);
  });

  it('starts at zero so the first next() is 1', () => {
    const seq = createLoadSeq();
    expect(seq.current()).toBe(0);
    expect(seq.next()).toBe(1);
  });
});
