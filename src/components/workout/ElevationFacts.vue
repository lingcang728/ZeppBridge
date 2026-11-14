<script setup lang="ts">
/* 海拔起伏概览（2026-11-14 用户：爬升卡平路时只剩孤零零一句话）。爬升卡和大档海拔卡共用这一份，不各写一遍。
   四格事实：累计上升 / 累计下降 / 最大落差 / 海拔范围；下面一条坡度分布（lib/elevationProfile）。
   缺哪个数就写「—」，不编；坡度分布算不出来就整条不画。只要分布条时传 facts=false。
   坡度分布「怎么算的」那句（t.how）由爬升卡放进它自己的说明里。 */
import { computed } from 'vue';
import ShareBar, { type ShareSegment } from './ShareBar.vue';
import { formatNumber } from '../../lib/format';
import type { SlopeShare } from '../../lib/elevationProfile';
import { elevationUnitLabel, toElevation } from '../../lib/units';
import { useMessages } from '../../i18n';
import { elevationFactsMessages } from './ElevationFacts.i18n';

export interface ElevationRelief { min: number | null; max: number | null; gain: number | null; loss: number | null }

const props = withDefaults(defineProps<{ relief?: ElevationRelief | null; slope: SlopeShare | null; facts?: boolean }>(), { relief: null, facts: true });
const t = useMessages(elevationFactsMessages);

const height = (meters: number | null | undefined) => (meters == null || !Number.isFinite(meters)
  ? '—'
  : formatNumber(toElevation(meters), { maximumFractionDigits: 0 }));

const cells = computed(() => {
  const r = props.relief;
  const hasRange = r && r.min !== null && r.max !== null && r.max >= r.min;
  return [
    { key: 'ascent', label: t.value.ascent, value: height(r?.gain), unit: r?.gain != null },
    { key: 'descent', label: t.value.descent, value: height(r?.loss), unit: r?.loss != null },
    { key: 'drop', label: t.value.drop, value: hasRange ? height(r.max! - r.min!) : '—', unit: Boolean(hasRange) },
    { key: 'range', label: t.value.range, value: hasRange ? `${height(r.min)}–${height(r.max)}` : '—', unit: Boolean(hasRange) },
  ];
});

const segments = computed<ShareSegment[] | null>(() => (props.slope ? [
  { key: 'up', label: t.value.up, seconds: props.slope.up, color: 'var(--altitude)' },
  { key: 'flat', label: t.value.flat, seconds: props.slope.flat, color: 'var(--route-mint)' },
  { key: 'down', label: t.value.down, seconds: props.slope.down, color: 'var(--pace)' },
] : null));
</script>

<template>
  <div class="elevation-facts" :aria-label="t.aria">
    <dl v-if="facts" class="cells">
      <div v-for="cell in cells" :key="cell.key">
        <dt>{{ cell.label }}</dt>
        <dd><strong>{{ cell.value }}</strong><em v-if="cell.unit">{{ elevationUnitLabel() }}</em></dd>
      </div>
    </dl>
    <ShareBar v-if="segments" :title="t.slopeTitle" :segments="segments" />
  </div>
</template>

<style scoped>
.elevation-facts { display: grid; gap: 14px; min-width: 0; container-type: inline-size; }
.cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; }
.cells div { display: flex; flex-direction: column-reverse; gap: 2px; min-width: 0; padding: 2px 12px; }
.cells div:first-child { padding-left: 2px; }
.cells div + div { border-left: 1px solid var(--mat-line); }
.cells dt { overflow: hidden; color: var(--subtle); font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
.cells dd { display: flex; align-items: baseline; gap: 3px; margin: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cells strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-2xl); font-weight: 600; line-height: 1.2; }
.cells em { color: var(--subtle); font-size: var(--fs-2xs); font-style: normal; }
@container (max-width: 420px) {
  .cells { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 10px; }
  .cells div:nth-child(3) { padding-left: 2px; border-left: 0; }
}
</style>
