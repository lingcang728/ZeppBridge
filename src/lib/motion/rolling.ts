/**
 * 会滚的数字（components/RollingNumber.vue）的纯函数部分：把排好版的字符串拆成「格」，判断新旧两个值能不能逐位滚，
 * 以及每一位的数字竖条该从哪儿滚到哪儿。
 *
 * 一段数字（`243.8`、`1:58:11`、`1,024`）里的每一格按「从右数第几位」配对，这样 9 → 10 这种多一位的情况
 * 两边的个位还对得上；数字段之外的字（单位、「次」「天」）整段算一格。
 * 两个值的格子一一对得上、数字以外的格子一字不差，才逐位滚；否则整串交叉淡入。
 */

export interface RollingSlot {
  key: string;
  /** 0–9：这一格是数字，画竖条；null：别的字，原样写。 */
  digit: number | null;
  text: string;
}

// 数字段：数字之间夹着的小数点、千分位、冒号、窄空格（法语千分位）也算在段里。
const NUMBER_RUN = /\d+(?:[.,:'  ]\d+)*/g;

export function rollingSlots(value: string): RollingSlot[] {
  const slots: RollingSlot[] = [];
  let at = 0, run = 0, text = 0;
  const pushText = (s: string) => { if (s) slots.push({ key: `t${text++}`, digit: null, text: s }); };
  for (const match of value.matchAll(NUMBER_RUN)) {
    pushText(value.slice(at, match.index));
    const chars = [...match[0]];
    chars.forEach((ch, i) => {
      const key = `n${run}.${chars.length - 1 - i}`;
      slots.push({ key, digit: /\d/.test(ch) ? Number(ch) : null, text: ch });
    });
    run += 1;
    at = match.index + match[0].length;
  }
  pushText(value.slice(at));
  return slots;
}

/** 两个值能逐位滚：格子一一对得上，数字以外的格子一字不差。 */
export function sameShape(a: RollingSlot[], b: RollingSlot[]): boolean {
  return a.length === b.length && a.every((slot, i) => {
    const other = b[i]!;
    return slot.key === other.key && (slot.digit === null) === (other.digit === null) && (slot.digit !== null || slot.text === other.text);
  });
}

/** 新值比旧值大是 1（往上滚），小是 -1（往下滚），一样是 0。只比数字：位数多的大，位数一样逐位比。 */
export function rollDirection(from: string, to: string): 1 | -1 | 0 {
  const a = from.replace(/\D/g, '').replace(/^0+(?=\d)/, ''), b = to.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (a.length !== b.length) return b.length > a.length ? 1 : -1;
  return b > a ? 1 : b < a ? -1 : 0;
}

/** 竖条有三遍 0–9（30 格），静止时停在中间那遍（10 + 数字）。 */
export const STRIP_CELLS = 30;
export const restCell = (digit: number) => 10 + digit;

/**
 * 竖条此刻停在第 `now` 格（滚到一半时是小数），要滚到数字 `digit`：先把 `now` 挪进中间那遍（看上去一样），
 * 再按方向找最近的那一格——往上滚只往后找，往下滚只往前找，所以 9 → 1 往上滚会经过 0 而不是倒着回去。
 */
export function rollTarget(now: number, digit: number, direction: 1 | -1 | 0): { from: number; to: number } {
  let from = now;
  while (from >= 20) from -= 10;
  while (from < 10) from += 10;
  const eps = 1e-3;
  if (direction >= 0) {
    let to = Math.ceil(from - eps);
    while (((to % 10) + 10) % 10 !== digit) to += 1;
    if (direction === 0 && to - from > 5) to -= 10;
    return { from, to };
  }
  let to = Math.floor(from + eps);
  while (((to % 10) + 10) % 10 !== digit) to -= 1;
  return { from, to };
}
