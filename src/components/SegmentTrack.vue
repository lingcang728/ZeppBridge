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
import Icon, { type IconName } from './Icon.vue';
import { dragThumb, snapStop, type SegmentStop } from '../lib/navigation';
import { useGlassLens } from '../composables/useGlassLens';

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
/** 松手后滑块吸附到位的那一段：和拖动一样不分色，免得吸附途中出现半个字。 */
const settling = ref(false);
/** 拖动 / 吸附中离滑块最近的那一项：它的字整枚上品牌色。 */
const lensValue = ref<T | null>(null) as Ref<T | null>;
/* 换字的淡入淡出只在拖动已经开始以后才打开：进入拖动那一帧画法从「按滑块裁切」换成
   「整枚上色」，两种画法在那一帧看上去完全一样，必须瞬间换；要是这时也走 140ms 的淡出，
   裁切先撤掉、其余几枚绿字还没淡完，所有标签就会一起闪绿一下（「一拖字就闪」）。 */
const lensFade = ref(false);
let fadeFrame = 0;
let settleTimer = 0;
/** 第一次量完之前不做过渡，免得滑块从最左边滑进来。 */
const settled = ref(false);

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

/* —— 折射（lib/glassLens.ts）：照 iOS 26 的标签栏，按住 / 拖动时滑块浮起来变成一块比胶囊还高的凸玻璃，
   斜面把外面的东西折进来；浮在内容上的玻璃导航，整条胶囊的外沿也对背后滚过的页面折射一圈。
   毛玻璃底画在轨道里的一层（.segment-glass）而不是轨道本身：轨道自己带 backdrop-filter 的话，
   透镜只看得见轨道里的字，看不见胶囊外面的页面。 —— */
const lensEl = ref<HTMLElement | null>(null);
const glassEl = ref<HTMLElement | null>(null);
const thumbLens = useGlassLens(lensEl, 'thumb');
const rimLens = useGlassLens(glassEl, 'rim', props.variant === 'glass');
/** 按住滑块（还没拖）：透镜先浮起来，和 iOS 一样手指一按就变成玻璃。 */
const pressed = ref(false);
/** 点了别的项、滑块滑过去的那一段：透镜浮着滑过去，到了再落下。 */
const gliding = ref(false);
let glideTimer = 0;
/** 拖得快时透镜沿运动方向拉长一点（像一滴水），按速度平滑。 */
const stretch = ref(0);
/** 轨道宽：透镜横向长出去时不越过两端太多。 */
const trackWidth = ref(0);

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
  trackWidth.value = track.value.offsetWidth;
  checkWrap();
  stops.value = readStops();
  if (!gesture) placeOn(restingValue());
  if (!settled.value && thumb.value.visible) requestAnimationFrame(() => { settled.value = true; });
};

const observeItems = () => {
  if (!observer || !track.value) return;
  observer.disconnect();
  observer.observe(track.value);
  for (const el of buttons()) observer.observe(el);
};

const trackStyle = computed(() => ({
  '--thumb-l': `${thumb.value.left}px`,
  '--thumb-w': `${thumb.value.visible ? thumb.value.width : 0}px`,
  '--thumb-t': `${thumb.value.top}px`,
  '--thumb-h': `${thumb.value.height}px`,
  '--lens-stretch': `${stretch.value.toFixed(1)}px`,
  '--track-w': `${trackWidth.value}px`,
}));
/** 透镜浮起来的时候：按住、拖动、松手后落位、点击后滑过去。 */
const lifted = computed(() => thumbLens.active.value && (pressed.value || dragging.value || settling.value || gliding.value));
/** 折行时不在滑块那一行的项：不挖空（挖空只按横坐标算，会误伤别的行）。 */
const offRow = (index: number) => wrapped.value && (stops.value[index]?.top ?? 0) !== thumb.value.top;
const itemLeft = (index: number) => ({ '--item-l': `${stops.value[index]?.left ?? 0}px` });

const focusActive = () => {
  if (!track.value?.contains(document.activeElement)) return;
  const index = props.items.findIndex((item) => item.value === props.modelValue);
  buttons()[index]?.focus({ preventScroll: true });
};

const commit = (value: T) => {
  window.clearTimeout(landTimer);
  landTimer = 0;
  pending = null;
  if (value !== props.modelValue) emit('update:modelValue', value);
};

