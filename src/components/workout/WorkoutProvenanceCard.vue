<script setup lang="ts">
/* 运动详情的「来源信息」小卡。它放在哪一列由页面按两列实际高度决定（放进更矮的那列），
   两列底部尽量齐平，不再有一边空出一大片。 */
import GlyphTile from '../GlyphTile.vue';
import type { WorkoutMetrics } from '../../composables/useWorkoutDetail';
import { dataProviderLabel, dataScopeLabel } from '../../lib/labels';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{ workout: WorkoutMetrics; deviceName: string; syncBadge: string }>();
const t = useMessages(workoutDetailMessages);
</script>

<template>
  <section class="surface-card meta-card" :aria-label="t.provenanceAria">
    <div class="section-head"><GlyphTile name="database" tone="altitude" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowProvenance }}</p><h2>{{ t.provenanceTitle }}</h2></div></div>
    <dl>
      <div><dt>{{ t.provenanceProvider }}</dt><dd>{{ dataProviderLabel() }}</dd></div>
      <div><dt>{{ t.provenanceScope }}</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div>
      <div><dt>{{ t.provenanceSynced }}</dt><dd>{{ syncBadge }}</dd></div>
      <div><dt>{{ t.provenanceRecordId }}</dt><dd>{{ workout.workout_id }}</dd></div>
      <div><dt>{{ t.provenanceDevice }}</dt><dd>{{ deviceName }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.meta-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
dl { display: grid; gap: 8px; margin: 0; }
dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
dt { color: var(--muted); font-size: var(--fs-sm); }
dd { margin: 0; color: var(--ink); font-size: var(--fs-sm); overflow-wrap: anywhere; text-align: right; }
</style>
