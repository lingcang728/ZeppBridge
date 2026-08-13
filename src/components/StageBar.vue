<script setup lang="ts">
import { computed } from 'vue';
import { isFiniteNumber } from '../lib/format';

export interface StageItem {
  label: string;
  minutes?: number | null;
  tone: 'deep' | 'light' | 'rem' | 'awake';
}

const props = defineProps<{ stages: StageItem[] }>();

const total = computed(() =>
  props.stages.reduce((sum, stage) => sum + (isFiniteNumber(stage.minutes) ? stage.minutes : 0), 0),
);
const percent = (minutes?: number | null): number =>
  total.value > 0 && isFiniteNumber(minutes) ? Math.max(0, (minutes / total.value) * 100) : 0;
const labelFor = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes)) return '未提供';
  return `${Math.round(minutes)} 分钟`;
};
</script>

<template>
  <div class="stage-block">
    <div class="stage-bar" aria-label="睡眠阶段比例">
      <span
        v-for="stage in stages"
        :key="stage.label"
        :class="stage.tone"
        :style="{ width: `${percent(stage.minutes)}%` }"
      />
    </div>
    <div class="stage-list">
      <div v-for="stage in stages" :key="stage.label">
        <span><i :class="stage.tone"></i>{{ stage.label }}</span>
        <strong>{{ labelFor(stage.minutes) }}</strong>
        <small>{{ isFiniteNumber(stage.minutes) ? `${percent(stage.minutes).toFixed(1)}%` : '—' }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-bar {
  display: flex;
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--line);
}
.stage-bar span { display: block; min-width: 0; }
.deep, i.deep { background: var(--sleep-deep); }
.light, i.light { background: var(--sleep-light); }
.rem, i.rem { background: var(--sleep-rem); }
.awake, i.awake { background: var(--sleep-awake); }
.stage-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--line);
}
.stage-list > div { padding: 12px; background: var(--surface-raised); }
.stage-list span, .stage-list strong, .stage-list small { display: block; }
.stage-list span { color: var(--muted); font-size: 11px; }
.stage-list i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
}
.stage-list strong {
  margin-top: 7px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.stage-list small { margin-top: 2px; color: var(--muted); font-size: 11px; }
@media (max-width: 760px) {
  .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
