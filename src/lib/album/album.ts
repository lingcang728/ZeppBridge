/**
 * 运动 / 睡眠列表的缩放：纯函数（三档、偏好、缩放手势的累计、按月 / 按年汇总与分析）。
 *
 * - 三档：日（逐条列表）→ 月（按月分组的小格 + 月度组头）→ 年（睡眠：每年一块热图 + 年度分析；运动：整页履历）。
 * - 入口只有两条，走同一个 `go()`：Ctrl + 滚轮 / 触控板捏合，和左下托盘（拖动吸附 / 面板里点）。
 * 偏好按列表分别记（运动、睡眠各一份）。
 */
import type { SleepMonth, WorkoutMonth } from '../../types/album';

export type AlbumKind = 'workouts' | 'sleep';
export type AlbumZoom = 'day' | 'month' | 'year';

/** 由细到粗。下标就是「缩得多远」：往外捏下标加一，往里捏减一。 */
export const ZOOMS: readonly AlbumZoom[] = ['day', 'month', 'year'];
export const zoomIndex = (zoom: AlbumZoom): number => ZOOMS.indexOf(zoom);
export const isAlbumZoom = (value: unknown): value is AlbumZoom => ZOOMS.includes(value as AlbumZoom);

const storageKey = (kind: AlbumKind) => `zeppbridge-album-${kind}`;

/**
 * 读这张列表上次停在哪一档；存储不可用、写坏了都退回「日」。
 * 旧版本记的是层级 + 密度两样：列表行 → 日、方块 → 月、热图或月 / 年卡 → 年。
 */
export const readAlbumZoom = (kind: AlbumKind): AlbumZoom => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey(kind)) ?? 'null') as { zoom?: unknown; level?: unknown; density?: unknown } | null;
    if (!raw || typeof raw !== 'object') return 'day';
    if (isAlbumZoom(raw.zoom)) return raw.zoom;
    if (raw.level === 'month' || raw.level === 'year') return 'year';
    const density = Number(raw.density);
    return density === 1 ? 'month' : density === 2 ? 'year' : 'day';
  } catch {
    return 'day';
  }
};

export const writeAlbumZoom = (kind: AlbumKind, zoom: AlbumZoom): void => {
  try { window.localStorage.setItem(storageKey(kind), JSON.stringify({ zoom })); } catch { /* 存不了就只在这次会话里记着 */ }
};

/* ---------- 缩放手势 ---------- */

/** 捏合 / Ctrl+滚轮累计到这个比例就换一档（放大 → 更细，缩小 → 更粗）。 */
export const ZOOM_STEP_IN = 1.22;
export const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN;
/** 已经是最细 / 最粗的那一档还往外拉：只给这么一点橡皮筋。 */
const EDGE_STRETCH = 0.05;
const LAST = ZOOMS.length - 1;

/** 一次滚轮事件折成的缩放倍数。鼠标滚轮一格（deltaY≈100）就是整整一档；触控板捏合是一串小 delta，连续地走。 */
export const wheelFactor = (deltaY: number, deltaMode = 0): number => {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-100, Math.min(100, pixels));
  return Math.exp(-clamped * 0.0022);
};

/** 越过这一档的边界之后，手势里的缩放只显示成一小截橡皮筋。`index`：此刻在第几档（0 = 日）。 */
export const stretchAtEdge = (scale: number, index: number): number => {
  if (index === 0 && scale > 1) return 1 + EDGE_STRETCH * (1 - 1 / scale) * 4;
  if (index === LAST && scale < 1) return 1 - EDGE_STRETCH * (1 - scale) * 4;
  return scale;
};

/** 累计缩放够一档了没有：放大到 ZOOM_STEP_IN → 往细的一档（-1），缩小到 ZOOM_STEP_OUT → 往粗的一档（+1）；到头了就是 0。 */
export const zoomStep = (scale: number, index: number): -1 | 0 | 1 => {
  if (scale >= ZOOM_STEP_IN && index > 0) return -1;
  if (scale <= ZOOM_STEP_OUT && index < LAST) return 1;
  return 0;
};

