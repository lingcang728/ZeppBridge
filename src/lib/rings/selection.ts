import type { AnnualRings } from '../../types/rings';

/** Keep the journal preview and the stage on the same calendar year. */
export function defaultRingYear(data: AnnualRings): number | null {
  const years = data.years.map(y => y.year);
  if (!years.length) return null;
  const [y, m, d] = data.today.split('-').map(Number);
  return (m === 12 && d >= 15) || !years.includes(y - 1) ? years[years.length - 1] : y - 1;
}
