/**
 * 「从卡打开 / 关回卡」的时长、曲线和分段淡入淡出：设置卡叠（composables/useDeckMorph.ts）和
 * 概览 ↔ 详情页（composables/usePageMorph.ts）共用同一份，两边的手感不再各走各的。
 *
 * 2026-10-03 第二轮（用户：「太快了，傻快傻快的，参考 iOS 那种优雅一点的」）：330 / 290ms 拉到 500 / 440ms，
 * 曲线也不再那么靠前：旧曲线前 100ms 就走完一半多，再拉长时长看上去还是「一下冲到位」；现在 100ms 走四成、
 * 200ms 走八成，后半程长长地减速落定，不回弹（像 iOS）。
 * 慢一点也给预加载和第一帧留出了时间。
 */
/**
 * 全局节奏（2026-10-12 第三次：「动画速度太快了，希望能真的调慢一点」）：所有「过场」——卡 ↔ 页、弹窗、抽屉、牌的飞行、
 * 计划牌换面、步骤展开——的时长都乘这个数。悬停、按下、长按门槛、Esc 快速撤回这类即时反馈不乘；
 * 换语言的涟漪（LOCALE_REVEAL_MS）也不乘：用户要的是回到之前那几版的速率。
 * 只拉长时长、不换曲线：曲线是 10-03 用户认可过的。CSS 那边对应 tokens.css 的 --dur-std / --dur-back / --dur-slow。
 */
export const PACE = 1.3;
export const paced = (ms: number) => Math.round(ms * PACE);

export const OPEN_MS = paced(500);
export const CLOSE_MS = paced(440);
export const OPEN_EASE = 'cubic-bezier(.4, .6, .2, 1)';
export const CLOSE_EASE = 'cubic-bezier(.4, .6, .2, 1)';
/**
 * 「收回原处」（卡 ↔ 页收回、设置大卡关回小卡）专用的曲线（2026-11-12 第三轮，用户录屏：收回到最后一刻像截图一样定格一下）。
 * CLOSE_EASE 在一半时间已经走完近九成，后四成几乎不动，落地的换手全挤在那段「停住」里。这条慢一点出发、
 * 一半时间走八成、到 0.8 还在动——落地的淡入淡出（真卡先在底下亮好、窗口最后淡掉）落在仍在缩的那段上。
 */
export const BACK_EASE = 'cubic-bezier(.32, .08, .24, 1)';

/** 整屏从一个按钮处扩散开（换主题）：和卡片展开同一条曲线，整屏的圆比卡大得多，再慢一点。 */
export const REVEAL_MS = paced(640);

/** 换语言的灰烬涟漪（2026-10-06 精修：「放慢到约 1 秒、更柔」）。比换主题慢：字要碎、要飘、新字要落定。
    material.css 里 ash-nav 那一层的时长写死了同一个数，改这里要一起改。 */
export const LOCALE_REVEAL_MS = 1050;

/** 卡身跟着形状一起出来（12%–50% 淡入；形状这时已走了大半）。
    不能等形状走完才淡入：那段时间里窗口长满了却一个字没有（「空板」）。按线性时间轴放。 */
export const BODY_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
/** 关上时卡身一直在、跟着板一起被裁小，板快缩到卡那么大（线性 65%–85%，形状那时已走完九成多）才化开、只剩卡头
    （2026-11-12 修复计划 A3：以前前 35% 就淡完，后 65% 只剩一块空板在缩）。 */
export const BODY_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.65 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }];

/** 替身 ↔ 内容的交接（lib/motion/flight.ts 的 handoff）占整段时间轴的比例：很短的一次交叉，不留空档。 */
export const HANDOFF_SPAN = 0.14;
/** 卡 → 页：内容最早从这个进度开始接手（窗口太小时满屏字挤在小框里）；画好得晚就更晚，替身一直顶着。 */
export const HANDOFF_EARLIEST = 0.28;
/** 页 → 卡（收回）：内容留到这个进度才换成卡（板快缩到卡那么大）。 */
export const HANDOFF_BACK = 0.6;
/** 收一张卡 / 一页的途中又开另一张：前一段在这么长里收完（压缩，不是硬切）。 */
export const COMPRESS_MS = 90;

/**
 * 一条 cubic-bezier 曲线时间上倒过来（掉头以后另起一段接力时用：卡 ↔ 页换了文档位置，没法翻同一组动画的速率）。
 * 去的时候先快后慢，回来就先慢后快——画面上是同一条路原样倒放，而不是回程又一下冲回去、在卡边上慢慢蹭。
 */
export const turnedEase = (ease: string): string => {
  const match = ease.match(/^cubic-bezier\(([^)]+)\)$/);
  const values = match?.[1].split(',').map((part) => Number.parseFloat(part));
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) return ease;
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  const r = (value: number) => Number((1 - value).toFixed(3));
  return `cubic-bezier(${r(x2)}, ${r(y2)}, ${r(x1)}, ${r(y1)})`;
};

/** 一条 cubic-bezier 缓动在时间进度 `x`（0–1）上的位置进度（纯函数，方便测）。不是 cubic-bezier 的字符串按线性算。 */
export const easeAt = (ease: string, x: number): number => {
  const values = ease.match(/^cubic-bezier\(([^)]+)\)$/)?.[1].split(',').map((part) => Number.parseFloat(part));
  const t0 = Math.min(1, Math.max(0, x));
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) return t0;
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  const at = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < t0) lo = mid; else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
};

/** easeAt 的反函数：位置进度 `y` 在这条曲线上对应的时间进度（单调的缓动才有意义）。 */
export const timeAt = (ease: string, y: number): number => {
  const target = Math.min(1, Math.max(0, y));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (easeAt(ease, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

/** 来处那一层退到后面：绕顶边中点缩小、变淡（设置卡叠的 `.deck-overview.is-receded` 同一组值）。 */
export const RECEDE_SCALE = 0.94;
export const RECEDE_OPACITY = 0.32;
