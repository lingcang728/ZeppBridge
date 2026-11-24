/**
 * 牌面读数怎么排（第三轮精修 A2）：「数字大、单位小、不折行」。
 *
 * 第二轮把「8 小时 11 分」整串当一个等宽数字排，还允许任意断行，窄牌上折成三行（截图 7、10）。
 * 现在把读数拆成数字段和单位段：数字用等宽大字，单位用正文字体小一号；整串不折行，放不下就按估出来的宽度
 * 一起缩字号（`faceFit` → CSS 的 `--fit`）。只拆不改：拆出来的段拼回去就是原文。
 */
export interface FacePart {
  /** 数字段（含小数点、千分位、时间里的冒号、负号）。 */
  n?: string;
  /** 单位或文字段。 */
  u?: string;
}

const NUMBER = /([-−]?\d[\d.,:]*)/;

/** 拆成数字段和单位段；`unit` 是牌另外给的单位（如 bpm），接在最后。空白只用来分段，不单独成段。 */
export const splitFaceValue = (text: string | null | undefined, unit?: string | null): FacePart[] => {
  const parts: FacePart[] = [];
  for (const piece of (text ?? '').split(NUMBER)) {
    if (!piece) continue;
    if (NUMBER.test(piece) && /^[-−]?\d/.test(piece)) parts.push({ n: piece });
    else {
      const word = piece.trim();
      if (word) parts.push({ u: word });
    }
  }
  const extra = unit?.trim();
  if (extra) parts.push({ u: extra });
  return parts;
};

/** 中日韩字符按一个字宽算，其余按半个。 */
const wide = (ch: string) => { const code = ch.codePointAt(0) ?? 0; return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff00 && code <= 0xffef); };

/**
 * 估一串读数排开有多宽，单位是「数字字号的 em」：等宽数字 0.6em 一个；单位字号是数字的 0.52，
 * 汉字 1em、拉丁字母约 0.56em；段与段之间留 0.14em。界面用它算缩字号的比例，不需要精确。
 */
export const faceFit = (parts: FacePart[], unitScale = 0.52): number => {
  let width = 0;
  parts.forEach((part, i) => {
    if (i > 0) width += 0.14;
    if (part.n) width += part.n.length * 0.6;
    if (part.u) for (const ch of part.u) width += (wide(ch) ? 1 : 0.56) * unitScale;
  });
  return Math.max(1, Math.round(width * 100) / 100);
};

/** 一行字（标题「9/14–9/20」之类）按同样的估法算宽度，单位是这行字号的 em。 */
export const textFit = (text: string): number => {
  let width = 0;
  for (const ch of text) width += wide(ch) ? 1 : /\d/.test(ch) ? 0.6 : 0.56;
  return Math.max(1, Math.round(width * 100) / 100);
};

/**
 * 牌面小图（发牌桌）：轨迹缩略和心率小线，画成 SVG path（`viewBox="0 0 100 100"` / `"0 0 100 30"`）。
 * 轨迹按纬度把经度压一下（cos φ），保持长宽比、居中；心率按这一次自己的高低撑满高度。点太少就不画（返回 null）。
 */
export const SKETCH_BOX = 100;
export const SPARK_BOX = { w: 100, h: 30 } as const;

const fixed = (value: number) => (Math.round(value * 10) / 10).toString();

export const routeSketch = (points: ReadonlyArray<readonly [number, number]>, pad = 6): string | null => {
  const clean = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (clean.length < 2) return null;
  const meanLat = clean.reduce((sum, [lat]) => sum + lat, 0) / clean.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xy = clean.map(([lat, lng]) => [lng * k, -lat] as const);
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return null;
  const scale = (SKETCH_BOX - pad * 2) / span;
  const offX = (SKETCH_BOX - (maxX - minX) * scale) / 2;
  const offY = (SKETCH_BOX - (maxY - minY) * scale) / 2;
  return xy.map(([x, y], i) => `${i ? 'L' : 'M'}${fixed(offX + (x - minX) * scale)} ${fixed(offY + (y - minY) * scale)}`).join(' ');
};

export const sparkPath = (values: readonly number[], pad = 2): string | null => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const range = hi - lo || 1;
  const step = SPARK_BOX.w / (clean.length - 1);
  return clean.map((value, i) => `${i ? 'L' : 'M'}${fixed(i * step)} ${fixed(SPARK_BOX.h - pad - ((value - lo) / range) * (SPARK_BOX.h - pad * 2))}`).join(' ');
};
