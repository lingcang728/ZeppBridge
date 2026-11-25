<script setup lang="ts">
/* 列表的「月」「年」两档：
   - 月（view = 'month'）：按月分组的一格格小卡，组头由列表页用 #head 插槽给（月度分析），格子内容用 #tile 给
     （运动：类型图标 + 轨迹 + 主读数；睡眠：时长 + 评分）；
   - 年（view = 'year'，睡眠用）：一年一块、一列一周（周一在上）、一格一天，那天越久格子越亮；块上方是 #year-head（年度分析）。
     窄窗口里整年横着滚。悬停 / 聚焦的那格放大一圈，上面浮出那天的记录；点一下回到日档、滚到那一天（`day` 事件）。
   每格都带 data-album-id / data-album-day，组和月份标记带 data-timeline（滚动条的年份刻度靠它），换档时靠它们把那一条钉住。 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { byMonth, heatDays, localDay, type AlbumTile } from '../../lib/album/album';
import { armPageMorph } from '../../composables/usePageMorph';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { useYearText } from '../journal/year/year.i18n';

const props = defineProps<{ tiles: AlbumTile[]; view: 'month' | 'year'; kind?: 'workouts' | 'sleep' }>();
const emit = defineEmits<{ day: [day: string, cell: HTMLElement] }>();
defineSlots<{ tile(props: { tile: AlbumTile }): unknown; head?(props: { month: string }): unknown; 'year-head'?(props: { year: number }): unknown }>();
const t = useMessages(albumMessages);
const y = useYearText();

const monthTitle = (month: string) =>
  displayDateTimeFormatter({ year: 'numeric', month: 'long' }).format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));

const groups = computed(() => byMonth(props.tiles));

/* ---------- 全年热图 ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
const heat = computed(() => (props.view === 'year' ? heatDays(props.tiles) : new Map()));
const levelOf = (strength: number) => (strength > 0.75 ? 4 : strength > 0.5 ? 3 : strength > 0.25 ? 2 : 1);
const years = computed(() => {
  if (props.view !== 'year' || !props.tiles.length) return [];
  const days = [...heat.value.keys()].sort();
  const newest = Number(days[days.length - 1].slice(0, 4));
  const oldest = Number(days[0].slice(0, 4));
  const newestMonth = days[days.length - 1].slice(0, 7);
  const oldestMonth = days[0].slice(0, 7);
  const today = localDay(new Date().toISOString());
  const monthName = displayDateTimeFormatter({ month: 'short' });
  const out: { year: number; cells: { key: string; col: number; row: number; hit: ReturnType<typeof heatDays> extends Map<string, infer V> ? V | undefined : never; level: number; future: boolean }[]; months: { key: string; col: number; label: string; inRange: boolean }[]; count: number }[] = [];
  for (let year = newest; year >= oldest; year -= 1) {
    const offset = (new Date(year, 0, 1).getDay() + 6) % 7;
    const length = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
    let count = 0;
    const cells = Array.from({ length }, (_, d) => {
      const date = new Date(year, 0, 1 + d);
      const key = `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const hit = heat.value.get(key);
      if (hit) count += hit.count;
      return { key, col: Math.floor((offset + d) / 7) + 2, row: ((offset + d) % 7) + 2, hit, level: hit ? levelOf(hit.strength) : 0, future: key > today };
    });
    // 新的月份在前（DOM 顺序）：「视口顶上是哪个月」从上往下找，先碰到的是这一年最近的那个月。
    const months = Array.from({ length: 12 }, (_, m) => {
      const key = `${year}-${pad(m + 1)}`;
      const first = Math.round((Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
      return { key, col: Math.floor((offset + first) / 7) + 2, label: monthName.format(new Date(year, m, 1)), inRange: key >= oldestMonth && key <= newestMonth };
    }).reverse();
    out.push({ year, cells, months, count });
  }
  return out;
});
const weekdays = computed(() => {
  const format = displayDateTimeFormatter({ weekday: 'short' });
  // 2024-01-01 是周一。
  return Array.from({ length: 7 }, (_, row) => format.format(new Date(2024, 0, 1 + row)));
});

/* 悬停 / 聚焦的那一格：上面浮一张小签（日期、类型、读数）。 */
const tip = ref<{ year: number; text: string; more: number; left: number; top: number; side: 'start' | 'mid' | 'end' } | null>(null);
const showTip = (event: Event, year: number) => {
  const cell = (event.target as Element | null)?.closest<HTMLElement>('.cell.on');
  const host = (event.currentTarget as HTMLElement).closest<HTMLElement>('.heat-year');
  if (!cell || !host) { tip.value = null; return; }
  const day = heat.value.get(cell.dataset.albumDay ?? '');
  if (!day) { tip.value = null; return; }
  const box = cell.getBoundingClientRect();
  const frame = host.getBoundingClientRect();
  // 靠左 / 靠右的格子：签贴着这一格往里伸，不伸出卡外。
  const left = box.left + box.width / 2 - frame.left;
  const side = left < frame.width * 0.25 ? 'start' : left > frame.width * 0.75 ? 'end' : 'mid';
  tip.value = { year, text: day.lead.label, more: day.count - 1, left, top: box.top - frame.top, side };
};
const hideTip = () => { tip.value = null; };

