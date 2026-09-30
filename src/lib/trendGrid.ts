/**
 * 趋势卡网格一行放几张：让最后一行尽量是满的。
 *
 * 以前是 `auto-fill, minmax(320px, 1fr)`：宽屏上排 5 列，心率页 3 张卡就空出两格、
 * 身体页 8 张卡排成 5 + 3，最后一行缺一块。现在按卡的张数挑列数（真正排几列还要看
 * 宽度，窄了会自动少排，见 material.css 的 `.trend-grid`）。
 */
export const trendColumns = (count: number): number => {
  // 一张就占满整行；五张在常见窗口宽度下排不下五列（每张至少 280px），会落成 4 + 1，改排 3 + 2。
  if (count === 5) return 3;
  if (count <= 4) return Math.max(1, count);
  let best = 4;
  let bestEmpty = Number.POSITIVE_INFINITY;
  for (let cols = 5; cols >= 3; cols -= 1) {
    const empty = (cols - (count % cols)) % cols;
    if (empty < bestEmpty) {
      best = cols;
      bestEmpty = empty;
    }
  }
  return best;
};

export const trendGridStyle = (count: number) => ({ '--cols': String(trendColumns(count)) });
