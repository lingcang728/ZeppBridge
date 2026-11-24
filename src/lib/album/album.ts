/**
 * 运动 / 睡眠列表的「相册」视图：纯函数（层级、密度、按月 / 按年汇总、偏好、缩放手势的累计）。
 *
 * - 层级：日（默认，就是原来的列表）→ 月（两列拼贴卡）→ 年（整宽大卡），胶囊上切；
 * - 密度：只在「日」这一层，Ctrl + 滚轮 / 触控板捏合在三档之间连续切：列表行 → 方块 → 日历热图。
 * 偏好按列表分别记（运动、睡眠各一份）。
 */
import type { SleepMonth, WorkoutMonth } from '../../types/album';

export type AlbumKind = 'workouts' | 'sleep';
export type AlbumLevel = 'day' | 'month' | 'year';
/** 0 = 列表行，1 = 方块，2 = 日历热图。 */
export type AlbumDensity = 0 | 1 | 2;

export const LEVELS: readonly AlbumLevel[] = ['year', 'month', 'day'];
/** 层级的深浅：年 0、月 1、日 2。往深处走是展开，往浅处走是收回。 */
export const levelDepth = (level: AlbumLevel): number => LEVELS.indexOf(level);

export interface AlbumPrefs { level: AlbumLevel; density: AlbumDensity }
const DEFAULT_PREFS: AlbumPrefs = { level: 'day', density: 0 };
const storageKey = (kind: AlbumKind) => `zeppbridge-album-${kind}`;

/** 读偏好；存储不可用、写坏了都退回默认。 */
export const readAlbumPrefs = (kind: AlbumKind): AlbumPrefs => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey(kind)) ?? 'null') as Partial<AlbumPrefs> | null;
    const level = LEVELS.includes(raw?.level as AlbumLevel) ? raw!.level! : DEFAULT_PREFS.level;
    const density = [0, 1, 2].includes(Number(raw?.density)) ? (Number(raw!.density) as AlbumDensity) : DEFAULT_PREFS.density;
    return { level, density };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const writeAlbumPrefs = (kind: AlbumKind, prefs: AlbumPrefs): void => {
  try { window.localStorage.setItem(storageKey(kind), JSON.stringify(prefs)); } catch { /* 存不了就只在这次会话里记着 */ }
};

/* ---------- 缩放手势 ---------- */

/** 捏合 / Ctrl+滚轮累计到这个比例就换一档（放大 → 更疏，缩小 → 更密）。 */
export const ZOOM_STEP_IN = 1.22;
export const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN;
/** 已经是最疏 / 最密的那一档还往外拉：只给这么一点橡皮筋。 */
const EDGE_STRETCH = 0.05;

/** 一次滚轮事件折成的缩放倍数。鼠标滚轮一格（deltaY≈100）就是整整一档；触控板捏合是一串小 delta，连续地走。 */
export const wheelFactor = (deltaY: number, deltaMode = 0): number => {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-100, Math.min(100, pixels));
  return Math.exp(-clamped * 0.0022);
};

/** 越过这一档的边界之后，手势里的缩放只显示成一小截橡皮筋。 */
export const stretchAtEdge = (scale: number, density: AlbumDensity): number => {
  if (density === 0 && scale > 1) return 1 + EDGE_STRETCH * (1 - 1 / scale) * 4;
  if (density === 2 && scale < 1) return 1 - EDGE_STRETCH * (1 - scale) * 4;
  return scale;
};

/** 累计缩放够一档了没有：放大到 ZOOM_STEP_IN → 往疏的一档（-1），缩小到 ZOOM_STEP_OUT → 往密的一档（+1）；到头了就是 0。 */
export const zoomStep = (scale: number, density: AlbumDensity): -1 | 0 | 1 => {
  if (scale >= ZOOM_STEP_IN && density > 0) return -1;
  if (scale <= ZOOM_STEP_OUT && density < 2) return 1;
  return 0;
};

/* ---------- 按月 / 按年 ---------- */

export interface WorkoutPeriod {
  /** YYYY 或 YYYY-MM。 */
  key: string;
  count: number;
  distance_m: number;
  duration_s: number;
  cover: WorkoutMonth['cover'];
}

export interface SleepPeriod {
  key: string;
  nights: number;
  avg_duration_min: number;
  avg_onset_min: number;
  stages: { deep: number; light: number; rem: number; awake: number };
}

export const workoutMonthPeriods = (months: WorkoutMonth[]): WorkoutPeriod[] =>
  months.map((month) => ({ key: month.month, count: month.count, distance_m: month.distance_m, duration_s: month.duration_s, cover: month.cover }));