/* 点月档的一格：详情页从这一格长出来，返回时缩回这一格（不然小格子会退到整个月份那块板上）。 */
const arm = (event: Event) => {
  const el = event.currentTarget as HTMLElement;
  const href = el.getAttribute('href');
  if (href) armPageMorph(el, href, { anySize: true });
};
const onKeyArm = (event: KeyboardEvent) => { if (event.key === 'Enter') arm(event); };
/* 点热图的一格：不进详情，放大回日档并滚到那一天。 */
const pickDay = (day: string, event: Event) => emit('day', day, event.currentTarget as HTMLElement);
</script>

<template>
  <div v-if="view === 'month'" class="album-tiles">
    <section v-for="group in groups" :key="group.month" class="tile-month" :data-album-month="group.month" :data-timeline="group.month">
      <slot name="head" :month="group.month"><h3 class="month-title">{{ monthTitle(group.month) }}</h3></slot>
      <div class="tiles">
        <RouterLink v-for="tile in group.items" :key="tile.id" :to="tile.to" class="tile" data-album-item
          :data-album-id="tile.id" :data-album-day="tile.day" :aria-label="tile.label" :title="tile.label" @pointerdown="arm" @keydown="onKeyArm">
          <slot name="tile" :tile="tile" />
        </RouterLink>
      </div>
    </section>
  </div>
  <div v-else :class="['album-heat', `tone-${kind ?? 'workouts'}`]">
    <section v-for="block in years" :key="block.year" class="heat-year">
      <slot name="year-head" :year="block.year"><h3 class="year-title">{{ block.year }}<small>{{ kind === 'sleep' ? t.nights(block.count) : t.workouts(block.count) }}</small></h3></slot>
      <div class="heat-scroll">
        <div class="heat-board" @pointerover="showTip($event, block.year)" @pointerleave="hideTip" @focusin="showTip($event, block.year)" @focusout="hideTip">
          <span v-for="(label, row) in weekdays" :key="`w${row}`" class="weekday" :style="{ gridRow: row + 2 }" aria-hidden="true">{{ label }}</span>
          <span v-for="month in block.months" :key="month.key" class="month" :style="{ gridColumn: `${month.col} / span 4` }"
            :data-album-month="month.inRange ? month.key : undefined" :data-timeline="month.inRange ? month.key : undefined">{{ month.label }}</span>
          <template v-for="cell in block.cells" :key="cell.key">
            <button v-if="cell.hit" type="button" :class="['cell', 'on', `l${cell.level}`]" data-album-item
              :data-album-id="cell.hit.lead.id" :data-album-day="cell.key" :aria-label="cell.hit.lead.label"
              :style="{ gridColumn: cell.col, gridRow: cell.row }" @click="pickDay(cell.key, $event)" />
            <span v-else :class="['cell', { future: cell.future }]" :data-album-day="cell.key" :style="{ gridColumn: cell.col, gridRow: cell.row }" aria-hidden="true" />
          </template>
        </div>
      </div>
      <div class="legend" aria-hidden="true">
        <span>{{ y.less }}</span><i v-for="level in 5" :key="level" :class="`l${level - 1}`" /><span>{{ y.more }}</span>
      </div>
      <div v-if="tip && tip.year === block.year" class="heat-tip" :class="`at-${tip.side}`" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }" aria-hidden="true">
        <span>{{ tip.text }}</span><b v-if="tip.more > 0">+{{ tip.more }}</b>
      </div>
    </section>
  </div>
</template>

