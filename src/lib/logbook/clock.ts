/** 履历里的时间与距离：成绩钟面（1:45:00）、倒计时天数、常用比赛距离。 */

/** 成绩钟面：`h:mm:ss`，不到一小时写 `mm:ss`。 */
export const clockText = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

/** 读用户敲的成绩：`1:45:00`、`45:30`、`2730`（纯秒）。读不懂返回 null，不猜。 */
export const parseClock = (text: string): number | null => {
  const value = text.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) > 0 ? Number(value) : null;
  const parts = value.split(':');
  // 第一段可以多位（100:00 也是合法的十公里外的成绩），后面每段两位以内。
  if (parts.length < 2 || parts.length > 3 || !/^\d+$/.test(parts[0]) || parts.slice(1).some(part => !/^\d{1,2}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some(n => n >= 60)) return null;
  const seconds = numbers.reduce((sum, n) => sum * 60 + n, 0);
  return seconds > 0 ? seconds : null;
};

/** 配速（秒 / km），距离不够算不出返回 null。 */
export const paceOf = (seconds: number, meters: number | null | undefined): number | null =>
  meters && meters > 0 ? seconds / (meters / 1000) : null;

/** 本地日期 `YYYY-MM-DD` 之间差几天（b − a），按日历日算，不受夏令时影响。 */
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** 比赛表单里的距离快捷项（米）。 */
export const RACE_DISTANCES = [
  { key: '5k', meters: 5000 },
  { key: '10k', meters: 10000 },
  { key: 'half', meters: 21097.5 },
  { key: 'marathon', meters: 42195 },
] as const;

/** 和标准距离差 1% 以内就叫它的名字（半马、全马），否则显示公里数。 */
export const raceDistanceKey = (meters: number | null | undefined): (typeof RACE_DISTANCES)[number]['key'] | null => {
  if (!meters) return null;
  return RACE_DISTANCES.find(item => Math.abs(item.meters - meters) <= item.meters * 0.01)?.key ?? null;
};
