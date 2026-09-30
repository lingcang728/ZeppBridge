<script setup lang="ts">
/**
 * 点节点弹出的小面板：类别给「交不交给 AI + 回溯天数 + 含运动当天 + 展开指标」，
 * 指标给「交不交给 AI」，中心只读。
 *
 * 位置跟着节点走，但永远落在画布「看得见」的那一块里：上面让出任务名胶囊，
 * 下面让出交付坞（安全边距由 TaskGraph 从样式变量读来）。量的是面板自己的真实
 * 高度——以前按固定 240px 估，面板一长就被交付坞盖住半截，下面的选项点不到。
 * 下面放不下就翻到节点上方；再放不下，面板自己滚动。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { GraphNode } from '../../lib/aiTask/graph/model';
import { CATEGORY_DAY_CHOICES, shownDayChoice } from '../../lib/aiTask/categories';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  node: GraphNode;
  /** 节点在视口里的屏幕坐标（每帧更新）。 */
  anchor: { x: number; y: number };
  viewport: { width: number; height: number };
  /** 画布四边被浮层挡住的宽度。 */
  safe: { top: number; right: number; bottom: number; left: number };
}>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'set-category', included: boolean): void;
  (event: 'set-metric', included: boolean): void;
  (event: 'set-days', days: number): void;
  (event: 'set-include-day', include: boolean): void;
  (event: 'toggle-expand'): void;
}>();

const t = useMessages(defineMessages(
  {
    include: '交给 AI', exclude: '不交给 AI', keep: '保留这个指标', drop: '排除这个指标',
    days: '回溯天数', daysOption: (days: number) => `${days} 天`,
    includeDay: '包含运动当天', expand: '展开指标', collapse: '收起指标',
    coverage: (have: number, total: number) => `${have}/${total} 天有数据`,
    noData: '这段时间没有数据', attachments: (count: number) => `${count} 个原件`,
    noteHint: '在右边第 ② 步写。', close: '关闭',
  },
  {
    include: 'Send to AI', exclude: 'Leave out', keep: 'Keep this metric', drop: 'Exclude this metric',
    days: 'Look-back', daysOption: (days: number) => `${days} days`,
    includeDay: 'Include the workout day', expand: 'Show metrics', collapse: 'Hide metrics',
    coverage: (have: number, total: number) => `${have}/${total} days with data`,
    noData: 'No data in this window', attachments: (count: number) => (count === 1 ? '1 file' : `${count} files`),
    noteHint: 'Write the note in step 2 on the right.', close: 'Close',
  },
  {
    include: 'Pasar a la IA', exclude: 'No pasar a la IA', keep: 'Conservar esta métrica', drop: 'Excluir esta métrica',
    days: 'Días anteriores', daysOption: (days: number) => `${days} días`,
    includeDay: 'Incluir día del entrenamiento', expand: 'Ver métricas', collapse: 'Ocultar métricas',
    coverage: (have: number, total: number) => `${have}/${total} días con datos`,
    noData: 'Sin datos en este periodo', attachments: (count: number) => (count === 1 ? '1 archivo' : `${count} archivos`),
    noteHint: 'Escríbela en el paso ② a la derecha.', close: 'Cerrar',
  },
  'components/ai/GraphNodePopover',
));

const WIDTH = 288;
const GAP = 16;
const root = ref<HTMLElement | null>(null);
const height = ref(0);

const room = computed(() => ({
  top: props.safe.top + 8,
  bottom: props.viewport.height - props.safe.bottom - 8,
  left: props.safe.left + 8,
  right: props.viewport.width - props.safe.right - 8,
}));
/** 面板最高能有多高：看得见的那一块整个高度。再高就在面板里滚。 */
const maxHeight = computed(() => Math.max(160, room.value.bottom - room.value.top));
const pos = computed(() => {
  const h = Math.min(height.value || 260, maxHeight.value);
  // 横向：优先放在节点右边，右边放不下就放左边。
  let left = props.anchor.x + GAP;
  if (left + WIDTH > room.value.right) left = props.anchor.x - GAP - WIDTH;
  left = Math.min(Math.max(left, room.value.left), Math.max(room.value.left, room.value.right - WIDTH));
  // 纵向：顶边对着节点略往上；下面放不下就整体往上挪，保证完整露出来。
  let top = props.anchor.y - 24;
  if (top + h > room.value.bottom) top = room.value.bottom - h;
  top = Math.max(top, room.value.top);
  return { left, top };
});

let observer: ResizeObserver | null = null;
const measure = () => { height.value = root.value?.offsetHeight ?? 0; };
watch(() => props.node.id, () => { void nextTick(measure); });

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};
/* 点面板以外的任何地方都关掉（不必非点 ×）。点的是图上的节点时不管：节点自己
   负责「换一个打开 / 再点一下收起」，这里再关一次会和它抢。 */
