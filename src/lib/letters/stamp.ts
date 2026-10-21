/**
 * 每一版一枚邮票（批次 6「火漆印 + 邮票集邮册」）：版本号做种子，同一版永远是同一枚，不用 PNG。
 *
 * 这里只产出几何（路径、点、配色的 token 名），画法在 components/letters/PostageStamp.vue。
 * 图案四选一：年轮、山脊、水纹、星图——都取自批次 6 定下的艺术方向，线条画，不涂满。
 * 坐标系是邮票内框 0..80 × 0..96。
 */

export type StampMotif = 'rings' | 'ridge' | 'waves' | 'stars';

/** 配色只用 tokens.css 里已有的类别色；邮票是「物件」，允许比卡片多一点颜色，但仍是一枚一色。 */
export const STAMP_TONES = ['--accent', '--route-amber', '--sleep', '--heart', '--pace', '--altitude', '--calories', '--route-cyan'] as const;
export type StampTone = (typeof STAMP_TONES)[number];

export interface StampDesign {
  version: string;
  motif: StampMotif;
  tone: StampTone;
  /** 线条（SVG path d），按画的先后。 */
  paths: string[];
  /** 星图的星：x, y, 半径。 */
  dots: Array<[number, number, number]>;
  /** 邮票右下角的面值，就是 主.次 版本号。 */
  face: string;
}

/** FNV-1a：短字符串 → 32 位种子。 */
const hash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** mulberry32：确定性的 0..1。 */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const MOTIFS: StampMotif[] = ['rings', 'ridge', 'waves', 'stars'];

export function stampDesign(version: string): StampDesign {
  const rand = random(hash(`zeppbridge-stamp:${version}`));
  const motif = MOTIFS[Math.floor(rand() * MOTIFS.length)]!;
  const tone = STAMP_TONES[Math.floor(rand() * STAMP_TONES.length)]!;
  const paths: string[] = [];
  const dots: Array<[number, number, number]> = [];

  if (motif === 'rings') {
    // 年轮：圆心偏一点，每圈半径和起伏都不同。
    const cx = 40 + (rand() - 0.5) * 10;
    const cy = 50 + (rand() - 0.5) * 12;
    const count = 5 + Math.floor(rand() * 3);
    for (let ring = 1; ring <= count; ring += 1) {
      const base = ring * (30 / count);
      const wobble = 0.6 + rand() * 1.4;
      const phase = rand() * Math.PI * 2;
      const points: string[] = [];
      for (let step = 0; step <= 36; step += 1) {
        const a = (step / 36) * Math.PI * 2;
        const r = base + Math.sin(a * 3 + phase) * wobble * (ring / count);
        points.push(`${step ? 'L' : 'M'}${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r * 1.08)}`);
      }
      paths.push(`${points.join('')}Z`);
    }
  } else if (motif === 'ridge') {
    // 山脊：三道远近不同的山线，越近越高。
    for (let layer = 0; layer < 3; layer += 1) {
      const baseline = 52 + layer * 13;
      let y = baseline - rand() * 10;
      const points = [`M0 ${r1(y)}`];
      for (let x = 8; x <= 80; x += 8) {
        y = Math.min(baseline + 6, Math.max(baseline - 22 + layer * 4, y + (rand() - 0.5) * 18));
        points.push(`L${x} ${r1(y)}`);
      }
      paths.push(points.join(''));
    }
    // 太阳 / 月亮：一个小圆。
    const sx = 14 + rand() * 52;
    const sy = 18 + rand() * 12;
    paths.unshift(`M${r1(sx + 6)} ${r1(sy)}A6 6 0 1 1 ${r1(sx - 6)} ${r1(sy)}A6 6 0 1 1 ${r1(sx + 6)} ${r1(sy)}Z`);
  } else if (motif === 'waves') {
    // 水纹：上下几道正弦，振幅从上往下变大。
    const lines = 6 + Math.floor(rand() * 3);
    const freq = 1.5 + rand() * 1.5;
    for (let line = 0; line < lines; line += 1) {
      const y0 = 18 + line * (64 / lines);
      const amp = 1 + line * 0.6 + rand();
      const phase = rand() * Math.PI * 2;
      const points: string[] = [];
      for (let x = 0; x <= 80; x += 4) {
        points.push(`${x ? 'L' : 'M'}${x} ${r1(y0 + Math.sin((x / 80) * Math.PI * 2 * freq + phase) * amp)}`);
      }
      paths.push(points.join(''));
    }
  } else {
    // 星图：一串星连成一条线（一次跑步一颗星的预演），旁边散几颗。
    const chain = 5 + Math.floor(rand() * 3);
    const points: Array<[number, number]> = [];
    let x = 10 + rand() * 10;
    let y = 70 - rand() * 20;
    for (let i = 0; i < chain; i += 1) {
      points.push([x, y]);
      x = Math.min(72, x + 8 + rand() * 6);
      y = Math.min(84, Math.max(14, y - 4 - rand() * 14 + (rand() > 0.7 ? 18 : 0)));
    }
    paths.push(points.map(([px, py], i) => `${i ? 'L' : 'M'}${r1(px)} ${r1(py)}`).join(''));
    for (const [px, py] of points) dots.push([r1(px), r1(py), r1(1.4 + rand() * 1.4)]);
    for (let i = 0; i < 9; i += 1) dots.push([r1(4 + rand() * 72), r1(6 + rand() * 84), r1(0.5 + rand() * 0.6)]);
  }
  /* 票面：x.y.0 印 x.y；补丁版印全号，不然 3.0.7 和 3.0.8 两枚票面一样。 */
  const [major, minor, patch] = version.split('.');
  const face = patch && patch !== '0' ? version : `${major ?? '?'}.${minor ?? '0'}`;
  return { version, motif, tone, paths, dots, face };
}
