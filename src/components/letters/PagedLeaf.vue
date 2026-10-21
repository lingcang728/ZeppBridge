<script setup lang="ts">
/**
 * 把一段内容排在横线信纸上、按页切开（2026-10-21 用户：信纸不能上下滚，右边那条滚动条太丑）。更新说明和上期回音用它；
 * 来信有首字母、落款这些自己的排法，在 LetterFlow 里，切页的做法一样：
 * 内容排进多栏布局，每栏正好一页宽、高度是行距的整数倍，溢出的往右排；第 page 页就是整条往左平移 page 栏。
 * 每一页都是同一份内容的一个拷贝（只有最上面那张能操作，别的 inert）。第 0 页量出总页数报给外面。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ page: number }>();
const emit = defineEmits<{ (event: 'pages', count: number): void }>();

const win = ref<HTMLElement | null>(null);
const flow = ref<HTMLElement | null>(null);
const box = ref({ width: 0, height: 0, gap: 48 });

const measure = async () => {
  const el = win.value;
  const inner = flow.value;
  if (!el || !inner) return;
  const line = parseFloat(getComputedStyle(el).lineHeight) || 34;
  const width = Math.floor(el.clientWidth);
  const height = Math.max(line, Math.floor(el.clientHeight / line) * line);
  if (width !== box.value.width || height !== box.value.height) {
    box.value = { ...box.value, width, height };
    await nextTick();
  }
  if (props.page !== 0) return;
  const step = width + box.value.gap;
  emit('pages', Math.max(1, Math.round((inner.scrollWidth + box.value.gap) / step)));
};
let observer: ResizeObserver | null = null;
/* 窗口一变、字体后到（会重排）都重量重报；字体只听事件，不读 document.fonts.ready。 */
const remeasure = () => { void measure(); };
onMounted(() => {
  observer = new ResizeObserver(remeasure);
  if (win.value) observer.observe(win.value);
  document.fonts?.addEventListener('loadingdone', remeasure);
  void measure();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  document.fonts?.removeEventListener('loadingdone', remeasure);
});

const flowStyle = computed(() => box.value.width ? {
  width: `${box.value.width}px`,
  height: `${box.value.height}px`,
  columnWidth: `${box.value.width}px`,
  columnGap: `${box.value.gap}px`,
  transform: `translateX(${-props.page * (box.value.width + box.value.gap)}px)`,
} : { visibility: 'hidden' as const });
</script>

<template>
  <div ref="win" class="paged paper-lines">
    <div ref="flow" class="paged-flow" :style="flowStyle"><slot /></div>
  </div>
</template>

<style scoped>
.paged { position: relative; height: 100%; overflow: hidden; }
.paged-flow { column-fill: auto; }
/* 一条（一组标题 + 它的第一条）不要被切在两页之间。 */
.paged-flow :deep(li), .paged-flow :deep(h3) { break-inside: avoid; }
.paged-flow :deep(h3) { break-after: avoid; }
</style>
