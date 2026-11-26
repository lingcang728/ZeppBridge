/**
 * 列表缩放的第四档：单条记录（睡眠 / 运动详情页）。日 → 月 → 年之下还有一层——在某一晚、某一次运动的详情页里
 * Ctrl + 滚轮往外（触控板往里捏），退到列表的「日」档、停在这一条上；再往外就是列表自己的月、年。
 *
 * 详情页这边只登记「要落到哪一条」，然后返回（来路就是列表时走浏览器后退，卡 ↔ 页形变缩回这一条；
 * 不是就前往列表）。列表那边回到场上时取走这条登记：先切到日档，再把这一行标成形变的落点、滚到固定的高度。
 */
import type { AlbumKind } from './album';

export interface RecordFocus {
  kind: AlbumKind;
  id: string;
  /** 这一条在哪一天（列表是分页读的，要先往下读到这个月）。 */
  day: string | null;
  /** 走的是浏览器后退：滚动由 returnScroll 按这一条定（steerReturnScroll），列表那边不用自己滚。 */
  steered: boolean;
}

let pending: RecordFocus | null = null;

export const requestRecordFocus = (focus: RecordFocus): void => { pending = focus; };

/** 列表回到场上时取走登记（只取自己这一种的）。 */
export const takeRecordFocus = (kind: AlbumKind): RecordFocus | null => {
  if (!pending || pending.kind !== kind) return null;
  const focus = pending;
  pending = null;
  return focus;
};

/** 落到日档以后，这一条的上沿离顶栏下沿多远：和年档热图点某一天落回日档是同一个高度（视口的四分之一）。 */
export const focusOffset = (viewportHeight: number): number => Math.max(24, viewportHeight / 4);

/* 一次手势只走一层，跨页也一样：详情页退回列表以后，同一串滚轮 / 捏合剩下的事件落到列表上，不能接着把日档缩成月档。
   退出那一刻锁住，手停下来（这么久没有新事件）才放开；锁着的时候每来一个事件就往后顺延。
   按事件自己的时间戳（event.timeStamp，和 performance.now() 同一时基）算：换页那一下主线程会忙几百毫秒，
   这期间的滚轮事件排着队、忙完才派发，按派发时的钟点算锁早过期了，按产生时算才认得出是同一串手势。 */
const GESTURE_IDLE_MS = 220;
let heldUntil = 0;
export const holdZoomGesture = (at: number = performance.now()): void => { heldUntil = Math.max(heldUntil, at + GESTURE_IDLE_MS); };
export const zoomGestureHeld = (at: number = performance.now()): boolean => at < heldUntil;
