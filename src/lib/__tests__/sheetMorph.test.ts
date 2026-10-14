import { describe, expect, it } from 'vitest';
import { sheetClip, sheetPose } from '../motion/sheet';

describe('sheet morph', () => {
  it('scales uniformly to the pill width and clips the rest to the pill shape', () => {
    const panel = { left: 160, top: 84, width: 960, height: 600 };
    const pill = { left: 540, top: 500, width: 240, height: 40 };
    const pose = sheetPose(pill, panel, 16);
    // 0.25 = 240 / 960：等比，字不被压扁。
    expect(pose.transform).toBe('translate(20.0px, 136.0px) scale(0.2500)');
    // 看得见的高度 = 40 / 0.25 = 160，上下各裁 220；圆角 16 / 0.25。
    expect(pose.clipPath).toBe('inset(220.0px 0.0px round 64.0px)');
  });

  it('keeps the bleed clip concentric with the card corners', () => {
    expect(sheetClip(28)).toEqual({ flush: 'inset(0px round 28px)', bleed: 'inset(-90px round 118px)' });
  });
});
