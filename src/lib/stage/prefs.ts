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

/**
 * 一组拖出来的尺寸（比例、整组宽、上一下三的缝、拉过的高）：不认识的、越界的丢掉，不报错。
 * 2026-11-17（用户录屏「无法记忆布局」+ 真实库 WebView 存档对照）：以前只校正舞台那组的尺寸，侧栏里的组读回来只剩
 * ids / snap——调过大小的组一退到侧栏，下次打开（或洞察算完、卡片列表一变重新读档）尺寸就没了。
 */
const sizesOf = (raw: unknown, ids: readonly string[]): Partial<StageGroup> => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as { ratio?: unknown; span?: unknown; splits?: unknown; heights?: unknown };
  const out: Partial<StageGroup> = {};
  const ratio = Number(data.ratio);
  if (ids.length && Number.isFinite(ratio) && ratio > 0 && ratio <= 1) out.ratio = ratio;
  // 整组宽、拉过的高（2026-11-13 起）。
  const span = Number(data.span);
  if (ids.length > 1 && Number.isFinite(span) && span >= 0.5 && span < 1) out.span = span;
  // 上一下三两条缝（2026-11-14 起）：只有 4 张时有意义；倒序、挤得太近、越界的丢掉（layout.splitsOf 同一套门槛）。
  if (ids.length === 4 && Array.isArray(data.splits) && data.splits.length === 2) {
    const [a, b] = data.splits.map(Number);
    if (a >= SPLIT_MIN && b - a >= SPLIT_MIN && b <= 1 - SPLIT_MIN) out.splits = [a, b];
  }
  if (data.heights && typeof data.heights === 'object') {
    const heights: Record<string, number> = {};
    for (const id of ids) {
      const h = Number((data.heights as Record<string, unknown>)[id]);
      if (Number.isFinite(h) && h >= 100 && h <= 4000) heights[id] = Math.round(h);
    }
    if (Object.keys(heights).length) out.heights = heights;
  }
  return out;
};
const withSizes = (ids: string[], snap: number, raw: unknown): StageGroup => ({ ids, snap: clampSnap(ids, snap), ...sizesOf(raw, ids) });

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
    if (ids.length) strip.push(withSizes(ids, Number((group as { snap?: unknown }).snap), group));
  }
  for (const id of cards) if (!seen.has(id)) { seen.add(id); strip.push({ ids: [id], snap: 0 }); }
  let stage: StageGroup = withSizes(stageIds, Number(data.stage?.snap), data.stage);
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
  // 组里少了卡（这条运动没有）：尺寸只留还在的那几张的。
  return { stage, strip: strip.filter((g) => g.ids.length).map((g) => withSizes(g.ids, g.snap, g)), hidden };
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

/**
 * 这次存档里没出现、上次存档里有的卡（这条运动没有、别的同类运动才有的，比如没测步频的那次没有步频卡）：
 * 藏起来的照旧藏着，其余接到侧栏最后——以前在缺卡的运动上动一下布局，那几张卡的「隐藏」就被冲掉了。
 */
export const keepAbsent = (prev: unknown, state: StageState): StageState => {
  if (!prev || typeof prev !== 'object') return state;
  const data = prev as { stage?: { ids?: unknown }; strip?: unknown; hidden?: unknown };
  const present = new Set([...state.stage.ids, ...state.strip.flatMap((g) => g.ids), ...state.hidden]);
  const absent = (ids: string[]) => ids.filter((id) => !present.has(id) && present.add(id));
  const hidden = absent(idList(data.hidden));
  const rest = [
    ...absent(idList(data.stage?.ids)),
    ...(Array.isArray(data.strip) ? data.strip : []).flatMap((g) => absent(idList((g as { ids?: unknown })?.ids))),
  ];
  if (!hidden.length && !rest.length) return state;
  return { ...state, strip: [...state.strip, ...rest.map((id) => ({ ids: [id], snap: 0 }))], hidden: [...state.hidden, ...hidden] };
};

/**
 * 只在用户动了布局之后存（useWorkoutStage）：光是打开一条缺卡的运动（比如没轨迹的跑步）不会冲掉这一类的习惯。
 * 存不了（隐私窗口、配额满）返回 false，调用方在控制台留一句（以前静默吞掉，「记不住布局」时查不到是不是它）。
 */
export const saveStage = (cls: SportClass, state: StageState): boolean => {
  try {
    let prev: unknown = null;
    try { prev = JSON.parse(localStorage.getItem(KEY + cls) ?? 'null'); } catch { /* 坏档当没有 */ }
    localStorage.setItem(KEY + cls, JSON.stringify({ v: 1, ...keepAbsent(prev, state) }));
    return true;
  } catch {
    return false;
  }
};

export const clearStage = (cls: SportClass): void => {
  try { localStorage.removeItem(KEY + cls); } catch { /* 同上 */ }
};
