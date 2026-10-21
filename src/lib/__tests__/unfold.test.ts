import { describe, expect, it } from 'vitest';
import { PERSPECTIVE, planUnfold } from '../letters/unfold';

const num = (text: string, name: string, index = 0) => Number(new RegExp(`${name}\\(([^)]+)\\)`).exec(text)![1]!.split(',')[index]!.replace('px', '').trim());
const depth = (z: number) => PERSPECTIVE / (PERSPECTIVE - z);

describe('拆信时间线', () => {
  const envelope = { left: 390, top: 254, width: 500, height: 312.5 };
  const wrap = { left: 390, top: 254, width: 500, height: 356 };
  const paper = { left: 420, top: 273, width: 440, height: 262 };
  const shell = { left: 320, top: 47, width: 640, height: 598 };
  const plan = planUnfold({ envelope, wrap, paper, shell });
  const at = plan.handoff / plan.duration;

  /* 照 CSS 变换手算：信纸绕自己中心（透视 + 平移），再随信封绕信封那一格的中心（透视 + 平移）。 */
  const envelopeFrame = plan.envelope.find((frame) => frame.offset === at)!;
  const paperFrame = plan.paper.find((frame) => frame.offset === at)!;
  const ey = num(String(envelopeFrame.transform), 'translateY');
  const ez = num(String(envelopeFrame.transform), 'translateZ');
  const py = num(String(paperFrame.transform), 'translateY');
  const pz = num(String(paperFrame.transform), 'translateZ');
  const ox = wrap.left + wrap.width / 2;
  const oy = wrap.top + wrap.height / 2;
  const ke = depth(ez);
  const k = ke * depth(pz);
  const cy = oy + ke * (paper.top + paper.height / 2 + depth(pz) * py + ey - oy);
  const seen = { top: cy - (paper.height * k) / 2, bottom: cy + (paper.height * k) / 2, cx: ox + ke * (paper.left + paper.width / 2 - ox), width: paper.width * k };

  it('接手那一刻外面那张和信封里那张重合（位置、宽度），而且只有一张看得见', () => {
    const shellFrames = plan.shell.filter((frame) => frame.offset === at);
    expect(shellFrames).toHaveLength(1);
    const shellFrame = shellFrames[0]!;
    expect(String(shellFrame.transform)).toContain('translateZ(0px)');
    expect(shell.top + num(String(shellFrame.transform), 'translate', 1)).toBeCloseTo(seen.top, 0);
    expect(shell.left + shell.width / 2 + num(String(shellFrame.transform), 'translate', 0)).toBeCloseTo(seen.cx, 0);
    expect(shell.width * num(String(shellFrame.transform), 'scale')).toBeCloseTo(seen.width, 0);
    expect(paperFrame.opacity).toBe(1);
    expect(shellFrame.opacity).toBe(0);
    const after = plan.shell[plan.shell.indexOf(shellFrame) + 1]!;
    expect(after.opacity).toBe(1);
    expect(plan.paper.find((frame) => Number(frame.offset) > at)!.opacity).toBe(0);
  });

  it('抽出来时信纸和信封分开纵深：信纸往前抬、信封往后退，下沿离信封口留开一截', () => {
    expect(pz).toBeGreaterThan(0);
    expect(ez).toBeLessThan(0);
    const envelopeTop = oy + ke * (envelope.top + ey - oy);
    expect(seen.bottom).toBeLessThan(envelopeTop - 20);
  });

  it('终点就是信纸本来的位置，关键帧偏移单调', () => {
    const last = plan.shell[plan.shell.length - 1]!;
    expect(String(last.transform)).toContain('translate(0px, 0px)');
    expect(String(last.transform)).toContain('scale(1)');
    for (const frames of [plan.envelope, plan.paper, plan.shell, plan.shadow]) {
      const offsets = frames.map((frame) => Number(frame.offset));
      expect(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1]!)).toBe(true);
      expect(offsets[offsets.length - 1]).toBe(1);
    }
    expect(plan.shadow[plan.shadow.length - 1]!.opacity).toBe(0);
    expect(plan.foldH).toBeLessThan(shell.height);
  });
});
