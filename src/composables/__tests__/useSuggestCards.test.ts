import { describe, expect, it } from 'vitest';
import { useSuggestCards } from '../useSuggestCards';

describe('首页建议卡：关过的不再出', () => {
  it('关掉一张：这一次永远不出，这一类当天也不出别的，第二天别的那次照出', () => {
    const prefs = useSuggestCards();
    expect(prefs.visible('workout_done', 'workout_done:a', '2026-11-20')).toBe(true);
    prefs.close('workout_done', 'workout_done:a', '2026-11-20');
    expect(prefs.visible('workout_done', 'workout_done:a', '2026-11-20')).toBe(false);
    expect(prefs.visible('workout_done', 'workout_done:b', '2026-11-20')).toBe(false);
    expect(prefs.visible('sleep_poor', 'sleep_poor:2026-11-20', '2026-11-20')).toBe(true);
    expect(prefs.visible('workout_done', 'workout_done:b', '2026-11-21')).toBe(true);
    expect(prefs.visible('workout_done', 'workout_done:a', '2026-11-21')).toBe(false);
  });

  it('手动换到的那一问只记当天；× 只关今天', () => {
    const prefs = useSuggestCards();
    expect(prefs.picked('2026-11-23')).toBeNull();
    prefs.pick('same_route', '2026-11-23');
    expect(prefs.picked('2026-11-23')).toBe('same_route');
    expect(prefs.picked('2026-11-24')).toBeNull();
    expect(prefs.showToday('2026-11-23')).toBe(true);
    prefs.quietToday('2026-11-23');
    expect(prefs.showToday('2026-11-23')).toBe(false);
    expect(prefs.showToday('2026-11-24')).toBe(true);
  });

  it('设置里关掉：一张都不出', () => {
    const prefs = useSuggestCards();
    prefs.setEnabled(false);
    expect(prefs.visible('long_idle', 'long_idle:x', '2026-11-22')).toBe(false);
    prefs.setEnabled(true);
    expect(prefs.visible('long_idle', 'long_idle:x', '2026-11-22')).toBe(true);
  });
});
