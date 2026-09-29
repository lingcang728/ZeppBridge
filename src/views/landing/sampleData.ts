/*
 * 落地页演示用的示例数据。全是编的、页面上标着「示例数据」，不来自任何人的账号。
 * 用确定的函数生成而不是随机数：每次打开形状都一样，截图和测试才对得上。
 */

/** 一天里每 30 分钟一个心率点（48 个），夜里低、白天起伏、傍晚跑步那一段高。 */
export const heartSeries: number[] = Array.from({ length: 48 }, (_, index) => {
  const hour = index / 2;
  const base = hour < 7 ? 54 : hour < 9 ? 66 : 72;
  const wave = Math.sin(index * 0.9) * 4 + Math.sin(index * 0.37) * 3;
  const run = hour >= 18 && hour < 19.5 ? 58 - Math.abs(hour - 18.75) * 40 : 0;
  return Math.round(base + wave + Math.max(0, run));
});

/** 每小时步数：没走路的小时是 null（和应用一样留空，不画成 0）。 */
export const hourlySteps: Array<number | null> = [
  null, null, null, null, null, null, 140, 820, 1320, 260, null, 190,
  610, 430, null, null, 220, 380, 1660, 1110, 480, 90, null, null,
];

export const stepsTotal = hourlySteps.reduce<number>((sum, value) => sum + (value ?? 0), 0);

export type Stage = 'deep' | 'light' | 'rem' | 'awake';
/** 一晚的睡眠阶段：[阶段, 分钟]。 */
export const sleepStages: Array<[Stage, number]> = [
  ['light', 18], ['deep', 42], ['light', 36], ['rem', 22], ['light', 40], ['deep', 30],
  ['light', 28], ['awake', 6], ['rem', 34], ['light', 44], ['deep', 18], ['light', 30],
  ['rem', 38], ['light', 26], ['awake', 4], ['rem', 26],
];

export const sleepMinutes = sleepStages
  .filter(([stage]) => stage !== 'awake')
  .reduce((sum, [, minutes]) => sum + minutes, 0);

/** 折线 path（0..w, 0..h），值越大越靠上。 */
export const linePath = (values: number[], width: number, height: number, pad = 4): string => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};
