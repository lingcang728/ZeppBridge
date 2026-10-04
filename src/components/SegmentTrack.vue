<script setup lang="ts" generic="T extends string | number">
/* 胶囊选择器（两到五项）/ 胶囊导航。
 *
 * 整个应用「从几项里挑一个」只有这一种样子：凹槽里托着一块凸起的胶囊，
 * 选中字用品牌色；更长的列表（语言、AI 服务商）用 CapsuleWheel，同一套底和胶囊。
 *
 * 标签画两层：底层是普通字，上层是「选中字」，按滑块的形状裁切；底层在滑块下面
 * 那一段被挖空。滑块位置是两个注册过的 CSS 长度（--thumb-l / --thumb-w，见
 * material.css），过渡只写在轨道上：滑块、上层裁切、下层挖空读同一对值，逐帧
 * 同步。以前玻璃导航的滑块是半透明的，底下的常规体和上面的粗体（拉丁字母粗体更宽）
 * 叠在一起，切成德语时每个标签都出重影。
 *
 * 位置用 offsetLeft / offsetWidth 量（布局像素，不受原生缩放影响），每个按钮尺寸
 * 变化、字体加载完成、换语言时都重新量。
 *
 * 拖动时（以及松手后吸附的那一下）不按裁切给字分色：裁切边会穿过字形，「旅」一半灰
 * 一半绿，滑块放大后绿字还会跑出胶囊。这段时间离滑块最近的那一枚标签整枚用品牌色（上层
 * 那一枚不裁切、底层那一枚隐去），滑过两枚中点时两枚交叉淡入淡出。松手时字已经是绿的，
 * 停稳后换回裁切画法也看不出变化——以前拖动中字是白的、停稳 300ms 后才淡成绿色，
 * 松手那一下就像闪了一次。只动透明度，不加任何滤镜。
 *
 * 选中字是粗体、普通字是常规体：按钮宽度按粗体预留（隐形的粗体副本撑宽），不然选中
 * 那一项的粗体比按钮宽，两头被裁掉（葡语「Zonas de reserva de frequência cardíaca」）。
 *
 * 放不下就折行（is-wrapped）：以前项被压窄、字互相叠在一起（葡语的生活事件分类、补拉
 * 起点）。折行后滑块按行定位（--thumb-t / --thumb-h），只能点、不能横拖。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { fontsReady } from '../lib/fontsReady';
import Icon, { type IconName } from './Icon.vue';
import { dragThumb, FLICK_VELOCITY, snapStop, type SegmentStop } from '../lib/navigation';
import { flickDeform, liftRect, rubberStretch, squash, stretchLimit } from '../lib/segmentGlass';
import { useGlassLens } from '../composables/useGlassLens';
import { exemptFromSettle } from '../lib/motion/interrupt';

export type SegmentItem<T extends string | number> = { value: T; label: string; icon?: IconName };

const props = withDefaults(defineProps<{
  items: SegmentItem<T>[];
  modelValue: T;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  /** 按钮等宽铺满整条轨道；默认按内容收紧。 */
  fill?: boolean;
  /** 只画图标（主题的月亮 / 太阳），标签进 aria 和 title。 */
  iconOnly?: boolean;
  /** `inset` 表单里的凹槽底；`glass` 浮在内容上的导航；`bare` 放进已经是玻璃的按钮组里。 */
  variant?: 'inset' | 'glass' | 'bare';
}>(), {
  disabled: false,
  compact: false,
  fill: false,
  iconOnly: false,
  variant: 'inset',
});

const emit = defineEmits<{
  'update:modelValue': [value: T];
  /** 点了（或 Enter / 空格）已经选中的那一项。分段控件本身不理它；当导航用时（顶栏）靠它回到入口首页。 */
  reselect: [value: T];
}>();

const track = ref<HTMLElement | null>(null);
const stops = ref([]) as Ref<SegmentStop<T>[]>;
const thumb = ref({ left: 0, width: 0, top: 0, height: 0, visible: false });
/** 一行放不下，折成多行。 */
const wrapped = ref(false);
const dragging = ref(false);
/** 滑块飞向新位置的那一段（松手、点击、键盘、外面换了值）：和拖动一样不按裁切分色，免得途中出现半个字。 */
const settling = ref(false);
/** 拖动 / 飞行中离滑块最近（或要去）的那一项：它的字整枚上品牌色。 */
const lensValue = ref<T | null>(null) as Ref<T | null>;
/* 换字的淡入淡出只在拖动已经开始以后才打开：进入拖动那一帧画法从「按滑块裁切」换成
   「整枚上色」，两种画法在那一帧看上去完全一样，必须瞬间换；要是这时也走 140ms 的淡出，
   裁切先撤掉、其余几枚绿字还没淡完，所有标签就会一起闪绿一下（「一拖字就闪」）。 */
const lensFade = ref(false);
let fadeFrame = 0;

type Gesture = {
  id: number;
  x: number;
  center: number;
  startValue: T;
  lastX: number;
  time: number;
  velocity: number;
};
let gesture: Gesture | null = null;
let frame = 0;
let nextThumb: { left: number; width: number } | null = null;
let suppressClick = false;
let observer: ResizeObserver | null = null;

