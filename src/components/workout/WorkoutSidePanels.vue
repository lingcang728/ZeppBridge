<script setup lang="ts">
/* 运动详情右侧一列：本地解析明细、导出、交给 AI、数据来源。 */
import type { DesignIconName } from '../DesignIcon.vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { ExportFormat, WorkoutMetrics } from '../../composables/useWorkoutDetail';
import { isTauri } from '../../composables/useTauriApi';
import { dataProviderLabel, dataScopeLabel } from '../../lib/labels';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{
  workout: WorkoutMetrics;
  decoded: { label: string; value: string; icon: DesignIconName }[];
  exportBusy: boolean;
  exportedNote: string | null;
  actionError: string | null;
  aiProviderChoices: { value: string; label: string }[];
  aiProviderLabel: string;
  handoffBusy: boolean;
  aiNote: string | null;
  handoffError: string | null;
  deviceName: string;
  syncBadge: string;
}>();
const format = defineModel<ExportFormat>('format', { required: true });
const provider = defineModel<string>('provider', { required: true });
const emit = defineEmits<{ export: []; handoff: [] }>();
const t = useMessages(workoutDetailMessages);
const FORMATS: ExportFormat[] = ['json', 'csv', 'gpx', 'fit'];
</script>

<template>
  <div class="side-col">
    <section class="surface-card side-card decoded-card" :aria-label="t.decodedAria">
      <div class="section-head"><GlyphTile name="structured-data" tone="pace" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowDecoded }}</p><h2>{{ t.decodedTitle }}</h2></div></div>
      <div class="decoded-list">
        <div v-for="metric in decoded" :key="metric.label"><GlyphTile :name="metric.icon" :size="28" plain /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
      </div>
      <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.decodedNote }}</p>
    </section>

    <section class="surface-card side-card" :aria-label="t.exportAria">
      <div class="section-head"><GlyphTile name="document" tone="sleep" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowExport }}</p><h2>{{ t.exportTitle }}</h2></div></div>
      <p class="card-sub">{{ t.exportSub }}</p>
      <SegmentTrack
        fill
        compact
        :items="FORMATS.filter((item) => item !== 'fit' || isTauri()).map((item) => ({ value: item, label: item.toUpperCase() }))"
        :model-value="format"
        :disabled="exportBusy"
        :aria-label="t.exportFormatAria"
        @update:model-value="(value) => { format = value as ExportFormat; }"
      />
      <button class="button primary wide" type="button" :disabled="exportBusy" @click="emit('export')"><GlyphTile name="cloud-output" :size="20" />{{ format === 'fit' ? t.saveFit : t.exportGo(format.toUpperCase()) }}</button>
      <p v-if="exportedNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportedNote }}</p>
      <p v-if="actionError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ actionError }}</p>
    </section>

    <section class="surface-card side-card" :aria-label="t.handoffAria">
      <div class="section-head"><GlyphTile name="handoff" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowHandoff }}</p><h2>{{ t.handoffTitle }}</h2></div></div>
      <p class="card-sub">{{ t.handoffSub }}</p>
      <div class="ai-provider">
        <span>{{ t.handoffTarget }}</span>
        <CapsuleWheel v-model="provider" loop :span="230" :items="aiProviderChoices" :aria-label="t.handoffTargetAria" />
      </div>
      <button class="button primary wide" type="button" :disabled="handoffBusy" @click="emit('handoff')">
        <GlyphTile name="handoff" :size="20" />{{ handoffBusy ? t.preparing : t.handTo(aiProviderLabel) }}
      </button>
      <p v-if="aiNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ aiNote }}</p>
      <p v-if="handoffError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ handoffError }}</p>
    </section>

    <section class="surface-card side-card meta-card" :aria-label="t.provenanceAria">
      <div class="section-head"><GlyphTile name="database" tone="altitude" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowProvenance }}</p><h2>{{ t.provenanceTitle }}</h2></div></div>
      <dl>
        <div><dt>{{ t.provenanceProvider }}</dt><dd>{{ dataProviderLabel() }}</dd></div>
        <div><dt>{{ t.provenanceScope }}</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div>
        <div><dt>{{ t.provenanceSynced }}</dt><dd>{{ syncBadge }}</dd></div>
        <div><dt>{{ t.provenanceRecordId }}</dt><dd>{{ workout.workout_id }}</dd></div>
        <div><dt>{{ t.provenanceDevice }}</dt><dd>{{ deviceName }}</dd></div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.side-col { display: grid; gap: 16px; min-width: 0; }
.side-card { padding: 16px 18px 18px; border-radius: 19px; }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-sm); }
.decoded-list { display: grid; }
.decoded-list > div { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 8px; min-height: 42px; padding: 4px 3px; color: var(--muted); }
.decoded-list > div + div { border-top: 1px solid var(--mat-line); }
.decoded-list span { color: var(--muted); font-size: var(--fs-xs); }
.decoded-list strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.6; }
.wide { width: 100%; min-height: 42px; margin-top: 12px; }
.ai-provider { display: grid; gap: 6px; font-size: var(--fs-sm); color: var(--muted); }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: var(--fs-sm); }
.action-note.ok { color: var(--accent); } .action-note.bad { color: var(--danger); }
.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.meta-card dt { color: var(--muted); font-size: var(--fs-sm); } .meta-card dd { margin: 0; color: var(--ink); font-size: var(--fs-sm); overflow-wrap: anywhere; text-align: right; }
@media (max-width: 1180px) { .side-col { grid-template-columns: repeat(2, minmax(0,1fr)); } .decoded-card { grid-row: span 2; } }
@media (max-width: 760px) { .side-col { grid-template-columns: minmax(0, 1fr); } .decoded-card { grid-row: auto; } }
</style>
