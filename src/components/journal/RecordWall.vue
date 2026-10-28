<script setup lang="ts">
/* PB 墙：5K / 10K / 半马 / 全马各一格，最快的那次大字，下面一行配速、日期、怎么算出来的。整格就是去那次运动的链接
   （形变从这一格出发）。没有就写「还没有」，不编。
   第二、三名是叠在这一格底下的两张小卡（用户 2026-10-28 选的「叠卡」，像 iOS 叠在一起的通知）：平时只露出两条
   薄薄的卡边，一眼看出「后面还有」；点卡边，小卡顺着往下展开成列表，再点原路叠回去。以前是一行「另外 N 次」的
   小字加格内折叠，用户嫌丑、展开生硬，而且同一排别的格子会被网格一起拉高——现在格子顶对齐，只有这一格变高。
   动的只是小卡的 transform 和外框的高度；外框顶边裁切，叠着时小卡藏在格子后面的部分不会透出来。 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import JournalCard from './JournalCard.vue';
import { useJournalText } from './journal.i18n';
import { useRepairText } from './repair.i18n';
import { useLogbook } from '../../composables/useLogbook';
import { clockText } from '../../lib/logbook/clock';
import { journalShortDay } from '../../lib/logbook/display';
import type { Effort } from '../../types/logbook';

const t = useJournalText();
const repair = useRepairText();
const expanded = ref<Record<string, boolean>>({});
const { records } = useLogbook();
const rows = computed(() => records.value?.records ?? []);
const toggle = (key: string) => { expanded.value = { ...expanded.value, [key]: !expanded.value[key] }; };
const pace = (effort: Effort, meters: number) => t.value.pace(clockText(effort.seconds / (meters / 1000)));
const how = (effort: Effort) => (effort.method === 'race' && effort.race_name ? effort.race_name : t.value.methods[effort.method]);
</script>

<template>
  <JournalCard :title="t.records" tone="record">
    <ul class="pb-grid">
      <li v-for="row in rows" :key="row.key" class="pb-cell" :class="{ open: !!expanded[row.key] }" :style="{ '--n': row.runners_up.length }">
        <div class="pb" :class="{ none: !row.best }" :data-morph-card="row.best?.workout_id ? '' : undefined">
          <component :is="row.best?.workout_id ? RouterLink : 'div'" :to="row.best?.workout_id ? `/workouts/${row.best.workout_id}` : undefined" class="pb-main">
            <span class="pb-dist">{{ t.distances[row.key] }}</span>
            <template v-if="row.best">
              <span class="pb-time">{{ clockText(row.best.seconds) }}</span>
              <span class="pb-meta">{{ pace(row.best, row.distance_m) }} · {{ journalShortDay(row.best.date) }}</span>
              <span class="pb-how">{{ how(row.best) }}</span>
            </template>
            <span v-else class="pb-time muted">{{ t.noRecord }}</span>
          </component>
        </div>
        <button v-if="row.runners_up.length" type="button" class="pb-stack" :aria-expanded="!!expanded[row.key]"
          :aria-label="repair.moreRecords(row.runners_up.length)" :title="repair.moreRecords(row.runners_up.length)" @click="toggle(row.key)">
          <span v-for="(effort, i) in row.runners_up" :key="`${effort.date}-${effort.seconds}`" class="pb-runner" :style="{ '--i': i }">
            <b class="pb-rank">{{ i + 2 }}</b>
            <span class="pb-runner-time">{{ clockText(effort.seconds) }}</span>
            <small>{{ journalShortDay(effort.date) }}</small>
          </span>
        </button>
      </li>
    </ul>
  </JournalCard>
</template>

<style scoped>
/* 格子顶对齐：一格展开时只有它变高，同一排的别的格子不被拉伸。 */
.pb-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; align-items: start; margin: 0; padding: 0; list-style: none; }
.pb-cell { display: grid; min-width: 0; }
.pb { position: relative; z-index: 2; display: grid; align-content: start; gap: 3px; padding: 0; overflow: hidden; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow); transition: background 160ms ease; }
.pb:has(> a.pb-main:hover) { background: color-mix(in srgb, var(--ink) 4%, var(--mat-inset)); }
.pb-main { display: grid; gap: 8px; padding: 20px 16px; color: inherit; text-decoration: none; min-width: 0; }
.pb-dist { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.pb-time { color: var(--ink); font-family: var(--font-mono); font-size: clamp(30px, 2.2vw, 34px); line-height: 1.15; font-variant-numeric: tabular-nums; text-decoration: none; }
a.pb-main:hover .pb-time { color: var(--accent); }
.pb-time.muted { color: var(--subtle); font-family: inherit; font-size: var(--fs-md); }
.pb-meta { white-space: nowrap; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pb.none { outline: 1px dashed var(--mat-line); box-shadow: none; }
.pb-how { justify-self: start; padding: 2px 8px; border-radius: 99px; background: var(--mat-card); color: var(--subtle); font-size: var(--fs-2xs); overflow-wrap: anywhere; }

/* 叠卡：--h 小卡高、--g 间距、--peek 叠着时每张露出的卡边。小卡平时的位置就是展开后的位置，叠起来靠 transform：
   往上收到格子底下、只露出底边，越靠后越窄（以底边为原点缩小），像一叠通知。外框顶边 clip，收上去的部分看不见。 */
.pb-stack { --h: 40px; --g: 6px; --peek: 6px; position: relative; z-index: 1; display: block; width: 100%; height: calc(var(--n) * var(--peek) + 4px);
  margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
  clip-path: inset(0 -24px -24px -24px); transition: height 480ms var(--ease-out); }
.pb-cell.open .pb-stack { height: calc(var(--n) * (var(--h) + var(--g)) + 4px); }
.pb-cell:not(.open) .pb-stack:hover { --peek: 9px; }
.pb-stack:focus-visible { outline: none; }
.pb-stack:focus-visible .pb-runner { box-shadow: var(--cap-track-shadow), 0 0 0 2px var(--focus); }
.pb-runner { position: absolute; left: 0; right: 0; top: calc(var(--g) + var(--i) * (var(--h) + var(--g))); z-index: calc(10 - var(--i)); box-sizing: border-box;
  display: flex; align-items: center; gap: 10px; height: var(--h); padding: 0 14px; border-radius: 12px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow);
  transform-origin: 50% 100%;
  transform: translateY(calc((var(--i) + 1) * var(--peek) - var(--h) - var(--g) - var(--i) * (var(--h) + var(--g)))) scale(calc(1 - (var(--i) + 1) * .05));
  transition: transform 480ms var(--ease-out) calc((var(--n) - 1 - var(--i)) * 40ms), background 160ms ease; }
.pb-cell.open .pb-runner { transform: none; transition-delay: calc(var(--i) * 50ms), 0ms; }
.pb-cell.open .pb-stack:hover .pb-runner { background: color-mix(in srgb, var(--ink) 4%, var(--mat-inset)); }
/* 字只在展开时出现：叠着的卡边上不挤半行字。收的时候字先走，展开时卡落定前一点才浮上来。 */
.pb-runner > * { opacity: 0; transition: opacity 140ms ease; }
.pb-cell.open .pb-runner > * { opacity: 1; transition: opacity 220ms ease calc(180ms + var(--i) * 60ms); }
.pb-rank { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--mat-card); color: var(--subtle); font-size: var(--fs-2xs); font-weight: 650; }
.pb-runner-time { flex: 1; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.pb-runner small { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .pb-stack, .pb-runner, .pb-runner > * { transition: none; } }
@media (max-width: 1100px) { .pb-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 460px) { .pb-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
