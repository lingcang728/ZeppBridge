<script setup lang="ts">
/**
 * 主滚动区的悬浮细条。全局把原生滚动条藏了（base.css），以前长列表滚到哪、还剩多少都看不出来。
 * 平时不显示；一滚动、或者指针摸到右缘，细条淡入，停下一秒后淡出。可以拖，点轨道空白处翻一页。
 * 按时间排的列表（行上带 data-timeline="YYYY-MM"）在轨道旁标年份（最上面那年也标）：列表够长、跨了不止一年时
 * 年份一直显示，不等滚动才出；拖动时滑块旁冒出「年 · 月」。
 * 只动 opacity / transform；几何换算在 lib/scroll/scrollbar.ts。读屏和键盘照旧走原生滚动，这条只给指针用。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { locale } from '../../i18n';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { lessMotion } from '../../lib/motion/lessMotion';
import {
  overflows, pinYears, rowAt, scrollTopFor, thumbFor, timelineMonth, trackPointFor, yearMarks, type TimelineRow,
} from '../../lib/scroll/scrollbar';

const props = defineProps<{ viewport: string }>();

/** 轨道离顶栏下沿和窗口底各留这么多。 */
const INSET = 6;
const HIDE_AFTER = 1000;

const scrollTop = ref(0);
const extent = shallowRef({ scrollHeight: 0, clientHeight: 0 });
const headHeight = ref(0);
const rows = shallowRef<TimelineRow[]>([]);
const hover = ref(false);
const dragging = ref(false);
const recent = ref(false);

const box = computed(() => ({ scrollTop: scrollTop.value, ...extent.value }));
const track = computed(() => Math.max(0, extent.value.clientHeight - headHeight.value - INSET * 2));
const scrollable = computed(() => overflows(box.value) && track.value > 40);
const thumb = computed(() => thumbFor(box.value, track.value));
/* 刻度只跟内容高度走，滚动时不重算。 */
const thumbSize = computed(() => thumbFor({ scrollTop: 0, ...extent.value }, track.value).size);
const marks = computed(() => {
  if (!scrollable.value || rows.value.length < 2) return [];
  const size = thumbSize.value;
  const geometry = { scrollTop: 0, ...extent.value };
  return yearMarks(rows.value, (top) => trackPointFor(top, headHeight.value, geometry, track.value, size));
});
const shown = computed(() => scrollable.value && (recent.value || hover.value || dragging.value));
/** 长的时间列表：年份刻度常显。 */
const pinned = computed(() => scrollable.value && pinYears(rows.value, extent.value));
const bubble = computed(() => {
  if (!dragging.value || !rows.value.length) return '';
  const row = rowAt(rows.value, scrollTop.value + headHeight.value + 1);
  const month = row && timelineMonth(row.key);
  void locale.value;
  return month ? `${displayDateTimeFormatter({ year: 'numeric' }).format(month)} · ${displayDateTimeFormatter({ month: 'long' }).format(month)}` : '';
});

let main: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let layoutFrame = 0;
let resizer: ResizeObserver | null = null;
let mutations: MutationObserver | null = null;

const wake = () => {
  recent.value = true;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { recent.value = false; }, HIDE_AFTER);
};

const readScroll = () => {
  frame = 0;
  if (main) scrollTop.value = main.scrollTop;
};
const onScroll = () => {
  if (!frame) frame = requestAnimationFrame(readScroll);
  wake();
};

/** 内容高度、顶栏高度、带时间的行的位置。内容一变（换页、加载更多、窗口缩放）就重量一次。 */
const measure = () => {
  layoutFrame = 0;
  if (!main) return;
  extent.value = { scrollHeight: main.scrollHeight, clientHeight: main.clientHeight };
  scrollTop.value = main.scrollTop;
  headHeight.value = main.querySelector<HTMLElement>(':scope > .shell-head')?.offsetHeight ?? 0;
  const origin = main.getBoundingClientRect().top - main.scrollTop;
  const found: TimelineRow[] = [];
  for (const el of main.querySelectorAll<HTMLElement>('[data-timeline]')) {
    const key = el.dataset.timeline;
    if (!key || !el.offsetParent) continue;
    found.push({ key, top: el.getBoundingClientRect().top - origin });
  }
  found.sort((a, b) => a.top - b.top);
  rows.value = found;
};
const remeasure = () => {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(measure);
};
const observeChildren = () => {
  if (!main || !resizer) return;
  resizer.disconnect();
  resizer.observe(main);
  for (const child of main.children) resizer.observe(child);
};

