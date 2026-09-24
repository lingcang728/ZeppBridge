<script setup lang="ts">
/**
 * 点节点弹出的小面板：类别给「加/移出 + 天数 + 展开指标」，指标给
 * 「保留/排除」，中心只读。位置跟着节点走、被父容器夹住——
 * 跟着节点动意味着布局在收敛时它会平滑跟过去。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import Icon from '../Icon.vue';
import type { GraphNode } from '../../lib/aiTask/graph/model';
import { CATEGORY_DAY_CHOICES } from '../../lib/aiTask/categories';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  node: GraphNode;
  /** 节点在视口里的屏幕坐标（每帧更新）。 */
  anchor: { x: number; y: number };
  viewport: { width: number; height: number };
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
    noteHint: '在右边第 ② 步里写内容。', close: '关闭',
  },
  {
    include: 'Hand to AI', exclude: 'Leave out', keep: 'Keep this metric', drop: 'Exclude this metric',
    days: 'Look-back', daysOption: (days: number) => `${days} days`,
    includeDay: 'Include the workout day', expand: 'Show metrics', collapse: 'Hide metrics',
    coverage: (have: number, total: number) => `${have}/${total} days with data`,
    noData: 'No data in this window', attachments: (count: number) => `${count} file(s)`,
    noteHint: 'Write the note in step 2 on the right.', close: 'Close',
  },
  {
    include: 'Entregar a la IA', exclude: 'Excluir', keep: 'Conservar', drop: 'Excluir esta métrica',
    days: 'Días atrás', daysOption: (days: number) => `${days} días`,
    includeDay: 'Incluir el día del entrenamiento', expand: 'Ver métricas', collapse: 'Ocultar métricas',
    coverage: (have: number, total: number) => `${have}/${total} días con datos`,
    noData: 'Sin datos en esta ventana', close: 'Cerrar',
  },
  'components/ai/GraphNodePopover',
));

const WIDTH = 236;
const HEIGHT = 240;
const pos = computed(() => ({
  left: Math.min(Math.max(props.anchor.x + 14, 8), Math.max(8, props.viewport.width - WIDTH - 8)),
  top: Math.min(Math.max(props.anchor.y - 20, 8), Math.max(8, props.viewport.height - HEIGHT - 8)),
}));

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="popover ai-card" role="dialog" :aria-label="node.label" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @pointerdown.stop>
    <div class="pop-head">
      <Icon v-if="node.icon" :name="node.icon" :size="15" />
      <strong>{{ node.label }}</strong>
      <span v-if="node.daysHave !== null && node.daysTotal !== null" class="coverage"
        :class="{ warn: node.daysHave === 0 }">
        {{ node.daysHave === 0 ? t.noData : t.coverage(node.daysHave, node.daysTotal) }}
      </span>
      <span class="gap" />
      <button type="button" class="ai-tool" :aria-label="t.close" @click="emit('close')"><Icon name="x" :size="13" /></button>
    </div>
    <p v-if="node.sublabel" class="pop-sub">{{ node.sublabel }}</p>

    <template v-if="node.kind === 'category'">
      <button type="button" :class="['ai-tool', 'toggle', { on: node.included }]" @click="emit('set-category', !node.included)">
        <Icon :name="node.included ? 'circle-check' : 'ring'" :size="14" />
        {{ node.included ? t.exclude : t.include }}
      </button>
      <span v-if="node.badge" class="pop-sub">{{ t.attachments(node.badge) }}</span>
      <p v-if="node.category === 'personal_note'" class="pop-sub">{{ t.noteHint }}</p>
      <template v-if="node.expandable && node.included">
        <p class="pop-label">{{ t.days }}</p>
        <div class="seg" role="radiogroup" :aria-label="t.days">
          <button v-for="days in CATEGORY_DAY_CHOICES" :key="days" type="button" role="radio"
            :aria-checked="node.daysBefore === days" :class="['seg-item', { 'is-on': node.daysBefore === days }]"
            @click="emit('set-days', days)">{{ t.daysOption(days) }}</button>
        </div>
        <label class="pop-check">
          <input type="checkbox" :checked="node.includeDay ?? false"
            @change="emit('set-include-day', ($event.target as HTMLInputElement).checked)" />
          <span>{{ t.includeDay }}</span>
        </label>
        <button type="button" class="ai-tool" @click="emit('toggle-expand')">
          <Icon :name="node.expanded ? 'chevron-down' : 'grid'" :size="13" />{{ node.expanded ? t.collapse : t.expand }}
        </button>
      </template>
    </template>

    <button v-else-if="node.kind === 'metric'" type="button" :class="['ai-tool', 'toggle', { on: node.included }]"
      @click="emit('set-metric', !node.included)">
      <Icon :name="node.included ? 'circle-check' : 'ring'" :size="14" />
      {{ node.included ? t.drop : t.keep }}
    </button>
  </div>
</template>

<style scoped>
.popover { position: absolute; z-index: 5; width: 236px; padding: 12px; }
.pop-head { display: flex; align-items: center; gap: 7px; color: var(--ink); }
.coverage { font-size: var(--fs-xs); color: var(--subtle); }
.coverage.warn { color: var(--warning); }
.gap { flex: 1; }
.pop-sub { margin: 6px 0 0; color: var(--subtle); font-size: var(--fs-xs); }
.pop-label { margin: 10px 0 4px; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.toggle { width: 100%; justify-content: center; margin-top: 10px; }
.toggle.on { border-color: var(--accent); color: var(--accent); }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.seg-item { padding: 4px 0; border: 1px solid var(--line-control); border-radius: 7px; background: var(--surface-raised); color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.seg-item.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
.pop-check { display: flex; align-items: center; gap: 7px; margin: 8px 0; color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.pop-check input { accent-color: var(--accent); }
</style>
