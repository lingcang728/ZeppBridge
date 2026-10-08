import { describe, expect, it } from 'vitest';
import { FOCUS_AREAS, MODULE_AREA, focusSplit, normalizeAreas } from '../focusAreas';

describe('normalizeAreas', () => {
  it('只留认识的区块、去重、保持点选顺序', () => {
    expect(normalizeAreas(['training', 'sleep', 'training', 'daily', 'nonsense', 3])).toEqual(['training', 'sleep', 'daily']);
  });

  it('不是数组就当没选', () => {
    expect(normalizeAreas(null)).toEqual([]);
    expect(normalizeAreas('sleep')).toEqual([]);
    expect(normalizeAreas(undefined)).toEqual([]);
  });
});

describe('focusSplit', () => {
  it('没选 = 不过滤（页面原样）', () => {
    expect(focusSplit([])).toBeNull();
  });

  it('三个全选和没选一样，不给伪布局', () => {
    expect(focusSplit(['sleep', 'daily', 'training'])).toBeNull();
  });

  it('选中的模块靠前，按固有顺序；没选中的收起来', () => {
    expect(focusSplit(['training', 'sleep'])).toEqual({
      matched: ['sleep', 'training'],
      folded: ['heart', 'steps', 'body'],
    });
  });

  it('只选日常状态：心率 / 步数 / 身体在前，睡眠与训练收起来', () => {
    expect(focusSplit(['daily'])).toEqual({
      matched: ['heart', 'steps', 'body'],
      folded: ['sleep', 'training'],
    });
  });

  it('不认识的输入当没选', () => {
    expect(focusSplit(['whatever'])).toBeNull();
  });
});

describe('MODULE_AREA', () => {
  it('五个模块各属一个区块，区块都在候选里', () => {
    for (const area of Object.values(MODULE_AREA)) expect(FOCUS_AREAS).toContain(area);
  });
});
