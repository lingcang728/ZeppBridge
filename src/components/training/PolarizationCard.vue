<script setup lang="ts">
/**
 * 强度分布（80/20）：最近 7 天、4 周、3 个月各在哪几个心率区间待了多久，
 * 并给出「轻松（区间 1–2）/ 吃力（区间 3–5）」各占多少。区间模型由训练页下面的心率区间卡里选的偏好决定；
 * 没选模型（后端没给报告）就整张卡不显示，不替用户挑模型。
 */
import { computed, onMounted, ref } from 'vue';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { isDesktop } from '../../lib/bridge';
import { backend } from '../../lib/bridge';
import { formatNumber } from '../../lib/format';
import type { HeartRateZoneReport } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages(
  {
    title: '强度分布',
    hint: '轻松 = 区间 1–2，吃力 = 区间 3–5；常见的参考是大约 80% 轻松',
    easy: '轻松',
    hard: '吃力',
    d7: '7 天',
    d28: '4 周',
    d90: '3 个月',
    zone: (n: number) => `区间 ${n}`,
    hours: (value: string) => `${value} 小时`,
    minutes: (value: string) => `${value} 分钟`,
    none: '没有记录',
    aria: '各时间段的心率区间分布',
  },
  {
    title: 'Intensity split',
    hint: 'Easy = zones 1–2, hard = zones 3–5. A common reference is roughly 80% easy',
    easy: 'Easy',
    hard: 'Hard',
    d7: '7 days',
    d28: '4 weeks',
    d90: '3 months',
    zone: (n: number) => `Zone ${n}`,
    hours: (value: string) => `${value} h`,
    minutes: (value: string) => `${value} min`,
    none: 'No data',
    aria: 'Heart-rate zone split for each period',
  },
  {
    title: 'Reparto de intensidad',
    hint: 'Suave = zonas 1–2, intenso = zonas 3–5. Una referencia habitual es cerca de un 80 % suave',
    easy: 'Suave',
    hard: 'Intenso',
    d7: '7 días',
    d28: '4 semanas',
    d90: '3 meses',
    zone: (n: number) => `Zona ${n}`,
    hours: (value: string) => `${value} h`,
    minutes: (value: string) => `${value} min`,
    none: 'Sin datos',
    aria: 'Reparto por zonas de frecuencia cardiaca de cada periodo',
  },
  'components/training/PolarizationCard',
);
const t = useMessages(messages);

const props = defineProps<{ revision?: number }>();

const PERIODS = [7, 28, 90] as const;
const reports = ref<Record<number, HeartRateZoneReport | null>>({});
const loaded = ref(false);

let seq = 0;
const load = async () => {
  if (!isDesktop()) { loaded.value = true; return; }
  const mine = ++seq;
  const results = await Promise.allSettled(PERIODS.map((days) => backend.getHeartRateZones(days)));
  if (mine !== seq) return;
  const next: Record<number, HeartRateZoneReport | null> = {};
  PERIODS.forEach((days, index) => {
    const result = results[index]!;
    next[days] = result.status === 'fulfilled' ? result.value.report ?? null : null;
  });
  reports.value = next;
  loaded.value = true;
};
onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });
void props;

const label = (days: number) => (days === 7 ? t.value.d7 : days === 28 ? t.value.d28 : t.value.d90);
const timeText = (seconds: number) => (seconds >= 3600
  ? t.value.hours(formatNumber(Math.round((seconds / 3600) * 10) / 10))
  : t.value.minutes(formatNumber(Math.round(seconds / 60))));

const rows = computed(() => PERIODS.map((days) => {
  const report = reports.value[days];
  const zones = report?.zones ?? [];
  const total = zones.reduce((sum, zone) => sum + zone.seconds, 0);
  const easy = zones.filter((zone) => zone.zone <= 2).reduce((sum, zone) => sum + zone.seconds, 0);
  return {
    days,
    total,
    easyPercent: total > 0 ? Math.round((easy / total) * 100) : null,
    zones: zones.map((zone) => ({ zone: zone.zone, seconds: zone.seconds, share: total > 0 ? (zone.seconds / total) * 100 : 0 })),
  };
}));
const hasAny = computed(() => rows.value.some((row) => row.total > 0));
const shade = (zone: number) => `color-mix(in srgb, var(--accent) ${[18, 34, 52, 74, 100][Math.min(Math.max(zone, 1), 5) - 1]}%, transparent)`;
</script>

<template>
  <section v-if="loaded && hasAny" class="pol-card" :aria-label="t.title">
    <header>
      <strong>{{ t.title }}</strong>
      <small>{{ t.hint }}</small>
    </header>
    <ul class="pol-rows" :aria-label="t.aria">
      <li v-for="row in rows" :key="row.days">
        <span class="pol-label">{{ label(row.days) }}</span>
        <span v-if="row.total > 0" class="pol-bar" role="img" :aria-label="`${label(row.days)}: ${t.easy} ${row.easyPercent}%`">
          <i v-for="zone in row.zones" :key="zone.zone" :style="{ width: `${zone.share}%`, background: shade(zone.zone) }" :title="`${t.zone(zone.zone)} · ${timeText(zone.seconds)}`" />
        </span>
        <span v-else class="pol-none">{{ t.none }}</span>
        <span class="pol-split">
          <template v-if="row.easyPercent !== null">{{ t.easy }} <b>{{ row.easyPercent }}%</b> · {{ t.hard }} <b>{{ 100 - row.easyPercent }}%</b> · {{ timeText(row.total) }}</template>
        </span>
      </li>
    </ul>
    <p class="pol-legend" aria-hidden="true"><span v-for="zone in [1, 2, 3, 4, 5]" :key="zone"><i :style="{ background: shade(zone) }" />{{ t.zone(zone) }}</span></p>
  </section>
</template>

<style scoped>
.pol-card { display: grid; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: grid; gap: 2px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small { color: var(--subtle); font-size: var(--fs-xs); }
.pol-rows { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.pol-rows li { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 4px 14px; align-items: center; }
.pol-label { color: var(--muted); font-size: var(--fs-xs); }
.pol-bar { display: flex; height: 14px; overflow: hidden; border-radius: 3px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.pol-bar i { display: block; height: 100%; }
.pol-none { color: var(--subtle); font-size: var(--fs-xs); }
.pol-split { grid-column: 2; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pol-split b { color: var(--ink); font-weight: 600; }
.pol-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: var(--subtle); font-size: var(--fs-2xs); }
.pol-legend span { display: inline-flex; align-items: center; gap: 6px; }
.pol-legend i { width: 9px; height: 9px; border-radius: 2px; }
</style>
