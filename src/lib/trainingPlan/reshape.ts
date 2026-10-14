import type { PlanDocument, PlanSport, PlanVariant, PlanWorkoutInput } from '../../types/trainingPlan';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * 草稿只管它写明的日子（from..to）；范围外，周视图显示的是已经发到手表的计划（后端预览就是这么拼的）。
 * 要动范围外的某天，先把范围撑到包住这些日子，并把撑进来的日子上已发的训练搬进草稿，再交给 moveDay / deleteDay 等去改。
 * 不先搬：改的是草稿里不存在的那一天，什么也不会发生——「删了一天以后就再也删不动、排不了序」（10-14 反馈）。
 * `planned` 只收今天及以后的；已经过去的日子不往草稿里放（发不出去，也改不到）。
 */
export const absorbPlanned = (document: PlanDocument, planned: PlanWorkoutInput[], dates: string[], today: string): PlanDocument => {
  const wanted = dates.filter((date) => date >= today);
  if (!wanted.length) return document;
  const written = document.workouts.map((w) => w.date).sort();
  const oldFrom = document.from ?? written[0];
  const oldTo = document.to ?? written[written.length - 1];
  const bounds = [oldFrom, oldTo, ...wanted].filter((date): date is string => !!date).sort();
  const from = bounds[0]!;
  const to = bounds[bounds.length - 1]!;
  if (from === oldFrom && to === oldTo) return document;
  const outside = (date: string) => !oldFrom || !oldTo || date < oldFrom || date > oldTo;
  const moved = planned.filter((w) => w.date >= today && w.date >= from && w.date <= to && outside(w.date));
  return { ...clone(document), from, to, workouts: [...clone(document.workouts), ...clone(moved)] };
};

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

/** 把一条训练放到某一天（模板、导入的文件）。那一天在计划写明的范围外就把范围撑开，那一天原有的训练不动。 */
export const addWorkout = (document: PlanDocument, workout: Omit<PlanWorkoutInput, 'date'>, date: string): PlanDocument => {
  const next = clone(document);
  next.workouts.push({ ...clone(workout), date });
  if (next.from && date < next.from) next.from = date;
  if (next.to && date > next.to) next.to = date;
  return next;
};
