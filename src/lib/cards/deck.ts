/**
 * 扑克牌收集（精修批次 7.2）的纯函数：一段日子 → 一层层的牌。
 *
 * - 7 天：七张日牌；
 * - 1 个月：最近 30 天按自然周（周一到周日）叠成 4–5 叠，开头那周落在范围里不到 3 天就并进下一叠；
 * - 6 个月：最近 6 个自然月，一月一叠；
 * - 1 年（3.0.4）：最近 4 个自然季度，一季一叠；
 * - 全部（3.0.4）：最近 10 个自然年，一年一叠（补拉的上限就是 10 年）。
 * 叠可以展开：年 → 季 → 月 → 这个月里的自然周 → 日。没有读数的日子照样发牌（显示「—」），但不能勾选，
 * 不拿 0 充数。
 */
import { addDays } from '../aiTask/bridgeScale';

export interface DeckDay {
  date: string;
  /** 这一天的读数；整类的牌只有「有没有记录」，这里是 null。 */
  value: number | null;
  /** 这一天有没有记录（有读数一定有记录）。 */
  has: boolean;
  /** 一张牌不是「一天」而是「一次运动」时（第三轮 B3）：牌的 id（默认就是日期）。 */
  id?: string;
  /** 放进收集箱的键（默认是这一项的键）。运动牌是 `workout:<id>`。 */
  pickKey?: string;
  /** 牌面上的图标（运动类型）。 */
  icon?: 'run' | 'bike' | 'activity';
  /** 已经排好的读数（运动牌：时长 · 距离）。 */
  text?: string;
  /** 双读数牌的第二个读数（乳酸阈值：配速，1A·A8）。没有就是 null，不补零。 */
  value2?: number | null;
}

/** 运动牌在收集箱里的键前缀：`workout:<运动 id>`。 */
export const WORKOUT_PREFIX = 'workout:';

/** 牌的 id：运动牌是运动 id，日牌是日期。 */
export const cardIdOf = (day: DeckDay): string => day.id ?? day.date;

export type GroupKind = 'week' | 'month' | 'quarter' | 'year';

export interface DeckGroup {
  id: string;
  kind: GroupKind;
  start: string;
  end: string;
  days: DeckDay[];
}

export type DeckLevel =
  | { kind: 'days'; days: DeckDay[] }
  | { kind: 'groups'; groups: DeckGroup[] };

export type DeckRange = 7 | 30 | 180 | 365 | 3650;

/** 牌桌上能选的档位，短 → 长。 */
export const DECK_RANGES: readonly DeckRange[] = [7, 30, 180, 365, 3650];

/** 「全部」往回几个自然年（含今年）。和补拉的上限一致（lib/backfillRange.ts 的 ALL_HISTORY_YEARS）。 */
export const ALL_YEARS = 10;

/** 页面上的范围 → 牌桌用哪一档（7 天以内发日牌，一个月以内发周叠，半年以内发月叠，一年以内发季叠，再长发年叠）。 */
export const deckRangeOf = (days: number): DeckRange => (days <= 7 ? 7 : days <= 31 ? 30 : days <= 186 ? 180 : days <= 366 ? 365 : 3650);

/** 星期几（周一 = 0）。按本地日历算，不受时区影响。 */
const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y!, m! - 1, d!).getDay() + 6) % 7;
};

/** `[start, end]` 每一天，旧 → 新；读数从 `lookup` 取。 */
export const daysBetweenInclusive = (start: string, end: string, lookup: (date: string) => { value: number | null; has: boolean } | null): DeckDay[] => {
  const out: DeckDay[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const found = lookup(day);
    out.push({ date: day, value: found?.value ?? null, has: found?.has ?? false });
  }
  return out;
};