/* —— 玻璃（lib/glassLens.ts，照 iOS 26 的标签栏；第五版，2026-10-01）——
   停着时选中项是一块平胶囊（.segment-plate：底色 + 一道很淡的顶边高光，尺寸就是滑块本身，端头是正圆）。
   按住 / 拖动 / 飞过去时它「浮起来」：平胶囊一边放大一边淡出，同一时刻玻璃边（.segment-rim-shape）从平胶囊
   的大小长到透镜的大小、淡入，里面换成会放大边缘的透镜（.segment-lens）；落下时原路缩回。两层在同一段时间、
   同一条曲线上缩放，看上去就是同一块玻璃浮起来又落下。
   以前玻璃边按浮起来的尺寸画、停着时非等比缩回滑块大小：端头被压成椭圆（「圆角做得很差」），还带一圈黑描边
   和斜对角高光（「像个餐盒」）——第五版停着时不再缩放任何东西。
   以前位置写在 transform: translate() 上、飞行又叠一个 scale：scale 会把 translate 的位移一起放大，
   玻璃从左边飞出胶囊再弹回来（「偷偷消失又突然弹出来」）。现在位置写在 left / top 上，动画只动 translate / scale。
   透镜的尺寸跟着滑块走（lib/segmentGlass.ts）：拖到哪一项就是哪一项的大小，字一直在正中。
   动画全是 Web Animations，只动 translate / scale / opacity，全在合成器上；状态复位等动画的 finished，
   不用定时器。这些动画都登记成不被 settleMotion 快进：切页时路由钩子会把所有 ≥300ms 的动画压进 90ms，
   滑块就「飞两帧、嗖地弹到终点」。
   毛玻璃底画在轨道里的一层（.segment-glass）而不是轨道本身：轨道自己带 backdrop-filter 的话，
   透镜只看得见轨道里的字，看不见胶囊外面的页面。 */
const lensEl = ref<HTMLElement | null>(null);
const glassEl = ref<HTMLElement | null>(null);
/** 滑块的位置层（飞行动画动它）和里面的平胶囊（浮起 / 落下动它）：两件事分在两层上，互不覆盖。 */
const thumbEl = ref<HTMLElement | null>(null);
const plateEl = ref<HTMLElement | null>(null);
/** 玻璃边同理：外层跟着透镜飞，里面的形状层浮起 / 落下。 */
const rimEl = ref<HTMLElement | null>(null);
const rimShape = ref<HTMLElement | null>(null);
const thumbLens = useGlassLens(lensEl, 'thumb');
const rimLens = useGlassLens(glassEl, 'rim', props.variant === 'glass');
/** 按住已选中的那一项（还没拖）：透镜先浮起来，和 iOS 一样手指一按就变成玻璃。 */
const pressed = ref(false);
/** 飞向新位置时浮着飞（用户自己点 / 拖 / 按键时；外面换了值只是平移过去）。 */
const flyLift = ref(false);
const trackSize = ref({ w: 0, h: 0 });
/** 轨道内边距（--seg-pad）：一行的高度 = 滑块高 + 上下内边距。 */
const trackPad = ref(3);
/** 拖过两端时整条胶囊被拉长多少像素（带方向，左负右正）。 */
const stretch = ref(0);
/** 飞行时长：松手后滑块落位、点击后滑过去。新值在起飞时就交出去（不再等落位），动画在合成器上跑，切页挂载卡不住它。 */
const FLY_MS = 360;
const FLY_EASE = 'cubic-bezier(.3, 1.22, .4, 1)';
/** 每次起飞加一：上一次飞行的收尾（动画 finished 以后复位状态）发现自己过期了就不做。 */
let flyToken = 0;
let colorTimer = 0;
/** 浮起（带一点回弹）/ 落下（不回弹）。 */
const LIFT_MS = 380;
const DROP_MS = 260;
const LIFT_EASE = 'cubic-bezier(.3, 1.45, .45, 1)';
const DROP_EASE = 'cubic-bezier(.25, .8, .3, 1)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buttons = () => Array.from(track.value?.querySelectorAll<HTMLElement>('.segment-item') ?? []);
const readStops = (): SegmentStop<T>[] => buttons().map((el, index) => ({
  left: el.offsetLeft,
  width: el.offsetWidth,
  top: el.offsetTop,
  height: el.offsetHeight,
  value: props.items[index]!.value,
}));

const placeOn = (value: T) => {
  const stop = stops.value.find((item) => item.value === value);
  thumb.value = stop
    ? { left: stop.left, width: stop.width, top: stop.top ?? 0, height: stop.height ?? 0, visible: true }
    : { ...thumb.value, visible: false };
};
/** 滑块现在是不是正停在这一项上。 */
const restsOn = (value: T) => {
  const stop = stops.value.find((item) => item.value === value);
  return !!stop && stop.left === thumb.value.left && stop.top === thumb.value.top && thumb.value.visible;
};

/* 一行时轨道内容比轨道宽就折；折了以后各项原宽之和放得下了再合回一行。项本身不收缩，
   所以两种状态下量出来的是同一个数，不会来回翻。铺满型（fill）和浮动导航 / 按钮组不折。 */
const checkWrap = () => {
  const el = track.value;
  if (!el || props.fill || props.variant !== 'inset') return;
  // 按各项原宽之和算，不看 scrollWidth：浮起来的透镜会伸出轨道，把 scrollWidth 撑大。
  const pad = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0;
  const natural = buttons().reduce((sum, button) => sum + button.offsetWidth, 0) + pad * 2;
  if (!wrapped.value) {
    if (natural > el.clientWidth + 1) wrapped.value = true;
    return;
  }
  if (natural <= el.clientWidth) wrapped.value = false;
};

