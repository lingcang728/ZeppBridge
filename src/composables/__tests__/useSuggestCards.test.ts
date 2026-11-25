import { describe, expect, it, vi } from 'vitest';
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

  it('手动换到的那一问只记当天；× 只把卡缩成胶囊、只管今天', () => {
    const prefs = useSuggestCards();
    expect(prefs.picked('2026-11-23')).toBeNull();
    prefs.pick('same_route', '2026-11-23');
    expect(prefs.picked('2026-11-23')).toBe('same_route');
    expect(prefs.picked('2026-11-24')).toBeNull();
    expect(prefs.minimized('2026-11-23')).toBe(false);
    prefs.minimize('2026-11-23');
    expect(prefs.minimized('2026-11-23')).toBe(true);
    expect(prefs.showToday()).toBe(true);
    expect(prefs.minimized('2026-11-24')).toBe(false);
    prefs.restore();
    expect(prefs.minimized('2026-11-23')).toBe(false);
  });

  it('设置里关掉：一张都不出', () => {
    const prefs = useSuggestCards();
    prefs.setEnabled(false);
    expect(prefs.visible('long_idle', 'long_idle:x', '2026-11-22')).toBe(false);
    prefs.setEnabled(true);
    expect(prefs.visible('long_idle', 'long_idle:x', '2026-11-22')).toBe(true);
  });

  it('旧版按过的 ×（quiet）读成当天缩成了胶囊，点胶囊能叫回来', async () => {
    const store = new Map<string, string>([['zeppbridge-suggest-cards', JSON.stringify({ enabled: true, closed: {}, codes: {}, pick: null, quiet: '2026-11-25' })]]);
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
    vi.resetModules();
    const { useSuggestCards: fresh } = await import('../useSuggestCards');
    const prefs = fresh();
    expect(prefs.showToday()).toBe(true);
    expect(prefs.minimized('2026-11-25')).toBe(true);
    expect(prefs.minimized('2026-11-26')).toBe(false);
    prefs.restore();
    expect(prefs.minimized('2026-11-25')).toBe(false);
    expect(store.get('zeppbridge-suggest-cards')).not.toContain('quiet');
    vi.unstubAllGlobals();
  });
});
