/**
 * 运动页带恢复背景（1D·D10）的门：「距上次 N 天」按本地日算、找的是这一次之前的那一次；
 * 任务只带这次运动 + 睡眠 / 恢复状态 / 静息心率，窗口是运动开始日往前 30 天。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/bridge', () => ({ backend: {}, toUserMessage: (_e: unknown, fallback: string) => fallback }));
vi.mock('../useAiHandoff', () => ({ copyTextToClipboard: vi.fn(), openProviderSite: vi.fn(), revealInFolder: vi.fn() }));

import { RECOVERY_CATEGORIES, daysSincePrevious, recoveryTask } from '../useWorkoutRecoveryHandoff';

const at = (id: string, iso: string) => ({ workout_id: id, start_time: iso });

describe('daysSincePrevious', () => {
  it('counts local days back to the workout just before this one', () => {
    const all = [at('a', '2026-09-20T07:00:00'), at('b', '2026-09-28T19:30:00'), at('c', '2026-10-05T07:10:00'), at('d', '2026-10-06T07:00:00')];
    expect(daysSincePrevious(all[2]!, all)).toBe(7);
  });

  it('is null when nothing was recorded before', () => {
    const all = [at('a', '2026-09-20T07:00:00'), at('b', '2026-09-28T19:30:00')];
    expect(daysSincePrevious(all[0]!, all)).toBeNull();
  });
});

describe('recoveryTask', () => {
  it('sends only the workout and the recovery categories, 30 days back from the workout day', () => {
    const task = recoveryTask({ workout_id: 'w-1' }, 'title', 'prompt');
    expect(task.workout_ids).toEqual(['w-1']);
    const on = task.categories.filter((range) => range.enabled);
    expect(on.map((range) => range.category).sort()).toEqual(['workout', ...RECOVERY_CATEGORIES].sort());
    for (const range of on.filter((r) => r.category !== 'workout')) {
      expect(range.days_before).toBe(29);
      expect(range.include_workout_day).toBe(true);
    }
    expect(on.find((range) => range.category === 'workout')?.days_before).toBe(0);
  });
});