const measure = () => {
  if (!track.value) return;
  trackSize.value = { w: track.value.offsetWidth, h: track.value.offsetHeight };
  trackPad.value = Number.parseFloat(getComputedStyle(track.value).paddingTop) || 0;
  checkWrap();
  stops.value = readStops();
  if (!gesture && !settling.value) placeOn(props.modelValue);
};

const observeItems = () => {
  if (!observer || !track.value) return;
  observer.disconnect();
  observer.observe(track.value);
  for (const el of buttons()) observer.observe(el);
};

/** 浮起来的透镜（和玻璃边）：跟着滑块走，见 lib/segmentGlass.ts。 */
const lensRect = computed(() => liftRect(thumb.value, trackSize.value.w, trackPad.value));

const trackStyle = computed(() => {
  const lens = lensRect.value;
  const style: Record<string, string | number> = {
    '--thumb-l': `${thumb.value.left}px`,
    '--thumb-w': `${thumb.value.visible ? thumb.value.width : 0}px`,
    '--thumb-t': `${thumb.value.top}px`,
    '--thumb-h': `${thumb.value.height}px`,
    '--thumb-vis': thumb.value.visible ? 1 : 0,
    '--lens-x': `${lens.x.toFixed(2)}px`,
    '--lens-y': `${lens.y.toFixed(2)}px`,
    '--lens-w': `${lens.w}px`,
    '--lens-h': `${lens.h}px`,
  };
  // 拖过两端：整条胶囊朝手指那边被拉长（钉住另一端），玻璃在里面跟着一起被拉，不会出界。
  if (stretch.value) {
    style.scale = squash(1 + Math.abs(stretch.value) / Math.max(1, trackSize.value.w));
    style.transformOrigin = stretch.value < 0 ? 'right center' : 'left center';
  }
  return style;
});
/** 透镜浮起来的时候：按住、拖动、浮着飞过去。 */
const lifted = computed(() => thumbLens.active.value && (pressed.value || dragging.value || flyLift.value));
/** 折行时不在滑块那一行的项：不挖空（挖空只按横坐标算，会误伤别的行）。 */
const offRow = (index: number) => wrapped.value && (stops.value[index]?.top ?? 0) !== thumb.value.top;
const itemLeft = (index: number) => ({ '--item-l': `${stops.value[index]?.left ?? 0}px` });

const focusActive = () => {
  if (!track.value?.contains(document.activeElement)) return;
  const index = props.items.findIndex((item) => item.value === props.modelValue);
  buttons()[index]?.focus({ preventScroll: true });
};

const commit = (value: T) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
};

/** 指针移动的屏幕像素换算成布局像素（原生缩放下两者不同）。 */
const layoutScale = () => {
  if (!track.value || !track.value.offsetWidth) return 1;
  // 拖过两端时轨道自己被拉长了（stretch）：去掉这一截，不然越拉手指和滑块越对不上。
  const pulled = 1 + Math.abs(stretch.value) / track.value.offsetWidth;
  return track.value.getBoundingClientRect().width / track.value.offsetWidth / pulled || 1;
};

/* —— 飞过去（FLIP）——
   先记下滑块、玻璃边、透镜此刻在屏幕上的位置（包括正在飞的半路），把它们直接摆到终点，再用 Web Animations
   从「起点相对终点的偏移」动回 0。动的只有 translate / scale，全在合成器上：切页挂载占着主线程时照样顺滑。
   三样东西的位置都写在 left / top 上（不是 transform），所以这里叠上去的 scale 只缩放它自己，不会把位置一起
   放大（以前位置在 transform 里，scale 一叠，玻璃就从胶囊左边飞出去）。
   透镜只平移、绝不缩放（缩放会把透过它的东西重采样得发糊）：它一起飞就是终点那一项的大小。 */
const flying: Animation[] = [];
/**
 * `fromColor`：起飞时整枚上色的是哪一项（拖着松手时是拖到的那一项；点击时是原来选中的那一项）。
 * 点击切换时目标的字色不在起飞那一刻就换，而是滑块飞到三成时交叉淡入——色先到、形后到，看上去就是「跳」。
 */
const fly = async (value: T, lift: boolean, fromColor: T | null = null) => {
  const token = (flyToken += 1);
  const movers = [thumbEl.value, rimEl.value, lensEl.value];
  const before = movers.map((el) => el?.getBoundingClientRect() ?? null);
  const wasVisible = thumb.value.visible;
  if (lift && thumbLens.active.value) flyLift.value = true;
  placeOn(value);
  settling.value = true;
  window.clearTimeout(colorTimer);
  const startColor = fromColor ?? props.modelValue;
  const quiet = !wasVisible || reducedMotion();
  if (quiet || startColor === value) {
    lensValue.value = value;
  } else {
    // 先按原来那一项上色（和停着时的画法一样，这一帧看不出变化），打开淡入淡出，飞到三成时换到目标。
    lensValue.value = startColor;
    lensFade.value = false;
    cancelAnimationFrame(fadeFrame);
    fadeFrame = requestAnimationFrame(() => { fadeFrame = requestAnimationFrame(() => { lensFade.value = true; }); });
    colorTimer = window.setTimeout(() => { if (token === flyToken) lensValue.value = value; }, FLY_MS * 0.3);
  }
  const land = () => {
    if (token !== flyToken) return;
    settling.value = false;
    flyLift.value = false;
    lensFade.value = false;
    lensValue.value = null;
  };
  await nextTick();
  if (quiet) {
    land();
    return;
  }
  for (const animation of flying.splice(0)) animation.cancel();
  const scale = layoutScale();
  movers.forEach((el, index) => {
    const from = before[index];
    const to = el?.getBoundingClientRect();
    if (!el || !from || !from.width || !to || !to.width) return;
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / scale;
    const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / scale;
    const keyframes: Keyframe[] = el === lensEl.value
      ? [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }]
      : [{ translate: `${dx}px ${dy}px`, scale: `${from.width / to.width} ${from.height / to.height}` }, { translate: '0px 0px', scale: '1 1' }];
    flying.push(exemptFromSettle(el.animate(keyframes, { duration: FLY_MS, easing: FLY_EASE })));
  });
  // 收尾跟着动画走（被新的一次起飞或拖动接住时，token 已经变了，不做）。
  if (flying.length) void Promise.all(flying.map((animation) => animation.finished)).then(land, () => undefined);
  else land();
  // 等动画真正交到合成器（画出一帧）以后再让调用方交出新值：交值会切页，新页挂载占住主线程的那一两百毫秒里，
  // 还没交到合成器的动画就停在起点、等主线程空了再一下跳到快结束的位置（降速 4× 逐帧录屏看到的）。
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};