/* 拖着松手：滑块先落到位，再把新值交出去。以前松手那一刻就切页面 / 换图表，新页面挂载的那一两百毫秒
   正好卡在滑块的落位动画上——用户看到的「放下去会卡一下」（2026-09-30）。点击和键盘照旧立刻生效。 */
const LAND_MS = 300;
let landTimer = 0;
/** 已经落位、还没交出去的那个值：这段时间里重新量尺寸也按它摆滑块，别弹回旧值。 */
let pending: T | null = null;
const commitAfterLanding = (value: T) => {
  window.clearTimeout(landTimer);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit(value);
    return;
  }
  pending = value;
  landTimer = window.setTimeout(() => commit(value), LAND_MS);
};
/** 滑块该停在哪：有待交出的值就是它，否则是当前值。 */
const restingValue = (): T => pending ?? props.modelValue;

const clearGesture = () => {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  pressed.value = false;
  stretch.value = 0;
  lensValue.value = null;
  cancelAnimationFrame(fadeFrame);
  cancelAnimationFrame(frame);
  frame = 0;
  nextThumb = null;
  if (current && track.value?.hasPointerCapture(current.id)) track.value.releasePointerCapture(current.id);
};

const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !track.value || wrapped.value) return;
  // 上一次拖动还没交出去就又按下：先把那一次交了，别丢。
  if (pending !== null) commit(pending);
  measure();
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
  // 按在已选中的那一项上：透镜马上浮起来（按在别的项上是点击，滑过去时再浮）。
  if (startValue === props.modelValue) pressed.value = true;
};

/** 指针移动的屏幕像素换算成布局像素（原生缩放下两者不同）。 */
const layoutScale = () => {
  if (!track.value || !track.value.offsetWidth) return 1;
  return track.value.getBoundingClientRect().width / track.value.offsetWidth || 1;
};

const onMove = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  const scale = layoutScale();
  const dx = (event.clientX - current.x) / scale;
  if (!dragging.value && Math.abs(dx) < 5) return;
  if (!dragging.value) {
    lensValue.value = props.modelValue;
    lensFade.value = false;
    // 两帧以后（新画法已经画出来）才打开换字的淡入淡出。
    fadeFrame = requestAnimationFrame(() => { fadeFrame = requestAnimationFrame(() => { lensFade.value = true; }); });
  }
  dragging.value = true;
  suppressClick = true;
  current.velocity = (event.clientX - current.lastX) / scale / Math.max(1, event.timeStamp - current.time);
  current.lastX = event.clientX;
  current.time = event.timeStamp;
  nextThumb = dragThumb(stops.value, current.center + dx, current.velocity);
  // 速度（布局像素 / 毫秒）换成拉长量：最多拉长滑块宽的一成二，平滑着跟。
  const target = Math.min(Math.abs(current.velocity) * 6, (nextThumb?.width ?? 0) * 0.12);
  stretch.value += (target - stretch.value) * 0.35;
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!nextThumb) return;
      thumb.value = { ...thumb.value, ...nextThumb, visible: true };
      lensValue.value = snapStop(stops.value, nextThumb.left + nextThumb.width / 2, 0).value;
    });
  }
  event.preventDefault();
};

const onUp = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  if (event.type !== 'pointerup') {
    // 拖到一半指针被系统收走（pointercancel / 捕获丢失）：已经拖动过就按此刻滑块所在的那一项落定，
    // 没拖动就原样放回。「禁止点击」的标记也要复位——以前它一直留着，之后点胶囊毫无反应，
    // 这就是「快速切换会卡住」。
    const landing = dragging.value ? snapStop(stops.value, thumb.value.left + thumb.value.width / 2, 0).value : null;
    clearGesture();
    window.setTimeout(() => { suppressClick = false; }, 0);
    if (landing !== null) {
      placeOn(landing);
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
  clearGesture();
  lensFade.value = moved && keepFade;
  if (moved) {
    settling.value = true;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => { settling.value = false; lensFade.value = false; lensValue.value = null; }, 340);
    lensValue.value = next;
  }
  placeOn(next);
  if (moved) commitAfterLanding(next);
  else {
    if (next !== props.modelValue) glide();
    commit(next);
  }
  window.setTimeout(() => { suppressClick = false; }, 0);
};

