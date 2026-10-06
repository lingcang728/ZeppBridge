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
      expect(read.document.format).toBe('zeppbridge-plan/3');
      expect(read.document.workouts).toHaveLength(2);
      expect(read.document.to).toBe('2026-10-06');
      // 每条示例训练都带着目的和描述：AI 照抄就不会被「缺目的 / 缺描述」挡住。
      for (const workout of read.document.workouts) {
        expect(workout.focus).toBeTruthy();
        expect(workout.description).toBeTruthy();
        expect(workout.name.length).toBeLessThanOrEqual(14);
      }
    }
  });

  it('写法只教解析器认的、手表上实测过的标识，上限和后端校验对齐（最远 56 天、40 步、重复 50 次）', () => {
    const guide = planGuide(now);
    for (const word of ['running', 'cycling', 'pool_swim', 'open_water_swim', 'treadmill', 'indoor', 'warmup', 'cooldown', 'hr 135-150', 'pace 5:00-5:30', '5km', 'focus', 'description']) {
      expect(guide).toContain(word);
    }
    expect(guide).toContain('56');
    expect(guide).toContain('40');
    expect(guide).toContain('50');
    expect(guide).toContain('14');
    // 发不到手表的活动要在讨论时说清，不能藏进休息日的备注。
    expect(guide).toMatch(/走路|徒步/);
    expect(guide).toContain('rest 的 note');
  });
});
