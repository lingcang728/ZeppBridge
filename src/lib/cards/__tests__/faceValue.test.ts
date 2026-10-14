import { describe, expect, it } from 'vitest';
import { faceFit, splitFaceValue, textFit } from '../faceValue';

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
