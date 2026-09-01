import { defineMessages, messagesOf } from '../i18n';

/**
 * 四个睡眠阶段的名字。
 *
 * 抽出来共用，是因为它们同时出现在三个地方：睡眠详情的图例和分段图、
 * `StageBar` 的阶梯图坐标轴、以及分段列表。各写各的必然会在某次翻译里
 * 漏掉一处，而漏掉的那一处会以另一种语言留在图上。
 */
export type SleepStageTone = 'deep' | 'light' | 'rem' | 'awake' | 'unknown';

/**
 * 阶段顺序固定：由深到浅再到醒，阶梯图的 y 轴就是这个顺序。
 *
 * `unknown` 排在最后，而且**只在真的出现未知片段时**才画进坐标轴——
 * 见 `StageBar.vue`。它不是一个睡眠阶段，是「云端给了一个我们不认识的
 * mode」。后端以前把这种片段直接算成清醒，现在如实留成未知。
 */
export const SLEEP_STAGE_TONES: readonly SleepStageTone[] = ['deep', 'light', 'rem', 'awake'];

/** 含未知档的完整顺序。未知片段存在时，阶梯图用这一份当 y 轴。 */
export const SLEEP_STAGE_TONES_WITH_UNKNOWN: readonly SleepStageTone[] = [
  ...SLEEP_STAGE_TONES,
  'unknown',
];

const messages = defineMessages(
  {
    deep: '深睡',
    light: '浅睡',
    rem: 'REM',
    awake: '清醒',
    unknown: '未知',
  },
  {
    deep: 'Deep',
    light: 'Light',
    rem: 'REM',
    awake: 'Awake',
    unknown: 'Unknown',
  },
);

export const sleepStageLabel = (tone: SleepStageTone): string => messagesOf(messages)[tone];

/** 按固定顺序的四个名字，给坐标轴和图例用。 */
export const sleepStageLabels = (): string[] => SLEEP_STAGE_TONES.map(sleepStageLabel);

/** 同上，但把「未知」也带上。 */
export const sleepStageLabelsWithUnknown = (): string[] =>
  SLEEP_STAGE_TONES_WITH_UNKNOWN.map(sleepStageLabel);
