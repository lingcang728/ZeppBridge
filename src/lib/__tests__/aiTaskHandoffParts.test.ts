import { describe, expect, it } from 'vitest';
import { exportFileStems, safeFileStem } from '../aiTask/fileName';
import { buildBrief } from '../aiTask/brief';

const now = new Date(2026, 8, 27, 16, 42);

describe('exportFileStems', () => {
  it('默认规则：日期范围 + 内容，提示词同名加后缀，两次不同范围不同名', () => {
    const a = exportFileStems('range_content', {
      start: '2026-09-14', end: '2026-09-27', categories: ['sleep', 'heart_rate', 'recovery', 'training', 'body', 'workout'], title: '', now,
    });
    expect(a.data).toBe('ZeppBridge_0914-0927_睡眠心率等6类');
    expect(a.prompt).toBe('ZeppBridge_0914-0927_睡眠心率等6类_提示词');
    const b = exportFileStems('range_content', { start: '2026-09-21', end: '2026-09-27', categories: ['sleep'], title: '', now });
    expect(b.data).not.toBe(a.data);
  });

  it('不是今年的区间带上年份', () => {
    const s = exportFileStems('range_content', { start: '2025-12-20', end: '2026-01-02', categories: ['sleep', 'body'], title: '', now });
    expect(s.data).toBe('ZeppBridge_20251220-20260102_睡眠身体');
  });

  it('另两种规则', () => {
    expect(exportFileStems('app_date', { start: null, end: null, categories: [], title: '', now }).data).toBe('ZeppBridge_2026-09-27_1642');
    expect(exportFileStems('task_time', { start: null, end: null, categories: [], title: '最近 14 天 · 9月27日', now }).data)
      .toBe('最近 14 天 · 9月27日_20260927-1642');
  });

  it('非法字符替换、超长截短', () => {
    expect(safeFileStem('a:b/c?d')).toBe('a_b_c_d');
    expect(Array.from(safeFileStem('长'.repeat(80))).length).toBeLessThanOrEqual(48);
  });
});

describe('buildBrief', () => {
  const base = {
    start: '2026-09-14', end: '2026-09-27', categories: ['sleep', 'heart_rate'] as const, dataFile: 'x.json',
    attachmentCount: 0, hasPersonalNote: false, workoutCount: 0,
  };

  it('没写问题也给出明确任务，并要求直接开始', () => {
    const text = buildBrief({ ...base, categories: [...base.categories], hasQuestion: false });
    expect(text).toContain('x.json');
    expect(text).toContain('直接开始分析，不用先问我要做什么');
    expect(text).toContain('1. 一句话结论');
    expect(text).toContain('不要推测');
  });

  it('有问题时围绕问题，不再列默认清单', () => {
    const text = buildBrief({ ...base, categories: [...base.categories], hasQuestion: true, attachmentCount: 2 });
    expect(text).not.toContain('1. 一句话结论');
    expect(text).toContain('2 个原件');
  });
});