/** 点到别的项：透镜浮着滑过去（指针点击在 onUp 里就交出了值，键盘不走这里）。 */
const glide = () => {
  if (!thumbLens.active.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gliding.value = true;
  window.clearTimeout(glideTimer);
  glideTimer = window.setTimeout(() => { gliding.value = false; }, LAND_MS);
};

const onClick = (value: T) => {
  if (props.disabled || suppressClick) return;
  if (value === props.modelValue) {
    emit('reselect', value);
    return;
  }
  glide();
  commit(value);
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
  commit(props.items[target]!.value);
};

watch(() => props.modelValue, async () => {
  // 外面改了值（比如换了路由）：还没交出去的那一次作废，以外面的为准。
  if (pending !== null && pending !== props.modelValue) {
    window.clearTimeout(landTimer);
    landTimer = 0;
    pending = null;
  }
  await nextTick();
  if (!gesture) placeOn(props.modelValue);
  focusActive();
});
watch(wrapped, async () => {
  await nextTick();
  stops.value = readStops();
  if (!gesture) placeOn(restingValue());
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
  void document.fonts?.ready.then(() => measure());
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => {
  clearGesture();
  window.clearTimeout(settleTimer);
  window.clearTimeout(landTimer);
  window.clearTimeout(glideTimer);
  cancelAnimationFrame(fadeFrame);
  observer?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    ref="track"
    :class="['segment-track', `is-${variant}`, {
      'is-dragging': dragging, 'is-settling': settling, 'is-lens-fade': lensFade, 'is-compact': compact, 'is-disabled': disabled, 'is-fill': fill, 'is-settled': settled,
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
    <span class="segment-thumb" aria-hidden="true" :style="{ opacity: thumb.visible ? 1 : 0 }" />
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
    <!-- 透镜：盖在滑块和选中字上面，折射它底下画出来的一切（字、胶囊的毛玻璃、胶囊外面的页面）。
         像 iOS 26 的标签栏：只在按住 / 拖动 / 吸附 / 滑过去时浮起来，停稳后缩回平的滑块。
         玻璃（折射）和边（描边、高光、影子）分两层：玻璃要按胶囊形状裁，边的影子不能被裁掉。 -->
    <template v-if="thumbLens.active.value">
      <span ref="lensEl" class="segment-lens" aria-hidden="true" :style="thumbLens.style()" />
      <span class="segment-lens-rim" aria-hidden="true" />
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
.segment-track.is-settled {
  transition: --thumb-l var(--seg-dur) var(--seg-ease), --thumb-w var(--seg-dur) var(--seg-ease),
    --thumb-t var(--seg-dur) var(--seg-ease), --thumb-h var(--seg-dur) var(--seg-ease);
}
.segment-track.is-dragging { --seg-grow: calc(var(--thumb-w) * .04); transition: none; }
.segment-track.is-inset { background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
/* 浮在内容之上的导航：用浮动控件的玻璃（见 material.css 的 .glass-control）。
   毛玻璃画在里面的 .segment-glass 上，轨道自己只留影子——轨道带 backdrop-filter 的话，浮起来的透镜
   就看不见胶囊外面的页面了（lib/glassLens.ts）。开着折射时 .segment-glass 四周多撑出 --lens-m 给外沿
   往外取样，再裁回胶囊形状。 */
.segment-track.is-glass { box-shadow: var(--glass-outline), var(--glass-shadow); }
.segment-glass {
  position: absolute;
  z-index: -1;
  inset: 0;
  margin: calc(-1 * var(--lens-m, 0px));
  border-radius: 999px;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  clip-path: inset(var(--lens-m, 0px) round 999px);
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

.segment-thumb {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: var(--thumb-w);
  height: var(--thumb-h);
  border-radius: 999px;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
  transform: translate(var(--thumb-l), var(--thumb-t));
  pointer-events: none;
  transition: scale var(--seg-dur) var(--seg-ease), opacity var(--dur-fast) ease;
}
.segment-track.is-bare .segment-thumb { background: var(--cap-glass-thumb); box-shadow: var(--cap-glass-thumb-rim); }
/* 浮动导航停稳时的选中项：iOS 26 标签栏是一块比玻璃略深的平胶囊，不是凸起的白胶囊。 */
.segment-track.is-glass .segment-thumb { background: var(--glass-tab-selected); box-shadow: none; }

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
/* 透镜（iOS 26 标签栏按住 / 拖动时那块玻璃）。停着时和滑块一样大、看不见；浮起来时往四周长：
   横向多出滑块宽的一成四（录屏里 160 → 205），竖向比整条胶囊还高约两成（伸出上下沿）。拖得快时
   沿运动方向再拉长一点、竖向略收。浮起带一点回弹，落下不回弹。
   透镜本身绝不 scale：一缩放，透过它看到的东西就被重采样，整块发糊。尺寸变化靠宽高，滤镜跟着按帧重摆。 */
.segment-lens, .segment-lens-rim {
  --lens-x: 0px;
  --lens-y: 0px;
  /* 两端最多伸出轨道这么多（和上下伸出去的一样多）：停在第一项 / 最后一项时不往外长成一条舌头。 */
  --lens-l: max(calc(var(--thumb-l) - var(--lens-x)), calc(var(--seg-pad) - var(--lens-y)));
  --lens-r: min(calc(var(--thumb-l) + var(--thumb-w) + var(--lens-x)), calc(var(--track-w, 100vw) - var(--seg-pad) + var(--lens-y)));
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  width: calc(var(--lens-r) - var(--lens-l));
  height: calc(var(--thumb-h) + 2 * var(--lens-y));
  border-radius: 999px;
  transform: translate(var(--lens-l), calc(var(--thumb-t) - var(--lens-y)));
  pointer-events: none;
  opacity: 0;
  transition: --lens-x 240ms var(--lens-drop), --lens-y 240ms var(--lens-drop), opacity 180ms ease 70ms;
}
.segment-track.is-lifted :is(.segment-lens, .segment-lens-rim) {
  --lens-x: calc(var(--thumb-w) * .14 + var(--lens-stretch, 0px));
  --lens-y: calc(var(--thumb-h) * .11 + var(--seg-pad) * 1.22 - var(--lens-stretch, 0px) * .3);
  opacity: 1;
  transition: --lens-x 420ms var(--lens-lift), --lens-y 420ms var(--lens-lift), opacity 90ms ease;
}
/* 拖动中拉长量逐帧在变：只给很短的跟随，不要回弹。 */
.segment-track.is-lifted.is-dragging :is(.segment-lens, .segment-lens-rim) {
  transition: --lens-x 110ms ease-out, --lens-y 110ms ease-out, opacity 90ms ease;
}
/* 玻璃本体：四周多撑出 --lens-m 给往外的取样，再裁回胶囊。里面不铺任何颜色——中间就是原样的胶囊。 */
.segment-lens {
  box-sizing: content-box;
  margin: calc(-1 * var(--lens-m, 0px));
  padding: var(--lens-m, 0px);
  clip-path: inset(var(--lens-m, 0px) round 999px);
}
/* 玻璃的边：一圈极细的暗描边 + 斜对角的两道高光（左上、右下）+ 很淡的浮起影子。 */
.segment-lens-rim { box-shadow: var(--lens-glass-rim); }
.segment-lens-rim::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1.2px;
  border-radius: inherit;
  background: var(--lens-glass-specular);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
/* 透镜浮起来时，平的选中胶囊化进玻璃里：iOS 里浮起的那块玻璃里面是清的，不再有那块深色底。 */
.segment-track.has-lens .segment-thumb { transition: scale var(--seg-dur) var(--seg-ease), opacity 160ms ease 120ms; }
.segment-track.has-lens.is-lifted .segment-thumb { scale: none; opacity: 0 !important; transition: opacity 90ms ease; }
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
.segment-track.is-dragging .segment-thumb { scale: 1.05 1.1; }
.segment-track.is-dragging { --seg-clip-extra: var(--seg-pad); }

.segment-track:has(.segment-item:focus-visible) .segment-thumb {
  box-shadow: 0 0 0 2px var(--canvas), 0 0 0 4px var(--focus);
}

.segment-track.is-compact .segment-item,
.segment-track.is-compact .segment-ink-item { padding: 3px 13px; font-size: var(--fs-xs); }
.segment-track.is-compact .segment-item { min-height: 30px; }
.segment-track.is-icon-only .segment-item,
.segment-track.is-icon-only .segment-ink-item { padding-inline: 11px; }
.segment-track.is-disabled { opacity: .55; }

@media (prefers-reduced-motion: reduce) {
  .segment-track.is-settled, .segment-thumb { transition: none; }
}
</style>
