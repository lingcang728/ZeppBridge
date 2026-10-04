import type { PlanDocument } from '../../types/trainingPlan';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Swap whole days, including local rest notes. Never overwrite a destination. */
export const moveDay = (document: PlanDocument, from: string, to: string): PlanDocument => {
  if (from === to) return clone(document);
  if (document.from && to < document.from || document.to && to > document.to) return clone(document);
  const swap = (date: string) => date === from ? to : date === to ? from : date;
  return { ...clone(document), workouts: document.workouts.map(w => ({ ...clone(w), date: swap(w.date) })),
    rest: document.rest?.map(r => ({ ...r, date: swap(r.date) })) };
};
export const deleteDay = (document: PlanDocument, date: string): PlanDocument => ({ ...clone(document),
  workouts: document.workouts.filter(w => w.date !== date).map(w => clone(w)), rest: document.rest?.filter(r => r.date !== date).map(r => ({ ...r })) });
