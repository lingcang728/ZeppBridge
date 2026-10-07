/**
 * 指标 → 交给 AI 的哪一类数据、开个头的问题（精修批次 6.1）。纯函数，不出文案——文案在 components/ask/ask.i18n.ts。
 */
import type { AiTaskCategory } from './bridge/types';

const BY_PREFIX: Array<[RegExp, AiTaskCategory]> = [
  [/^sleep|^deep_|^rem_|^light_|^awake_|^nap/, 'sleep'],
  [/^(weight|bmi|body_|muscle|bone|visceral|bmr|protein|fat_|calorie_intake|food)/, 'body'],
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

/** 单次运动的三个问题（第三轮 B6）：这次练得怎么样、恢复够不够、下一次怎么安排。都带上这次运动本身。 */
export const workoutAskPresets = (): AskPreset[] => [
  { key: 'workoutReview', categories: ['training', 'heart_rate'], days: 7 },
  { key: 'workoutRecovery', categories: ['recovery', 'sleep'], days: 7 },
  { key: 'workoutNext', categories: ['training', 'recovery'], days: 28 },
];
