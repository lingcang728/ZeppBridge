import { defineMessages, messagesOf } from '../i18n';
import { isFiniteNumber } from './format';

/*
 * 训练负荷分档（从 Overview.vue 抽出来的唯一一份逻辑，D6 训练页也要显示档位）。
 *
 * 负荷本身是手表给的无量纲分数；分档是 ZeppBridge 自己划的粗读刻度：后端没给
 * 正数的 `training_load_scale` 时用 600 这个参考值，且要标明「参考」——不标的话
 * 用户会以为手表给过分级。比值口径与 Overview 原来的一字不差：
 * < 1/6 偏低，< 1/2 中等，< 1 较高，其余很高。
 */

export type TrainingLoadTier = 'low' | 'medium' | 'high' | 'veryHigh';

/** 参考刻度：后端没给正数 scale 时用这个。 */
export const DEFAULT_TRAINING_LOAD_SCALE = 600;

/** 生效的刻度：不是正数（没给 / 坏值）就落到参考刻度 600。 */
export const effectiveLoadScale = (scale?: number | null): number =>
  isFiniteNumber(scale) && scale > 0 ? scale : DEFAULT_TRAINING_LOAD_SCALE;

/** 这份刻度是不是参考值（后端没给正数 scale）——是的话档位要标「参考」。 */
export const isReferenceLoadScale = (scale?: number | null): boolean =>
  !(isFiniteNumber(scale) && scale > 0);

/** 负荷分档：负荷不是数（没有读数）返回 null。 */
export const trainingLoadTier = (
  load: number | null | undefined,
  scale?: number | null,
): TrainingLoadTier | null => {
  if (!isFiniteNumber(load)) return null;
  const ratio = load / effectiveLoadScale(scale);
  if (ratio < 1 / 6) return 'low';
  if (ratio < 1 / 2) return 'medium';
  if (ratio < 1) return 'high';
  return 'veryHigh';
};

const messages = defineMessages(
  {
    low: '偏低',
    medium: '中等',
    high: '较高',
    veryHigh: '很高',
    reference: (band: string) => `${band}（参考）`,
  },
  {
    low: 'low',
    medium: 'moderate',
    high: 'high',
    veryHigh: 'very high',
    reference: (band: string) => `${band} (reference)`,
  },
  {
    low: 'baja',
    medium: 'moderada',
    high: 'alta',
    veryHigh: 'muy alta',
    reference: (band: string) => `${band} (referencia)`,
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/trainingLoadTier',
);

/** 档位的界面说法（跟着界面语言走）。 */
export const trainingLoadTierLabel = (tier: TrainingLoadTier): string => messagesOf(messages)[tier];

/** 档位 +「参考」标记：刻度是参考值时用这份。 */
export const trainingLoadTierReference = (tier: TrainingLoadTier): string =>
  messagesOf(messages).reference(trainingLoadTierLabel(tier));

/** 直接给卡片的档位文案：负荷不是数返回 null；刻度是参考值时自动带「参考」标记。 */
export const trainingLoadTierText = (
  load: number | null | undefined,
  scale?: number | null,
): string | null => {
  const tier = trainingLoadTier(load, scale);
  if (!tier) return null;
  return isReferenceLoadScale(scale) ? trainingLoadTierReference(tier) : trainingLoadTierLabel(tier);
};
