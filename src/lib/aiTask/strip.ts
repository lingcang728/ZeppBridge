import type { DayStripCell } from '../../types/timeBridge';
import { perCell } from './bridgeScale';

export interface StripColumn {
  dates: string[]; value: number | null; has: boolean; unit: string | null;
  height: number; ids: string[]; missing: number;
}
export const stripColumns = (cells: DayStripCell[], days: number): StripColumn[] => {
  const selected = cells.slice(-days);
  const group = perCell(days);
  const values = selected.map(c => c.value).filter((v): v is number => v !== null && Number.isFinite(v));
  const max = Math.max(...values, 1);
  const out: StripColumn[] = [];
  for (let i = 0; i < selected.length; i += group) {
    const chunk = selected.slice(i, i + group);
    const known = chunk.flatMap(c => c.value !== null && Number.isFinite(c.value) ? [c.value] : []);
    const value = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    out.push({ dates: chunk.map(c => c.date), value, has: chunk.some(c => c.has), unit: chunk.find(c => c.unit)?.unit ?? null,
      height: value === null ? 0 : Math.max(2, value / max * 29), ids: chunk.flatMap(c => c.workout_ids), missing: chunk.filter(c => !c.has).length });
  }
  return out;
};