/* —— 浮起 / 落下 ——
   两头的样子写在样式表里（.is-lifted 与否）；切换时平胶囊和玻璃边在同一段时间里互相「变成」对方：
   浮起时平胶囊放大到透镜的大小并淡出，玻璃边从平胶囊的大小长到 1 并淡入；落下反过来。两层都是正圆端头，
   只有这几百毫秒里被非等比缩放，停着的时候谁都不缩放。
   半路换向（刚按下就松手；点别的项时浮起要 380ms、飞行 360ms 就落地了）：先读下三层此刻的样子
   （计算样式里带着正在放的动画），撤掉旧动画，按新方向的时长和曲线从这个样子接着放。
   以前是把旧动画 reverse()：已经放完的淡入淡出被倒放时，Chromium 要到下一帧才真正掉头，那一帧它们都不生效，
   画面上只剩样式表里落下以后的样子——透镜和玻璃边一下没了、平胶囊按浮起的大小整块亮出来，下一帧又变回透镜；
   倒放的浮起曲线还会先往外再鼓一下、最后一截猛地缩回（2026-10-02 录屏「点到最右边，玻璃合并以后闪一下」。
   拖动不闪：松手时浮起早放完了，走的是重新起一段的路）。 */
const morphing: Animation[] = [];
type LayerPose = { scale: string; translate: string; opacity: string };
const poseOf = (el: HTMLElement): LayerPose => {
  const style = getComputedStyle(el);
  return {
    scale: style.scale === 'none' ? '1 1' : style.scale,
    translate: style.translate === 'none' ? '0px 0px' : style.translate,
    opacity: style.opacity,
  };
};
watch(lifted, async (up) => {
  // flush: 'pre'：这时类名还没换，读到的就是画面上此刻的样子。
  const midway = morphing.some((animation) => animation.playState === 'running');
  const poses = new Map<HTMLElement, LayerPose>();
  if (midway) {
    for (const el of [plateEl.value, rimShape.value, lensEl.value]) if (el) poses.set(el, poseOf(el));
  }
  for (const animation of morphing.splice(0)) animation.cancel();
  if (reducedMotion()) return;
  await nextTick();
  const plate = plateEl.value;
  const rim = rimShape.value;
  const lens = lensEl.value;
  const box = thumb.value;
  const glass = lensRect.value;
  if (!plate || !rim || !lens || !box.width || !glass.w || lifted.value !== up) return;
  const sx = box.width / glass.w;
  const sy = box.height / glass.h;
  const dx = box.left + box.width / 2 - (glass.x + glass.w / 2);
  const dy = box.top + box.height / 2 - (glass.y + glass.h / 2);
  const rest = { scale: `${sx} ${sy}`, translate: `${dx}px ${dy}px` };
  const grown = { scale: `${1 / sx} ${1 / sy}`, translate: `${-dx}px ${-dy}px` };
  const flat = { scale: '1 1', translate: '0px 0px' };
  const timing: KeyframeAnimationOptions = { duration: up ? LIFT_MS : DROP_MS, easing: up ? LIFT_EASE : DROP_EASE };
  const fade = (duration: number, delay: number): KeyframeAnimationOptions => ({ duration, delay, easing: 'ease', fill: 'backwards' });
  const parts: Array<[HTMLElement, Keyframe[], KeyframeAnimationOptions]> = up
    ? [
      [rim, [rest, flat], timing],
      [plate, [flat, grown], timing],
      [rim, [{ opacity: 0 }, { opacity: 1 }], fade(120, 0)],
      [plate, [{ opacity: 1 }, { opacity: 0 }], fade(200, 60)],
      [lens, [{ opacity: 0 }, { opacity: 1 }], fade(180, 60)],
    ]
    : [
      [rim, [flat, rest], timing],
      [plate, [grown, flat], timing],
      [lens, [{ opacity: 1 }, { opacity: 0 }], fade(140, 0)],
      [plate, [{ opacity: 0 }, { opacity: 1 }], fade(180, 40)],
      [rim, [{ opacity: 1 }, { opacity: 0 }], fade(120, Math.max(0, DROP_MS - 120))],
    ];
  // 半路换向：每段的起点换成那一层此刻的样子（只换这一段动的那几项）。
  const from = (el: HTMLElement, frame: Keyframe): Keyframe => {
    const pose = poses.get(el);
    return pose ? Object.fromEntries(Object.keys(frame).map((key) => [key, pose[key as keyof LayerPose]])) : frame;
  };
  for (const [el, [first, ...after], options] of parts) {
    morphing.push(exemptFromSettle(el.animate([from(el, first!), ...after], options)));
  }
}, { flush: 'pre' });

