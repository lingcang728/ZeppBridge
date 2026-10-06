import type { PlanDocument, PlanSport, PlanVariant } from '../../types/trainingPlan';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Swap whole days, including local rest notes. Never overwrite a destination. */
export const moveDay = (document: PlanDocument, from: string, to: string): PlanDocument => {
  if (from === to) return clone(document);
  if (document.from && to < document.from || document.to && to > document.to) return clone(document);
  const swap = (date: string) => date === from ? to : date === to ? from : date;
  return { ...clone(document), workouts: document.workouts.map(w => ({ ...clone(w), date: swap(w.date) })),
    rest: document.rest?.map(r => ({ ...r, date: swap(r.date) })) };
};
const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
};

/**
 * 把 `from` 这一天整天挪到 `to`，中间的日子顺移一天让位（拖到两张卡之间的缝隙）。
 * 往后挪：from+1 … to 各提前一天；往前挪：to … from-1 各推后一天。休息建议跟着各自的那天走。
 * 落点超出计划写明的范围就原样返回（不往范围外挤）。
 */
export const insertDay = (document: PlanDocument, from: string, to: string): PlanDocument => {
  if (from === to) return clone(document);
  if (document.from && to < document.from || document.to && to > document.to) return clone(document);
  const forward = to > from;
  const move = (date: string) => {
    if (date === from) return to;
    if (forward && date > from && date <= to) return shiftDate(date, -1);
    if (!forward && date >= to && date < from) return shiftDate(date, 1);
    return date;
  };
  return { ...clone(document), workouts: document.workouts.map(w => ({ ...clone(w), date: move(w.date) })),
    rest: document.rest?.map(r => ({ ...r, date: move(r.date) })) };
};

/** 能发到手表的大类和各自的子类型（游泳不分）。和 core `Sport::variants` 一致。 */
export const SPORT_VARIANTS: Record<PlanSport, PlanVariant[]> = {
  running: ['outdoor', 'treadmill', 'track'],
  cycling: ['outdoor', 'indoor'],
  pool_swim: [],
  open_water_swim: [],
};

/**
 * 改一条训练的运动大类和子类型（草稿原文里第几条）。走路这类发不到手表的活动就地换成能发的，
 * 子类型不属于新大类就去掉，交给后端重新校验。
 */
export const retypeWorkout = (document: PlanDocument, index: number, sport: PlanSport, variant?: PlanVariant): PlanDocument => {
  const next = clone(document);
  const target = next.workouts[index];
  if (!target) return next;
  target.sport = sport;
  const keep = variant ?? (target.variant as PlanVariant | undefined);
  if (keep && SPORT_VARIANTS[sport].includes(keep)) target.variant = keep;
  else delete target.variant;
  return next;
};

/** 删掉草稿原文里的某一条训练（同一天别的训练和休息建议不动）。 */
export const deleteWorkout = (document: PlanDocument, index: number): PlanDocument => {
  const next = clone(document);
  next.workouts.splice(index, 1);
  return next;
};

export const deleteDay = (document: PlanDocument, date: string): PlanDocument => ({ ...clone(document),
  workouts: document.workouts.filter(w => w.date !== date).map(w => clone(w)), rest: document.rest?.filter(r => r.date !== date).map(r => ({ ...r })) });
