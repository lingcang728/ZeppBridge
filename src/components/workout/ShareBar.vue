<script setup lang="ts">
/* 一条按时长分段的占比条 + 图例（坡度分布、心率各区间时长）。只排版，数由调用方给。
   占比为 0 的段不画条、图例照列（「下坡 0%」也是信息）。 */
import { computed } from 'vue';

export interface ShareSegment { key: string; label: string; seconds: number; color: string }

const props = defineProps<{ title: string; segments: ShareSegment[] }>();

const clock = (seconds: number) => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const rows = computed(() => {
  const total = props.segments.reduce((sum, segment) => sum + Math.max(0, segment.seconds), 0);
  return props.segments.map((segment) => {
    const share = total > 0 ? Math.max(0, segment.seconds) / total : 0;
    return { ...segment, share, percent: `${Math.round(share * 100)}%`, time: clock(segment.seconds) };
  });
});
</script>

<template>
  <div class="share-bar" role="group" :aria-label="title">
    <p class="share-title">{{ title }}</p>
    <div class="bar" aria-hidden="true">
      <span v-for="row in rows" v-show="row.share > 0" :key="row.key" :style="{ flexGrow: row.share, background: row.color }" />
    </div>
    <ul class="legend">
      <li v-for="row in rows" :key="row.key">
        <i :style="{ background: row.color }" />
        <span class="name">{{ row.label }}</span>
        <strong>{{ row.percent }}</strong>
        <span class="time">{{ row.time }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.share-bar { display: grid; gap: 8px; min-width: 0; }
.share-title { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; }
.bar { display: flex; gap: 2px; height: 8px; overflow: hidden; border-radius: 999px; background: var(--mat-line); }
.bar span { flex-basis: 0; min-width: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.legend li { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
.legend i { flex: none; width: 8px; height: 8px; border-radius: 2px; transform: translateY(-1px); }
.name { color: var(--muted); font-size: var(--fs-2xs); }
.legend strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-xs); font-weight: 600; }
.time { color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); }
</style>
