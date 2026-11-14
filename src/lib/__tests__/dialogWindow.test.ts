import { describe, expect, it } from 'vitest';
import { dialogFillFrames, dialogWindowFrames, edgeBleed } from '../motion/dialogFlight';

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

  it('morphs a circular pill cleanly into a square-cornered paper sheet with bleedEnd', () => {
    const pill = { left: 1780, top: 18, width: 36, height: 36 };
    const sheet = { left: 640, top: 180, width: 640, height: 480 };
    const open = dialogWindowFrames(pill, sheet, sheet, 18, true);
    expect(open[0].clipPath).toBe('inset(0px 604px 444px 0px round 18px)');
    // 右边是从外往里落：最后一帧最多放到上一帧裁切的位置（32.16 ≥ 0.29 × 18，角照样是方的），不再先往外伸。
    expect(open[open.length - 1].clipPath).toBe('inset(-36px -32.16px -36px -36px round 18px)');
  });

  /* 看得见的右边缘 = min(裁切右沿, 画着东西的右沿)，每段关键帧之间两者都按同一条曲线直线走：逐段取样，必须单调。 */
  const nums = (text: unknown) => String(text).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const rightEdges = (frames: Keyframe[], panel: { left: number; width: number }, fill?: Keyframe[], fillWidth = panel.width) => {
    const at = frames.map((frame, i) => {
      const dx = nums(frame.transform)[0];
      const clip = panel.left + dx + panel.width - nums(frame.clipPath)[1];
      const painted = panel.left + dx + (fill ? fillWidth - Math.max(0, nums(fill[i].clipPath)[1]) : panel.width);
      return { clip, painted };
    });
    const seen: number[] = [];
    for (let i = 1; i < at.length; i += 1) {
      for (let k = 0; k <= 20; k += 1) {
        const s = k / 20;
        const lerp = (a: number, b: number) => a + (b - a) * s;
        seen.push(Math.min(lerp(at[i - 1].clip, at[i].clip), lerp(at[i - 1].painted, at[i].painted)));
      }
    }
    return seen;
  };
  const monotone = (values: number[]) => {
    const sign = Math.sign(values[values.length - 1] - values[0]);
    return values.every((v, i) => i === 0 || (v - values[i - 1]) * sign >= -0.01);
  };

  it('a source wider than the panel (shoe row) never shows its extra width past the landing edge', () => {
    const shoe = { left: 48, top: 661, width: 658, height: 83 };
    const panel = { left: 440, top: 120, width: 560, height: 640 };
    const grow = { width: true, height: false };
    const open = dialogWindowFrames(shoe, panel, panel, 14, true, grow);
    const fill = dialogFillFrames(shoe, panel, panel, { width: 658, height: 640 }, 26);
    // 底的裁切：起点露满来处的宽度，终点正好收回面板盒子；没撑大的竖直方向放开（不挡投影）。
    expect(fill[0].clipPath).toBe('inset(-64px 0px -64px -64px round 26px)');
    expect(fill[fill.length - 1].clipPath).toBe('inset(-64px 98px -64px -64px round 26px)');
    const edges = rightEdges(open, panel, fill, 658);
    expect(monotone(edges)).toBe(true);
    expect(Math.max(...edges)).toBeLessThanOrEqual(1000.01);
    expect(edges[edges.length - 1]).toBeCloseTo(1000, 1);
  });

  it('a narrow source to the right (injury row) lands without the edge poking out and back', () => {
    const row = { left: 1024, top: 416, width: 368, height: 68 };
    const panel = { left: 310, top: 40, width: 820, height: 700 };
    const edges = rightEdges(dialogWindowFrames(row, panel, panel, 14, true), panel);
    expect(monotone(edges)).toBe(true);
    expect(edges[edges.length - 1]).toBeCloseTo(1130, 1);
  });

  it('edgeBleed only pushes the last clip outward when that keeps the visible edge moving one way', () => {
    expect(edgeBleed(980, 980, 1000, 36)).toBe(36); // 从里往外落，画着的东西没越过终点：放满
    expect(edgeBleed(990, 1010, 1000, 36)).toBe(0); // 从里往外落，但盒子已经伸到终点外：不放
    expect(edgeBleed(1015, 1040, 1000, 36)).toBe(15); // 从外往里落：最多放到上一帧的位置
    expect(edgeBleed(1050, 1020, 1000, 36)).toBe(36); // 画着的边先到：裁切往外放也露不出东西
  });
});
