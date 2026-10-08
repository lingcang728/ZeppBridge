/**
 * 舞台左边那一把牌怎么撒（2026-10-08 横向舞台）：像随手撒在桌上的扑克——大致按格子摆，
 * 每张错开一点、歪一点，隔一排往右让半格。确定性（按序号算抖动），换语言、重渲染不跳。
 * 用户拖过的牌由调用方记下偏移另加，这里只给「本来的位置」。
 */
export interface CloudSlot { x: number; y: number; rot: number }
export interface CloudLayout { width: number; height: number; slots: CloudSlot[] }

const wobble = (n: number) => {
  const s = Math.sin(n * 91.7 + 13.1) * 24634.6345;
  return (s - Math.floor(s)) * 2 - 1;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const CARD_RATIO = 1.32;

export const cloudLayout = (n: number, zone: { width: number; height: number }): CloudLayout => {
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = zone.width / cols;
  const cellH = zone.height / rows;
  const width = Math.round(clamp(Math.min(cellW * 0.66, (cellH * 0.84) / CARD_RATIO), 92, 152));
  const height = Math.round(width * CARD_RATIO);
  const slots = Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const shift = row % 2 ? cellW * 0.2 : 0;
    const x = col * cellW + (cellW - width) / 2 + shift + wobble(i + 1) * cellW * 0.12;
    const y = row * cellH + (cellH - height) / 2 + wobble(i + 7) * cellH * 0.12;
    return {
      x: Math.round(clamp(x, 0, zone.width - width)),
      y: Math.round(clamp(y, 0, Math.max(0, zone.height - height))),
      rot: Math.round(wobble(i + 3) * 50) / 10,
    };
  });
  return { width, height, slots };
};
