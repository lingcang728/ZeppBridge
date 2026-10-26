import { describe, expect, it } from 'vitest';
import { dialogWindowFrames } from '../motion/dialogFlight';

describe('dialog window geometry', () => {
  it('accepts DOMRect prototype getters and preserves exact button endpoints without scaling text', () => {
    // Browser DOMRect properties are getters, not enumerable own properties.
    class Box {
      get left() { return 400; }
      get top() { return 100; }
      get width() { return 560; }
      get height() { return 600; }
    }
    const panel = new Box();
    const button = { left: 1200, top: 700, width: 120, height: 32 };
    const open = dialogWindowFrames(button, panel, panel, 16);
    expect(open[0].clipPath).toBe('inset(0px 440px 568px 0px round 16px)');
    expect(open[0].transform).toBe('translate(800px, 600px)');
    expect(open[open.length - 1].clipPath).toBe('inset(0px 0px 0px 0px round 16px)');
    const close = dialogWindowFrames(panel, button, panel, 16);
    expect(close[close.length - 1].clipPath).toBe(open[0].clipPath);
    expect(close[close.length - 1].transform).toBe(open[0].transform);
    for (const frame of [...open, ...close]) {
      expect(String(frame.clipPath)).not.toMatch(/NaN|undefined/);
      expect(String(frame.clipPath)).toContain('round 16px');
      expect(String(frame.transform)).not.toContain('scale');
    }
  });
});