/** 年卡：把这一年的月份加起来；封面取这一年距离最长的那条轨迹。最新的一年在前。 */
export const workoutYearPeriods = (months: WorkoutMonth[]): WorkoutPeriod[] => {
  const years = new Map<string, WorkoutPeriod & { coverDistance: number }>();
  for (const month of months) {
    const key = month.month.slice(0, 4);
    const year = years.get(key) ?? { key, count: 0, distance_m: 0, duration_s: 0, cover: null, coverDistance: -1 };
    year.count += month.count;
    year.distance_m += month.distance_m;
    year.duration_s += month.duration_s;
    if (month.cover && (month.cover_distance_m ?? 0) > year.coverDistance) {
      year.cover = month.cover;
      year.coverDistance = month.cover_distance_m ?? 0;
    }
    years.set(key, year);
  }
  return [...years.values()].sort((a, b) => b.key.localeCompare(a.key)).map(({ coverDistance: _drop, ...year }) => year);
};

const sleepPeriod = (key: string, months: SleepMonth[]): SleepPeriod => {
  const nights = months.reduce((sum, m) => sum + m.nights, 0);
  const weighted = (pick: (m: SleepMonth) => number) => (nights > 0 ? months.reduce((sum, m) => sum + pick(m) * m.nights, 0) / nights : 0);
  return {
    key,
    nights,
    avg_duration_min: weighted((m) => m.avg_duration_min),
    avg_onset_min: weighted((m) => m.avg_onset_min),
    stages: {
      deep: months.reduce((sum, m) => sum + m.deep_min, 0),
      light: months.reduce((sum, m) => sum + m.light_min, 0),
      rem: months.reduce((sum, m) => sum + m.rem_min, 0),
      awake: months.reduce((sum, m) => sum + m.awake_min, 0),
    },
  };
};

export const sleepMonthPeriods = (months: SleepMonth[]): SleepPeriod[] => months.map((month) => sleepPeriod(month.month, [month]));

/** 年卡：按晚数加权平均（每个月的平均已经是按晚算的）。 */
export const sleepYearPeriods = (months: SleepMonth[]): SleepPeriod[] => {
  const byYear = new Map<string, SleepMonth[]>();
  for (const month of months) byYear.set(month.month.slice(0, 4), [...(byYear.get(month.month.slice(0, 4)) ?? []), month]);
  return [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, list]) => sleepPeriod(key, list));
};

/** 当地中午之后的分钟数 → HH:MM（24 小时制，给卡上的「平均入睡」）。 */
export const clockFromNoon = (minutes: number): string => {
  const total = Math.round(minutes + 720) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** 本地日期 YYYY-MM-DD。 */
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 日历热图的一个月：从 1 号那天是星期几（周一为 0）开始排，每天一格。 */
export const monthCells = (month: string): { lead: number; days: string[] } => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  return { lead, days: Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`) };
};

/** 从最新的月份往回数到最早的月份（含两端），YYYY-MM，新的在前。 */
export const monthsBetween = (newest: string, oldest: string): string[] => {
  const out: string[] = [];
  let [y, m] = newest.split('-').map(Number) as [number, number];
  const [oy, om] = oldest.split('-').map(Number) as [number, number];
  while (y > oy || (y === oy && m >= om)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
    if (out.length > 600) break;
  }
  return out;
};

/* ---------- 方块 / 热图的一格 ---------- */

/** 方块和日历热图里的一条记录（运动、睡眠共用；列表页把自己的记录折成这个样子）。 */
export interface AlbumTile {
  id: string;
  /** 本地日期 YYYY-MM-DD / 月份 YYYY-MM。 */
  day: string;
  month: string;
  /** 点开去的详情页。 */
  to: object;
  /** 读屏和悬停用的整句（日期 + 类型 + 主读数）。 */
  label: string;
  /** 方块上的主读数（距离 / 时长）。 */
  reading: string;
  /** 热图的颜色（CSS 颜色）和深浅（0–1，按时长）。 */
  color: string;
  strength: number;
  /** 热图同一天有好几条时，留时长最长的那条。 */
  weight: number;
}

/** 热图的一天：同一天的好几条记录合成一格，颜色跟最长的那条，深浅按当天总时长。 */
export const heatDays = (tiles: AlbumTile[]): Map<string, { lead: AlbumTile; count: number; strength: number }> => {
  const days = new Map<string, { lead: AlbumTile; count: number; strength: number }>();
  for (const tile of tiles) {
    const day = days.get(tile.day);
    if (!day) { days.set(tile.day, { lead: tile, count: 1, strength: tile.strength }); continue; }
    day.count += 1;
    day.strength = Math.min(1, day.strength + tile.strength);
    if (tile.weight > day.lead.weight) day.lead = tile;
  }
  return days;
};

/** 按月份分组（保持原来的先后：新的在前）。 */
export const byMonth = <T extends { month: string }>(items: T[]): { month: string; items: T[] }[] => {
  const groups: { month: string; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.month === item.month) last.items.push(item);
    else groups.push({ month: item.month, items: [item] });
  }
  return groups;
};
