<script setup lang="ts">
/**
 * 可折叠的覆盖明细：逐类别 × 逐窗口一行。运动类型、来源、单位都已本地化
 * （见 `lib/aiTask/coverage.ts`），不再露出内部码。默认收起——大多数人看
 * 图谱上的覆盖弧就够了。
 */
import { computed } from 'vue';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { coverageRows, formatBytes } from '../../lib/aiTask/coverage';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ preview: AiTaskPreview }>();

const t = useMessages(defineMessages(
  {
    summary: (bytes: string) => `详细覆盖（数据包约 ${bytes}）`,
    category: '类别', window: '时间窗', coverage: '有数据', sources: '来源', units: '单位',
    days: (have: number, total: number) => `${have}/${total} 天`,
  },
  {
    summary: (bytes: string) => `Coverage details (package ≈ ${bytes})`,
    category: 'Category', window: 'Window', coverage: 'With data', sources: 'Sources', units: 'Units',
    days: (have: number, total: number) => `${have}/${total} days`,
  },
  {
    summary: (bytes: string) => `Cobertura detallada (paquete ≈ ${bytes})`,
    category: 'Categoría', window: 'Ventana', coverage: 'Con datos', sources: 'Orígenes', units: 'Unidades',
    days: (have: number, total: number) => `${have}/${total} días`,
  },
  'components/ai/CoverageDetails',
));

const rows = computed(() => coverageRows(props.preview.coverage, props.preview.workouts));
</script>

<template>
  <details class="details">
    <summary>{{ t.summary(formatBytes(preview.estimated_bytes)) }}</summary>
    <div class="scroll">
      <table>
        <thead>
          <tr><th>{{ t.category }}</th><th>{{ t.window }}</th><th>{{ t.coverage }}</th><th>{{ t.sources }}</th><th>{{ t.units }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :class="{ 'is-missing': row.missing }">
            <td>{{ row.categoryLabel }}<small v-if="row.workoutTitle"> · {{ row.workoutTitle }}</small></td>
            <td class="mono">{{ row.start_date }} ~ {{ row.end_date }}</td>
            <td class="mono">{{ t.days(row.days_with_data, row.days_in_range) }}</td>
            <td>{{ row.sources.join(', ') || '—' }}</td>
            <td>{{ row.units.join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>

<style scoped>
.details { margin-top: 12px; }
.details > summary { color: var(--muted); font-size: var(--fs-sm); cursor: pointer; }
.scroll { margin-top: 8px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { color: var(--subtle); font-weight: 600; white-space: nowrap; }
td { color: var(--ink); }
td small { color: var(--subtle); }
.mono { font-family: var(--font-mono); white-space: nowrap; }
tr.is-missing td { color: var(--subtle); }
</style>