const firstOfMonth = (year: number, monthIndex: number): string => {
  const first = new Date(year, monthIndex, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
};

/** 这一档从哪天开始：7 天 / 30 天往回数；6 个月从五个月前的 1 号起；1 年从三个季度前那一季的第一天起；全部从九年前的 1 月 1 日起。 */
export const rangeStart = (today: string, range: DeckRange): string => {
  const [y, m] = today.split('-').map(Number);
  if (range === 180) return firstOfMonth(y!, m! - 1 - 5);
  if (range === 365) return firstOfMonth(y!, Math.floor((m! - 1) / 3) * 3 - 9);
  if (range === 3650) return `${y! - (ALL_YEARS - 1)}-01-01`;
  return addDays(today, -(range - 1));
};

/** 按自然周叠起来；开头那周在范围里不到 `minDays` 天就并进下一周。 */
export const weeksOf = (days: DeckDay[], minDays = 3): DeckGroup[] => {
  const groups: DeckGroup[] = [];
  for (const day of days) {
    const monday = addDays(day.date, -weekdayOf(day.date));
    const last = groups[groups.length - 1];
    if (last && last.id === `w:${monday}`) last.days.push(day);
    else groups.push({ id: `w:${monday}`, kind: 'week', start: day.date, end: day.date, days: [day] });
  }
  if (groups.length > 1 && groups[0]!.days.length < minDays) {
    const [head, next] = groups.splice(0, 2) as [DeckGroup, DeckGroup];
    groups.unshift({ ...next, start: head.start, days: [...head.days, ...next.days] });
  }
  for (const group of groups) {
    group.start = group.days[0]!.date;
    group.end = group.days[group.days.length - 1]!.date;
  }
  return groups;
};

/** 按日期算出的键连续叠起来（月、季、年都是这样叠的）。 */
const groupBy = (days: DeckDay[], kind: GroupKind, keyOf: (date: string) => string): DeckGroup[] => {
  const groups: DeckGroup[] = [];
  for (const day of days) {
    const id = keyOf(day.date);
    const last = groups[groups.length - 1];
    if (last && last.id === id) { last.days.push(day); last.end = day.date; }
    else groups.push({ id, kind, start: day.date, end: day.date, days: [day] });
  }
  return groups;
};

/** 第几季度（1–4）。 */
export const quarterOf = (date: string): number => Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;

/** 按自然月叠起来。 */
export const monthsOf = (days: DeckDay[]): DeckGroup[] => groupBy(days, 'month', (date) => `m:${date.slice(0, 7)}`);

/** 按自然季度叠起来（1–3 月是第一季）。 */
export const quartersOf = (days: DeckDay[]): DeckGroup[] => groupBy(days, 'quarter', (date) => `q:${date.slice(0, 4)}-${quarterOf(date)}`);

/** 按自然年叠起来。 */
export const yearsOf = (days: DeckDay[]): DeckGroup[] => groupBy(days, 'year', (date) => `y:${date.slice(0, 4)}`);

/** 最上面一层。 */
export const rootLevel = (days: DeckDay[], range: DeckRange): DeckLevel => {
  if (range === 7) return { kind: 'days', days };
  const groups = range === 30 ? weeksOf(days) : range === 180 ? monthsOf(days) : range === 365 ? quartersOf(days) : yearsOf(days);
  return { kind: 'groups', groups };
};

/** 点开一叠：年 → 四个季度；季 → 三个月；月 → 这个月的自然周（不并头）；周 → 日牌。 */
export const expandGroup = (group: DeckGroup): DeckLevel => {
  if (group.kind === 'year') return { kind: 'groups', groups: quartersOf(group.days) };
  if (group.kind === 'quarter') return { kind: 'groups', groups: monthsOf(group.days) };
  if (group.kind === 'month') return { kind: 'groups', groups: weeksOf(group.days, 1) };
  return { kind: 'days', days: group.days };
};

/**
 * 牌面上那排小点：周叠、月叠一天一个点；季叠、年叠一天一个点就是几百个，改成一月一个点（这个月有记录就亮，挑过就点亮成已挑）。
 */
export const groupDots = (group: DeckGroup, picked: (date: string) => boolean): Array<boolean | 'picked'> => {
  const dot = (days: DeckDay[]): boolean | 'picked' => (days.some((day) => day.has && picked(day.date)) ? 'picked' : days.some((day) => day.has));
  if (group.kind === 'week' || group.kind === 'month') return group.days.map((day) => dot([day]));
  return monthsOf(group.days).map((month) => dot(month.days));
};

/**
 * 连续挑（3.0.4「自定义 = 在当前层级连续拖选卡」）：`from` 到 `to` 之间（含两头）的每一张，按牌序，不管谁先点。
 * 范围永远按整张牌对齐，卡序不变；两头有一张不在这一层就什么也不挑。
 */
export const spanBetween = <T>(items: readonly T[], idOf: (item: T) => string, from: string, to: string): T[] => {
  const a = items.findIndex((item) => idOf(item) === from);
  const b = items.findIndex((item) => idOf(item) === to);
  if (a < 0 || b < 0) return [];
  return items.slice(Math.min(a, b), Math.max(a, b) + 1);
};

/** 一叠没有记录时，是还没补拉、还是云端确实没有（读覆盖账本，lib/cards/coverage.ts）。 */
export type GroupCoverage = 'not_backfilled' | 'cloud_empty' | null;

/** 一叠的概况：几天里有几天有记录、有读数的平均值（没有读数就是 null，不补零）。 */
export const groupSummary = (group: DeckGroup): { recorded: number; total: number; average: number | null } => {
  const values = group.days.map((day) => day.value).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    recorded: group.days.filter((day) => day.has).length,
    total: group.days.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  };
};

/** 一叠里能勾的日子（有记录的）。 */
export const pickableDates = (group: DeckGroup): string[] => group.days.filter((day) => day.has).map((day) => day.date);

/**
 * 从某一天点开（「你的过去」的一格）：以它为中心的 `size` 天，最后一天不超过今天。
 * 返回 `[start, end]`。
 */
export const focusWindow = (focus: string, today: string, size = 7): [string, string] => {
  const half = Math.floor(size / 2);
  let end = addDays(focus, size - 1 - half);
  if (end > today) end = today;
  return [addDays(end, -(size - 1)), end];
};
