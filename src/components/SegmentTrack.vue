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
 * 拖动时（以及松手后吸附的那一下）不再用裁切给字分色：裁切边会穿过字形，「旅」一半灰
 * 一半绿，滑块放大成透镜后绿字还会跑出胶囊。改成——拖动期间上层选中字整层隐去、底层
 * 字完整露出，由浮在字上面的液态玻璃镜片去折射它们（components/LiquidGlassDefs.vue，
 * WebView2 上有真实折射，WebKit 回落成磨砂）；停稳后选中字整枚淡入成品牌色。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import Icon, { type IconName } from './Icon.vue';
import { dragThumb, snapStop, type SegmentStop } from '../lib/navigation';

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

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const track = ref<HTMLElement | null>(null);
const stops = ref([]) as Ref<SegmentStop<T>[]>;
const thumb = ref({ left: 0, width: 0, visible: false });
const dragging = ref(false);
/** 松手后滑块吸附到位的那一段：和拖动一样不分色，免得吸附途中出现半个字。 */
const settling = ref(false);
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

const buttons = () => Array.from(track.value?.querySelectorAll<HTMLElement>('.segment-item') ?? []);
const readStops = (): SegmentStop<T>[] => buttons().map((el, index) => ({
  left: el.offsetLeft,
  width: el.offsetWidth,
  value: props.items[index]!.value,
}));

const placeOn = (value: T) => {
  const stop = stops.value.find((item) => item.value === value);
  thumb.value = stop ? { left: stop.left, width: stop.width, visible: true } : { ...thumb.value, visible: false };
};

const measure = () => {
  if (!track.value) return;
  stops.value = readStops();
  if (!gesture) placeOn(props.modelValue);
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
}));
const itemLeft = (index: number) => ({ '--item-l': `${stops.value[index]?.left ?? 0}px` });

const focusActive = () => {
  if (!track.value?.contains(document.activeElement)) return;
  const index = props.items.findIndex((item) => item.value === props.modelValue);
  buttons()[index]?.focus({ preventScroll: true });
};

const commit = (value: T) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
};

const clearGesture = () => {
  const current = gesture;
  gesture = null;
  dragging.value = false;
  cancelAnimationFrame(frame);
  frame = 0;
  nextThumb = null;
  if (current && track.value?.hasPointerCapture(current.id)) track.value.releasePointerCapture(current.id);
};

const onDown = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0 || !event.isPrimary || !track.value) return;
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
  dragging.value = true;
  suppressClick = true;
  current.velocity = (event.clientX - current.lastX) / scale / Math.max(1, event.timeStamp - current.time);
  current.lastX = event.clientX;
  current.time = event.timeStamp;
  nextThumb = dragThumb(stops.value, current.center + dx, current.velocity);
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (nextThumb) thumb.value = { ...nextThumb, visible: true };
    });
  }
  event.preventDefault();
};

const onUp = (event: PointerEvent) => {
  const current = gesture;
  if (!current || current.id !== event.pointerId) return;
  if (event.type !== 'pointerup') {
    clearGesture();
    placeOn(props.modelValue);
    return;
  }
  const moved = dragging.value;
  const center = current.center + (event.clientX - current.x) / layoutScale();
  const velocity = event.timeStamp - current.time < 90 ? current.velocity : 0;
  const next = moved ? snapStop(stops.value, center, velocity).value : current.startValue;
  clearGesture();
  if (moved) {
    settling.value = true;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => { settling.value = false; }, 320);
  }
  placeOn(next);
  commit(next);
  window.setTimeout(() => { suppressClick = false; }, 0);
};

