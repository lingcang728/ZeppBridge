<script setup lang="ts">
/* 年轮区块的全年日历：一列一周（周一在上），一格一天，那天练得越久格子越亮；悬停的那格放大发亮，上面浮出日期和那天练了什么。
   照用户 2026-10-27 给的示例图：小方格、格距留得开、圆角很小，七行星期都标，左下角一条「少 … 多」。
   颜色是 tokens.css 里的 --cal-0…4 五档平涂橙（不和卡片底色混、不发光），今天以后的日子更淡。
   月份、星期的名字交给 Intl 按界面语言出。悬停不画竖线（用户不喜欢竖线）。 */
import { computed, ref } from 'vue';
import { dayOfYear, daysInYear } from '../../../lib/rings/geometry';
import { displayDateTimeFormatter } from '../../../lib/dateTime';
import { journalDay, kmText } from '../../../lib/logbook/display';
import { workoutLabel } from '../../../lib/labels';
import { useJournalText } from '../journal.i18n';
import { useYearText } from './year.i18n';
import type { RingStar, RingYear } from '../../../types/rings';

const props = defineProps<{ year: RingYear; today: string }>();
const j = useJournalText();
const y = useYearText();
const PITCH = 12, CELL = 8.4, LEFT = 30, TOP = 18;