/* —— 橡皮筋与形变 ——
   拖过两端时整条胶囊被拉长（stretch，逐帧写在轨道的 scale 上）；松手、或者大力一甩，用一段 Web Animations
   弹回原样：朝运动方向多冲一点、再往回收一点、停住。钉住的是运动方向的另一端，所以胶囊是朝手指那边变形。 */
let elastic: Animation | null = null;
const springBack = (from: number, flick: number) => {
  const el = track.value;
  const width = trackSize.value.w;
  const dir = from ? Math.sign(from) : Math.sign(flick);
  if (!el || !width || !dir || reducedMotion()) return;
  const start = 1 + Math.abs(from) / width;
  const peak = Math.max(start, 1 + Math.abs(flick));
  const origin = dir < 0 ? 'right center' : 'left center';
  const frames: Keyframe[] = [{ scale: squash(start), transformOrigin: origin, easing: 'cubic-bezier(.3, .7, .4, 1)' }];
  if (peak > start + 0.001) frames.push({ scale: squash(peak), transformOrigin: origin, offset: 0.26, easing: 'cubic-bezier(.4, 0, .4, 1)' });
  frames.push(
    { scale: squash(1 - (peak - 1) * 0.3), transformOrigin: origin, offset: 0.62, easing: 'cubic-bezier(.4, 0, .4, 1)' },
    { scale: '1 1', transformOrigin: origin },
  );
  elastic?.cancel();
  elastic = exemptFromSettle(el.animate(frames, { duration: peak > start + 0.001 ? 560 : 460 }));
};

const clearGesture = () => {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  pressed.value = false;
  lensValue.value = null;
  stretch.value = 0;
  cancelAnimationFrame(fadeFrame);
  cancelAnimationFrame(frame);
  frame = 0;
  nextThumb = null;
  if (current && track.value?.hasPointerCapture(current.id)) track.value.releasePointerCapture(current.id);
};

const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !track.value || wrapped.value) return;
  measure();
  elastic?.cancel();
  elastic = null;
  const button = (event.target as Element).closest<HTMLElement>('.segment-item');
  const index = button ? buttons().indexOf(button) : -1;
  const startValue = index >= 0 ? props.items[index]!.value : props.modelValue;
  const active = stops.value.find((stop) => stop.value === props.modelValue) ?? stops.value[0];
  if (!active) return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    center: active.left + active.width / 2,
    startValue,
    lastX: event.clientX,
    time: event.timeStamp,
    velocity: 0,
  };
  track.value.setPointerCapture(event.pointerId);
  // 按在已选中的那一项上：透镜马上浮起来（按在别的项上是点击，飞过去时再浮）。
  if (startValue === props.modelValue) pressed.value = true;
};

/** 手指拖到的中心（布局像素）越过第一项 / 最后一项中心多远（带方向）。 */
const overshoot = (center: number) => {
  const first = stops.value[0];
  const last = stops.value[stops.value.length - 1];
  if (!first || !last) return 0;
  const lo = first.left + first.width / 2;
  const hi = last.left + last.width / 2;
  return center < lo ? center - lo : center > hi ? center - hi : 0;
};

const onMove = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const scale = layoutScale();
  const dx = (event.clientX - current.x) / scale;
  if (!dragging.value && Math.abs(dx) < 5) return;
  if (!dragging.value) {
    // 正在飞的那一段被手指接住：停在此刻的位置上接着拖。
    for (const animation of flying.splice(0)) animation.cancel();
    flyToken += 1;
    window.clearTimeout(colorTimer);
    settling.value = false;
    flyLift.value = false;
    lensValue.value = props.modelValue;
    lensFade.value = false;
    // 两帧以后（新画法已经画出来）才打开换字的淡入淡出。
    fadeFrame = requestAnimationFrame(() => { fadeFrame = requestAnimationFrame(() => { lensFade.value = true; }); });
  }
  dragging.value = true;
  suppressClick = true;
  // 一阶低通：原始差分在高回报率鼠标下每个事件都在跳，滑块宽度（按速度拉长）跟着一帧一抖。
  const instant = (event.clientX - current.lastX) / scale / Math.max(1, event.timeStamp - current.time);
  current.velocity += (instant - current.velocity) * 0.35;
  current.lastX = event.clientX;
  current.time = event.timeStamp;
  const center = current.center + dx;
  nextThumb = dragThumb(stops.value, center, current.velocity);
  const pull = rubberStretch(overshoot(center), stretchLimit(trackSize.value.w));
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!nextThumb) return;
      thumb.value = { ...thumb.value, ...nextThumb, visible: true };
      stretch.value = gesture ? pull : 0;
      lensValue.value = snapStop(stops.value, nextThumb.left + nextThumb.width / 2, 0).value;
    });
  }
  event.preventDefault();
};