<style scoped>
.album-tiles, .album-heat { display: grid; gap: 30px; padding: 20px 22px 24px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
.month-title { margin: 0 0 8px; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
/* 屏幕外的月份 / 年份不排版也不画（几百格的列表捏密时这一下最省）。 */
.tile-month { content-visibility: auto; contain-intrinsic-size: auto 220px; }
/* 格子放宽、缝拉开：112px / 8px 时一屏十列挤成一片。 */
.tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); }
.tile {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 4px;
  aspect-ratio: 1;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  container-type: inline-size;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  color: inherit;
  text-decoration: none;
  transition: translate var(--dur-base) var(--ease-out), background var(--dur-fast) ease;
}
.tile:hover { translate: 0 -2px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* ---------- 全年热图（颜色和履历页同一组 --cal-*；睡眠换成睡眠蓝） ---------- */
.album-heat { gap: 26px; }
.heat-year { position: relative; min-width: 0; container-type: inline-size; content-visibility: auto; contain-intrinsic-size: auto 190px; }
.year-title { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; color: var(--ink); font-size: var(--fs-md); font-weight: 700; font-variant-numeric: tabular-nums; }
.year-title small { color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
/* 一格多大跟着这一块的宽度走：宽窗口里整年 53 列正好铺满，窄到每格不足 9px 就不再缩、整年横着滚。 */
.heat-scroll { overflow-x: auto; overflow-y: hidden; padding: 8px 4px 6px; margin: -8px -4px 0; scrollbar-width: thin; overscroll-behavior-x: contain; }
.heat-board {
  --c: clamp(9px, calc((100cqi - 44px) / 53 - 3px), 19px);
  display: grid;
  width: max-content;
  grid-template-columns: max-content repeat(53, var(--c));
  grid-template-rows: auto repeat(7, var(--c));
  gap: 3px;
}
.weekday { grid-column: 1; align-self: center; padding-right: 6px; color: var(--subtle); font-size: 10px; line-height: 1; white-space: nowrap; }
.month { grid-row: 1; padding-bottom: 3px; color: var(--muted); font-size: 10px; line-height: 1.2; white-space: nowrap; }
.cell { display: block; width: var(--c); height: var(--c); border-radius: 2.5px; background: var(--cal-0); }
.cell.future { background: var(--cal-future); }
.l0 { --cell: var(--cal-0); }
.l1 { --cell: var(--cal-1); }
.l2 { --cell: var(--cal-2); }
.l3 { --cell: var(--cal-3); }
.l4 { --cell: var(--cal-4); }
.tone-sleep .l1 { --cell: color-mix(in srgb, var(--sleep) 30%, var(--cal-0)); }
.tone-sleep .l2 { --cell: color-mix(in srgb, var(--sleep) 52%, var(--cal-0)); }
.tone-sleep .l3 { --cell: color-mix(in srgb, var(--sleep) 76%, var(--cal-0)); }
.tone-sleep .l4 { --cell: var(--sleep); }
.cell.on { position: relative; padding: 0; border: 0; background: var(--cell); cursor: pointer; transition: scale 160ms var(--ease-out); }
/* 悬停的那一格放大一圈（不发光、不画竖线），和履历页一样。 */
.cell.on:hover, .cell.on:focus-visible { z-index: 1; scale: 1.45; }
.cell.on:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.legend { display: flex; align-items: center; gap: 5px; margin-top: 10px; color: var(--muted); font-size: var(--fs-xs); }
.legend i { width: 10px; height: 10px; border-radius: 2px; background: var(--cell); }
.legend span:first-child { margin-right: 3px; }
.legend span:last-child { margin-left: 3px; }
.heat-tip {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 8px;
  max-width: min(320px, 90cqi);
  padding: 7px 11px;
  transform: translate(-50%, calc(-100% - 8px));
  white-space: nowrap;
  border-radius: 8px;
  background: var(--cal-tip);
  box-shadow: 0 6px 18px #0005, inset 0 0 0 1px var(--mat-line);
  color: var(--ink);
  font-size: var(--fs-sm);
  pointer-events: none;
  animation: tip-in 140ms ease-out;
}
.heat-tip.at-start { transform: translate(-14px, calc(-100% - 8px)); }
.heat-tip.at-end { transform: translate(calc(-100% + 14px), calc(-100% - 8px)); }
.heat-tip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.heat-tip b { color: var(--muted); font-weight: 600; }
@keyframes tip-in { from { opacity: 0; } }
@media (max-width: 420px) {
  .album-tiles, .album-heat { padding-inline: 10px; }
  .tiles { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
}
@media (prefers-reduced-motion: reduce) { .tile, .cell.on { transition: none; } .heat-tip { animation: none; } }
</style>
