/** Heart-rate samples farther apart than this are a break, not a straight line. */
export const HR_GAP_BREAK_MS = 15 * 60_000;

export interface TimedValue {
  ts: number;
  value: number;
}

/**
 * Insert a null breakpoint when consecutive samples exceed `gapMs`.
 * Pair with `connectNulls: false` so missing time is a hole, not a line.
 */
export function insertNullBreaks(
  points: readonly TimedValue[],
  gapMs: number,
): Array<[number, number | null]> {
  const data: Array<[number, number | null]> = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous && point.ts - previous.ts > gapMs) {
      data.push([previous.ts + 1, null]);
    }
    data.push([point.ts, point.value]);
  }
  return data;
}