const onUp = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const pulled = stretch.value;
  if (event.type !== 'pointerup') {
    // 拖到一半指针被系统收走（pointercancel / 捕获丢失）：已经拖动过就按此刻滑块所在的那一项落定，
    // 没拖动就原样放回。「禁止点击」的标记也要复位——以前它一直留着，之后点胶囊毫无反应，
    // 这就是「快速切换会卡住」。
    const landing = dragging.value ? snapStop(stops.value, thumb.value.left + thumb.value.width / 2, 0).value : null;
    clearGesture();
    springBack(pulled, 0);
    window.setTimeout(() => { suppressClick = false; }, 0);
    if (landing !== null) {
      void fly(landing, false);
      commit(landing);
    } else {
      placeOn(props.modelValue);
    }
    return;
  }
  const moved = dragging.value;
  const center = current.center + (event.clientX - current.x) / layoutScale();
  const velocity = event.timeStamp - current.time < 90 ? current.velocity : 0;
  const next = moved ? snapStop(stops.value, center, velocity).value : current.startValue;
  const keepFade = lensFade.value;
  const colored = lensValue.value;
  const willFly = moved || next !== props.modelValue;
  // 要飞就先把「浮着」交给飞行再撤掉拖动状态：中间哪怕一瞬间不算浮着，玻璃就会先落下再浮起。
  if (willFly && thumbLens.active.value) flyLift.value = true;
  clearGesture();
  // 拉过两端就弹回去；大力一甩，整条胶囊朝甩的方向形变再回弹。
  springBack(pulled, moved && Math.abs(velocity) >= FLICK_VELOCITY ? flickDeform(velocity) : 0);
  lensFade.value = moved && keepFade;
  // 指针的点击在这里就处理完了，紧跟着的 click 事件不再处理一遍（click 只留给键盘的 Enter / 空格）。
  suppressClick = true;
  window.setTimeout(() => { suppressClick = false; }, 0);
  if (!willFly) {
    emit('reselect', next);
    return;
  }
  // 松手就交出新值：飞行动画在合成器上，切页卡不住它，不用再等它落位。
  void fly(next, true, colored).then(() => commit(next));
};

/** 键盘的 Enter / 空格（指针点击在 onUp 里处理）。 */
const onClick = (value: T) => {
  if (props.disabled || suppressClick) return;
  if (value === props.modelValue) {
    emit('reselect', value);
    return;
  }
  void fly(value, true).then(() => commit(value));
};

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled || !props.items.length) return;
  const index = Math.max(0, props.items.findIndex((item) => item.value === props.modelValue));
  const last = props.items.length - 1;
  const target = {
    ArrowRight: Math.min(last, index + 1),
    ArrowDown: Math.min(last, index + 1),
    ArrowLeft: Math.max(0, index - 1),
    ArrowUp: Math.max(0, index - 1),
    Home: 0,
    End: last,
  }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  const value = props.items[target]!.value;
  if (value === props.modelValue) return;
  void fly(value, true).then(() => commit(value));
};

watch(() => props.modelValue, async (value) => {
  await nextTick();
  // 用户自己点 / 拖过去的，滑块已经在那儿了；外面换了值（比如换了路由）才平移过去。
  if (!gesture && !restsOn(value)) void fly(value, false);
  focusActive();
});
watch(wrapped, async () => {
  await nextTick();
  stops.value = readStops();
  if (!gesture) placeOn(props.modelValue);
});
watch(() => props.items.map((item) => `${item.value}\u0000${item.label}`).join('\u0001'), async () => {
  await nextTick();
  observeItems();
  measure();
});