const onDocPointer = (event: PointerEvent) => {
  const target = event.target as Element | null;
  if (!target || root.value?.contains(target)) return;
  if (target.closest('svg [role="button"]')) return;
  emit('close');
};
onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDocPointer, true);
  measure();
  observer = new ResizeObserver(measure);
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('pointerdown', onDocPointer, true);
  observer?.disconnect();
});

const dayItems = computed(() => CATEGORY_DAY_CHOICES.map((days) => ({ value: days, label: t.value.daysOption(days) })));
const coverageText = computed(() => {
  const { daysHave, daysTotal } = props.node;
  if (daysHave === null || daysTotal === null) return null;
  return daysHave === 0 ? t.value.noData : t.value.coverage(daysHave, daysTotal);
});
</script>

<template>
  <div ref="root" class="popover glass-control" role="dialog" :aria-label="node.label"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px`, maxHeight: `${maxHeight}px` }" @pointerdown.stop @wheel.stop>
    <div class="pop-head">
      <span v-if="node.icon" class="pop-icon"><Icon :name="node.icon" :size="16" /></span>
      <div class="pop-title">
        <strong>{{ node.label }}</strong>
        <span v-if="coverageText" :class="['coverage', { warn: node.daysHave === 0 }]">{{ coverageText }}</span>
        <span v-else-if="node.sublabel" class="coverage">{{ node.sublabel }}</span>
      </div>
      <button type="button" class="pop-close" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="14" /></button>
    </div>

    <template v-if="node.kind === 'category'">
      <div class="pop-row">
        <span>{{ t.include }}</span>
        <button type="button" class="mat-switch" role="switch" :aria-checked="node.included" :aria-label="t.include"
          @click="emit('set-category', !node.included)"></button>
      </div>
      <p v-if="node.badge" class="pop-note">{{ t.attachments(node.badge) }}</p>
      <p v-if="node.category === 'personal_note'" class="pop-note">{{ t.noteHint }}</p>
      <template v-if="node.expandable && node.included">
        <div class="pop-block">
          <span class="pop-label">{{ t.days }}</span>
          <SegmentTrack compact fill :items="dayItems" :model-value="shownDayChoice(node.daysBefore ?? 0, CATEGORY_DAY_CHOICES)" :aria-label="t.days"
            @update:model-value="(days) => emit('set-days', Number(days))" />
        </div>
        <div class="pop-row">
          <span>{{ t.includeDay }}</span>
          <button type="button" class="mat-switch" role="switch" :aria-checked="node.includeDay ?? false" :aria-label="t.includeDay"
            @click="emit('set-include-day', !(node.includeDay ?? false))"></button>
        </div>
        <button type="button" class="pop-action" @click="emit('toggle-expand')">
          <Icon :name="node.expanded ? 'chevron-down' : 'grid'" :size="14" />{{ node.expanded ? t.collapse : t.expand }}
        </button>
      </template>
    </template>

    <div v-else-if="node.kind === 'metric'" class="pop-row">
      <span>{{ t.include }}</span>
      <button type="button" class="mat-switch" role="switch" :aria-checked="node.included" :aria-label="node.included ? t.drop : t.keep"
        @click="emit('set-metric', !node.included)"></button>
    </div>
  </div>
</template>

<style scoped>
.popover {
  position: absolute;
  z-index: 6;
  display: grid;
  width: 288px;
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
  border-radius: var(--radius-md);
  overscroll-behavior: contain;
  animation: pop-in .26s var(--ease-out);
}
@keyframes pop-in { from { opacity: 0; scale: .96; } }
.pop-head { display: flex; align-items: flex-start; gap: 10px; color: var(--ink); }
.pop-icon { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border-radius: 50%; background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--accent); }
.pop-title { display: grid; flex: 1; min-width: 0; gap: 2px; }
.pop-title strong { font-size: var(--fs-md); font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.coverage { color: var(--subtle); font-size: var(--fs-xs); }
.coverage.warn { color: var(--warning); }
.pop-close { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.pop-close:hover { background: var(--glass-press); color: var(--ink); }
.pop-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink); font-size: var(--fs-sm); }
.pop-block { display: grid; gap: 8px; }
.pop-label { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.pop-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
.pop-action {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 999px;
  background: var(--cap-thumb);
  box-shadow: var(--cap-thumb-rim);
  color: var(--ink);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: scale var(--dur-fast) var(--ease-out);
}
.pop-action:active { scale: .97; }
@media (prefers-reduced-motion: reduce) { .popover { animation: none; } }
</style>
