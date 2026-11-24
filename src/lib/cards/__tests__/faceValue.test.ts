import { describe, expect, it } from 'vitest';
import { faceFit, routeSketch, sparkPath, splitFaceValue, textFit } from '../faceValue';

describe('牌面读数拆分', () => {
  it('时长拆成数字段和单位段，拼回去还是原文', () => {
    expect(splitFaceValue('8 小时 11 分')).toEqual([{ n: '8' }, { u: '小时' }, { n: '11' }, { u: '分' }]);
    expect(splitFaceValue('8h 11m')).toEqual([{ n: '8' }, { u: 'h' }, { n: '11' }, { u: 'm' }]);
  });

  it('小数、冒号、负号算在数字里；牌另给的单位接在最后', () => {
    expect(splitFaceValue('62.5', 'kg')).toEqual([{ n: '62.5' }, { u: 'kg' }]);
    expect(splitFaceValue('4:35', '/km')).toEqual([{ n: '4:35' }, { u: '/km' }]);
    expect(splitFaceValue('-3')).toEqual([{ n: '-3' }]);
  });

  it('没有数字的读数整串是文字；空值是空数组', () => {
    expect(splitFaceValue('有记录')).toEqual([{ u: '有记录' }]);
    expect(splitFaceValue(null)).toEqual([]);
  });

  it('估宽：单位小一号，汉字比字母宽；越长越宽', () => {
    const zh = faceFit(splitFaceValue('8 小时 11 分'));
    const en = faceFit(splitFaceValue('8h 11m'));
    expect(zh).toBeGreaterThan(en);
    expect(faceFit(splitFaceValue('62'))).toBeLessThan(zh);
    expect(textFit('9/14–9/20')).toBeGreaterThan(textFit('9/16'));
  });
});

describe('牌面小图', () => {
  it('轨迹缩略：保持长宽比、居中进 100×100，点太少不画', () => {
    const d = routeSketch([[0, 0], [0, 0.01], [0.005, 0.01]])!;
    const nums = d.match(/-?[\d.]+/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(100);
    expect(d.startsWith('M')).toBe(true);
    // 东西 1 格、南北半格：横向撑满（6 → 94），纵向居中。
    expect(nums[0]).toBe(6);
    expect(nums[2]).toBe(94);
    expect(routeSketch([[1, 1]])).toBeNull();
    expect(routeSketch([[1, 1], [1, 1]])).toBeNull();
  });

  it('心率小线：低的在下、高的在上，撑满高度', () => {
    expect(sparkPath([100, 150])).toBe('M0 28 L100 2');
    expect(sparkPath([120, 120, 120])).toBe('M0 28 L50 28 L100 28');
    expect(sparkPath([140])).toBeNull();
  });
});
