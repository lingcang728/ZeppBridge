import type { AdherenceDay } from '../../types/timeBridge';
import type { StripColumn } from '../aiTask/strip';

/** Shared duration scale for actual bars and historical plan outlines. */
export const adherenceScale = (columns: StripColumn[], compared: AdherenceDay[]): number =>
  Math.max(1,...columns.map(c => c.value ?? 0),...compared.map(a => (a.planned?.seconds ?? 0) / 60));
export const plannedColumns = (columns: StripColumn[], compared: AdherenceDay[], max: number) => {
  const byDay = new Map(compared.map(a => [a.date,a]));
  return columns.map((c,i) => {
    const planned = c.dates.flatMap(d => byDay.get(d)?.planned ? [byDay.get(d)!.planned!] : []);
    const seconds = planned.length && planned.every(p => p.seconds !== null) ? planned.reduce((s,p) => s+p.seconds!,0)/planned.length : null;
    return { i, height: seconds === null ? 0 : Math.max(3, seconds / 60 / max * 29) };
  }).filter(g => g.height > 0);
};
