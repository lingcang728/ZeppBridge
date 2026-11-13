<script setup lang="ts">
/* 导出与分享：JSON / CSV / GPX / FIT（FIT 只在桌面应用里）。台前调度（2026-11-13）起单独一张卡。
   第三轮 B6：「交给 AI」在头部右上角的「问 AI」胶囊，这里不再分两档。
   .deliver-card 类名有人用：落地页演示片（views/landing/film/chapters/read.ts）按它找这张卡。 */
import Icon from '../Icon.vue';
import GlyphTile from '../GlyphTile.vue';
import SegmentTrack from '../SegmentTrack.vue';
import type { ExportFormat } from '../../composables/useWorkoutDetail';
import { isTauri } from '../../composables/useTauriApi';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{ exportBusy: boolean; exportedNote: string | null; actionError: string | null }>();
const format = defineModel<ExportFormat>('format', { required: true });
const emit = defineEmits<{ export: [] }>();
const t = useMessages(workoutDetailMessages);
const FORMATS: ExportFormat[] = ['json', 'csv', 'gpx', 'fit'];
</script>

<template>
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
</template>

<style scoped>
.side-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-sm); }
.wide { width: 100%; min-height: 42px; margin-top: 12px; }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: var(--fs-sm); }
.action-note.ok { color: var(--accent); } .action-note.bad { color: var(--danger); }
</style>
