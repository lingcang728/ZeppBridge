/**
 * 轴标签门禁（3.1）：一条轴上的标签按位置从左到右必须**单调、不重复**。
 *
 * 起因是 tobi 那张设计稿的睡眠图横轴写着 22:00 / 01:00 / 01:00 / 04:00——典型的生成稿破绽。
 * 我们自己也会撞上：夏令时结束那晚，钟面上的 01:00 会出现两次，按整点走的刻度就会写出两个
 * 「01:00」。所以所有自己排的时间刻度都过一遍 `gateAxisTicks`：位置不增的、标签和前面重复的都丢掉。
 */

export interface AxisTick {
  /** 在轴上的位置（时间戳或百分比都行，只要越往右越大）。 */
  at: number;
  label: string;
}

/** 丢掉位置不增、或标签和左边任何一个重复的刻度。保持原顺序。 */
export function gateAxisTicks<T extends AxisTick>(ticks: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  let last = -Infinity;
  for (const tick of ticks) {
    if (!(tick.at > last) || seen.has(tick.label)) continue;
    seen.add(tick.label);
    out.push(tick);
    last = tick.at;
  }
  return out;
}

/** 测试用：列出一串刻度违反门禁的地方，空数组就是合格。 */
export function axisTickProblems(ticks: readonly AxisTick[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  ticks.forEach((tick, index) => {
    if (index > 0 && !(tick.at > ticks[index - 1].at)) problems.push(`#${index} ${tick.label} not increasing`);
    if (seen.has(tick.label)) problems.push(`#${index} ${tick.label} repeated`);
    seen.add(tick.label);
  });
  return problems;
}

const HOUR = 3_600_000;

/**
 * 睡眠时间轴的中间刻度：本机钟面的整点，按跨度取 1 / 2 / 3 小时一格；贴着两端（6% 以内）的不画，
 * 两端已有起止时间。`format` 把时间戳写成钟面时间。返回的 `at` 是百分比位置。
 */
export function sleepHourTicks(from: number, span: number, format: (ms: number) => string): AxisTick[] {
  if (!(span > 0)) return [];
  const hours = span / HOUR;
  const step = hours <= 6 ? 1 : hours <= 12 ? 2 : 3;
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  const out: AxisTick[] = [];
  for (let at = first.getTime() + HOUR; at < from + span; at += HOUR) {
    if (new Date(at).getHours() % step !== 0) continue;
    const left = ((at - from) / span) * 100;
    if (left < 6 || left > 94) continue;
    out.push({ at: left, label: format(at) });
  }
  // 两端的起止时间也在轴上：和它们同名的中间刻度一样不要。
  const ends = new Set([format(from), format(from + span)]);
  return gateAxisTicks(out.filter((tick) => !ends.has(tick.label)));
}
