import { describe, expect, it } from 'vitest';
import { planUnfold } from '../letters/unfold';

const num = (text: string, name: string, index = 0) => Number(new RegExp(`${name}\\(([^)]+)\\)`).exec(text)![1]!.split(',')[index]!.replace('px', '').trim());

describe('拆信时间线', () => {
  const envelope = { left: 390, top: 254, width: 500, height: 312.5 };
  const paper = { left: 420, top: 273, width: 440, height: 262 };
  const shell = { left: 320, top: 47, width: 640, height: 598 };
  const plan = planUnfold({ envelope, paper, shell });
  const at = plan.handoff / plan.duration;

  it('接手那一刻外面那张和信封里那张重合（位置、宽度），而且只有一张看得见', () => {
    const envelopeFrame = plan.envelope.find((frame) => frame.offset === at)!;
    const paperFrame = plan.paper.find((frame) => frame.offset === at)!;
    const shellFrames = plan.shell.filter((frame) => frame.offset === at);
    expect(shellFrames).toHaveLength(1);
    const shellFrame = shellFrames[0]!;
    const sinkY = num(String(envelopeFrame.transform), 'translateY');
    const riseY = num(String(paperFrame.transform), 'translateY');
    const scale = num(String(shellFrame.transform), 'scale');
    expect(shell.top + num(String(shellFrame.transform), 'translate', 1)).toBeCloseTo(paper.top + sinkY + riseY, 0);
    expect(shell.left + shell.width / 2 + num(String(shellFrame.transform), 'translate', 0)).toBeCloseTo(paper.left + paper.width / 2, 0);
    expect(shell.width * scale).toBeCloseTo(paper.width, 0);
    // 接手时信封里那张的下沿已经越过信封口（不会穿过信封）。
    expect(paper.top + riseY + paper.height).toBeLessThan(envelope.top);
    expect(paperFrame.opacity).toBe(1);
    expect(shellFrame.opacity).toBe(0);
    const after = plan.shell[plan.shell.indexOf(shellFrame) + 1]!;
    expect(after.opacity).toBe(1);
    expect(plan.paper.find((frame) => Number(frame.offset) > at)!.opacity).toBe(0);
  });

  it('终点就是信纸本来的位置，关键帧偏移单调', () => {
    const last = plan.shell[plan.shell.length - 1]!;
    expect(String(last.transform)).toContain('translate(0px, 0px)');
    expect(String(last.transform)).toContain('scale(1)');
    for (const frames of [plan.envelope, plan.paper, plan.shell]) {
      const offsets = frames.map((frame) => Number(frame.offset));
      expect(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1]!)).toBe(true);
      expect(offsets[offsets.length - 1]).toBe(1);
    }
    expect(plan.foldH).toBeLessThan(shell.height);
  });
});
