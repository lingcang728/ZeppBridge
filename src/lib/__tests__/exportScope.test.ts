import { describe, expect, it } from 'vitest';
import { buildExportSelection } from '../exportScope';

const base = {
  dataTypes: ['workouts'] as const,
  detail: 'summary' as const,
};

describe('导出范围互斥', () => {
  it('同时给日期范围和单条运动会被拒绝，而不是挑一个赢家', () => {
    // 定优先级只会让下一个人写出「我以为选了这条运动就只导这一条」的 bug。
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      workoutId: 'run-1',
    });
    expect(result.ok).toBe(false);
    // 断言的是规则的码，不是它的中文说法——文案跟着界面语言走，规则不跟。
    if (!result.ok) expect(result.error).toBe('scope_conflict');
  });

  it('只给单条运动时范围就是那一条', () => {
    const result = buildExportSelection({ ...base, dataTypes: ['workouts'], workoutId: 'run-1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selection.scope).toEqual({ kind: 'workout', workoutId: 'run-1' });
  });

  it('只给日期时范围是这段日期', () => {
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selection.scope).toEqual({
        kind: 'dateRange',
        start: '2026-01-01',
        end: '2026-01-31',
      });
      // 旧字段不再顺手带上：两套写法同时出现会被后端拒绝。
      expect(result.selection.startDate).toBeUndefined();
    }
  });

  it('只写了一半日期不算有效范围', () => {
    const result = buildExportSelection({ ...base, dataTypes: ['workouts'], startDate: '2026-01-01' });
    expect(result.ok).toBe(false);
  });
});

describe('日期边界', () => {
  it('同一天是合法的一天，不是零天', () => {
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2026-03-01',
      endDate: '2026-03-01',
    });
    expect(result.ok).toBe(true);
  });

  it('结束早于开始会被拒绝', () => {
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2026-03-10',
      endDate: '2026-03-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('end_before_start');
  });

  it('刚好一年可以，多一天不行', () => {
    // 2025-01-01 到 2025-12-31 含头含尾正好 365 天。
    const exact = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    expect(exact.ok).toBe(true);

    const oneMore = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2025-01-01',
      endDate: '2026-01-01',
    });
    expect(oneMore.ok).toBe(false);
    if (!oneMore.ok) expect(oneMore.error).toBe('range_too_long');
  });

  it('跨闰日的天数算对', () => {
    // 2024 是闰年：2024-02-01 到 2024-03-01 含头含尾是 30 天。
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '2024-02-01',
      endDate: '2024-03-01',
    });
    expect(result.ok).toBe(true);
  });

  it('日期不可解析时报错，不静默当成今天', () => {
    const result = buildExportSelection({
      ...base,
      dataTypes: ['workouts'],
      startDate: '不是日期',
      endDate: '2026-03-01',
    });
    expect(result.ok).toBe(false);
  });
});

describe('数据类型', () => {
  it('一种都没选时拒绝导出', () => {
    // 导出一个空壳 JSON 比报错更让人困惑。
    const result = buildExportSelection({ ...base, dataTypes: [], workoutId: 'run-1' });
    expect(result.ok).toBe(false);
  });

  it('返回的是副本，改动不会回写调用方的数组', () => {
    const types: Array<'workouts'> = ['workouts'];
    const result = buildExportSelection({ ...base, dataTypes: types, workoutId: 'run-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      result.selection.dataTypes.push('sleep');
      expect(types).toEqual(['workouts']);
    }
  });
});