/** 托盘把手上下拖：竖直位移（向上为负）折成第几档。每 `pitch` 像素一档，吸附到最近的那档。 */
export const trayZoomAt = (start: number, dy: number, pitch: number): number =>
  Math.max(0, Math.min(LAST, Math.round(start - dy / pitch)));

/* ---------- 按月 / 按年 ---------- */

export interface WorkoutPeriod {
  /** YYYY 或 YYYY-MM。 */
  key: string;
  count: number;
  distance_m: number;
  duration_s: number;
}

export interface SleepStages { deep: number; light: number; rem: number; awake: number }

export interface SleepPeriod {
  key: string;
  nights: number;
  /** 没有一晚有时长 / 入睡时刻 / 评分时是 null（界面写「—」，不拿 0 填）。 */
  avg_duration_min: number | null;
  avg_onset_min: number | null;
  avg_score: number | null;
  stages: SleepStages;
}

export const workoutMonthPeriods = (months: WorkoutMonth[]): WorkoutPeriod[] =>
  months.map((month) => ({ key: month.month, count: month.count, distance_m: month.distance_m, duration_s: month.duration_s }));

export const sleepMonthPeriods = (months: SleepMonth[]): SleepPeriod[] => months.map((month) => ({
  key: month.month,
  nights: month.nights,
  avg_duration_min: month.nights > 0 && month.avg_duration_min > 0 ? month.avg_duration_min : null,
  avg_onset_min: (month.onset_nights ?? month.nights) > 0 ? month.avg_onset_min : null,
  avg_score: month.avg_score ?? null,
  stages: { deep: month.deep_min, light: month.light_min, rem: month.rem_min, awake: month.awake_min },
}));

/** 上一个日历月（YYYY-MM）。 */
export const previousMonth = (key: string): string => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/**
 * 和上一段比：本段减上一段。上一段（上个日历月 / 去年）没有记录、或任一边没有这个读数时是 null，
 * 界面就不写这一项（不拿 0 当上一段）。
 */
export const periodDelta = <T extends { key: string }>(periods: readonly T[], key: string, pick: (period: T) => number | null): number | null => {
  const prevKey = key.length === 4 ? String(Number(key) - 1) : previousMonth(key);
  const current = periods.find((period) => period.key === key);
  const previous = periods.find((period) => period.key === prevKey);
  if (!current || !previous) return null;
  const a = pick(current);
  const b = pick(previous);
  return a === null || b === null ? null : a - b;
};

export interface SleepYearAnalysis {
  year: string;
  nights: number;
  avg_duration_min: number | null;
  /** 比去年（同一读数）多 / 少几分钟；去年没有记录就是 null。 */
  duration_delta_min: number | null;
  /** 入睡时刻的离散度（标准差，分钟）：越小越规律。 */
  onset_sd_min: number | null;
  onset_sd_delta_min: number | null;
  best: { month: string; score: number } | null;
  /** 有评分的月份不到两个时不写「最差」（只有一个月，最好最差是同一个）。 */
  worst: { month: string; score: number } | null;
  stages: SleepStages;
}

const yearFacts = (months: SleepMonth[]) => {
  const nights = months.reduce((sum, m) => sum + m.nights, 0);
  const timed = months.filter((m) => m.nights > 0 && m.avg_duration_min > 0);
  const timedNights = timed.reduce((sum, m) => sum + m.nights, 0);
  const avgDuration = timedNights > 0 ? timed.reduce((sum, m) => sum + m.avg_duration_min * m.nights, 0) / timedNights : null;
  // 入睡时刻按晚合并：每个月给了晚数、平均和标准差，合起来就是全年的标准差（不是各月标准差的平均）。
  const onsets = months.filter((m) => (m.onset_nights ?? 0) > 0 && m.onset_sd_min !== null && m.onset_sd_min !== undefined);
  const n = onsets.reduce((sum, m) => sum + m.onset_nights, 0);
  let onsetSd: number | null = null;
  if (n > 1) {
    const mean = onsets.reduce((sum, m) => sum + m.avg_onset_min * m.onset_nights, 0) / n;
    const square = onsets.reduce((sum, m) => sum + m.onset_nights * ((m.onset_sd_min ?? 0) ** 2 + m.avg_onset_min ** 2), 0) / n;
    onsetSd = Math.sqrt(Math.max(0, square - mean * mean));
  }
  return { nights, avgDuration, onsetSd };
};

