/**
 * 信纸里那一句本机算的个人化句子（「你的库里已经有 7 年 2 个月」）。只读本机的覆盖范围，
 * 不发出去，也不进回信。不到一个月、或库是空的，就不说这句（不编造）。
 */
export interface ArchiveSpan { years: number; months: number }

export function archiveSpan(earliestDay: string | null | undefined, today: Date): ArchiveSpan | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(earliestDay ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) months -= 1;
  if (months < 1) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}
