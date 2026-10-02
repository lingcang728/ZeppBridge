/**
 * 表盘刻度的几何：大圈（交给 AI 的表圈）和类别节点外圈（日环）共用一套画法。
 *
 * 约定和钟表一样：一格一天，从 12 点顺时针排，**最后一天（今天）正好落在 12 点**——
 * 像表针停在「现在」。第一天紧挨在 12 点右手边，一圈走完回到今天。
 *
 * 疏密的取舍：7 天只有 7 根刻度，一圈空得像坏了的表；90 天又密成一圈毛边。所以：
 *   - 天刻度永远一天一根（超过上限才几天并一格，由 dayRing / windowDial 决定）；
 *   - 两根天刻度之间补细的分刻度，让整圈总数落在 `minorTarget` 附近（7 天 → 每天间 7 根，
 *     14 天 → 3 根，30 天 → 1 根，90 天 → 不补）。分刻度只是标尺，不表达任何数据；
 *   - 大圈每 7 天一根加长的周刻度（从今天往回数），一眼数得出「两周前」。
 *
 * 刻度合并成几条 path（亮 / 半亮 / 缺 / 只是标尺 / 分刻度），一圈几十根线只占几个 DOM 节点：
 * 关系网拖动时逐帧重绘，元素越少越省。纯函数，不碰 DOM。
 */

export type DialTickState = 'on' | 'part' | 'off' | 'plain';

export interface DialOptions {
  /** 刻度内端到圆心的距离；刻度向外长 `length`。 */
  radius: number;
  length: number;
  /** 周刻度的长度（向外）；不给就不画周刻度。 */
  weekLength?: number;
  /** 每格代表几天：大于 1 时周刻度对不上，不画。 */
  perCell?: number;
  /** 整圈刻度（天 + 分刻度）想要的大致总数；0 = 不补分刻度。 */
  minorTarget?: number;
  minorLength?: number;
}

/** 一圈上的一根刻度（天 / 周 / 今天 / 分刻度），按角度均匀排开。 */
export interface DialMark {
  angle: number;
  /** 静止时的长度。 */
  length: number;
  kind: 'day' | 'week' | 'today' | 'minor';
  /** 天刻度对应第几格；分刻度为 null。 */
  cell: number | null;
}

export interface DialPaths {
  /** 按状态分好的天刻度 path。 */
  ticks: Record<DialTickState, string>;
  /** 半亮那几格的不透明度（同一条 path 只能有一个，取平均）。 */
  partOpacity: number;
  minor: string;
  /** 今天（12 点）那一根：单独一条，最长。 */
  today: string;
  /** 今天那一格有没有数据（颜色照实画，不因为是今天就点亮）。 */
  todayState: DialTickState;
  /** 12 点刻度外端的坐标（放「今天」标签用）。 */
  todayTip: { x: number; y: number };
}

const round = (value: number) => Math.round(value * 100) / 100;
export const dialSegment = (angle: number, from: number, to: number): string => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return `M${round(from * cos)} ${round(from * sin)}L${round(to * cos)} ${round(to * sin)}`;
};

/** 第 `index` 格（0 = 最早）所在角度：最后一格在正上方。 */
export const dialAngle = (index: number, count: number): number =>
  -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / Math.max(1, count);

/** 两根天刻度之间补几根分刻度。 */
export const minorPerGap = (count: number, target: number): number =>
  target > 0 && count > 0 ? Math.max(0, Math.round(target / count) - 1) : 0;

/**
 * 整圈所有刻度，按角度从 12 点右手边顺时针排；第 `j` 根在 `-π/2 + (j+1)·2π/总数`。
 * 天刻度之间夹着分刻度，所以整圈是一把等距的尺——拖动时的「尾迹」在这把尺上走（见 wake.ts）。
 */
export const dialMarks = (count: number, options: DialOptions): DialMark[] => {
  const minors = minorPerGap(count, options.minorTarget ?? 0);
  const per = minors + 1;
  const total = Math.max(1, count) * per;
  const weeks = options.weekLength !== undefined && (options.perCell ?? 1) === 1;
  const minorLength = options.minorLength ?? options.length * 0.5;
  const marks: DialMark[] = [];
  for (let j = 0; j < total; j += 1) {
    const angle = -Math.PI / 2 + ((j + 1) * 2 * Math.PI) / total;
    // 第 i 格天刻度在 (i+1)·per - 1；其余是它后面的分刻度。
    const isDay = (j + 1) % per === 0;
    if (!isDay) {
      marks.push({ angle, length: minorLength, kind: 'minor', cell: null });
      continue;
    }
    const cell = (j + 1) / per - 1;
    const back = count - 1 - cell;
    if (back === 0) marks.push({ angle, length: (options.weekLength ?? options.length) + 2, kind: 'today', cell });
    else if (weeks && back % 7 === 0) marks.push({ angle, length: options.weekLength!, kind: 'week', cell });
    else marks.push({ angle, length: options.length, kind: 'day', cell });
  }
  return marks;
};

const stateOf = (value: number | undefined): DialTickState => {
  if (value === undefined) return 'plain';
  if (value >= 1) return 'on';
  return value > 0 ? 'part' : 'off';
};

/**
 * `cells` 为 null 时只画标尺（全部 `plain`），不点亮也不画成缺失——没有逐日数据就不猜。
 */
export const dialPaths = (cells: number[] | null, count: number, options: DialOptions): DialPaths => {
  const { radius } = options;
  const ticks: Record<DialTickState, string> = { on: '', part: '', off: '', plain: '' };
  let minor = '';
  let today = '';
  let todayState: DialTickState = 'plain';
  let partSum = 0;
  let partCount = 0;
  for (const mark of dialMarks(count, options)) {
    const d = dialSegment(mark.angle, radius, radius + mark.length);
    if (mark.kind === 'minor') { minor += d; continue; }
    const value = cells && mark.cell !== null ? cells[mark.cell] : undefined;
    const state = stateOf(value);
    if (mark.kind === 'today') { today = d; todayState = state; continue; }
    ticks[state] += d;
    if (state === 'part') { partSum += value!; partCount += 1; }
  }
  const tipRadius = radius + (options.weekLength ?? options.length) + 2;
  return {
    ticks,
    partOpacity: partCount ? round(0.35 + 0.65 * (partSum / partCount)) : 1,
    minor,
    today,
    todayState,
    todayTip: { x: 0, y: -tipRadius },
  };
};