const onClick = (value: T) => {
  if (props.disabled || suppressClick) return;
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
  await nextTick();
  if (!gesture) placeOn(props.modelValue);
  focusActive();
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
  observer?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    ref="track"
    :class="['segment-track', `is-${variant}`, {
      'is-dragging': dragging, 'is-settling': settling, 'is-compact': compact, 'is-disabled': disabled, 'is-fill': fill, 'is-settled': settled,
      'is-icon-only': iconOnly,
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
    <span class="segment-thumb" aria-hidden="true" :style="{ opacity: thumb.visible ? 1 : 0 }" />
    <button
      v-for="(item, index) in items"
      :key="String(item.value)"
      type="button"
      role="radio"
      class="segment-item"
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
        <span v-if="!iconOnly">{{ item.label }}</span>
      </slot>
    </button>
    <!-- 拖动时浮在字上面的镜片：透过它看到的是底下完整的字，被玻璃边缘折射。 -->
    <span class="segment-lens" aria-hidden="true" />
    <!-- 选中字：同样的标签按量好的位置摆一遍，只露出滑块覆盖的那一段。 -->
    <span class="segment-ink" aria-hidden="true">
      <span
        v-for="(stop, index) in stops"
        :key="String(stop.value)"
        class="segment-ink-item"
        :style="{ left: `${stop.left}px`, width: `${stop.width}px` }"
      >
        <slot v-if="items[index]" :item="items[index]!" :active="true">
          <Icon v-if="items[index]!.icon" :name="items[index]!.icon!" :size="iconOnly ? 17 : 15" />
          <span v-if="!iconOnly">{{ items[index]!.label }}</span>
        </slot>
      </span>
    </span>
  </div>
</template>

<style scoped>
.segment-track {
  --seg-pad: 3px;
  --seg-dur: 300ms;
  --seg-ease: cubic-bezier(.3, 1.25, .4, 1);
  /* 拖动时滑块放大成透镜，裁切和挖空跟着往两边多让出这么多。 */
  --seg-grow: 0px;
  --seg-clip-y: var(--seg-pad);
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
  transition: --thumb-l var(--seg-dur) var(--seg-ease), --thumb-w var(--seg-dur) var(--seg-ease);
}
.segment-track.is-dragging { --seg-grow: calc(var(--thumb-w) * .04); transition: none; }
.segment-track.is-inset { background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
/* 浮在内容之上的导航：用浮动控件的玻璃（见 material.css 的 .glass-control）。 */
.segment-track.is-glass {
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-rim), var(--glass-shadow);
}
@media (prefers-reduced-transparency: reduce) {
  .segment-track.is-glass { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
.segment-track.is-fill { display: flex; }
.segment-track.is-fill .segment-item { flex: 1 1 0; }

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
  transition: color var(--dur-fast) ease;
}
.segment-item:hover:not(:disabled) { color: var(--ink); }
/* 焦点画在滑块上，不画在按钮上：按钮的 outline 会留在旧位置，成为一圈残影。 */
.segment-item:focus-visible { outline: none; }
.segment-track.is-dragging .segment-item { cursor: grabbing; }
.segment-item:disabled { cursor: not-allowed; }

.segment-thumb {
  position: absolute;
  z-index: 0;
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  left: 0;
  width: var(--thumb-w);
  border-radius: 999px;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
  transform: translateX(var(--thumb-l));
  pointer-events: none;
  transition: scale var(--seg-dur) var(--seg-ease), opacity var(--dur-fast) ease;
}
.segment-track.is-glass .segment-thumb,
.segment-track.is-bare .segment-thumb { background: var(--cap-glass-thumb); box-shadow: var(--cap-glass-thumb-rim); }

.segment-ink {
  position: absolute;
  z-index: 2;
  inset: 0;
  color: var(--cap-ink);
  font-weight: 600;
  pointer-events: none;
  clip-path: inset(var(--seg-clip-y) calc(100% - var(--thumb-l) - var(--thumb-w) - var(--seg-grow)) var(--seg-clip-y)
    calc(var(--thumb-l) - var(--seg-grow)) round 999px);
}
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

/* 拖动 / 吸附中：选中字整层隐去，底层字不再挖空——字始终完整，不会被切成两色。 */
.segment-ink { transition: opacity 180ms ease; }
.segment-track.is-dragging .segment-ink, .segment-track.is-settling .segment-ink { opacity: 0; transition-duration: 60ms; }
.segment-track.is-dragging .segment-item, .segment-track.is-settling .segment-item { -webkit-mask-image: none; mask-image: none; }

/* 液态玻璃镜片：只在拖动时出现，几何与滑块一致（同一对 --thumb-l / --thumb-w、同样放大），
   叠在字上面；backdrop 上套 SVG 位移滤镜，把底下的字按玻璃边缘折射、边缘带一点色散。 */
.segment-lens {
  position: absolute;
  z-index: 3;
  top: var(--seg-pad);
  bottom: var(--seg-pad);
  left: 0;
  width: var(--thumb-w);
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  transform: translateX(var(--thumb-l)) scale(1.08, 1.16);
  transition: opacity 140ms ease;
}
:global(.has-liquid-glass) .segment-track.is-dragging .segment-lens {
  opacity: 1;
  -webkit-backdrop-filter: blur(.4px) saturate(1.5) brightness(1.06);
  backdrop-filter: blur(.4px) saturate(1.5) brightness(1.06);
  filter: url(#zb-liquid-glass);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5), inset 0 -1px 0 rgba(255, 255, 255, .12),
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
}

/* 拖动时滑块变成清透的透镜：放大一点、边缘高光、几乎无色，透过它能看清底下的标签。 */
.segment-track.is-dragging .segment-thumb {
  scale: 1.08 1.16;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45), inset 0 -1px 0 rgba(255, 255, 255, .1),
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 8px 20px -8px rgba(0, 0, 0, .45);
}
.segment-track.is-dragging { --seg-clip-y: 0px; }

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