onMounted(() => {
  void nextTick(() => {
    measure();
    observer = new ResizeObserver(() => measure());
    observeItems();
  });
  void fontsReady().then(() => measure());
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => {
  clearGesture();
  flyToken += 1;
  window.clearTimeout(colorTimer);
  for (const animation of [...flying.splice(0), ...morphing.splice(0)]) animation.cancel();
  elastic?.cancel();
  cancelAnimationFrame(fadeFrame);
  observer?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    ref="track"
    :class="['segment-track', `is-${variant}`, {
      'is-dragging': dragging, 'is-settling': settling, 'is-lens-fade': lensFade, 'is-compact': compact, 'is-disabled': disabled, 'is-fill': fill,
      'is-wrapped': wrapped,
      'is-icon-only': iconOnly,
      'has-lens': thumbLens.active.value,
      'is-lifted': lifted,
    }]"
    :style="trackStyle"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @lostpointercapture="onUp"
    @keydown="onKeydown"
  >
    <span v-if="variant === 'glass'" ref="glassEl" class="segment-glass" aria-hidden="true" :style="rimLens.style('var(--glass-blur)')" />
    <span ref="thumbEl" class="segment-thumb" aria-hidden="true"><span ref="plateEl" class="segment-plate" /></span>
    <button
      v-for="(item, index) in items"
      :key="String(item.value)"
      type="button"
      role="radio"
      :class="['segment-item', { 'is-lensed': lensValue !== null && item.value === lensValue, 'is-offrow': offRow(index) }]"
      :style="itemLeft(index)"
      :aria-checked="item.value === modelValue"
      :aria-label="iconOnly ? item.label : undefined"
      :title="iconOnly ? item.label : undefined"
      :disabled="disabled"
      :tabindex="item.value === modelValue ? 0 : -1"
      @click="onClick(item.value)"
    >
      <slot :item="item" :active="false">
        <Icon v-if="item.icon" :name="item.icon" :size="iconOnly ? 17 : 15" />
        <span v-if="!iconOnly" class="seg-label" :data-label="item.label">{{ item.label }}</span>
      </slot>
    </button>
    <!-- 选中字：同样的标签按量好的位置摆一遍，只露出滑块覆盖的那一段。 -->
    <span class="segment-ink" aria-hidden="true">
      <span
        v-for="(stop, index) in stops"
        :key="String(stop.value)"
        :class="['segment-ink-item', { 'is-lensed': lensValue !== null && stop.value === lensValue }]"
        :style="{ left: `${stop.left}px`, width: `${stop.width}px`, top: `${stop.top ?? 0}px`, height: `${stop.height ?? 0}px` }"
      >
        <slot v-if="items[index]" :item="items[index]!" :active="true">
          <Icon v-if="items[index]!.icon" :name="items[index]!.icon!" :size="iconOnly ? 17 : 15" />
          <span v-if="!iconOnly">{{ items[index]!.label }}</span>
        </slot>
      </span>
    </span>
    <!-- 透镜：盖在滑块和选中字上面，放大它底下画出来的一切（字、胶囊的毛玻璃、胶囊外面的页面）。
         像 iOS 26 的标签栏：只在按住 / 拖动 / 飞过去时浮起来，停稳后缩回平的滑块。
         玻璃的边（高光、影子）是单独一层，浮起时由平胶囊长出来、落下时缩回平胶囊。 -->
    <template v-if="thumbLens.active.value">
      <span ref="lensEl" class="segment-lens" aria-hidden="true" :style="thumbLens.style()" />
      <span ref="rimEl" class="segment-lens-rim" aria-hidden="true"><span ref="rimShape" class="segment-rim-shape" /></span>
    </template>
  </div>
</template>

<style scoped>
.segment-track {
  --seg-pad: 3px;
  --seg-dur: 300ms;
  --seg-ease: cubic-bezier(.3, 1.25, .4, 1);
  /* 拖动时滑块放大成透镜，裁切和挖空跟着往两边多让出这么多。 */
  --seg-grow: 0px;
  /* 拖动时上层裁切上下各多让出这么多（滑块放大成透镜）。 */
  --seg-clip-extra: 0px;
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: stretch;
  padding: var(--seg-pad);
  overflow: hidden;
  isolation: isolate;
  border-radius: 999px;
  user-select: none;
  touch-action: none;
}
/* 滑块位置和浮起 / 落下都不用 CSS 过渡：全是脚本里的 Web Animations（合成器上跑，见 fly 与 lifted 的 watch）。 */
.segment-track.is-dragging { --seg-grow: calc(var(--thumb-w) * .04); }
.segment-track.is-inset { background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
/* 浮在内容之上的导航：用浮动控件的玻璃（见 material.css 的 .glass-control）。
   毛玻璃画在里面的 .segment-glass 上，轨道自己只留影子——轨道带 backdrop-filter 的话，浮起来的透镜
   就看不见胶囊外面的页面了（lib/glassLens.ts）。 */
.segment-track.is-glass { box-shadow: var(--glass-outline), var(--glass-shadow); }
.segment-glass {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  pointer-events: none;
}
/* 胶囊的边：iOS 26 的玻璃边是一圈很细的高光，上下沿最亮、两端渐弱（光从正上方来）。画在字下面、
   透镜下面——透镜浮过来时，这圈边也被折进透镜里，和录屏里一样。 */
.segment-track.is-glass::after {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: var(--glass-edge);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}
@media (prefers-reduced-transparency: reduce) {
  .segment-glass { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
/* 开着折射：透镜浮起来时比胶囊还高，要伸出轨道。 */
.segment-track.has-lens { overflow: visible; }
.segment-track.is-fill { display: flex; }
.segment-track.is-fill .segment-item { flex: 1 1 0; }
/* 表单里的分段胶囊项不收缩（放不下就折行）；浮动导航和按钮组不折行，按原样收缩。 */
.segment-track.is-inset:not(.is-fill) .segment-item { flex: 0 0 auto; }
.segment-track.is-wrapped { display: flex; width: 100%; flex-wrap: wrap; border-radius: 20px; }
.segment-track.is-wrapped .segment-item { cursor: pointer; }

.segment-item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 15px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: grab;
  /* 滑块下面那一段挖掉：选中字只由上层画一次。 */
  -webkit-mask-image: linear-gradient(90deg,
    #000 calc(var(--thumb-l) - var(--seg-grow) - var(--item-l, 0px)),
    transparent calc(var(--thumb-l) - var(--seg-grow) - var(--item-l, 0px)),
    transparent calc(var(--thumb-l) + var(--thumb-w) + var(--seg-grow) - var(--item-l, 0px)),
    #000 calc(var(--thumb-l) + var(--thumb-w) + var(--seg-grow) - var(--item-l, 0px)));
  mask-image: linear-gradient(90deg,
    #000 calc(var(--thumb-l) - var(--seg-grow) - var(--item-l, 0px)),
    transparent calc(var(--thumb-l) - var(--seg-grow) - var(--item-l, 0px)),
    transparent calc(var(--thumb-l) + var(--thumb-w) + var(--seg-grow) - var(--item-l, 0px)),
    #000 calc(var(--thumb-l) + var(--thumb-w) + var(--seg-grow) - var(--item-l, 0px)));
}
.segment-item:hover:not(:disabled) { color: var(--ink); }
.segment-item.is-offrow { -webkit-mask-image: none; mask-image: none; }
/* 按钮宽度按粗体留：隐形的粗体副本和字叠在同一格里，取两者较宽的那个。 */
.seg-label { display: inline-grid; }
.seg-label::after {
  content: attr(data-label);
  height: 0;
  overflow: hidden;
  font-weight: 600;
  visibility: hidden;
}
/* 焦点画在滑块上，不画在按钮上：按钮的 outline 会留在旧位置，成为一圈残影。 */
.segment-item:focus-visible { outline: none; }
.segment-track.is-dragging .segment-item { cursor: grabbing; }
.segment-item:disabled { cursor: not-allowed; }

/* 滑块：位置层按 left / top 摆（飞行动画在它身上叠 translate / scale，不会把位置一起放大），
   里面的平胶囊是看得见的那一块（浮起 / 落下动它）。停着时谁都不缩放，端头是正圆。 */
.segment-thumb {
  position: absolute;
  z-index: 0;
  top: var(--thumb-t);
  left: var(--thumb-l);
  width: var(--thumb-w);
  height: var(--thumb-h);
  pointer-events: none;
  opacity: var(--thumb-vis, 0);
}
.segment-plate {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
  transition: scale var(--seg-dur) var(--seg-ease);
}
.segment-track.is-bare .segment-plate { background: var(--cap-glass-thumb); box-shadow: var(--cap-glass-thumb-rim); }
/* 浮动导航停稳时的选中项：iOS 26 标签栏是一块比玻璃略亮的平胶囊，只有一道很淡的顶边高光——
   没有黑描边、没有斜对角高光（2026-10-01：「像个餐盒」）。 */
.segment-track.is-glass .segment-plate { background: var(--glass-tab-selected); box-shadow: var(--glass-tab-selected-rim); }

.segment-ink {
  position: absolute;
  z-index: 2;
  inset: 0;
  color: var(--cap-ink);
  font-weight: 600;
  pointer-events: none;
  clip-path: inset(calc(var(--thumb-t) - var(--seg-clip-extra)) calc(100% - var(--thumb-l) - var(--thumb-w) - var(--seg-grow))
    calc(100% - var(--thumb-t) - var(--thumb-h) - var(--seg-clip-extra)) calc(var(--thumb-l) - var(--seg-grow)) round 999px);
}
/* —— 玻璃（iOS 26 标签栏按住 / 拖动时那块）——
   透镜（.segment-lens）和玻璃边（.segment-lens-rim）按 lib/segmentGlass.ts 算出的矩形摆：跟着滑块、
   比它左右各宽几像素、比整条胶囊高两成。停着时两样都看不见；浮起来时玻璃边由平胶囊长出来、透镜淡入。
   两头的样子写在这里，中间的过程由脚本里的 Web Animations 放。 */
.segment-lens, .segment-lens-rim {
  position: absolute;
  z-index: 3;
  top: var(--lens-y);
  left: var(--lens-x);
  width: var(--lens-w);
  height: var(--lens-h);
  border-radius: 999px;
  pointer-events: none;
}
.segment-lens { opacity: 0; }
.segment-lens-rim { opacity: var(--thumb-vis, 0); }
.segment-rim-shape {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  /* 一圈极淡的亮描边 + 斜对角的两道高光（左上、右下）+ 很淡的浮起影子。 */
  box-shadow: var(--lens-glass-rim);
}
.segment-rim-shape::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1.2px;
  border-radius: inherit;
  background: var(--lens-glass-specular);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
.segment-track.is-lifted .segment-lens, .segment-track.is-lifted .segment-rim-shape { opacity: 1; }
/* 浮起来时平胶囊化开：iOS 里浮起的那块玻璃里面是清的。 */
.segment-track.has-lens.is-lifted .segment-plate { opacity: 0; }
.segment-track.has-lens.is-dragging { --seg-clip-extra: 0px; }
.segment-ink-item {
  position: absolute;
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 15px;
  font-size: var(--fs-sm);
  line-height: 1.2;
  white-space: nowrap;
}

/* 拖动 / 吸附中：上层不按滑块裁切，只留离滑块最近的那一枚（整枚品牌色）；底层不再挖空，
   那一枚隐去。字始终完整，不会被切成两色。 */
.segment-item { transition: color var(--dur-fast) ease; }
.segment-track.is-lens-fade .segment-ink-item, .segment-track.is-lens-fade .segment-item {
  transition: opacity 140ms ease, color var(--dur-fast) ease;
}
.segment-track.is-dragging .segment-ink, .segment-track.is-settling .segment-ink { clip-path: none; }
.segment-track.is-dragging .segment-ink-item, .segment-track.is-settling .segment-ink-item { opacity: 0; }
.segment-track.is-dragging .segment-ink-item.is-lensed, .segment-track.is-settling .segment-ink-item.is-lensed { opacity: 1; }
.segment-track.is-dragging .segment-item, .segment-track.is-settling .segment-item { -webkit-mask-image: none; mask-image: none; }
.segment-track.is-dragging .segment-item.is-lensed, .segment-track.is-settling .segment-item.is-lensed { opacity: 0; }

/* 拖动时滑块只放大一点，材质不换：以前拖动中换成一块泛绿的透镜，松手一瞬间又换回玻璃，
   颜色跳一下就是「闪」。 */
.segment-track.is-dragging:not(.has-lens) .segment-plate { scale: 1.05 1.1; }
.segment-track.is-dragging { --seg-clip-extra: var(--seg-pad); }

/* 键盘焦点：选中的平胶囊亮一点，不画描边（2026-10-01：「只要有绿色描边的地方，都去掉」——
   点了胶囊以后浏览器有时也会把焦点判成键盘焦点，于是一点就冒出一圈绿环）。 */
.segment-track:has(.segment-item:focus-visible) .segment-plate { filter: brightness(1.18); }

.segment-track.is-compact .segment-item,
.segment-track.is-compact .segment-ink-item { padding: 3px 13px; font-size: var(--fs-xs); }
.segment-track.is-compact .segment-item { min-height: 30px; }
.segment-track.is-icon-only .segment-item,
.segment-track.is-icon-only .segment-ink-item { padding-inline: 11px; }
.segment-track.is-disabled { opacity: .55; }

@media (prefers-reduced-motion: reduce) {
  .segment-plate { transition: none; }
}
</style>
