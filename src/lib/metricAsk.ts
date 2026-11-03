/**
 * 指标 → 交给 AI 的哪一类数据、开个头的问题（精修批次 6.1）。纯函数，不出文案——文案在 components/ask/ask.i18n.ts。
 */
import type { AiTaskCategory, AiTaskDetailLevel } from './bridge/types';

const BY_PREFIX: Array<[RegExp, AiTaskCategory]> = [
  [/^sleep|^deep_|^rem_|^light_|^awake_|^nap/, 'sleep'],
  [/^(blood_pressure|weight|bmi|body_|muscle|bone|visceral|bmr|protein|fat_|calorie_intake|food)/, 'body'],
  [/^(training_load|vo2max|lactate|pai|steps|distance|active_|floors)/, 'training'],
  [/^(heart_rate|hr_|max_hr|min_hr)/, 'heart_rate'],
  [/^(resting_hr|readiness|physical_readiness|stress|respiratory|hrv|sleep_hrv|spo2|charge|skin_temp|body_temp)/, 'recovery'],
];

/** 这一项属于哪一类（交给 AI 时只带这一类）。认不出来就当恢复状态。 */
export const askCategoryOf = (metric: string): AiTaskCategory => {
  // 静息心率既在恢复也在心率里：问它多半是想看恢复。
  if (metric === 'resting_hr') return 'recovery';
  for (const [pattern, category] of BY_PREFIX) if (pattern.test(metric)) return category;
  return 'recovery';
};

export type AskDirection = 'above' | 'below' | 'usual' | null;

/** 一个现成问题：问什么、要带哪几类、看多少天。 */
export interface AskPreset {
  key: string;
  categories: AiTaskCategory[];
  days: number;
  /** 某几类自己的天数（没写的用 `days`）。运动类写 1 = 只交这一次运动。 */
  daysBy?: Partial<Record<AiTaskCategory, number>>;
  /** 明细程度（没写就是新任务的默认）。 */
  detail?: AiTaskDetailLevel;
}

/**
 * 每一项三个问题：第一句跟着标记走（比平时高 / 低 / 正常吗），第二句结合训练或饮食，第三句顺便看看睡眠
 * （本身就是睡眠的，第三句换成结合训练一起看）。训练类的第三句是「下周该加量还是减量」。
 */
export const askPresets = (metric: string): AskPreset[] => {
  const category = askCategoryOf(metric);
  const first: AskPreset = { key: 'first', categories: [category], days: 28 };
  if (category === 'sleep') {
    return [first, { key: 'sleepWithTraining', categories: ['sleep', 'training'], days: 28 }];
  }
  if (category === 'body') {
    return [first, { key: 'bodyFood', categories: ['body', 'training'], days: 56 }, { key: 'withSleep', categories: ['body', 'sleep'], days: 28 }];
  }
  if (category === 'training') {
    return [first, { key: 'trainingNext', categories: ['training', 'recovery'], days: 28 }, { key: 'withSleep', categories: ['training', 'sleep'], days: 28 }];
  }
  return [first, { key: 'withTraining', categories: [category, 'training'], days: 28 }, { key: 'withSleep', categories: [category, 'sleep'], days: 28 }];
};

/**
 * 单次运动的三个问题（第三轮 B6）：这次练得怎么样、恢复够不够、下一次怎么安排。
 * 每一问都开「运动」类、只交这一次（10-28：以前三问都没开运动类，导出侧不开这一类就一个运动字段都不出去，
 * 交给 AI 页上只有两三张别的牌）。窗口按这次运动的开始日往前数，看旧运动也对得上。
 */
const THIS_WORKOUT = { workout: 1 } as const;
export const workoutAskPresets = (): AskPreset[] => [
  { key: 'workoutReview', categories: ['workout', 'training', 'recovery', 'sleep', 'resting_hr'], days: 7, daysBy: THIS_WORKOUT, detail: 'detailed' },
  { key: 'workoutRecovery', categories: ['workout', 'sleep', 'recovery', 'resting_hr'], days: 30, daysBy: THIS_WORKOUT },
  { key: 'workoutNext', categories: ['workout', 'training', 'recovery', 'sleep'], days: 14, daysBy: { ...THIS_WORKOUT, training: 28 } },
];

/** 睡眠详情的三个问题：这一晚怎么样、和训练一起看、恢复够不够。窗口以那一晚（醒来那天）为终点。 */
export const sleepAskPresets = (): AskPreset[] => [
  { key: 'sleepNight', categories: ['sleep', 'recovery', 'resting_hr'], days: 14 },
  { key: 'sleepWithTraining', categories: ['sleep', 'recovery', 'resting_hr', 'training'], days: 14, daysBy: { training: 28 } },
  { key: 'sleepRecovery', categories: ['sleep', 'recovery', 'resting_hr'], days: 14 },
];

/** 以 `end`（YYYY-MM-DD）为最后一天、往前共 `days` 天的日子，从早到晚。 */
export const daysEndingOn = (end: string, days: number): string[] => {
  const last = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(last)) return [];
  return Array.from({ length: Math.max(1, days) }, (_, i) => new Date(last - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
};
