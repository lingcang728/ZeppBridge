/**
 * 年轮分享图（1080×1440 PNG，在本机的 canvas 上拼）：2026-10-28 重做（用户：留白太多、字体无序、没有分享的动力）。
 * 自上而下：标题 + 一行陪伴天数 → 年轮按木头实际的外形放到最大 → 三个数 → 四条高光 → 小一号的 Z 图标 + ZeppBridge。
 * 同日第二版（用户：「AI 味太浓」）：去掉渐变字、光晕、带色条的圆角卡片和分隔竖线，改成纯色字、细线分行的排版；
 * 颜色只有白、灰和木头的琥珀色，抢眼的交给木头本身。品牌那行缩小。
 * 字号只有五档（标题 64 / 数字 72 / 高光 36 / 正文 26 / 注脚 22），粗细只用 700 和 400。
 * 原始数据不离开这台电脑——截的只是像素；字是 share.ts 排好的，这里不排版数字。
 */
import type { ShareCard, ShareStory } from './share';

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1440;
export const SNAPSHOT_SIZE = 1080;

const PAD = 80;
const INK = 'rgba(255, 255, 255, .94)';
const MUTED = 'rgba(255, 255, 255, .55)';
const RULE = 'rgba(255, 255, 255, .1)';
const AMBER = '#E9A95C';
const FONT = "'MiSans', 'Microsoft YaHei', 'Segoe UI', sans-serif";

export interface ShareInput {
  /** 年轮（treeSnapshot.ts，正方形透明画布）。 */
  snapshot: HTMLCanvasElement | null;
  title: string;
  /** 标题里要染成琥珀色的那一截（年份）。 */
  highlight: string;
  subtitle: string;
  story: ShareStory;
  /** 应用图标（public/zeppbridge-icon.png）；读不到就只写字。 */
  icon: HTMLImageElement | null;
  brand: string;
}

/** 太长的字在 `max` 宽处截断加省略号。 */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
};
const font = (ctx: CanvasRenderingContext2D, size: number, weight: 400 | 700) => { ctx.font = `${weight} ${size}px ${FONT}`; };
/** 放不下先缩字号（最多缩到七成），还放不下才截断：英文、西语的句子比中文长一截。 */
const shrink = (ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight: 400 | 700): string => {
  for (let s = size; s >= Math.round(size * 0.7); s -= 2) {
    font(ctx, s, weight);
    if (ctx.measureText(text).width <= max) return text;
  }
  return fit(ctx, text, max);
};
const rule = (ctx: CanvasRenderingContext2D, y: number) => {
  ctx.fillStyle = RULE;
  ctx.fillRect(PAD, y, SHARE_WIDTH - PAD * 2, 1.5);
};

/** 年轮在快照里实际占的范围（木头外形是起伏的，不是整张正方形；淡淡的投影不算）。 */
const woodBounds = (snapshot: HTMLCanvasElement) => {
  const ctx = snapshot.getContext('2d');
  const size = snapshot.width;
  if (!ctx || !size) return null;
  const { data } = ctx.getImageData(0, 0, size, snapshot.height);
  let minX = size, minY = snapshot.height, maxX = -1, maxY = -1;
  for (let y = 0; y < snapshot.height; y += 3) {
    for (let x = 0; x < size; x += 3) {
      if (data[(y * size + x) * 4 + 3]! < 200) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

const drawRing = (ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement, top: number, bottom: number) => {
  const box = woodBounds(snapshot);
  if (!box) return;
  const scale = Math.min((SHARE_WIDTH - PAD * 2) / box.w, (bottom - top) / box.h, 1.45);
  const cx = SHARE_WIDTH / 2, cy = (top + bottom) / 2;
  ctx.drawImage(snapshot, cx - (box.x + box.w / 2) * scale, cy - (box.y + box.h / 2) * scale, snapshot.width * scale, snapshot.height * scale);
};

const drawTitle = (ctx: CanvasRenderingContext2D, title: string, highlight: string, y: number) => {
  font(ctx, 64, 700);
  const max = SHARE_WIDTH - PAD * 2;
  const at = highlight ? title.indexOf(highlight) : -1;
  if (at < 0 || ctx.measureText(title).width > max) {
    ctx.fillStyle = INK;
    ctx.fillText(shrink(ctx, title, max, 64, 700), PAD, y);
    return;
  }
  let x = PAD;
  for (const [text, accent] of [[title.slice(0, at), false], [highlight, true], [title.slice(at + highlight.length), false]] as const) {
    if (!text) continue;
    ctx.fillStyle = accent ? AMBER : INK;
    ctx.fillText(text, x, y);
    x += ctx.measureText(text).width;
  }
};

/** 三个数并排、左对齐，数字下面一行小字。 */
const drawHero = (ctx: CanvasRenderingContext2D, hero: ShareStory['hero'], top: number) => {
  if (!hero.length) return;
  const width = (SHARE_WIDTH - PAD * 2) / 3;
  hero.forEach((item, i) => {
    const x = PAD + width * i;
    ctx.fillStyle = INK;
    ctx.fillText(shrink(ctx, item.value, width - 24, 72, 700), x, top + 66);
    ctx.fillStyle = MUTED;
    ctx.fillText(shrink(ctx, item.label, width - 24, 26, 400), x, top + 106);
  });
};

/** 高光：两列，每条一句话加一行注脚，行与行之间一道细线。 */
const drawCards = (ctx: CanvasRenderingContext2D, cards: ShareCard[], top: number) => {
  const gap = 40, rowH = 112;
  const w = (SHARE_WIDTH - PAD * 2 - gap) / 2;
  cards.forEach((card, i) => {
    const row = Math.floor(i / 2);
    const x = PAD + (i % 2) * (w + gap);
    const y = top + row * rowH;
    if (i % 2 === 0) rule(ctx, y);
    ctx.fillStyle = INK;
    ctx.fillText(shrink(ctx, card.title, w, 36, 700), x, y + 54);
    if (card.note) {
      ctx.fillStyle = MUTED;
      ctx.fillText(shrink(ctx, card.note, w, 22, 400), x, y + 90);
    }
  });
};

const drawBrand = (ctx: CanvasRenderingContext2D, icon: HTMLImageElement | null, brand: string, centerY: number) => {
  const size = 64, gap = 16;
  font(ctx, 34, 700);
  const total = (icon ? size + gap : 0) + ctx.measureText(brand).width;
  let x = (SHARE_WIDTH - total) / 2;
  if (icon) {
    ctx.drawImage(icon, x, centerY - size / 2, size, size);
    x += size + gap;
  }
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.fillText(brand, x, centerY + 1);
  ctx.textBaseline = 'alphabetic';
};

export const drawShare = (canvas: HTMLCanvasElement, input: ShareInput): void => {
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawTitle(ctx, input.title, input.highlight, 140);
  ctx.fillStyle = MUTED;
  ctx.fillText(shrink(ctx, input.subtitle, SHARE_WIDTH - PAD * 2, 26, 400), PAD, 190);

  const rows = Math.ceil(input.story.cards.length / 2);
  const brandY = SHARE_HEIGHT - 76;
  const cardsTop = brandY - 72 - rows * 112;
  const heroTop = cardsTop - (input.story.hero.length ? 150 : 0);
  if (input.snapshot) drawRing(ctx, input.snapshot, 236, heroTop - 30);
  drawHero(ctx, input.story.hero, heroTop);
  drawCards(ctx, input.story.cards, cardsTop);
  drawBrand(ctx, input.icon, input.brand, brandY);
};