const pad = (n: number) => String(n).padStart(2, '0');
const grid = computed(() => {
  const y = props.year.year;
  const days = daysInYear(y);
  const offset = (new Date(y, 0, 1).getDay() + 6) % 7;
  const byDay = new Map<string, RingStar[]>();
  for (const star of props.year.stars) byDay.set(star.date, [...(byDay.get(star.date) ?? []), star]);
  const seconds = (list: RingStar[]) => list.reduce((sum, s) => sum + (s.duration_s ?? 0), 0);
  const most = Math.max(1, ...[...byDay.values()].map(seconds));
  const cells = Array.from({ length: days }, (_, d) => {
    const date = new Date(y, 0, 1 + d);
    const key = `${y}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const list = byDay.get(key) ?? [];
    const share = Math.sqrt(seconds(list) / most);
    const level = !list.length ? 0 : share > 0.75 ? 4 : share > 0.5 ? 3 : share > 0.25 ? 2 : 1;
    return { key, list, level, future: key > props.today, x: LEFT + Math.floor((offset + d) / 7) * PITCH, y: TOP + ((offset + d) % 7) * PITCH };
  });
  const month = displayDateTimeFormatter({ month: 'short' });
  const months = Array.from({ length: 12 }, (_, m) => ({
    x: LEFT + Math.floor((offset + dayOfYear(`${y}-${pad(m + 1)}-01`)) / 7) * PITCH,
    label: month.format(new Date(y, m, 1)),
  }));
  const weekday = displayDateTimeFormatter({ weekday: 'short' });
  // 2024-01-01 是周一。
  const weekdays = Array.from({ length: 7 }, (_, row) => ({ y: TOP + row * PITCH + CELL / 2, label: weekday.format(new Date(2024, 0, 1 + row)) }));
  return { offset, cells, months, weekdays, width: LEFT + Math.ceil((offset + days) / 7) * PITCH, height: TOP + 7 * PITCH };
});

const box = ref<HTMLElement | null>(null);
const hover = ref<{ index: number; left: number; top: number } | null>(null);
function move(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const scale = grid.value.width / rect.width;
  const ux = (event.clientX - rect.left) * scale, uy = (event.clientY - rect.top) * scale;
  const col = Math.floor((ux - LEFT) / PITCH), row = Math.floor((uy - TOP) / PITCH);
  const index = col * 7 + row - grid.value.offset;
  const cell = row >= 0 && row < 7 && col >= 0 ? grid.value.cells[index] : undefined;
  if (!cell) { hover.value = null; return; }
  const host = box.value!.getBoundingClientRect();
  hover.value = { index, left: rect.left - host.left + (cell.x + CELL / 2) / scale, top: rect.top - host.top + (cell.y - 2) / scale };
}
const tip = computed(() => {
  const cell = hover.value ? grid.value.cells[hover.value.index] : null;
  if (!cell) return null;
  return {
    date: journalDay(cell.key),
    lines: cell.list.slice(0, 3).map(s => ({ kind: workoutLabel(s.kind), km: s.distance_m ? j.value.km(kmText(s.distance_m / 1000)) : '' })),
    more: Math.max(0, cell.list.length - 3),
  };
});
const tipLeft = computed(() => {
  const width = box.value?.clientWidth ?? 0;
  return Math.min(Math.max(hover.value?.left ?? 0, 70), Math.max(70, width - 70));
});
</script>

<template>
  <div ref="box" class="year-calendar">
    <svg :viewBox="`0 0 ${grid.width} ${grid.height}`" :style="{ maxWidth: `${grid.width * 1.4}px` }" aria-hidden="true" @pointermove="move" @pointerleave="hover = null">
      <text v-for="m in grid.months" :key="m.label" :x="m.x" y="9" class="label">{{ m.label }}</text>
      <text v-for="w in grid.weekdays" :key="w.label" x="0" :y="w.y" dominant-baseline="central" class="label">{{ w.label }}</text>
      <rect v-for="cell in grid.cells" :key="cell.key" :x="cell.x" :y="cell.y" :width="CELL" :height="CELL" rx="1.8" :class="['day', `l${cell.level}`, { future: cell.future }]" />
      <rect v-if="hover" :key="hover.index" :x="grid.cells[hover.index].x - 2.2" :y="grid.cells[hover.index].y - 2.2" :width="CELL + 4.4" :height="CELL + 4.4" rx="2.6"
        :class="['day', 'lifted', `l${grid.cells[hover.index].level}`]" />
    </svg>
    <div class="legend" aria-hidden="true">
      <span>{{ y.less }}</span><i v-for="level in 5" :key="level" :class="`l${level - 1}`" /><span>{{ y.more }}</span>
    </div>
    <div v-if="tip && hover" class="tip" :style="{ left: `${tipLeft}px`, top: `${hover.top}px` }">
      <b>{{ tip.date }}</b>
      <span v-for="(line, i) in tip.lines" :key="i" class="line"><span>{{ line.kind }}</span>{{ line.km }}</span>
      <span v-if="tip.more" class="line">+{{ tip.more }}</span>
    </div>
  </div>
</template>

<style scoped>
.year-calendar { position: relative; min-width: 0; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
.label { font-size: 8px; fill: var(--muted); }
.l0 { --cell: var(--cal-0); }
.l1 { --cell: var(--cal-1); }
.l2 { --cell: var(--cal-2); }
.l3 { --cell: var(--cal-3); }
.l4 { --cell: var(--cal-4); }
.day { fill: var(--cell); }
.day.future { fill: var(--cal-future); }
.legend i { background: var(--cell); }
/* 悬停的那一格：只是放大一圈，颜色不变、不发光，像示例图里被点中的那天。 */
.day.lifted { pointer-events: none; transform-box: fill-box; transform-origin: center; animation: cell-lift 160ms ease-out; }
@keyframes cell-lift { from { transform: scale(.7); } }
.legend { display: flex; align-items: center; gap: 6px; margin-top: 12px; color: var(--muted); font-size: var(--fs-xs); }
.legend i { width: 11px; height: 11px; border-radius: 2px; }
.legend span:first-child { margin-right: 4px; }
.legend span:last-child { margin-left: 4px; }
.tip { position: absolute; z-index: 2; display: grid; gap: 4px; padding: 8px 12px; transform: translate(-50%, calc(-100% - 10px)); border-radius: 8px;
  background: var(--cal-tip); box-shadow: 0 6px 18px #0005, inset 0 0 0 1px var(--mat-line); color: var(--ink); font-size: var(--fs-sm); white-space: nowrap; pointer-events: none; }
.tip b { font-weight: 600; }
.tip .line { display: flex; gap: 12px; font-variant-numeric: tabular-nums; }
.tip .line span { color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .day.lifted { animation: none; } }
</style>
