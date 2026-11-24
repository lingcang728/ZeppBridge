<script setup lang="ts">
/* 「日」这一层捏密之后的两档：
   - 方块（density 1）：按月分组的一格格小卡，内容由列表页用 #tile 插槽给（运动：类型图标 + 轨迹 + 主读数；睡眠：时长 + 分期条）；
   - 日历热图（density 2）：每月一块、七列（周一在前），有记录的那天按类型着色、按时长深浅，点一下进那条记录。
   每格都带 data-album-id / data-album-day，捏合换档时靠它把指针下那一条钉住。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { byMonth, heatDays, monthCells, monthsBetween, type AlbumTile } from '../../lib/album/album';

const props = defineProps<{ tiles: AlbumTile[]; density: 1 | 2 }>();
defineSlots<{ tile(props: { tile: AlbumTile }): unknown }>();

const monthTitle = (month: string, withYear: boolean) =>
  displayDateTimeFormatter(withYear ? { year: 'numeric', month: 'long' } : { month: 'short' })
    .format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));

const groups = computed(() => byMonth(props.tiles));
const heat = computed(() => (props.density === 2 ? heatDays(props.tiles) : new Map()));
const heatMonths = computed(() => {
  if (props.density !== 2 || !props.tiles.length) return [];
  const newest = props.tiles[0].month;
  const oldest = props.tiles[props.tiles.length - 1].month;
  return monthsBetween(newest > oldest ? newest : oldest, newest > oldest ? oldest : newest).map((month) => ({ month, ...monthCells(month) }));
});
</script>

<template>
  <div v-if="density === 1" class="album-tiles">
    <section v-for="group in groups" :key="group.month" class="tile-month" :data-album-month="group.month" :data-timeline="group.month">
      <h3 class="month-title">{{ monthTitle(group.month, true) }}</h3>
      <div class="tiles">
        <RouterLink v-for="tile in group.items" :key="tile.id" :to="tile.to" class="tile" data-album-item
          :data-album-id="tile.id" :data-album-day="tile.day" :aria-label="tile.label" :title="tile.label">
          <slot name="tile" :tile="tile" />
        </RouterLink>
      </div>
    </section>
  </div>
  <div v-else class="album-heat">
    <section v-for="block in heatMonths" :key="block.month" class="heat-month" :data-album-month="block.month" :data-timeline="block.month">
      <h3 class="month-title">{{ monthTitle(block.month, block.month.endsWith('-01') || block.month === heatMonths[0].month) }}</h3>
      <div class="heat-days">
        <span v-for="pad in block.lead" :key="`pad-${pad}`" class="cell pad" aria-hidden="true" />
        <template v-for="day in block.days" :key="day">
          <RouterLink v-if="heat.get(day)" :to="heat.get(day)!.lead.to" class="cell on" data-album-item
            :data-album-id="heat.get(day)!.lead.id" :data-album-day="day" :aria-label="heat.get(day)!.lead.label" :title="heat.get(day)!.lead.label"
            :style="{ '--cell': heat.get(day)!.lead.color, '--k': heat.get(day)!.strength.toFixed(2) }" />
          <span v-else class="cell" :data-album-day="day" aria-hidden="true" />
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.album-tiles, .album-heat { display: grid; gap: 18px; padding: 18px 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
.month-title { margin: 0 0 8px; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
/* 屏幕外的月份不排版也不画（几百格的列表捏密时这一下最省）。 */
.tile-month, .heat-month { content-visibility: auto; contain-intrinsic-size: auto 220px; }
.tiles { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
.tile {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 4px;
  aspect-ratio: 1;
  min-width: 0;
  padding: 10px;
  overflow: hidden;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  color: inherit;
  text-decoration: none;
  transition: translate var(--dur-base) var(--ease-out), background var(--dur-fast) ease;
}
.tile:hover { translate: 0 -2px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.album-heat { grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 16px 18px; }
.heat-month { contain-intrinsic-size: auto 150px; }
.heat-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
.cell { display: block; aspect-ratio: 1; border-radius: 4px; background: color-mix(in srgb, var(--ink) 5%, transparent); }
.cell.pad { background: transparent; }
.cell.on { background: color-mix(in srgb, var(--cell) calc(35% + var(--k) * 65%), transparent); transition: scale var(--dur-fast) var(--ease-out); }
.cell.on:hover { scale: 1.18; }
.cell.on:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
@media (max-width: 420px) {
  .album-tiles, .album-heat { padding-inline: 10px; }
  .tiles { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
}
@media (prefers-reduced-motion: reduce) { .tile, .cell.on { transition: none; } }
</style>
