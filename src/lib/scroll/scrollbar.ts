/**
 * 主滚动区那根悬浮细条（components/scroll/OverlayScrollbar.vue）的几何换算。
 * 轨道从顶栏下沿到窗口底，滑块在轨道里按 scrollTop 比例走；
 * 按时间排的列表（行上带 data-timeline="YYYY-MM"）另在轨道上标年份、拖动时给出当前年月。
 */

export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface Thumb {
  /** 滑块长度（px）。 */
  size: number;
  /** 滑块上沿离轨道上沿多远（px）。 */
  offset: number;
}

/** 滑块再短也要拿得住。 */
export const MIN_THUMB = 32;

export const maxScroll = (box: ScrollBox): number => Math.max(0, box.scrollHeight - box.clientHeight);

/** 内容比窗口高才有滚动条；差一两像素（缩放取整）不算。 */
export const overflows = (box: ScrollBox): boolean => maxScroll(box) > 1;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function thumbFor(box: ScrollBox, track: number, min = MIN_THUMB): Thumb {
  const room = Math.max(0, track);
  if (!overflows(box) || room <= 0) return { size: room, offset: 0 };
  const size = clamp(room * (box.clientHeight / box.scrollHeight), Math.min(min, room), room);
  const ratio = clamp(box.scrollTop / maxScroll(box), 0, 1);
  return { size, offset: (room - size) * ratio };
}

/** 拖动：滑块上沿拖到 offset 时，滚动区该滚到哪。 */
export function scrollTopFor(offset: number, box: ScrollBox, track: number, size: number): number {
  const travel = track - size;
  if (travel <= 0) return 0;
  return clamp(offset / travel, 0, 1) * maxScroll(box);
}

/** 某个内容位置滚到顶栏下沿时，滑块中线落在轨道哪里。年份刻度和气泡都按这条线对齐。 */
export function trackPointFor(contentTop: number, headHeight: number, box: ScrollBox, track: number, size: number): number {
  const scrollMax = maxScroll(box);
  const ratio = scrollMax > 0 ? clamp((contentTop - headHeight) / scrollMax, 0, 1) : 0;
  return (track - size) * ratio + size / 2;
}

export interface TimelineRow {
  /** YYYY-MM。 */
  key: string;
  /** 行上沿在滚动内容里的位置（px）。 */
  top: number;
}

export interface YearMark {
  year: string;
  /** 刻度在轨道上的位置（px）。 */
  at: number;
}

/**
 * 每年第一行（列表按时间倒排时就是那一年最晚的一条）标一个年份，最顶上那一年也标（一眼看出整条从哪年到哪年）。
 * 两个刻度挨得太近只留前一个，免得字叠在一起。
 */
export function yearMarks(rows: TimelineRow[], place: (top: number) => number, minGap = 22): YearMark[] {
  const marks: YearMark[] = [];
  let year = '';
  for (const row of rows) {
    const rowYear = row.key.slice(0, 4);
    if (rowYear === year) continue;
    year = rowYear;
    const at = place(row.top);
    const last = marks[marks.length - 1];
    if (last && at - last.at < minGap) continue;
    marks.push({ year: rowYear, at });
  }
  return marks;
}

/** 长列表（内容超过这么多屏）且带时间的行跨了不止一年：年份刻度一直显示，不等滚动才出。 */
export const PIN_SCREENS = 3;
export function pinYears(rows: TimelineRow[], box: Pick<ScrollBox, 'scrollHeight' | 'clientHeight'>): boolean {
  if (box.clientHeight <= 0 || box.scrollHeight < box.clientHeight * PIN_SCREENS || !rows.length) return false;
  const first = rows[0]!.key.slice(0, 4);
  return rows.some((row) => row.key.slice(0, 4) !== first);
}

/** 内容位置 y 处是哪一行（最后一个上沿不超过 y 的行；y 在第一行以上就算第一行）。行按 top 升序。 */
export function rowAt(rows: TimelineRow[], y: number): TimelineRow | null {
  if (!rows.length) return null;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (rows[mid]!.top <= y) low = mid;
    else high = mid - 1;
  }
  return rows[low]!;
}

/** 行的时间 → data-timeline 的值（本地时区的年月）。认不出来就不标。 */
export function timelineKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** data-timeline 的值 → 当月一号（给年月气泡格式化用）。 */
export function timelineMonth(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}
