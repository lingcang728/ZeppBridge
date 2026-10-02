import { describe, expect, it } from 'vitest';
import { planGuide } from '../planGuide';
import { extractPlan } from '../../trainingPlan/extract';

describe('planGuide', () => {
  const now = new Date(2026, 9, 2);

  it('示例是按今天往后排的将来日期，并且正是粘贴回写能读出来的那种代码块', () => {
    const guide = planGuide(now);
    expect(guide).toContain('"from":"2026-10-03"');
    expect(guide).toContain('"date":"2026-10-04"');
    const read = extractPlan(guide);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.document.workouts).toHaveLength(1);
      expect(read.document.to).toBe('2026-10-05');
    }
  });

  it('写法只教解析器认的英文标识，上限和后端校验对齐（最远 56 天、40 步、重复 50 次）', () => {
    const guide = planGuide(now);
    for (const word of ['running', 'cycling', 'pool_swim', 'open_water_swim', 'warmup', 'cooldown', 'hr 135-150']) {
      expect(guide).toContain(word);
    }
    expect(guide).toContain('56');
    expect(guide).toContain('40');
    expect(guide).toContain('50');
  });
});
