import { describe, expect, it } from 'vitest';
import { dialogWindowFrames } from '../motion/dialogFlight';
import { sheetClip, sheetRadius } from '../motion/sheet';

describe('sheet morph', () => {
  it('starts as the pill itself: the window is the pill rect, content 1:1 anchored at its corner', () => {
    const panel = { left: 160, top: 84, width: 960, height: 600 };
    const pill = { left: 540, top: 500, width: 240, height: 40 };
    const frames = dialogWindowFrames(pill, panel, panel, sheetRadius(pill, 20));
    // 不缩放：只平移到胶囊左上角，裁切框正好是胶囊那么大、圆角是胶囊的半高。
    expect(frames[0].transform).toBe('translate(380px, 416px)');
    expect(frames[0].clipPath).toBe('inset(0px 720px 560px 0px round 20px)');
    expect(frames[frames.length - 1].transform).toBe('translate(0px, 0px)');
  });

  it('keeps one radius for the whole flight, capped by the pill and at 24px', () => {
    expect(sheetRadius({ left: 0, top: 0, width: 120, height: 30 }, 999)).toBe(15);
    expect(sheetRadius({ left: 0, top: 0, width: 300, height: 80 }, 0)).toBe(24);
  });

  it('keeps the bleed clip concentric with the card corners', () => {
    expect(sheetClip(28)).toEqual({ flush: 'inset(0px round 28px)', bleed: 'inset(-90px round 118px)' });
  });
});