onMounted(() => {
  main = document.getElementById(props.viewport);
  if (!main) return;
  main.addEventListener('scroll', onScroll, { passive: true });
  resizer = new ResizeObserver(remeasure);
  observeChildren();
  mutations = new MutationObserver((records) => {
    if (records.some((record) => record.target === main)) observeChildren();
    remeasure();
  });
  mutations.observe(main, { childList: true, subtree: true });
  measure();
});
onUnmounted(() => {
  main?.removeEventListener('scroll', onScroll);
  resizer?.disconnect();
  mutations?.disconnect();
  cancelAnimationFrame(frame);
  cancelAnimationFrame(layoutFrame);
  clearTimeout(hideTimer);
});

/* 拖滑块：按住时记下起点，之后按位移换算 scrollTop。拖到底会碰到「加载更多」的哨兵，内容变长、滑块跟着缩。 */
let grab: { y: number; offset: number } | null = null;
const thumbDown = (event: PointerEvent) => {
  if (event.button !== 0 || !main) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  grab = { y: event.clientY, offset: thumb.value.offset };
  dragging.value = true;
};
const thumbMove = (event: PointerEvent) => {
  if (!grab || !main) return;
  const offset = grab.offset + event.clientY - grab.y;
  main.scrollTop = scrollTopFor(offset, box.value, track.value, thumb.value.size);
};
const thumbUp = () => {
  if (!grab) return;
  grab = null;
  dragging.value = false;
  wake();
};
/* 点轨道空白处：朝那边翻一页。 */
const trackDown = (event: PointerEvent) => {
  if (event.button !== 0 || !main) return;
  const rail = event.currentTarget as HTMLElement;
  const y = event.clientY - rail.getBoundingClientRect().top;
  const direction = y < thumb.value.offset ? -1 : 1;
  main.scrollBy({ top: direction * main.clientHeight * 0.88, behavior: lessMotion() ? 'auto' : 'smooth' });
};
</script>

<template>
  <div v-if="scrollable" :class="['overlay-scroll', { shown, hover, dragging, pinned }]" :style="{ top: `${headHeight + INSET}px`, height: `${track}px` }"
    aria-hidden="true" @pointerenter="hover = true" @pointerleave="hover = false" @pointerdown="trackDown">
    <span v-for="mark in marks" :key="mark.year" class="year" :style="{ transform: `translateY(${mark.at}px)` }">{{ mark.year }}</span>
    <div class="thumb" :style="{ height: `${thumb.size}px`, transform: `translateY(${thumb.offset}px)` }"
      @pointerdown.stop="thumbDown" @pointermove="thumbMove" @pointerup="thumbUp" @pointercancel="thumbUp" @lostpointercapture="thumbUp"></div>
    <span v-if="bubble" class="bubble" :style="{ transform: `translateY(${thumb.offset + thumb.size / 2}px)` }">{{ bubble }}</span>
  </div>
</template>

<style scoped>
/* 右缘 14px 宽的感应带：平时透明，指针进来就亮。看得见的细条只有 4px，悬停 / 拖动时加宽到 8px。
   淡入淡出分开做：细条跟着滚动出没，年份刻度在长列表里常显（pinned）。 */
.overlay-scroll { position: absolute; right: 0; z-index: 40; width: 14px; touch-action: none; }
.thumb, .year { opacity: 0; transition: opacity 260ms ease 120ms; }
.overlay-scroll.shown .thumb, .overlay-scroll.shown .year, .overlay-scroll.pinned .year { opacity: 1; transition-delay: 0ms; transition-duration: 140ms; }
.thumb { position: absolute; top: 0; right: 0; width: 14px; cursor: default; }
.thumb::before {
  content: ''; position: absolute; inset: 0 3px 0 auto; width: 8px; border-radius: 4px; background: var(--scroll-thumb);
  transform: scaleX(.5); transform-origin: 100% 50%; transition: transform 160ms ease, background-color 160ms ease;
}
.overlay-scroll.hover .thumb::before, .overlay-scroll.dragging .thumb::before { transform: none; background: var(--scroll-thumb-active); }
/* 年份刻度：轨道左侧一枚小胶囊，中线对着那一年第一条记录滚到顶时滑块的中线。 */
.year {
  position: absolute; top: -9px; right: 16px; padding: 0 6px; border-radius: 6px; pointer-events: none;
  background: var(--scroll-label-bg); color: var(--muted); box-shadow: 0 0 0 1px var(--line-strong);
  font: 650 11px / 18px var(--font-sans); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.bubble {
  position: absolute; top: -16px; right: 22px; padding: 0 12px; border-radius: 10px; pointer-events: none;
  background: var(--surface-raised); color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong), 0 6px 18px rgb(0 0 0 / .22);
  font: 600 var(--fs-sm) / 32px var(--font-sans); font-variant-numeric: tabular-nums; white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) { .thumb, .year, .thumb::before { transition: none; } }
</style>
