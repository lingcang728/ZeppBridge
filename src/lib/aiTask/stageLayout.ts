/**
 * 交给 AI 横向舞台的版式（2026-10-08）：左边一片撒牌区、中间一条竖线上的门锁、右边一张牌。
 * 锁和右牌的中心在同一条水平线上，线从锁的两侧出去。窄到放不下三栏（< 760px）时竖线变横线：
 * 牌在上、锁在中、右牌在下——只在这一处退化，不做成纵向长页。纯函数，单位是舞台内像素。
 */
export interface Box { x: number; y: number; width: number; height: number }
export interface StageLayout {
  mode: 'row' | 'column';
  width: number;
  height: number;
  cloud: Box;
  lock: { x: number; y: number; r: number };
  /** 右牌本身（上方留 `TEMPLATE_H` 给垫着的那张露出上沿）。 */
  card: Box;
}

/** 右牌上方留给垫着的那张牌露出上沿的空。 */
export const TEMPLATE_H = 48;
const PAD = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const stageLayout = (width: number, height: number): StageLayout => {
  if (width >= 760) {
    const r = width >= 1100 ? 54 : 46;
    const cardW = Math.round(clamp(width * 0.27, 240, 340));
    const cardX = width - cardW - PAD;
    const cloudW = Math.round(Math.min(width * 0.46, cardX - 2 * r - 140));
    const cardTop = TEMPLATE_H;
    const cardH = Math.round(clamp(height - cardTop - PAD, 300, 460));
    const lockY = cardTop + cardH / 2;
    return {
      mode: 'row', width, height,
      cloud: { x: 0, y: PAD, width: cloudW, height: height - 2 * PAD },
      lock: { x: Math.round((cloudW + cardX) / 2), y: Math.round(lockY), r },
      card: { x: cardX, y: cardTop, width: cardW, height: cardH },
    };
  }
  const r = 44;
  const cloudH = Math.round(clamp(width * 0.95, 360, 480));
  const lockY = cloudH + 64;
  const cardW = Math.round(Math.min(width - 2 * PAD, 420));
  // 锁下面还有滚轮和就绪度两行（约 110px），再往下才是模板分段和右牌。
  const cardTop = lockY + r + 110 + TEMPLATE_H;
  const cardH = 380;
  return {
    mode: 'column', width, height: cardTop + cardH + PAD,
    cloud: { x: 0, y: PAD, width, height: cloudH },
    lock: { x: Math.round(width / 2), y: lockY, r },
    card: { x: Math.round((width - cardW) / 2), y: cardTop, width: cardW, height: cardH },
  };
};
