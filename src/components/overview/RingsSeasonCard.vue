<script setup lang="ts">
/* 概览上的年轮入口：只在 12 月 15 日到 1 月底出现（那一年的年轮长好了），点进去看那一年。
   别的时候年轮从履历页右上角进。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import GlyphTile from '../GlyphTile.vue';
import { useRingsText } from '../rings/rings.i18n';
import { todayKey } from '../../lib/logbook/display';

defineOptions({ name: 'OverviewRingsSeasonCard' });
const t = useRingsText();

/** 该提醒哪一年；不在季节里是 null。 */
const season = computed(() => {
  const [y, m, d] = todayKey().split('-').map(Number);
  if (m === 12 && d >= 15) return y;
  if (m === 1) return y - 1;
  return null;
});
</script>

<template>
  <RouterLink v-if="season" class="metric-panel rings-season" :to="{ name: 'Rings', query: { year: String(season) } }">
    <svg class="mini-ring" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="17" /><circle r="11.5" /><circle r="6" /><circle class="core" r="1.6" />
    </svg>
    <span class="rs-main">
      <span class="rs-title">{{ t.ready(season) }}</span>
      <span class="rs-hint">{{ t.readyHint }}</span>
    </span>
    <GlyphTile class="rs-go" name="chevron-right" :size="18" />
  </RouterLink>
</template>

<style scoped>
.rings-season { display: flex; align-items: center; gap: 14px; padding: 14px 18px; color: inherit; text-decoration: none;
  background: radial-gradient(320px 160px at 0 100%, color-mix(in srgb, var(--kintsugi) 10%, transparent), transparent 70%), var(--mat-card); }
.mini-ring { flex: none; width: 38px; height: 38px; }
.mini-ring circle { fill: none; stroke: color-mix(in srgb, var(--kintsugi) 55%, transparent); stroke-width: 1.6; }
.mini-ring circle:first-child { stroke: var(--kintsugi); stroke-width: 2.2; }
.mini-ring .core { fill: var(--kintsugi); stroke: none; }
.rs-main { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; }
.rs-title { color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.rs-hint { color: var(--muted); font-size: var(--fs-sm); }
.rs-go { opacity: .7; transition: translate var(--dur-base) var(--ease-out), opacity var(--dur-fast) ease; }
.rings-season:hover .rs-go { opacity: 1; translate: 2px 0; }
</style>
