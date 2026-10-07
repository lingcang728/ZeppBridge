/**
 * 扑克牌收集（精修批次 7.2）的纯函数：一段日子 → 一层层的牌。
 *
 * - 7 天：七张日牌；
 * - 1 个月：最近 30 天按自然周（周一到周日）叠成 4–5 叠，开头那周落在范围里不到 3 天就并进下一叠；
 * - 6 个月：最近 6 个自然月，一月一叠。
 * 叠可以展开：月 → 这个月里的自然周 → 日。没有读数的日子照样发牌（显示「—」），但不能勾选，
 * 不拿 0 充数。
 */
import { addDays } from '../aiTask/bridgeScale';

export interface DeckDay {
  date: string;
  /** 这一天的读数；整类的牌只有「有没有记录」，这里是 null。 */
  value: number | null;
  /** 这一天有没有记录（有读数一定有记录）。 */
  has: boolean;
}

export type GroupKind = 'week' | 'month';

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

export type DeckRange = 7 | 30 | 180;

/** 页面上的范围 → 牌桌用哪一档（7 天以内发日牌，一个月以内发周叠，再长发月叠）。 */
export const deckRangeOf = (days: number): DeckRange => (days <= 7 ? 7 : days <= 31 ? 30 : 180);

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

/** 这一档从哪天开始：7 天 / 30 天往回数，6 个月从五个月前的 1 号起。 */
export const rangeStart = (today: string, range: DeckRange): string => {
  if (range === 180) {
    const [y, m] = today.split('-').map(Number);
    const first = new Date(y!, m! - 1 - 5, 1);
    return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
  }
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

/** 按自然月叠起来。 */
export const monthsOf = (days: DeckDay[]): DeckGroup[] => {
  const groups: DeckGroup[] = [];
  for (const day of days) {
    const id = `m:${day.date.slice(0, 7)}`;
    const last = groups[groups.length - 1];
    if (last && last.id === id) { last.days.push(day); last.end = day.date; }
    else groups.push({ id, kind: 'month', start: day.date, end: day.date, days: [day] });
  }
  return groups;
};

/** 最上面一层。 */
export const rootLevel = (days: DeckDay[], range: DeckRange): DeckLevel => {
  if (range === 7) return { kind: 'days', days };
  return { kind: 'groups', groups: range === 30 ? weeksOf(days) : monthsOf(days) };
};

/** 点开一叠：月 → 这个月的自然周（不并头）；周 → 日牌。 */
export const expandGroup = (group: DeckGroup): DeckLevel => (group.kind === 'month'
  ? { kind: 'groups', groups: weeksOf(group.days, 1) }
  : { kind: 'days', days: group.days });

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
