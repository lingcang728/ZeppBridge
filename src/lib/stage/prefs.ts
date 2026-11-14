/**
 * 台前调度按运动大类记住布局（localStorage `zeppbridge-workout-stage:v2:<大类>`），读的时候先校验：
 * 不认识 / 这条运动没有的卡丢掉，新出现的卡排到侧栏最后；舞台空了按默认布局补。
 * 浏览器存储可能不可用（隐私窗口、预览），读写都包在 try/catch 里，失败就用默认布局。
 */
import { MAX_ON_STAGE, snapCount, TOP_SNAP, type StageGroup, type StageState } from './state';
import { SPLIT_MIN } from './layout';

export type SportClass = 'strength' | 'run' | 'ride' | 'swim' | 'other';
export const SPORT_CLASSES: readonly SportClass[] = ['strength', 'run', 'ride', 'swim', 'other'];

export const sportClass = (type: string | null | undefined, hasStrength = false): SportClass => {
  const name = (type ?? '').toLowerCase();
  if (hasStrength || /strength|weight|gym/.test(name)) return 'strength';
  if (/swim|pool|open_water/.test(name)) return 'swim';
  if (/cycl|bik|ride|spinning/.test(name)) return 'ride';
  if (/run|walk|hik|trail|treadmill|jog/.test(name)) return 'run';
  return 'other';
};

/**
 * 各大类默认舞台（按顺序挑第一组卡都在的）：概要卡「主卡在上」占整行，下面两张——
 * 力量 = 逐组明细 + 肌肉图（2:1）；跑走 / 骑行 = 轨迹 + 心率（2:1）；其余 = 心率 + 心率区间（1:1）。
 * 一组都凑不齐时取第一组里有的那几张。
 */
const DEFAULTS: Record<SportClass, StageGroup[]> = {
  strength: [
    { ids: ['summary', 'strength-sets', 'strength-map'], snap: TOP_SNAP },
    { ids: ['strength-sets', 'strength-map'], snap: 1 },
    { ids: ['summary', 'strength-sets'], snap: 0 },
  ],
  run: [{ ids: ['summary', 'route', 'chart-heart'], snap: TOP_SNAP }, { ids: ['route', 'chart-heart'], snap: 1 }],
  ride: [{ ids: ['summary', 'route', 'chart-heart'], snap: TOP_SNAP }, { ids: ['route', 'chart-heart'], snap: 1 }],
  swim: [{ ids: ['summary', 'chart-heart', 'hr-zones'], snap: TOP_SNAP, ratio: 0.5 }, { ids: ['chart-heart', 'hr-zones'], snap: 0 }],
  other: [{ ids: ['summary', 'chart-heart', 'hr-zones'], snap: TOP_SNAP, ratio: 0.5 }, { ids: ['chart-heart', 'hr-zones'], snap: 0 }],
};

const clampSnap = (ids: string[], snap: unknown): number =>
  Math.min(Math.max(0, Math.round(Number(snap)) || 0), snapCount(ids.length) - 1);

export const defaultState = (cls: SportClass, cards: readonly string[]): StageState => {
  const whole = DEFAULTS[cls].find((wish) => wish.ids.every((id) => cards.includes(id)));
  let stage: StageGroup | null = whole ? { ...whole, ids: [...whole.ids] } : null;
  if (!stage) {
    const ids = DEFAULTS[cls][0].ids.filter((id) => cards.includes(id));
    if (ids.length) stage = { ids, snap: 0 };
  }
  stage ??= { ids: cards.length ? [cards[0]] : [], snap: 0 };
  const strip = cards.filter((id) => !stage!.ids.includes(id)).map((id) => ({ ids: [id], snap: 0 }));
  return { stage, strip, hidden: [] };
};

const idList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);

