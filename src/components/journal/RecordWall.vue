<script setup lang="ts">
/* PB 墙：5K / 10K / 半马 / 全马各一格，最快的那次大字，下面一行配速、日期、怎么算出来的，再列其后两次。
   整格就是去那次运动的链接（形变从整格出发）；第二、三名默认收起，格内展开。没有就写「还没有」，不编。
   「另外 N 次」是格子底下一行安静的字加一个小箭头（以前是描边胶囊，用户 2026-10-27 嫌丑）；点开时格子往下长、
   那几行依次浮上来，收起原路缩回（以前 v-if 一下冒出来）。 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
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
const pace = (effort: Effort, meters: number) => t.value.pace(clockText(effort.seconds / (meters / 1000)));
const how = (effort: Effort) => (effort.method === 'race' && effort.race_name ? effort.race_name : t.value.methods[effort.method]);
</script>

<template>
  <JournalCard :title="t.records" tone="record">
    <ul class="pb-grid">
      <!-- 形变认的是整格（带「另外 N 次」那一截）：只标链接的话，回来时窗口落在格子上半截，像是错位了（用户 2026-10-27）。 -->
      <li v-for="row in rows" :key="row.key" class="pb" :class="{ none: !row.best }" :data-morph-card="row.best?.workout_id ? '' : undefined">
        <component :is="row.best?.workout_id ? RouterLink : 'div'" :to="row.best?.workout_id ? `/workouts/${row.best.workout_id}` : undefined" class="pb-main">
          <span class="pb-dist">{{ t.distances[row.key] }}</span>
          <template v-if="row.best">
            <span class="pb-time">{{ clockText(row.best.seconds) }}</span>
            <span class="pb-meta">{{ pace(row.best, row.distance_m) }} · {{ journalShortDay(row.best.date) }}</span>
            <span class="pb-how">{{ how(row.best) }}</span>
          </template>
          <span v-else class="pb-time muted">{{ t.noRecord }}</span>
        </component>
        <template v-if="row.runners_up.length">
          <button type="button" class="pb-toggle" :aria-expanded="!!expanded[row.key]" @click.stop="expanded[row.key] = !expanded[row.key]">
            {{ repair.moreRecords(row.runners_up.length) }}<Icon name="chevron-down" :size="14" class="pb-chev" />
          </button>
          <div class="pb-fold" :class="{ open: expanded[row.key] }" :inert="!expanded[row.key]">
            <div class="pb-fold-inner">
              <ol class="pb-then" :aria-label="t.then">
                <li v-for="(effort, i) in row.runners_up" :key="`${effort.date}-${effort.seconds}`" :style="{ '--i': i }">
                  <span>{{ clockText(effort.seconds) }}</span><small>{{ journalShortDay(effort.date) }}</small>
                </li>
              </ol>
            </div>
          </div>
        </template>
      </li>
    </ul>
  </JournalCard>
</template>

<style scoped>
.pb-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.pb { display: grid; align-content: start; gap: 3px; padding: 0; overflow: hidden; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--cap-track-shadow); }
.pb-dist { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.pb-time { color: var(--ink); font-family: var(--font-mono); font-size: clamp(30px, 2.2vw, 34px); line-height: 1.15; font-variant-numeric: tabular-nums; text-decoration: none; }
a.pb-main:hover .pb-time { color: var(--accent); }
.pb-time.muted { color: var(--subtle); font-family: inherit; font-size: var(--fs-md); }
.pb-meta { white-space: nowrap; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.pb-then { display: grid; gap: 6px; margin: 0; padding: 2px 16px 16px; list-style: none; }
.pb-then li { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums;
  opacity: 0; transform: translateY(-6px); transition: opacity 160ms ease, transform 240ms var(--ease-out); }
.pb-fold.open .pb-then li { opacity: 1; transform: none; transition-delay: calc(90ms + var(--i) * 60ms); }
/* 往下长用 0fr → 1fr：只有两三行，量不出代价；里面那层裁掉，收起时不露半行字。 */
.pb-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 360ms var(--ease-out); }
.pb-fold.open { grid-template-rows: 1fr; }
.pb-fold-inner { min-height: 0; overflow: hidden; }
.pb-then small { color: var(--subtle); }
.pb-main { display: grid; gap: 8px; padding: 20px 16px; color: inherit; text-decoration: none; min-width: 0; }
/* 悬停亮的是整格：只亮链接那块的话，下面「另外 N 次」那一截不亮，中间横出一条直角分界（用户 2026-10-27）。 */
.pb { transition: background 160ms ease; }
.pb:has(> a.pb-main:hover) { background: color-mix(in srgb, var(--ink) 4%, var(--mat-inset)); }
.pb-toggle { justify-self: start; display: inline-flex; align-items: center; gap: 4px; margin: -6px 8px 10px; padding: 4px 8px; border: 0; border-radius: 999px;
  background: none; color: var(--subtle); font: inherit; font-size: var(--fs-xs); cursor: pointer; transition: color var(--dur-fast) ease, background var(--dur-fast) ease; }
.pb-toggle:hover, .pb-toggle[aria-expanded="true"] { color: var(--muted); }
.pb-toggle:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.pb-toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 0; }
.pb-chev { transition: transform 320ms var(--ease-out); }
.pb-toggle[aria-expanded="true"] .pb-chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .pb-fold, .pb-then li, .pb-chev { transition: none; } }
.pb.none { outline: 1px dashed var(--mat-line); box-shadow: none; }
.pb-how { justify-self: start; padding: 2px 8px; border-radius: 99px; background: var(--mat-card); color: var(--subtle); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
@media (max-width: 1100px) { .pb-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 460px) { .pb-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
