<script setup lang="ts">
/* 心率区间分布（手表最多下发六段）。台前调度（2026-11-13）起单独一张卡。 */
import GlyphTile from '../GlyphTile.vue';
import { useMessages } from '../../i18n';
import { workoutDetailMessages } from '../../views/WorkoutDetail.i18n';

defineProps<{
  zones: {
    totalLabel: string;
    rows: { index: number; range: string; duration: string; percent: number; percentLabel: string }[];
  };
}>();
const t = useMessages(workoutDetailMessages);
</script>

<template>
  <section class="surface-card hr-zone-card" :aria-label="t.hrZonesAria">
    <div class="section-head">
      <GlyphTile name="heart-rate" :size="40" />
      <div><p class="section-eyebrow">{{ t.eyebrowHrZones }}</p><h2>{{ t.hrZonesTitle }}</h2></div>
      <span class="route-note">{{ t.hrZoneTotal(zones.totalLabel) }}</span>
    </div>
    <div class="hr-zone-bar" role="img" :aria-label="t.hrZoneBarAria">
      <span v-for="row in zones.rows" :key="row.index" :class="['hr-zone-fill', `zone-${row.index}`]" :style="{ width: `${row.percent}%` }"></span>
    </div>
    <ul class="hr-zone-list">
      <li v-for="row in zones.rows" :key="row.index">
        <i :class="['hr-zone-dot', `zone-${row.index}`]"></i>
        <span class="hr-zone-range">{{ row.range }}</span>
        <strong>{{ row.duration }}</strong>
        <em>{{ row.percentLabel }}</em>
      </li>
    </ul>
    <p class="mapping-note"><GlyphTile name="verified" :size="18" />{{ t.hrZonesNote }}</p>
  </section>
</template>

<style scoped>
.hr-zone-card { padding: 22px; }
.section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.route-note { margin-left: auto; color: var(--subtle); font-size: var(--fs-xs); }
.hr-zone-bar { display: flex; overflow: hidden; height: 15px; border-radius: 999px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.hr-zone-fill { min-width: 0; }
.hr-zone-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px 24px; margin: 20px 0 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.hr-zone-list li { display: grid; grid-template-columns: 9px minmax(0, 1fr) auto 4.5em; align-items: center; gap: 10px; font-size: var(--fs-sm); }
.hr-zone-range { color: var(--muted); }
.hr-zone-list strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-weight: 600; white-space: nowrap; }
.hr-zone-list em { min-width: 46px; color: var(--subtle); font-style: normal; text-align: right; }
.hr-zone-dot { width: 9px; height: 9px; border-radius: 3px; }
/* 六段由凉到热，和心率本身的强度方向一致。 */
.zone-0 { background: var(--pace); } .zone-1 { background: var(--route-mint); } .zone-2 { background: var(--training); }
.zone-3 { background: var(--altitude); } .zone-4 { background: var(--calories); } .zone-5 { background: var(--heart); }
.mapping-note { display: flex; align-items: flex-start; gap: 7px; margin: 20px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); color: var(--muted); font-size: var(--fs-2xs); line-height: 1.7; }
</style>
