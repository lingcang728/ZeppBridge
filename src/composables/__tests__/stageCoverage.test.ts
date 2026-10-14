import { describe, expect, it } from 'vitest';
import type { AiTask, AiTaskPreview } from '../../lib/bridge/types';
import { newTaskDraft } from '../../lib/aiTask/draft';
import { categoryRangeOf, withCategoryRange } from '../../lib/aiTask/categories';
import { freshCoverage } from '../ai/useStageCards';

const preview = (rows: Array<[string, number, number]>): AiTaskPreview => ({
  task_id: 't', workouts: [], attachments: [], estimated_bytes: 0, warnings: [],
  coverage: rows.map(([category, have, total]) => ({ category, workout_id: null, days_with_data: have, days_in_range: total } as unknown as AiTaskPreview['coverage'][number])),
});

describe('freshCoverage', () => {
  it('预览就是按现在的范围算的：照用', () => {
    const draft = newTaskDraft();
    expect(freshCoverage(preview([['sleep', 13, 14]]), draft, draft, 'sleep')?.days_with_data).toBe(13);
  });

  it('这一类的范围改了、新预览还没回来：不拿旧数字冒充', () => {
    const before = newTaskDraft();
    const after: AiTask = { ...before, categories: withCategoryRange(before.categories, { ...categoryRangeOf(before.categories, 'training'), picked_days: ['2026-10-08'] }) };
    const old = preview([['training', 7, 7], ['sleep', 13, 14]]);
    expect(freshCoverage(old, before, after, 'training')).toBeNull();
    // 别的类没动：照用，免得改一类就让所有牌一起闪成「—」。
    expect(freshCoverage(old, before, after, 'sleep')?.days_with_data).toBe(13);
  });

  it('换了关联的运动：所有类都要等新结果', () => {
    const before = newTaskDraft();
    const after: AiTask = { ...before, workout_ids: ['w1'] };
    expect(freshCoverage(preview([['sleep', 13, 14]]), before, after, 'sleep')).toBeNull();
  });

  it('从没算过：null', () => {
    expect(freshCoverage(null, null, newTaskDraft(), 'sleep')).toBeNull();
  });
});
