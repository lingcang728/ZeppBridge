<script setup lang="ts">
/* 运动详情右侧一列：本地解析明细、导出与分享；来源信息由页面决定放哪列。
   第三轮 B6：「交给 AI」挪到头部右上角的「问 AI」胶囊（和睡眠详情同一个组件、同一个位置），这里不再分两档。 */
import { computed } from 'vue';
import type { DesignIconName } from '../DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';
import type { MetricRole } from '../../lib/workoutGlyphs';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { ExportFormat } from '../../composables/useWorkoutDetail';
import { isTauri } from '../../composables/useTauriApi';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  decoded: { label: string; value: string; icon: DesignIconName; tone: GlyphTone; role: MetricRole }[];
  exportBusy: boolean;
  exportedNote: string | null;
  actionError: string | null;
}>();
const format = defineModel<ExportFormat>('format', { required: true });
const emit = defineEmits<{ export: [] }>();
const t = useMessages(workoutDetailMessages);
const FORMATS: ExportFormat[] = ['json', 'csv', 'gpx', 'fit'];
/* 已解码参数：有值的行在前；没值的不再一行一个「未提供」，折成底部一行（和头部那行同一句话，第三轮 B5）。 */
const blank = (value: string) => value === t.value.notProvided || value === '—' || !value.trim();
const present = computed(() => props.decoded.filter((metric) => !blank(metric.value)));
const missingLine = computed(() => {
  const missing = props.decoded.filter((metric) => blank(metric.value)).map((metric) => metric.label);
  return missing.length ? t.value.missingMetrics(missing.join(' · ')) : null;
});
</script>

<template>
  <div class="side-col">
    <section class="surface-card side-card decoded-card" :aria-label="t.decodedAria">
      <div class="section-head"><GlyphTile name="structured-data" tone="pace" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowDecoded }}</p><h2>{{ t.decodedTitle }}</h2></div></div>
      <div class="decoded-list">
        <div v-for="metric in present" :key="metric.label"><GlyphTile :name="metric.icon" :tone="metric.tone" :role="metric.role" :size="22" /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
      </div>
      <p v-if="missingLine" class="decoded-missing">{{ missingLine }}</p>
      <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.decodedNote }}</p>
    </section>

    <section class="surface-card side-card deliver-card" :aria-label="t.exportAria">
      <div class="section-head"><GlyphTile name="document" tone="sleep" :size="40" /><div><h2>{{ t.exportTitle }}</h2></div></div>
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

    <slot name="after" />
  </div>
</template>

<style scoped>
.side-col { display: grid; gap: 16px; min-width: 0; }
.side-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-sm); }
.decoded-list { display: grid; }
.decoded-list > div { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 8px; min-height: 42px; padding: 4px 3px; color: var(--muted); }
.decoded-list > div + div { border-top: 1px solid var(--mat-line); }
.decoded-list span { color: var(--muted); font-size: var(--fs-xs); }
.decoded-list strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.decoded-missing { margin: 8px 3px 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.6; }
.wide { width: 100%; min-height: 42px; margin-top: 12px; }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: var(--fs-sm); }
.action-note.ok { color: var(--accent); } .action-note.bad { color: var(--danger); }
/* 两列时解析明细跨两行：多出来的高度全给第二行（来源信息那一格），交付卡按内容高、不被拉长——
   以前两行平分，「交给 AI / 导出与分享」按钮下面空出一大截。 */
@media (max-width: 1180px) { .side-col { grid-template-columns: repeat(2, minmax(0,1fr)); grid-template-rows: auto 1fr; align-items: start; } .decoded-card { grid-row: span 2; align-self: stretch; } }
@media (max-width: 760px) { .side-col { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; } .decoded-card { grid-row: auto; } }
</style>