/** 某一年的年度分析（热图上方那张卡）。`months` 是全部月份（要拿去年来比）。 */
export const sleepYearAnalysis = (months: SleepMonth[], year: string): SleepYearAnalysis | null => {
  const inYear = months.filter((m) => m.month.startsWith(`${year}-`));
  if (!inYear.length) return null;
  const lastYear = months.filter((m) => m.month.startsWith(`${Number(year) - 1}-`));
  const now = yearFacts(inYear);
  const before = lastYear.length ? yearFacts(lastYear) : null;
  const scored = inYear.filter((m) => m.avg_score !== null && m.avg_score !== undefined && (m.score_nights ?? 0) > 0)
    .map((m) => ({ month: m.month, score: m.avg_score as number }))
    .sort((a, b) => b.score - a.score || a.month.localeCompare(b.month));
  const diff = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : a - b);
  return {
    year,
    nights: now.nights,
    avg_duration_min: now.avgDuration,
    duration_delta_min: diff(now.avgDuration, before?.avgDuration),
    onset_sd_min: now.onsetSd,
    onset_sd_delta_min: diff(now.onsetSd, before?.onsetSd),
    best: scored[0] ?? null,
    worst: scored.length > 1 ? scored[scored.length - 1]! : null,
    stages: {
      deep: inYear.reduce((sum, m) => sum + m.deep_min, 0),
      light: inYear.reduce((sum, m) => sum + m.light_min, 0),
      rem: inYear.reduce((sum, m) => sum + m.rem_min, 0),
      awake: inYear.reduce((sum, m) => sum + m.awake_min, 0),
    },
  };
};

/** 分期占比环：四段弧，周长按 100 算（`r = 15.915` 的圆）。四段都是 0 时为空。 */
const RING = ['deep', 'light', 'rem', 'awake'] as const;
export const stageRing = (stages: SleepStages): { stage: (typeof RING)[number]; dash: string; offset: number }[] => {
  const total = RING.reduce((sum, key) => sum + Math.max(0, stages[key]), 0);
  if (total <= 0) return [];
  let start = 0;
  return RING.map((stage) => {
    const length = (Math.max(0, stages[stage]) / total) * 100;
    const visible = Math.max(0, length - 1.2);
    const arc = { stage, dash: `${visible} ${100 - visible}`, offset: 25 - start };
    start += length;
    return { arc, visible };
  }).filter((part) => part.visible > 0).map((part) => part.arc);
};

/** 当地中午之后的分钟数 → HH:MM（24 小时制，给「平均入睡」）。 */
export const clockFromNoon = (minutes: number): string => {
  const total = Math.round(minutes + 720) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** 本地日期 YYYY-MM-DD。 */
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- 月档小格 / 年档热图的一格 ---------- */

/** 小格和日历热图里的一条记录（运动、睡眠共用；列表页把自己的记录折成这个样子）。 */
export interface AlbumTile {
  id: string;
  /** 本地日期 YYYY-MM-DD / 月份 YYYY-MM。 */
  day: string;
  month: string;
  /** 点开去的详情页。 */
  to: object;
  /** 读屏和悬停用的整句（日期 + 类型 + 主读数）。 */
  label: string;
  /** 小格上的主读数（距离 / 时长）。 */
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
