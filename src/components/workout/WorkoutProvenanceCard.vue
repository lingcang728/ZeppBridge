<script setup lang="ts">
/* 运动详情的「来源信息」小卡。它放在哪一列由页面按两列实际高度决定（放进更矮的那列），
   两列底部尽量齐平，不再有一边空出一大片。
   #140：用修正过的 .fit 顶替这条运动也在这里——它改的正是「这条数据从哪来」。 */
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import type { WorkoutMetrics } from '../../composables/useWorkoutDetail';
import type { WorkoutFitOverride } from '../../types';
import { dataProviderLabel, dataScopeLabel } from '../../lib/labels';
import { formatDistance } from '../../lib/format';
import { isTauri } from '../../composables/useTauriApi';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{
  workout: WorkoutMetrics;
  deviceName: string;
  syncBadge: string;
  fit: { override: WorkoutFitOverride | null; busy: boolean; note: string | null; error: string | null };
}>();
const emit = defineEmits<{ replaceFit: []; restoreFit: [] }>();
const t = useMessages(workoutDetailMessages);
const desktop = isTauri();
// 从 GPX / Strava / Apple 健康导入的运动（core::storage::imports）：没经过 Zepp 云端。
const imported = (workout: WorkoutMetrics) => workout.type_source === 'imported';
</script>

<template>
  <section class="surface-card meta-card" :aria-label="t.provenanceAria">
    <div class="section-head"><GlyphTile name="database" tone="altitude" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowProvenance }}</p><h2>{{ t.provenanceTitle }}</h2></div></div>
    <dl>
      <div><dt>{{ t.provenanceProvider }}</dt><dd>{{ imported(workout) ? t.provenanceImported : dataProviderLabel() }}</dd></div>
      <div><dt>{{ t.provenanceScope }}</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div>
      <div><dt>{{ imported(workout) ? t.provenanceImportedAt : t.provenanceSynced }}</dt><dd>{{ syncBadge }}</dd></div>
      <div><dt>{{ t.provenanceRecordId }}</dt><dd>{{ workout.workout_id }}</dd></div>
      <div><dt>{{ t.provenanceDevice }}</dt><dd>{{ deviceName }}</dd></div>
      <template v-if="fit.override">
        <div class="fit-row"><dt>{{ t.provenanceFit }}</dt><dd>{{ fit.override.fileName ?? '.fit' }}</dd></div>
        <div v-if="fit.override.originalDistanceM"><dt>{{ t.fitCloudDistance }}</dt><dd>{{ formatDistance(fit.override.originalDistanceM) }}</dd></div>
      </template>
    </dl>
    <div v-if="desktop" class="fit-actions">
      <button class="button secondary" type="button" :disabled="fit.busy" @click="emit('replaceFit')">{{ fit.override ? t.fitReplaceAgain : t.fitReplace }}</button>
      <button v-if="fit.override" class="button secondary" type="button" :disabled="fit.busy" @click="emit('restoreFit')">{{ t.fitRestore }}</button>
    </div>
    <p v-if="fit.note" class="fit-note ok" role="status"><Icon name="circle-check" :size="13" />{{ fit.note }}</p>
    <p v-if="fit.error" class="fit-note bad" role="alert"><Icon name="warning" :size="13" />{{ fit.error }}</p>
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
.fit-row dd { color: var(--accent); }
.fit-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.fit-actions .button { flex: 1 1 auto; min-height: 36px; }
.fit-note { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: var(--fs-sm); }
.fit-note.ok { color: var(--accent); } .fit-note.bad { color: var(--danger); }
</style>
