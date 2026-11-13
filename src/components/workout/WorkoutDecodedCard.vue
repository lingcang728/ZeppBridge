<script setup lang="ts">
/* 本地解析明细：有值的行在前；没值的不再一行一个「未提供」，折成底部一行（和头部那行同一句话，第三轮 B5）。
   台前调度（2026-11-13）起单独一张卡（以前和导出一起排在右栏）。 */
import { computed } from 'vue';
import type { DesignIconName } from '../DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';
import type { MetricRole } from '../../lib/workoutGlyphs';
import GlyphTile from '../GlyphTile.vue';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

const props = defineProps<{
  decoded: { label: string; value: string; icon: DesignIconName; tone: GlyphTone; role: MetricRole }[];
}>();
const t = useMessages(workoutDetailMessages);
const blank = (value: string) => value === t.value.notProvided || value === '—' || !value.trim();
const present = computed(() => props.decoded.filter((metric) => !blank(metric.value)));
const missingLine = computed(() => {
  const missing = props.decoded.filter((metric) => blank(metric.value)).map((metric) => metric.label);
  return missing.length ? t.value.missingMetrics(missing.join(' · ')) : null;
});
</script>

<template>
  <section class="surface-card side-card decoded-card" :aria-label="t.decodedAria">
    <div class="section-head"><GlyphTile name="structured-data" tone="pace" :size="40" /><div><p class="section-eyebrow">{{ t.eyebrowDecoded }}</p><h2>{{ t.decodedTitle }}</h2></div></div>
    <div class="decoded-list">
      <div v-for="metric in present" :key="metric.label"><GlyphTile :name="metric.icon" :tone="metric.tone" :role="metric.role" :size="22" /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
    </div>
    <p v-if="missingLine" class="decoded-missing">{{ missingLine }}</p>
    <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.decodedNote }}</p>
  </section>
</template>

<style scoped>
.side-card { padding: 16px 18px 18px; border-radius: var(--radius-lg); container-type: inline-size; }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
/* 卡宽了就排两列（舞台上单独一张时不是一长条）。 */
.decoded-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); column-gap: 24px; }
.decoded-list > div { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; align-items: center; gap: 8px; min-height: 42px; padding: 4px 3px; border-bottom: 1px solid var(--mat-line); color: var(--muted); }
.decoded-list span { color: var(--muted); font-size: var(--fs-xs); }
.decoded-list strong { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.decoded-missing { margin: 8px 3px 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.6; }
</style>
