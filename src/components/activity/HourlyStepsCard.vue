<script setup lang="ts">
/**
 * 每小时步数（Zepp 官方授权才有，旧通道没有这一项）。
 *
 * 官方只回「有步数的小时」：没回的小时就是没有记录，柱子留空，不画成 0。
 * 24 根柱子是纯 CSS——一张图表引擎画 24 个数不值得。
 */
import { computed, onMounted, ref, watch } from 'vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useSyncController } from '../../composables/useSyncController';
import { backend, isDesktop } from '../../lib/bridge';
import { localDateString } from '../../lib/format';
import type { HourlySteps } from '../../types';
import { useMessages } from '../../i18n';
import { hourlyStepsMessages as messages } from './HourlyStepsCard.i18n';

const t = useMessages(messages);
const { dataRevision } = useSyncController();

type Day = 'today' | 'yesterday';
const day = ref<Day>('today');
const rows = ref<HourlySteps[]>([]);
const failed = ref(false);

const dateOf = (which: Day) => {
  const date = new Date();
  if (which === 'yesterday') date.setDate(date.getDate() - 1);
  return localDateString(date);
};

let seq = 0;
const load = async () => {
  if (!isDesktop()) return;
  const mine = ++seq;
  try {
    const next = await backend.getHourlySteps(dateOf(day.value));
    if (mine !== seq) return;
    rows.value = next;
    failed.value = false;
  } catch {
    if (mine !== seq) return;
    rows.value = [];
    failed.value = true;
  }
};
onMounted(() => { void load(); });
watch([day, dataRevision], () => { void load(); });

const byHour = computed(() => new Map(rows.value.map((row) => [row.hour, row.steps])));
const peak = computed(() => Math.max(1, ...rows.value.map((row) => row.steps)));
const total = computed(() => rows.value.reduce((sum, row) => sum + row.steps, 0));
const busiest = computed(() => rows.value.reduce<HourlySteps | null>((best, row) => (!best || row.steps > best.steps ? row : best), null));
const bars = computed(() => Array.from({ length: 24 }, (_, hour) => {
  const steps = byHour.value.get(hour);
  return { hour, steps, height: steps === undefined ? 0 : Math.max(3, Math.round((steps / peak.value) * 100)) };
}));
const format = (value: number) => Math.round(value).toLocaleString();
</script>

<template>
  <section class="hourly-card" :aria-label="t.title">
    <header>
      <span><strong>{{ t.title }}</strong><small>{{ t.source }}</small></span>
      <SegmentTrack
        compact
        :items="[{ value: 'today', label: t.today }, { value: 'yesterday', label: t.yesterday }]"
        :model-value="day"
        :aria-label="t.dayAria"
        @update:model-value="(value) => day = value as Day"
      />
    </header>
    <p v-if="failed" class="hourly-empty" role="alert">{{ t.failed }}</p>
    <p v-else-if="!rows.length" class="hourly-empty">{{ t.empty }}</p>
    <template v-else>
      <p class="hourly-facts">
        <b>{{ format(total) }}</b> {{ t.stepsUnit }}
        <span v-if="busiest"> · {{ t.busiest(busiest.hour, format(busiest.steps)) }}</span>
      </p>
      <ol class="hourly-bars" role="list">
        <li v-for="bar in bars" :key="bar.hour" :title="bar.steps === undefined ? t.noRecord(bar.hour) : t.barTitle(bar.hour, format(bar.steps))">
          <span class="bar" :class="{ empty: bar.steps === undefined }" :style="{ height: `${bar.height}%` }" />
          <small v-if="bar.hour % 6 === 0">{{ bar.hour }}</small>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.hourly-card { display: grid; gap: 12px; padding: 18px 20px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
header span { display: grid; gap: 2px; }
header strong { font-size: var(--fs-md); }
header small, .hourly-empty { color: var(--muted); font-size: var(--fs-xs); }
.hourly-empty { margin: 0; padding: 22px 0; text-align: center; }
.hourly-facts { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.hourly-facts b { color: var(--ink); font-size: 22px; font-variant-numeric: tabular-nums; }
.hourly-bars { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); align-items: end; gap: 3px; height: 120px; margin: 0; padding: 0 0 16px; list-style: none; }
.hourly-bars li { position: relative; display: flex; align-items: flex-end; height: 100%; }
.bar { width: 100%; border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--accent) 78%, transparent); }
.bar.empty { height: 2px !important; background: color-mix(in srgb, var(--ink) 10%, transparent); }
.hourly-bars small { position: absolute; bottom: -16px; left: 0; color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; }
</style>
