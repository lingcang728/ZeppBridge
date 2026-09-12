/**
 * 日历上的月份名、星期名、一周从哪天起。
 *
 * **跟系统地区，不跟界面语言。** 界面只有中/英/西三份，系统地区却有很多：
 * 德语 Windows 上用英文界面的人，日历仍该是 März / Mo Di Mi，而不是
 * 被折成 English。原生 `<input type="date">` 就是这个合同，自绘日历沿用。
 *
 * 可选的 `localeTag` 只给测试用。界面调用一律不传，读 `navigator`。
 *
 * 日期数字怎么排（年/月/日）是另一件事，由 `displayDateTimeFormatter` 和
 * 设置里的日期顺序偏好管。这里只决定日历上的**字**。
 */

interface LocaleWeekInfo {
  firstDay: number;
}

export const systemLocaleTag = (): string | undefined => {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.languages?.[0] || navigator.language || undefined;
};

const resolveTag = (localeTag?: string): string | undefined =>
  localeTag || systemLocaleTag();

const weekInfoOf = (tag: string): LocaleWeekInfo | undefined => {
  try {
    const info = (new Intl.Locale(tag) as Intl.Locale & { weekInfo?: LocaleWeekInfo }).weekInfo;
    return info;
  } catch {
    return undefined;
  }
};

const isCjkLocale = (tag: string | undefined): boolean =>
  Boolean(tag && /^(zh|ja|ko)\b/i.test(tag));

/** JS `Date#getDay`：0 是星期日。 */
export const calendarWeekStart = (localeTag?: string): number => {
  const tag = resolveTag(localeTag);
  const first = tag ? weekInfoOf(tag)?.firstDay : undefined;
  if (typeof first === 'number') return first === 7 ? 0 : first;
  // weekInfo 缺失时：美式英语周日，其余按 ISO 周一。
  if (tag && /^en\b/i.test(tag) && !/-(GB|IE|AU|NZ|ZA|IN)/i.test(tag)) return 0;
  return 1;
};

export const calendarMonthTitle = (
  year: number,
  monthIndex: number,
  localeTag?: string,
): string =>
  new Intl.DateTimeFormat(resolveTag(localeTag), { year: 'numeric', month: 'long' })
    .format(new Date(year, monthIndex, 1));

export const calendarWeekdayNames = (localeTag?: string): string[] => {
  const tag = resolveTag(localeTag);
  const sunday = new Date(2026, 0, 4);
  const formatter = new Intl.DateTimeFormat(tag, {
    weekday: isCjkLocale(tag) ? 'narrow' : 'short',
  });
  const start = calendarWeekStart(tag);
  return Array.from({ length: 7 }, (_unused, offset) => {
    const day = (start + offset) % 7;
    return formatter.format(new Date(2026, 0, sunday.getDate() + day));
  });
};

export interface CalendarCell {
  day: number | null;
  dateStr: string;
}

export const calendarCells = (
  year: number,
  monthIndex: number,
  localeTag?: string,
): CalendarCell[] => {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const leading = (firstWeekday - calendarWeekStart(localeTag) + 7) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push({ day: null, dateStr: '' });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const month = String(monthIndex + 1).padStart(2, '0');
    const dayPart = String(day).padStart(2, '0');
    cells.push({ day, dateStr: `${year}-${month}-${dayPart}` });
  }
  return cells;
};
