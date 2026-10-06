<script setup lang="ts">
/**
 * 「你的过去」里某一类的逐天页（/ai/past/:category）：最近 N 天一天一行，有数值写数值，有记录没数值写
 * 「有记录」，没有记录写「—」，不补零。顶上一枚玻璃两档决定这一类交不交给 AI；运动这一类每天的那几次
 * 可以单独勾选。（批次 7 会把这一页换成一张张可以翻、可以收进收集箱的牌。）
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import SegmentTrack from '../../components/SegmentTrack.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useBridgeStrip } from '../../composables/useBridgeStrip';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { AI_TASK_CATEGORY_META, categoryLabel } from '../../lib/aiTask/categories';
import { unitLabel } from '../../lib/aiTask/metrics';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { workoutDisplayLabel } from '../../lib/workouts';
import type { AiTaskCategory } from '../../lib/bridge/types';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPastCategory' });
const route = useRoute();
const hub = useAiHub();
const ctl = useAiTaskDraft();
const strips = useBridgeStrip();
const h = useHubText();
const { draft } = ctl;
const KNOWN: AiTaskCategory[] = ['sleep', 'recovery', 'heart_rate', 'workout', 'training', 'body'];
const category = computed<AiTaskCategory | null>(() => {
  const value = String(route.params.category ?? '');
  return (KNOWN as string[]).includes(value) ? value as AiTaskCategory : null;
});
const meta = computed(() => (category.value ? AI_TASK_CATEGORY_META[category.value] : null));
const enabled = computed(() => !!category.value && (draft.value.categories.find((c) => c.category === category.value)?.enabled ?? false));
const includeItems = computed(() => [{ value: 'in', label: h.value.include }, { value: 'out', label: h.value.exclude }]);
const setIncluded = (value: string) => { if (category.value) ctl.setCategoryEnabled(category.value, value === 'in'); };
const days = computed(() => {
  const row = strips.rows.value.find((r) => r.category === category.value);
  return [...(row?.cells ?? [])].slice(-hub.pastDays.value).reverse();
});
const workoutsById = computed(() => new Map(hub.choices.value.map((w) => [w.workout_id, w])));
const dayLabel = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric', weekday: 'short' }).format(parseDisplayDate(date));
const valueText = (value: number, unit: string | null) => `${value.toFixed(unit === 'kg' || unit === 'h' ? 1 : 0)} ${unitLabel(unit ?? '')}`.trim();
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-category-title">
    <PageHeader title-id="ai-category-title" :title="category ? categoryLabel(category) : '—'" :intro="h.categoryIntro(hub.pastDays.value)">
      <SegmentTrack v-if="category" compact :items="includeItems" :model-value="enabled ? 'in' : 'out'" :aria-label="enabled ? h.categoryIncluded : h.categoryExcluded" @update:model-value="setIncluded" />
    </PageHeader>
    <div v-if="category && meta" class="ai-panel" :style="{ '--tint': meta.tint }">
      <ol class="day-list" :class="{ off: !enabled }">
        <li v-for="cell in days" :key="cell.date">
          <time>{{ dayLabel(cell.date) }}</time>
          <span v-if="cell.value !== null" class="value">{{ valueText(cell.value, cell.unit) }}</span>
          <span v-else-if="cell.has" class="presence">{{ h.recorded }}</span>
          <span v-else class="missing">{{ h.noRecord }}</span>
          <span v-if="category === 'workout' && cell.workout_ids.length" class="workouts">
            <button v-for="id in cell.workout_ids" :key="id" type="button" :class="['workout-chip', { on: draft.workout_ids.includes(id) }]"
              :aria-pressed="draft.workout_ids.includes(id)" @click="ctl.toggleWorkout(id)">
              <Icon :name="draft.workout_ids.includes(id) ? 'check' : 'plus'" :size="12" />{{ workoutsById.get(id) ? workoutDisplayLabel(workoutsById.get(id)!) : id }}
            </button>
          </span>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.day-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.day-list li { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; gap: 4px 16px; padding: 10px 4px; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); font-size: var(--fs-sm); }
.day-list li:last-child { border-bottom: 0; }
.day-list time { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.value { color: var(--tint); font-weight: 650; font-variant-numeric: tabular-nums; }
.presence { color: var(--muted); }
.missing { color: var(--subtle); }
.day-list.off .value { color: var(--muted); }
.workouts { display: flex; flex-wrap: wrap; grid-column: 2; gap: 6px; }
.workout-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border: 0; border-radius: 999px; background: var(--mat-inset); color: var(--muted); font: inherit; font-size: var(--fs-2xs); cursor: pointer; transition: background var(--dur-base) ease, color var(--dur-base) ease; }
.workout-chip.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
</style>
