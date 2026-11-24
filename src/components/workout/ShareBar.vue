<script setup lang="ts">
/* 一条按时长分段的占比条 + 图例（坡度分布、心率各区间时长）。只排版，数由调用方给。
   占比为 0 的段不画条、图例照列（「下坡 0%」也是信息）。
   `compact`：只画一条细条（中小尺寸的心率卡、运动列表每一行）；指针停在条上或键盘聚焦时，
   在条上方浮出一块玻璃小卡，逐段写百分比和时长，指着的那一段加亮。 */
import { computed, ref } from 'vue';

export interface ShareSegment { key: string; label: string; seconds: number; color: string }

/** `popEnd`：浮层右对齐（细条贴在右边时，免得浮层伸出卡外）。`passive`：放在链接里（列表行），不单独占一个 Tab 停靠点。 */
const props = defineProps<{ title: string; segments: ShareSegment[]; compact?: boolean; popEnd?: boolean; passive?: boolean }>();

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
const summary = computed(() => `${props.title}: ${rows.value.map((row) => `${row.label} ${row.percent}`).join(', ')}`);

/* 细条上指着哪一段（按横向位置换算成段）：浮层里那一行加亮。 */
const pointed = ref<string | null>(null);
/* 浮层第一次指到 / 聚焦时才画（列表里一千多行，每行先备一块浮层太重）；出现的那一下靠 @starting-style 照样淡入。 */
const armed = ref(false);
const onMove = (event: PointerEvent) => {
  const bar = event.currentTarget as HTMLElement;
  const box = bar.getBoundingClientRect();
  const x = (event.clientX - box.left) / Math.max(1, box.width);
  let acc = 0;
  pointed.value = null;
  for (const row of rows.value) {
    if (row.share <= 0) continue;
    acc += row.share;
    if (x <= acc) { pointed.value = row.key; break; }
  }
};
</script>

<template>
  <div v-if="compact" :class="['share-bar', 'compact', { 'pop-end': popEnd }]" :tabindex="passive ? -1 : 0" role="img" :aria-label="summary" @pointerenter="armed = true" @focusin="armed = true" @pointermove="onMove" @pointerleave="pointed = null">
    <div class="bar" aria-hidden="true">
      <span v-for="row in rows" v-show="row.share > 0" :key="row.key" :class="{ lit: pointed === row.key }" :style="{ flexGrow: row.share, background: row.color }" />
    </div>
    <div v-if="armed" class="share-pop" aria-hidden="true">
      <p class="share-title">{{ title }}</p>
      <ul>
        <li v-for="row in rows" :key="row.key" :class="{ lit: pointed === row.key, dim: pointed && pointed !== row.key }">
          <i :style="{ background: row.color }" />
          <span class="name">{{ row.label }}</span>
          <strong>{{ row.percent }}</strong>
          <span class="time">{{ row.time }}</span>
        </li>
      </ul>
    </div>
  </div>
  <div v-else class="share-bar" role="group" :aria-label="title">
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
.share-title { margin: 0; color: var(--subtle); font-size: var(--share-label, var(--fs-2xs)); font-weight: 600; }
.bar { display: flex; gap: 2px; height: 8px; overflow: hidden; border-radius: 999px; background: var(--mat-line); }
.bar span { flex-basis: 0; min-width: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.legend li { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
.legend i { flex: none; width: 8px; height: 8px; border-radius: 2px; transform: translateY(-1px); }
.name { color: var(--muted); font-size: var(--share-label, var(--fs-2xs)); }
.legend strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--share-value, var(--fs-xs)); font-weight: 600; }
.time { color: var(--subtle); font-family: var(--font-mono); font-size: var(--share-label, var(--fs-2xs)); }

/* 细条：上下各留几像素给指针（条本身只有 5px 高），浮层贴在条的上方。 */
.compact { position: relative; padding-block: 5px; border-radius: 6px; outline: none; cursor: default; }
.compact .bar { height: var(--share-height, 5px); }
.compact .bar span { transition: opacity 160ms ease; }
.compact:hover .bar span:not(.lit), .compact:focus-visible .bar span:not(.lit) { opacity: .78; }
.compact:hover .bar:not(:has(.lit)) span, .compact:focus-visible .bar span { opacity: 1; }
.compact:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
.share-pop {
  position: absolute;
  bottom: calc(100% + 4px);
  inset-inline-start: var(--share-pop-start, 0px);
  z-index: 5;
  display: grid;
  gap: 6px;
  width: max-content;
  max-width: min(260px, 92vw);
  padding: 10px 12px;
  border-radius: 14px;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-rim), var(--glass-shadow);
  opacity: 0;
  translate: 0 4px;
  pointer-events: none;
  transition: opacity 180ms ease, translate 220ms var(--ease-out);
}
.compact.pop-end .share-pop { inset-inline-start: auto; inset-inline-end: 0; }
.compact:hover .share-pop, .compact:focus-visible .share-pop { opacity: 1; translate: 0 0; transition-delay: 120ms; }
@starting-style { .compact:hover .share-pop, .compact:focus-visible .share-pop { opacity: 0; translate: 0 4px; } }
.share-pop ul { display: grid; grid-template-columns: auto auto auto auto; gap: 3px 8px; margin: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.share-pop li { display: contents; }
.share-pop li > * { align-self: center; transition: opacity 140ms ease; }
.share-pop li.dim > * { opacity: .45; }
.share-pop i { width: 8px; height: 8px; border-radius: 2px; }
.share-pop .name { color: var(--muted); font-size: var(--fs-2xs); }
.share-pop strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: var(--fs-xs); font-weight: 650; text-align: end; }
.share-pop .time { font-size: var(--fs-2xs); text-align: end; }
.share-pop li.lit strong { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .share-pop { transition: opacity 120ms ease; translate: none; } }
</style>
