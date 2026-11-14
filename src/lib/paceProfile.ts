/*
 * 配速统计：剔除暂停段和停顿 / 飘点后再算最快、最慢和纵轴主体范围。纯函数。
 *
 * 2026-11-14 用户截图：最慢 52'05"（等红灯）、纵轴 0:00–58:20，最快 / 平均 / 最慢和轴完全对不上。
 * 用户选定：三个都留，但只在「真在动」的采样上算；平均用 距离 ÷ 运动时间（和概要卡一致，由调用方给）。
 */
import type { ChartPoint } from './workoutCharts';

export interface TimeSpan { start: number; end: number }

/** 比中位数慢这么多倍就当是停下来了（等灯、系鞋带），不算进最慢。 */
export const SLOW_FACTOR = 3;
/** 比中位数快这么多倍是 GPS 飘点。 */
export const FAST_FACTOR = 0.4;
/** 最快 / 最慢取滑动中位数（这么多个点）：单个跳点不算数。 */
const SMOOTH = 5;

export interface PaceProfile {
  /** 平滑后的最快 / 最慢（原单位，原时刻）。 */
  fastest: ChartPoint;
  slowest: ChartPoint;
  /** 主体范围（2% / 98% 分位，原单位），纵轴按它取整。 */
  lo: number;
  hi: number;
  /** 被当成停顿 / 飘点剔掉了几个点（不含暂停段里的）。 */
  dropped: number;
  /** 剩下那些点的平均配速：按时间平均速度再取倒数（= 总时间 ÷ 总距离），不是配速的算术平均。 */
  mean: number;
}

/**
 * 头部的「平均」用哪个：概要给的平均（运动距离 ÷ 运动时间，和概要卡一致）落在最快 / 最慢之间就用它；
 * 落在外面说明采样和概要对不上（采样只覆盖一段、单位不一致……），这时用采样自己的平均——
 * 「平均比最快还快」这种自相矛盾的头部不出现（2026-11-14）。
 */
export const consistentAverage = (profile: PaceProfile, summary: number | null | undefined): number =>
  summary != null && Number.isFinite(summary) && summary >= profile.fastest.v && summary <= profile.slowest.v ? summary : profile.mean;

export const inSpans = (t: number, spans: readonly TimeSpan[]): boolean =>
  spans.some((span) => t >= span.start && t <= span.end);

export const quantile = (sorted: readonly number[], q: number): number => {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q;
  const i = Math.floor(at);
  const frac = at - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * frac : sorted[i];
};

const rollingMedian = (points: readonly ChartPoint[], size: number): ChartPoint[] => {
  const half = Math.floor(size / 2);
  return points.map((point, i) => {
    const window = points.slice(Math.max(0, i - half), i + half + 1).map((p) => p.v).sort((a, b) => a - b);
    return { t: point.t, v: quantile(window, 0.5) };
  });
};

/** 数值越小越快（分 / 公里）。少于两个在动的点返回 null。 */
export const paceProfile = (points: readonly ChartPoint[], pauses: readonly TimeSpan[]): PaceProfile | null => {
  const moving = points.filter((p) => !inSpans(p.t, pauses));
  if (moving.length < 2) return null;
  const median = quantile(moving.map((p) => p.v).sort((a, b) => a - b), 0.5);
  const kept = moving.filter((p) => p.v <= median * SLOW_FACTOR && p.v >= median * FAST_FACTOR);
  if (kept.length < 2) return null;
  const smooth = rollingMedian(kept, SMOOTH);
  let fastest = smooth[0];
  let slowest = smooth[0];
  for (const p of smooth) {
    if (p.v < fastest.v) fastest = p;
    if (p.v > slowest.v) slowest = p;
  }
  const sorted = smooth.map((p) => p.v).sort((a, b) => a - b);
  const speed = kept.reduce((sum, p) => sum + 1 / p.v, 0) / kept.length;
  return { fastest, slowest, lo: quantile(sorted, 0.02), hi: quantile(sorted, 0.98), dropped: moving.length - kept.length, mean: 1 / speed };
};
