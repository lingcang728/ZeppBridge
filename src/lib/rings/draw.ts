/**
 * 年轮分享图：年轮（treeSnapshot.ts，1080×1080）+ 下面几行字，在本机的 canvas 上拼成 1080×1440 的 PNG。
 * 原始数据不离开这台电脑——截的只是像素；字是界面已经排好的（标题、事实），这里不排版数字。
 */
export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1440;
export const SNAPSHOT_SIZE = 1080;

const INK = 'rgba(255, 255, 255, .95)';
const MUTED = 'rgba(255, 255, 255, .55)';
const ACCENT = 'rgba(227, 164, 82, .95)';
const FONT = "'MiSans', 'Microsoft YaHei', 'Segoe UI', sans-serif";

export interface ShareInput {
  /** 舞台截下的一帧（正方形）。 */
  snapshot: HTMLCanvasElement | null;
  title: string;
  subtitle: string;
  facts: { label: string; value: string }[];
  footer: string;
}

/** 太长的字在 `max` 宽处截断加省略号。 */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
};

export const drawShare = (canvas: HTMLCanvasElement, input: ShareInput): void => {
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#15181d';
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  if (input.snapshot) ctx.drawImage(input.snapshot, 0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);

  // 上沿压一层暗，标题读得清；下沿和文字区接上。
  const top = ctx.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, 'rgba(21, 24, 29, .85)');
  top.addColorStop(1, 'rgba(21, 24, 29, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, SHARE_WIDTH, 260);
  const bottom = ctx.createLinearGradient(0, SNAPSHOT_SIZE - 200, 0, SNAPSHOT_SIZE);
  bottom.addColorStop(0, 'rgba(21, 24, 29, 0)');
  bottom.addColorStop(1, 'rgba(21, 24, 29, 1)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, SNAPSHOT_SIZE - 200, SHARE_WIDTH, 200);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = INK;
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText(fit(ctx, input.title, SHARE_WIDTH - 160), 80, 130);
  ctx.fillStyle = MUTED;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(fit(ctx, input.subtitle, SHARE_WIDTH - 160), 80, 180);
  ctx.shadowBlur = 0;

  // 事实：两列，最多三行。
  const colWidth = (SHARE_WIDTH - 160 - 60) / 2;
  input.facts.slice(0, 6).forEach((fact, i) => {
    const x = 80 + (i % 2) * (colWidth + 60);
    const y = SNAPSHOT_SIZE + 30 + Math.floor(i / 2) * 96;
    ctx.fillStyle = MUTED;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(fit(ctx, fact.label, colWidth), x, y);
    ctx.fillStyle = i === 0 ? ACCENT : INK;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(fit(ctx, fact.value, colWidth), x, y + 44);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, .35)';
  ctx.font = `20px ${FONT}`;
  ctx.fillText(fit(ctx, input.footer, SHARE_WIDTH - 160), SHARE_WIDTH / 2, SHARE_HEIGHT - 36);
};
