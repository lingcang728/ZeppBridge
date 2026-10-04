import { nextTick } from 'vue';
import { ensureLocalePack, locale, setLocale, type Locale } from '../../i18n';
import { dustLayer } from './ashDust';
import { CHART_INK, drawCharts, drawVisibleText, grainsOf, TEXT_INK, type AshOrigin } from './ashGlyphs';
import { localeTarget } from './localeTarget';
import { whenFramesSteady } from './steady';
import { OPEN_EASE, REVEAL_MS } from './timing';

/**
 * 换语言的「响指」（用户 2026-10-04 提的点子：像《复联 4》灭霸打响指，旧语言的字化成灰被吹走，底下露出新语言）。
 *
 * 第二版（同日录屏反馈）：从左往右扫一道风，改成**从语言轮处扩散的一圈涟漪**——和换主题的圆同一个起点方位、
 * 同一条曲线、同样的时长，「换色」「换字」是同一种动作。圆的边扫到哪里，那里的旧字和图表线条碎成灰、顺着涟漪
 * 往外吹散，圆里面已经是新语言。第一版的问题和这一版的对策：
 *   - 前沿那条光带忽隐忽现，不如不要 → 删掉；
 *   - 导航胶囊在两种语言里位置不同（中文居中；英文同步胶囊变宽、导航让到左边），被一刀刀扫开像瞬移
 *     → 换场期间导航单独成一层（material.css 的 ash-nav），从旧位置滑到新位置；
 *   - 只有字碎、图表不动，像只换了一半 → 图表画布的线条也取进灰里；
 *   - 掉帧 → 灰的画布按 CSS 像素画（不乘设备像素比，4K 屏上少画四分之三）、灰粒上限减半、没有整屏着色器；
 *     换场期间顶栏胶囊不补间宽度（新快照是活的，宽度每变一帧整张快照都要重画）；
 *   - 快速连拨时上一次被直接跳到结尾（一次硬切）→ 排队：这一圈放完，接着从语言轮再放一圈到最后拨到的那一项。
 *
 * 做法（不碰页面代码，所有页面自动生效）：
 * 1. **取字形**：换之前扫一遍可视区里看得见的文字（TreeWalker + Range 量每行 / 每个字的位置），按它们的字体、
 *    字号、颜色画到一张看不见的 2D 画布上，读出像素——灰烬就是旧文字真实的笔画，不是方块。图表画布直接 drawImage。
 * 2. **换场**：View Transitions 给新旧整页各拍一张（新的那张是活的），新快照套一个从语言轮处长大的圆形 clip-path，
 *    只动 clip-path，合成器上跑。
 * 3. **吹散**：每个像素是一粒灰，交给 WebGL 一次画完。每粒的「起飞时刻」= 圆扫到它的时刻，位置、透明度、大小全在
 *    顶点着色器里按时间算，CPU 每帧只更新一个时间。灰的画布带 view-transition-name，换场期间是独立的一层；
 *    连拨时几圈的灰画在同一张画布上，上一圈没飘完的灰不会被下一次换场冻住。
 *
 * 系统要求减少动效、内核没有 View Transitions 时直接换；没有 WebGL 时只放涟漪、不放灰。
 */

export type { AshOrigin };
type ViewTransitionHandle = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionHandle };

/* ── 换场 ──────────────────────────────── */

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 涟漪默认从顶栏的语言轮长出来；顶栏没有语言轮（窄窗口收掉了）时从右上角。 */
const defaultOrigin = (): AshOrigin => {
  const rect = document.querySelector<HTMLElement>('.locale-wheel')?.getBoundingClientRect();
  if (rect?.width) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return { x: window.innerWidth - 32, y: 32 };
};

/** 放一圈：从 origin 扩散到 value。返回时这一圈的换场已经结束（灰可能还在飘）。 */
const ripple = async (value: Locale, origin: AshOrigin) => {
  const doc = document as ViewTransitionDocument;
  // 语言包先到：换上去的第一帧就是新语言，不会先露出英文兜底、过一会儿再变（那又是一跳）。
  await Promise.race([ensureLocalePack(value), new Promise((resolve) => window.setTimeout(resolve, 600))]);
  if (value === locale.value) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const reach = Math.ceil(Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)));
  const layer = dustLayer(width, height);
  const grains = grainsOf(
    [[drawVisibleText(width, height), TEXT_INK], [drawCharts(width, height, layer?.canvas ?? null), CHART_INK]],
    width, height, origin, reach,
  );
  const batch = layer && grains ? layer.add(grains, origin) : null;

  const root = document.documentElement;
  root.dataset.ashMorph = '';
  const transition = doc.startViewTransition!(async () => {
    setLocale(value);
    if (batch) layer!.mount();
    // 顶栏换语言后要重新量档位（AppTopBar 的 refit，一串 nextTick）：等它落定再拍新快照，换场途中顶栏不再变。
    for (let i = 0; i < 6; i += 1) await nextTick();
  });
  try {
    await transition.ready;
  } catch {
    if (batch) layer!.drop(batch);
    delete root.dataset.ashMorph;
    return;
  }
  const at = `at ${Math.round(origin.x)}px ${Math.round(origin.y)}px`;
  const grow = root.animate(
    { clipPath: [`circle(2px ${at})`, `circle(${reach}px ${at})`] },
    { duration: REVEAL_MS, easing: OPEN_EASE, fill: 'both', pseudoElement: '::view-transition-new(root)' },
  );
  // 导航胶囊那一层（material.css 的 ash-nav）和圆同一刻开跑。
  const parts = [grow, ...document.getAnimations().filter((animation) =>
    ((animation.effect as KeyframeEffect | null)?.pseudoElement ?? '').includes('(ash-nav)'))];
  // 和主题扩散一样：先停在起点（画面上还是旧语言），等两张整屏快照上了 GPU、帧节奏平稳再长。
  // 起点留 2px 而不是 0：零半径时新快照整张被跳过、不上 GPU，开跑后第一帧才现传，卡 100ms。
  for (const animation of parts) animation.pause();
  await whenFramesSteady();
  for (const animation of parts) if (animation.playState === 'paused') animation.play();
  if (batch) layer!.start(batch, grow);
  await transition.finished.catch(() => undefined);
  delete root.dataset.ashMorph;
};

let busy = false;
let queued: { value: Locale; origin?: AshOrigin } | null = null;

/**
 * 换语言并放「响指」。`origin` 是被拨的那只语言轮（视口坐标），不给就用顶栏的语言轮。
 * 上一圈还没放完又拨：记下最后拨到的那一项（语言轮先停在那儿），这一圈放完再从语言轮放一圈过去。
 * 放不了（减少动效、内核不支持）就直接换。
 */
export const switchLocaleWithAsh = async (value: Locale, origin?: AshOrigin): Promise<void> => {
  if (busy) {
    queued = { value, origin };
    localeTarget.value = value;
    return;
  }
  if (value === locale.value) {
    localeTarget.value = null;
    return;
  }
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || reducedMotion()) {
    localeTarget.value = null;
    setLocale(value);
    return;
  }
  busy = true;
  localeTarget.value = value;
  try {
    await ripple(value, origin ?? defaultOrigin());
  } catch {
    if (locale.value !== value) setLocale(value);
  } finally {
    busy = false;
    const next = queued;
    queued = null;
    if (next) void switchLocaleWithAsh(next.value, next.origin);
    else localeTarget.value = null;
  }
};
