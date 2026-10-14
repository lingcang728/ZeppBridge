/**
 * 舞台左边那一把牌怎么摆（2026-10-08 横向舞台；同日第二轮改成砖缝错开）。
 *
 * 像随手摆在桌上的扑克，但列与列上下错开（三列错开 0 / ⅔ / ⅓ 行，两列错开半行），牌高不超过行距的六成：
 * 这样每张牌心那一行正好落在它右边几列的牌缝里，线可以水平穿过牌缝接到每一张牌（threads.ts），不斜穿别的牌。
 * 每张只抖一点点、歪一点点（确定性，按序号算），换语言、重渲染不跳。用户拖过的牌由调用方另加偏移。
 */
export interface CloudSlot { x: number; y: number; rot: number }
export interface CloudLayout { width: number; height: number; slots: CloudSlot[] }

const wobble = (n: number) => {
  const s = Math.sin(n * 91.7 + 13.1) * 24634.6345;
  return (s - Math.floor(s)) * 2 - 1;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const CARD_RATIO = 1.26;
/** 牌高占行距的比例：留出一条牌缝给线穿过。 */
const FILL = 0.62;

export const cloudLayout = (n: number, zone: { width: number; height: number }): CloudLayout => {
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  const offsets = cols === 4 ? [0, 1 / 2, 1 / 4, 3 / 4] : cols === 3 ? [0, 2 / 3, 1 / 3] : [0, 1 / 2];
  const maxOffset = Math.max(...offsets);
  const room = zone.height / (rows - 1 + maxOffset + FILL);
  const colW = zone.width / cols;
  const width = Math.round(clamp(Math.min(colW * 0.78, (room * FILL) / CARD_RATIO), 84, 150));
  const height = Math.round(width * CARD_RATIO);
  // 牌宽被列宽卡住时竖向用不满：行距收到刚好留出牌缝，整把牌在撒牌区里上下居中。
  const pitch = Math.min(room, height / FILL);
  const top = Math.max(0, (zone.height - ((rows - 1 + maxOffset) * pitch + height)) / 2);
  const slots = Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * colW + (colW - width) / 2 + wobble(i + 1) * 4;
    const y = top + (row + offsets[col]!) * pitch + wobble(i + 7) * 3;
    return {
      x: Math.round(clamp(x, 0, zone.width - width)),
      y: Math.round(clamp(y, 0, Math.max(0, zone.height - height))),
      rot: Math.round(wobble(i + 3) * 25) / 10,
    };
  });
  return { width, height, slots };
};
