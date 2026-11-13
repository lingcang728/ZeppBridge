import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStage, defaultState, loadStage, loadView, sanitize, saveStage, saveView, sportClass } from '../prefs';

const CARDS = ['insight', 'strength-sets', 'strength-map', 'chart-heart', 'hr-zones', 'decoded', 'export'];

describe('stage prefs', () => {
  // vitest 跑在 node 环境：给一个最小的内存版 localStorage。
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('classifies sports', () => {
    expect(sportClass('outdoor_running')).toBe('run');
    expect(sportClass('indoor_cycling')).toBe('ride');
    expect(sportClass('pool_swimming')).toBe('swim');
    expect(sportClass('yoga')).toBe('other');
    expect(sportClass('yoga', true)).toBe('strength');
  });

  it('defaults to the class layout, falling back to what exists', () => {
    expect(defaultState('strength', CARDS).stage).toEqual({ ids: ['strength-sets', 'strength-map'], snap: 1 });
    expect(defaultState('strength', CARDS.filter((id) => id !== 'strength-map')).stage).toEqual({ ids: ['strength-sets'], snap: 0 });
    expect(defaultState('run', CARDS).stage).toEqual({ ids: ['chart-heart'], snap: 0 });
    const other = defaultState('other', CARDS);
    expect(other.stage).toEqual({ ids: ['chart-heart', 'hr-zones'], snap: 0 });
    expect(other.strip.map((g) => g.ids[0])).toEqual(['insight', 'strength-sets', 'strength-map', 'decoded', 'export']);
  });

  it('puts the summary card on top of the default trio when every card is there', () => {
    const all = ['summary', 'route', ...CARDS];
    expect(defaultState('run', all).stage).toEqual({ ids: ['summary', 'route', 'chart-heart'], snap: 2 });
    expect(defaultState('swim', all).stage).toEqual({ ids: ['summary', 'chart-heart', 'hr-zones'], snap: 2, ratio: 0.5 });
    expect(defaultState('strength', all).stage).toEqual({ ids: ['summary', 'strength-sets', 'strength-map'], snap: 2 });
    // 没轨迹的跑步：凑不齐三张，取第一组里有的。
    expect(defaultState('run', all.filter((id) => id !== 'route')).stage).toEqual({ ids: ['summary', 'chart-heart'], snap: 0 });
  });

  it('remembers the classic view globally and falls back to the stage', () => {
    expect(loadView()).toBe('stage');
    saveView('classic');
    expect(loadView()).toBe('classic');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(loadView()).toBe('stage');
    expect(() => saveView('stage')).not.toThrow();
  });

  it('drops unknown cards, dedupes, appends new ones and refills an empty stage', () => {
    const fallback = defaultState('other', CARDS);
    const s = sanitize({
      stage: { ids: ['route', 'gone'], snap: 2 },
      strip: [{ ids: ['decoded', 'decoded', 'export'], snap: 7 }, { ids: 'nope' }],
      hidden: ['insight', 'chart-heart'],
    }, CARDS, fallback);
    expect(s.hidden).toEqual(['insight', 'chart-heart']);
    expect(s.stage).toEqual({ ids: ['hr-zones'], snap: 0 });
    expect(s.strip[0]).toEqual({ ids: ['decoded', 'export'], snap: 2 });
    const every = [...s.stage.ids, ...s.strip.flatMap((g) => g.ids), ...s.hidden].sort();
    expect(every).toEqual([...CARDS].sort());
  });

  it('keeps a dragged group width and heights, drops nonsense ones', () => {
    const s = sanitize({ stage: { ids: ['decoded', 'export'], snap: 0, span: 0.7, heights: { decoded: 320.4, export: 'x', ghost: 400 } } }, CARDS, defaultState('other', CARDS));
    expect(s.stage).toEqual({ ids: ['decoded', 'export'], snap: 0, span: 0.7, heights: { decoded: 320 } });
    const bad = sanitize({ stage: { ids: ['decoded'], snap: 0, span: 0.7, heights: { decoded: 5 } } }, CARDS, defaultState('other', CARDS));
    expect(bad.stage).toEqual({ ids: ['decoded'], snap: 0 });
  });

  it('spills a stage of more than three into the strip', () => {
    const s = sanitize({ stage: { ids: CARDS.slice(0, 5), snap: 0 } }, CARDS, defaultState('other', CARDS));
    expect(s.stage.ids).toEqual(CARDS.slice(0, 3));
    expect(s.strip[0].ids).toEqual(CARDS.slice(3, 5));
  });

  it('round-trips through storage per class and survives a broken store', () => {
    const custom = { stage: { ids: ['decoded'], snap: 1 }, strip: defaultState('run', CARDS).strip.filter((g) => g.ids[0] !== 'decoded'), hidden: [] };
    custom.strip.push({ ids: ['chart-heart'], snap: 0 });
    saveStage('run', custom);
    expect(loadStage('run', CARDS).stage).toEqual({ ids: ['decoded'], snap: 1 });
    expect(loadStage('ride', CARDS).stage).toEqual({ ids: ['chart-heart'], snap: 0 });
    clearStage('run');
    expect(loadStage('run', CARDS).stage.ids).toEqual(['chart-heart']);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(() => saveStage('run', custom)).not.toThrow();
    expect(loadStage('run', CARDS).stage.ids).toEqual(['chart-heart']);
  });
});
