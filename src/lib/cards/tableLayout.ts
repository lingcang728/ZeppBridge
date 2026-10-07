/**
 * 牌桌的版式（精修批次 7.2，第三轮从 CardTable.vue 拆出来）：牌按桌面大小排开，一层一道微拱的扇面。
 * 一行放不下（牌窄于 104px）就分两排；运动多的一周（一天两三练）再分一排。纯函数。
 */
import type { DeckLevel } from './deck';

const GAP = 18;

export interface StageBox { width: number; height: number }

const countOf = (level: DeckLevel) => (level.kind === 'days' ? level.days.length : level.groups.length);

export const tableLayout = (level: DeckLevel, stage: StageBox) => {
  const n = Math.max(1, countOf(level));
  const { width, height } = stage;
  const byHeight = (rows: number) => ((height - GAP * (rows - 1)) / rows) * 0.84 * (5 / 7);
  let perRow = n;
  let w = Math.min(232, byHeight(1), (width - GAP * (perRow - 1)) / perRow);
  if (w < 104 && n > 4) {
    perRow = Math.ceil(n / 2);
    w = Math.min(200, byHeight(2), (width - GAP * (perRow - 1)) / perRow);
  }
  if (w < 96 && n > 12) {
    perRow = Math.ceil(n / 3);
    w = Math.min(180, byHeight(3), (width - GAP * (perRow - 1)) / perRow);
  }
  return { w: Math.max(72, Math.floor(w)), perRow, rows: Math.ceil(n / perRow) };
};

/** 一层的牌宽和最大宽度。层自己左右各有 8px 内边距（border-box）：算宽度时带上，不然最后一张会被挤到下一排。 */
export const tableLayerStyle = (level: DeckLevel, stage: StageBox) => {
  const { w, perRow } = tableLayout(level, stage);
  return { '--card-w': `${w}px`, maxWidth: `${perRow * w + (perRow - 1) * GAP + 24}px` };
};

/** 扇面：一行里越靠边越往下、往外歪一点；多排时不拱。 */
export const tableSlotStyle = (level: DeckLevel, i: number, stage: StageBox): Record<string, string> => {
  const { perRow, rows } = tableLayout(level, stage);
  if (rows > 1 || perRow < 3) return {};
  const mid = (perRow - 1) / 2;
  const off = (i - mid) / mid;
  const tilt = off * Math.min(5, 26 / perRow);
  const drop = off * off * Math.min(28, 6 + perRow * 3);
  return { transform: `translateY(${drop.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)` };
};
