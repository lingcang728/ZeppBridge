import { describe, expect, it } from 'vitest';
import { progress, TURN_AT, turnKeyframes, turnPose, type Pose } from '../letters/turn';

const W = 600;
const H = 700;
const top: Pose = { x: 0, y: 0, r: 0 };
const bottom: Pose = { x: -5, y: 9, r: -1 };

describe('信纸翻页路径', () => {
  it('从起点出发、落在终点，层次只在最远处换一次', () => {
    const frames = turnKeyframes(top, bottom, W, H, '5', '0');
    expect(frames[0]!.transform).toBe('translate(0.00px, 0.00px) rotate(0.000deg)');
    expect(frames[frames.length - 1]!.transform).toBe('translate(-5.00px, 9.00px) rotate(-1.000deg)');
    const swaps = frames.filter((f, i) => i > 0 && f.zIndex !== frames[i - 1]!.zIndex);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.offset! - TURN_AT).toBeLessThan(1e-3);
    expect(progress(TURN_AT)).toBeCloseTo(0.5, 6);
    // 换层次那一刻整张纸在整沓左边、不重叠：右边缘（转角带来的外扩按半对角线估）仍在整沓左边缘以左。
    const peak = turnPose(0.5, top, bottom, W, H);
    const reach = Math.hypot(W / 2, H / 2) * Math.sin(Math.abs(peak.r) * Math.PI / 180);
    expect(peak.x + W / 2 + reach).toBeLessThan(-W / 2);
  });

  it('中途不停：掉头时纸仍在动（录屏里「顿一下」就是最远处速度归零停了一拍）', () => {
    const step = 1 / 200;
    const speeds: number[] = [];
    for (let t = 0; t < 0.85; t += step) {
      const a = turnPose(progress(t), bottom, top, W, H);
      const b = turnPose(progress(t + step), bottom, top, W, H);
      // 位移和转角（按半宽的弧长折成像素）一起算：只要有一样在变，人眼看到的就是在动。
      speeds.push(Math.hypot(b.x - a.x, b.y - a.y, ((b.r - a.r) * Math.PI / 180) * (W / 2)) / step);
    }
    const fastest = Math.max(...speeds);
    expect(Math.min(...speeds)).toBeGreaterThan(fastest * 0.08);
  });

  it('落回整沓时慢慢停稳，不是全速撞上去', () => {
    const end = (t: number) => turnPose(progress(t), top, bottom, W, H);
    const last = Math.hypot(end(1).x - end(0.99).x, end(1).y - end(0.99).y);
    const first = Math.hypot(end(0.01).x - end(0).x, end(0.01).y - end(0).y);
    expect(last).toBeLessThan(first * 0.05);
  });
});