/** 把存下来的（可能是旧的、坏的、别的运动的）布局校正成对这条运动有效的状态。 */
export const sanitize = (raw: unknown, cards: readonly string[], fallback: StageState): StageState => {
  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as { stage?: { ids?: unknown; snap?: unknown }; strip?: unknown; hidden?: unknown };
  const seen = new Set<string>();
  const keep = (ids: string[]) => ids.filter((id) => cards.includes(id) && !seen.has(id) && seen.add(id));
  const hidden = keep(idList(data.hidden));
  let stageIds = keep(idList(data.stage?.ids));
  const overflow = stageIds.slice(MAX_ON_STAGE);
  stageIds = stageIds.slice(0, MAX_ON_STAGE);
  const strip: StageGroup[] = [];
  if (overflow.length) strip.push({ ids: overflow.slice(0, MAX_ON_STAGE), snap: 0 });
  for (const group of Array.isArray(data.strip) ? data.strip : []) {
    const ids = keep(idList((group as { ids?: unknown })?.ids)).slice(0, MAX_ON_STAGE);
    if (ids.length) strip.push({ ids, snap: clampSnap(ids, (group as { snap?: unknown }).snap) });
  }
  for (const id of cards) if (!seen.has(id)) { seen.add(id); strip.push({ ids: [id], snap: 0 }); }
  let stage: StageGroup = { ids: stageIds, snap: clampSnap(stageIds, data.stage?.snap) };
  const ratio = Number((data.stage as { ratio?: unknown } | undefined)?.ratio);
  if (stage.ids.length && Number.isFinite(ratio) && ratio > 0 && ratio <= 1) stage.ratio = ratio;
  // 整组宽、拉过的高（2026-11-13 起）：不认识的、越界的丢掉，不报错。
  const span = Number((data.stage as { span?: unknown } | undefined)?.span);
  if (stage.ids.length > 1 && Number.isFinite(span) && span >= 0.5 && span < 1) stage.span = span;
  // 上一下三两条缝（2026-11-14 起）：只有 4 张时有意义；倒序、挤得太近、越界的丢掉（layout.splitsOf 同一套门槛）。
  const rawSplits = (data.stage as { splits?: unknown } | undefined)?.splits;
  if (stage.ids.length === 4 && Array.isArray(rawSplits) && rawSplits.length === 2) {
    const [a, b] = rawSplits.map(Number);
    if (a >= SPLIT_MIN && b - a >= SPLIT_MIN && b <= 1 - SPLIT_MIN) stage.splits = [a, b];
  }
  const rawHeights = (data.stage as { heights?: unknown } | undefined)?.heights;
  if (rawHeights && typeof rawHeights === 'object') {
    const heights: Record<string, number> = {};
    for (const id of stage.ids) {
      const h = Number((rawHeights as Record<string, unknown>)[id]);
      if (Number.isFinite(h) && h >= 100 && h <= 4000) heights[id] = Math.round(h);
    }
    if (Object.keys(heights).length) stage.heights = heights;
  }
  if (!stage.ids.length) {
    // 舞台空了：默认那组里没藏起来的请上来，否则侧栏最上面那组。
    const wish = fallback.stage.ids.filter((id) => !hidden.includes(id));
    if (wish.length) {
      stage = wish.length === fallback.stage.ids.length ? { ...fallback.stage, ids: wish } : { ids: wish, snap: 0 };
      for (const group of strip) group.ids = group.ids.filter((id) => !wish.includes(id));
    } else if (strip.length) {
      stage = strip.shift()!;
    }
  }
  return { stage, strip: strip.filter((g) => g.ids.length).map((g) => ({ ids: g.ids, snap: clampSnap(g.ids, g.snap) })), hidden };
};

/** v2（2026-11-13）：头图变成「概要」卡进了台前调度，v1 存的布局里没有它，作废。 */
const KEY = 'zeppbridge-workout-stage:v2:';
const VIEW_KEY = 'zeppbridge-workout-stage:v1:view';

/**
 * 运动详情用哪种排法（全局，不分运动大类）：'stage' 台前调度（新），'classic' 老版两栏（「全部卡片」）。
 * 台前调度还是实验性的，不喜欢的老用户要能退回老版、并且记住（2026-11-13 用户）。
 */
export type StageView = 'stage' | 'classic';
export const loadView = (): StageView => {
  try { return localStorage.getItem(VIEW_KEY) === 'classic' ? 'classic' : 'stage'; } catch { return 'stage'; }
};
export const saveView = (view: StageView): void => {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* 存不了就只管这一次 */ }
};

export const loadStage = (cls: SportClass, cards: readonly string[]): StageState => {
  const fallback = defaultState(cls, cards);
  try {
    const text = localStorage.getItem(KEY + cls);
    return text ? sanitize(JSON.parse(text), cards, fallback) : fallback;
  } catch {
    return fallback;
  }
};

/** 只在用户动了布局之后存（useWorkoutStage）：光是打开一条缺卡的运动（比如没轨迹的跑步）不会冲掉这一类的习惯。 */
export const saveStage = (cls: SportClass, state: StageState): void => {
  try {
    localStorage.setItem(KEY + cls, JSON.stringify({ v: 1, ...state }));
  } catch {
    /* 存不了就算了：下次按默认布局。 */
  }
};

export const clearStage = (cls: SportClass): void => {
  try { localStorage.removeItem(KEY + cls); } catch { /* 同上 */ }
};
