/**
 * 拖放判定（`hit.ts`）的契约：拖动中的提示与松手结果是同一个函数——
 * 「看到的」就是「会发生的」。
 *   - 类别：到原点的距离 < `boundary` 算「交给 AI」，压线或出圈算移出；
 *   - 指标：到父类别的距离 < `metricLength × 1.4` 算保留，拖远算排除；
 *   - 中心节点不参与判定（null）。只有一条线，没有中间地带。
 */
import { describe, expect, it } from 'vitest';
import { dropIncludes } from '../hit';
import type { GraphRadii } from '../layout';

const RADII: GraphRadii = { inner: 40, outer: 100, boundary: 80, metricLength: 50 };

describe('dropIncludes · 类别', () => {
  it('到原点的距离小于 boundary 算加入，压线或出圈算移出', () => {
    const node = { kind: 'category' as const };
    expect(dropIncludes(node, { x: 0, y: 0 }, null, RADII)).toBe(true);
    expect(dropIncludes(node, { x: 0, y: -79.9 }, null, RADII)).toBe(true);
    expect(dropIncludes(node, { x: 80, y: 0 }, null, RADII)).toBe(false);
    expect(dropIncludes(node, { x: 60, y: 60 }, null, RADII)).toBe(false);
    // 判定只量到原点的距离，父节点位置不参与。
    expect(dropIncludes(node, { x: 10, y: 0 }, { x: 500, y: 500 }, RADII)).toBe(true);
  });
});

describe('dropIncludes · 指标', () => {
  it('离父节点不超过自己那一圈 + 余量算保留，拖远算排除', () => {
    const node = { kind: 'metric' as const, index: 0, siblings: 3 };
    const parent = { x: 30, y: -10 };
    // 第一圈半径 90（不小于 90），余量 34：阈值 124。
    expect(dropIncludes(node, parent, parent, RADII)).toBe(true);
    expect(dropIncludes(node, { x: 153.9, y: -10 }, parent, RADII)).toBe(true);
    expect(dropIncludes(node, { x: 154, y: -10 }, parent, RADII)).toBe(false);
    // 外圈的指标阈值跟着它那一圈放大。
    const outer = { kind: 'metric' as const, index: 20, siblings: 22 };
    expect(dropIncludes(outer, { x: 30 + 200, y: -10 }, parent, RADII)).toBe(true);
    // 判定跟父节点走，不跟原点走：原点近在咫尺也不算保留。
    expect(dropIncludes(node, { x: 0, y: 0 }, { x: 400, y: 0 }, RADII)).toBe(false);
  });

  it('没有父位置时给 null', () => {
    expect(dropIncludes({ kind: 'metric' }, { x: 0, y: 0 }, null, RADII)).toBeNull();
  });
});

describe('dropIncludes · 其他', () => {
  it('中心节点不判定，返回 null', () => {
    expect(dropIncludes({ kind: 'center' }, { x: 0, y: 0 }, null, RADII)).toBeNull();
    expect(dropIncludes({ kind: 'center' }, { x: 10, y: 0 }, { x: 0, y: 0 }, RADII)).toBeNull();
  });
});
