<script setup lang="ts">
/**
 * 包裹区：要交给 AI 的数据是六块砖，网格位置永远固定——亮着就是装进包里，
 * 灰掉就是放在外面的搁置架上。点一下切换；拖出去（到架子上 / 出网格）也行，
 * 没走到就松手按弹簧曲线回弹。
 *
 *   标题行：「交给 AI 的数据」+ 全局回溯范围（7/14/30/90，一次改所有类别）+ 撤销胶囊。
 *   砖：图标、类别名、一行覆盖（「9/15 天有数据」）+ 底部 14 天微型覆盖条（一天一格，
 *       亮 = 有数据；没有逐日数据就退化为一行覆盖文案，不猜）。选中是水面从底漫上来的
 *       填充——和概览页 PinPicker 同一套 .fill 写法，只动 transform / opacity，合成器完成。
 *   砖右上齿轮开小弹层：这一类的回溯天数（7/14/30）和「包含运动当天」。
 *   搁置架：灰砖的名单，点一下就带回包里；拖拽中它也是放下的目标（高亮提示）。
 *
 * 砖永远挂载、永远在原位：所以取消选中时水面能顺着退下去，而不是元素跳走。
 * 类别色不进这里——区分靠图标，状态只有品牌绿（带上）和灰（不带）两种。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import GraphUndoPill from './GraphUndoPill.vue';
import type { AiTaskCategory, AiTaskCategoryRange, AiTaskPreview } from '../../lib/bridge/types';
import {
  AI_TASK_CATEGORY_META,
  AI_TASK_CATEGORY_ORDER,
  CATEGORY_DAY_CHOICES,
  categoryLabel,
  categoryRangeOf,
  shownDayChoice,
} from '../../lib/aiTask/categories';
import { categoryCoverage } from '../../lib/aiTask/coverage';
import type { DayRing } from '../../lib/aiTask/dayRing';
import { recentWindowDays } from '../../lib/aiTask/title';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  preview: AiTaskPreview | null;
  canUndo: boolean;
  /** 刚才那一步改了什么（「已移出『睡眠』」）；撤销胶囊把它亮出来几秒。 */
  undoHint: string | null;
  /** 每改一步加一，撤销胶囊靠它重新计时。 */
  undoSeq: number;
}>();
const emit = defineEmits<{ (event: 'undo'): void }>();

const { draft, setCategoryEnabled, setCategoryDays, setIncludeWorkoutDay, setWindowDays } = useAiTaskDraft();

const t = useMessages(defineMessages(
  {
    title: '交给 AI 的数据',
    rangeLabel: '回溯范围',
    days: (n: number) => `${n} 天`,
    undo: '撤销',
    shelf: '搁置架 · 不带',
    restore: (name: string) => `带回「${name}」`,
    include: (name: string) => `带上「${name}」`,
    exclude: (name: string) => `不带「${name}」`,
    settings: (name: string) => `「${name}」的设置`,
    daysLabel: '回溯天数',
    includeDay: '包含运动当天',
    close: '关闭',
    coverage: (have: number, total: number) => `${have}/${total} 天有数据`,
    noData: '这段时间没有数据',
    counting: '正在清点…',
    offTag: '不带',
  },
  {
    title: 'Data for the AI',
    rangeLabel: 'Look-back range',
    days: (n: number) => `${n} days`,
    undo: 'Undo',
    shelf: 'On the shelf · left out',
    restore: (name: string) => `Bring “${name}” back`,
    include: (name: string) => `Include “${name}”`,
    exclude: (name: string) => `Leave out “${name}”`,
    settings: (name: string) => `Settings for “${name}”`,
    daysLabel: 'Look-back days',
    includeDay: 'Include the workout day',
    close: 'Close',
    coverage: (have: number, total: number) => `${have}/${total} days with data`,
    noData: 'No data in this period',
    counting: 'Counting…',
    offTag: 'Left out',
  },
  {
    title: 'Datos para la IA',
    rangeLabel: 'Periodo anterior',
    days: (n: number) => `${n} días`,
    undo: 'Deshacer',
    shelf: 'En el estante · fuera',
    restore: (name: string) => `Recuperar «${name}»`,
    include: (name: string) => `Incluir «${name}»`,
    exclude: (name: string) => `Excluir «${name}»`,
    settings: (name: string) => `Ajustes de «${name}»`,
    daysLabel: 'Días anteriores',
    includeDay: 'Incluir día del entrenamiento',
    close: 'Cerrar',
    coverage: (have: number, total: number) => `${have}/${total} días con datos`,
    noData: 'Sin datos en este periodo',
    counting: 'Contando…',
    offTag: 'Fuera',
  },
  'components/ai/PackageZone',
));

/* —— 全局回溯范围：一次改所有数据类别（从任务名胶囊搬来这里，贴着它管的东西） —— */
const RANGE_CHOICES = [7, 14, 30, 90];
const rangeItems = computed(() => RANGE_CHOICES.map((days) => ({ value: days, label: t.value.days(days) })));
const windowDays = computed(() => shownDayChoice(recentWindowDays(draft.value), RANGE_CHOICES));

/* —— 六块砖：只有数据类别（有窗口概念）进包裹区；个人说明 / 附件在各自的段落里 —— */
const WINDOWED = AI_TASK_CATEGORY_ORDER.filter((category) => AI_TASK_CATEGORY_META[category].hasWindow);

interface Tile {
  category: AiTaskCategory;
  icon: (typeof AI_TASK_CATEGORY_META)[AiTaskCategory]['icon'];
  label: string;
  range: AiTaskCategoryRange;
  enabled: boolean;
  coverageText: string;
  coverageWarn: boolean;
  /** 砖底覆盖条的数据：一天（或几天）一格；对不上窗口时是 null——只留覆盖文案，不猜。 */
  ring: DayRing | null;
}

const tiles = computed<Tile[]>(() => WINDOWED.map((category) => {
  const meta = AI_TASK_CATEGORY_META[category];
  const range = categoryRangeOf(draft.value.categories, category);
  const summary = categoryCoverage(props.preview, category);
  let coverageText = t.value.counting;
  let coverageWarn = false;
  if (summary) {
    coverageWarn = summary.daysWithData === 0;
    coverageText = coverageWarn ? t.value.noData : t.value.coverage(summary.daysWithData, summary.daysInRange);
  }
  return {
    category, icon: meta.icon, label: categoryLabel(category), range, enabled: range.enabled,
    coverageText, coverageWarn, ring: summary?.ring ?? null,
  };
}));

const onShelf = computed(() => tiles.value.filter((tile) => !tile.enabled));

/* —— 单砖设置弹层：天数 + 含运动当天。钉在齿轮下方，一次只开一个 —— */
const settingsFor = ref<AiTaskCategory | null>(null);
const popStyle = ref({ top: '0px', left: '0px' });
const zoneEl = ref<HTMLElement | null>(null);
const settingsTile = computed(() => tiles.value.find((tile) => tile.category === settingsFor.value) ?? null);
const dayItems = computed(() => CATEGORY_DAY_CHOICES.map((days) => ({ value: days, label: t.value.days(days) })));

const toggleSettings = (category: AiTaskCategory, event: MouseEvent) => {
  if (settingsFor.value === category) { settingsFor.value = null; return; }
  const zone = zoneEl.value;
  const gear = event.currentTarget as HTMLElement;
  if (zone) {
    const zr = zone.getBoundingClientRect();
    const br = gear.getBoundingClientRect();
    const width = 248;
    popStyle.value = {
      top: `${br.bottom - zr.top + 6}px`,
      left: `${Math.max(8, Math.min(br.right - zr.left - width + 24, zr.width - width - 8))}px`,
    };
  }
  settingsFor.value = category;
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onKey);
};
const closeSettings = () => {
  settingsFor.value = null;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKey);
};
const onDocPointer = (event: PointerEvent) => {
  const target = event.target as Element | null;
  if (!target || target.closest('.tile-pop') || target.closest('.tile-gear')) return;
  closeSettings();
};
const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeSettings(); };

/* —— 拖拽：拖到搁置架 / 拖出网格 = 排除；中途松手 / 取消 = 弹簧回弹 ——
 * 只动 transform：跟手时 transition 关掉，松手回弹时开 --ease-spring 一条。
 * 没走过门槛的按压算点按（触屏 / 键盘的退路一直在）；pointer capture 挂在
 * 砖的按钮上，指针划出窗口也收得到 up/cancel。 */
const DRAG_THRESHOLD = 8;
/** 网格界外留一点宽容：指尖压着边缘不算「拖出去了」。 */
const GRID_MARGIN = 14;
interface DragState { category: AiTaskCategory; dx: number; dy: number; armed: boolean; returning: boolean }
const drag = ref<DragState | null>(null);
const tilesEl = ref<HTMLElement | null>(null);
const shelfEl = ref<HTMLElement | null>(null);
let press: { category: AiTaskCategory; pointerId: number; startX: number; startY: number } | null = null;
let suppressClick = false;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const pointIn = (rect: DOMRect, x: number, y: number, margin = 0) =>
  x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;

/** 吞咽拖拽落点紧跟着的那个 click，不然「放下」会被读成「再点一下」。 */
const swallowNextClick = () => {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
};

const onTilePointerDown = (tile: Tile, event: PointerEvent) => {
  if (event.button !== 0 || !tile.enabled || drag.value) return;
  press = { category: tile.category, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const onTilePointerMove = (tile: Tile, event: PointerEvent) => {
  if (!press || event.pointerId !== press.pointerId || press.category !== tile.category) return;
  const dx = event.clientX - press.startX;
  const dy = event.clientY - press.startY;
  const current = drag.value;
  if (!current) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    closeSettings();
    drag.value = { category: tile.category, dx, dy, armed: false, returning: false };
    return;
  }
  if (current.returning || current.category !== tile.category) return;
  const overShelf = shelfEl.value
    ? pointIn(shelfEl.value.getBoundingClientRect(), event.clientX, event.clientY) : false;
  const inGrid = tilesEl.value
    ? pointIn(tilesEl.value.getBoundingClientRect(), event.clientX, event.clientY, GRID_MARGIN) : true;
  drag.value = { ...current, dx, dy, armed: overShelf || !inGrid };
};

const finishDrag = (drop: boolean) => {
  press = null;
  const current = drag.value;
  if (!current) return; // 没走过门槛：什么都不是，让 click 正常走
  swallowNextClick();
  if (drop) {
    drag.value = null;
    setCategoryEnabled(current.category, false);
    return;
  }
  drag.value = { ...current, dx: 0, dy: 0, armed: false, returning: true };
  // reduced-motion 下 transition 关掉，没有 transitionend：到点直接收摊，
  // 此时 dx/dy 已是 0，砖看起来就是立刻回了家。
  settleTimer = setTimeout(() => { if (drag.value?.returning) drag.value = null; }, 420);
};

const onTilePointerUp = (tile: Tile, event: PointerEvent) => {
  if (event.pointerId !== press?.pointerId || press.category !== tile.category) return;
  finishDrag(drag.value?.armed ?? false);
};

const onTilePointerCancel = (tile: Tile, event: PointerEvent) => {
  if (event.pointerId !== press?.pointerId || press.category !== tile.category) return;
  finishDrag(false);
};

const onTileTransitionEnd = (tile: Tile, event: TransitionEvent) => {
  if (event.propertyName === 'transform' && drag.value?.returning && drag.value.category === tile.category) {
    clearTimeout(settleTimer);
    drag.value = null;
  }
};

const onTileClick = (tile: Tile) => {
  if (suppressClick) { suppressClick = false; return; }
  setCategoryEnabled(tile.category, !tile.enabled);
};

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKey);
  clearTimeout(settleTimer);
});
</script>

<template>
  <section ref="zoneEl" class="ai-card zone" aria-labelledby="package-zone-title">
    <div class="zone-head">
      <h2 id="package-zone-title" class="zone-title">{{ t.title }}</h2>
      <SegmentTrack compact :items="rangeItems" :model-value="windowDays" :aria-label="t.rangeLabel"
        @update:model-value="(value) => setWindowDays(Number(value))" />
      <GraphUndoPill class="zone-undo" :can-undo="canUndo" :label="t.undo" :hint="undoHint" :seq="undoSeq" @undo="emit('undo')" />
    </div>

    <div ref="tilesEl" class="tiles" role="group" :aria-label="t.title">
      <div v-for="tile in tiles" :key="tile.category"
        :class="['tile', { on: tile.enabled, drag: drag?.category === tile.category, armed: drag?.category === tile.category && drag.armed, settling: drag?.category === tile.category && drag.returning }]"
        :style="drag?.category === tile.category ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined"
        @transitionend="onTileTransitionEnd(tile, $event)">
        <span class="fill" aria-hidden="true"></span>
        <button type="button" class="tile-main" :aria-pressed="tile.enabled"
          :aria-label="tile.enabled ? t.exclude(tile.label) : t.include(tile.label)"
          @pointerdown="onTilePointerDown(tile, $event)"
          @pointermove="onTilePointerMove(tile, $event)"
          @pointerup="onTilePointerUp(tile, $event)"
          @pointercancel="onTilePointerCancel(tile, $event)"
          @click="onTileClick(tile)">
          <span class="tile-glyph" aria-hidden="true"><Icon :name="tile.icon" :size="17" /></span>
          <span class="tile-text">
            <strong>{{ tile.label }}</strong>
            <small v-if="tile.enabled" :class="{ warn: tile.coverageWarn }">{{ tile.coverageText }}</small>
            <small v-else>{{ t.offTag }}</small>
          </span>
          <!-- 14 天覆盖条：一天一格，亮 = 有数据。覆盖文案已在上面，这里纯图形。 -->
          <span v-if="tile.enabled && tile.ring" class="tile-strip" aria-hidden="true">
            <span v-for="(cell, i) in tile.ring.cells" :key="i" class="cell" :class="{ lit: cell > 0 }" :style="{ '--v': cell }"></span>
          </span>
        </button>
        <button v-if="tile.enabled" type="button" class="tile-gear" :aria-label="t.settings(tile.label)"
          :aria-expanded="settingsFor === tile.category" @click="toggleSettings(tile.category, $event)">
          <Icon name="sliders" :size="13" />
        </button>
      </div>
    </div>

    <!-- 搁置架：不带的类别的名单，点一下带回；拖拽中它也是放下目标（hot 高亮）。 -->
    <div v-if="onShelf.length || drag" ref="shelfEl" :class="['shelf', { hot: !!drag?.armed }]">
      <span class="shelf-label">{{ t.shelf }}</span>
      <button v-for="tile in onShelf" :key="tile.category" type="button" class="shelf-chip"
        :aria-label="t.restore(tile.label)" @click="setCategoryEnabled(tile.category, true)">
        <Icon :name="tile.icon" :size="13" />{{ tile.label }}<Icon name="plus" :size="12" class="shelf-plus" />
      </button>
    </div>

    <Transition name="pop">
      <div v-if="settingsTile" class="tile-pop glass-control" role="dialog" :aria-label="t.settings(settingsTile.label)" :style="popStyle">
        <div class="tp-head">
          <Icon :name="settingsTile.icon" :size="15" />
          <strong>{{ settingsTile.label }}</strong>
          <button type="button" class="tp-close" :aria-label="t.close" @click="closeSettings"><Icon name="x" :size="13" /></button>
        </div>
        <p class="tp-label">{{ t.daysLabel }}</p>
        <SegmentTrack compact fill :items="dayItems"
          :model-value="shownDayChoice(settingsTile.range.days_before, CATEGORY_DAY_CHOICES)" :aria-label="t.daysLabel"
          @update:model-value="(value) => setCategoryDays(settingsTile!.category, Number(value))" />
        <div class="tp-row">
          <span>{{ t.includeDay }}</span>
          <button type="button" class="mat-switch" role="switch" :aria-checked="settingsTile.range.include_workout_day"
            :aria-label="t.includeDay"
            @click="setIncludeWorkoutDay(settingsTile!.category, !settingsTile!.range.include_workout_day)"></button>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.zone { position: relative; }
.zone-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 14px; }
.zone-title { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; }
.zone-undo { margin-left: auto; min-height: 32px; }

/* —— 砖：位置固定，状态只有两种——水面漫上来（带上）/ 灰下去（不带） —— */
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tile {
  position: relative;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  transition: background var(--dur-base) ease, box-shadow var(--dur-base) ease, opacity var(--dur-base) ease;
}
.tile.on { background: var(--mat-raised); box-shadow: var(--mat-raised-rim); }
.tile:not(.on) { opacity: .55; }
.tile:not(.on):hover { opacity: .8; }

/* 拖拽：跟手时只改 transform（合成器），阴影给一点「被拿起来」的抬升；
   松手回家走弹簧曲线；预备落架时先灰下去，看到的就是会发生的。 */
.tile.drag { z-index: 3; box-shadow: var(--mat-shadow-lift); }
.tile.drag .tile-main { cursor: grabbing; }
.tile.armed { opacity: .55; }
.tile.settling {
  transition: transform .42s var(--ease-spring),
    background var(--dur-base) ease, box-shadow var(--dur-base) ease, opacity var(--dur-base) ease;
}
.zone:has(.tile.drag) { user-select: none; }

/* 水面：平时压扁在底边，选中时从底边往上漫满；取消时先往下退、最后才淡掉（同 PinPicker）。 */
.fill {
  position: absolute; inset: 0; z-index: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent) 16%, transparent));
  transform: scaleY(0); transform-origin: 50% 100%; opacity: 0;
  transition: transform 340ms cubic-bezier(.3, .7, .2, 1), opacity 200ms ease;
}
.tile.on > .fill { transform: scaleY(1); opacity: 1; }
.tile:not(.on) > .fill { transition: transform 340ms cubic-bezier(.4, 0, .6, 1), opacity 160ms ease 180ms; }

.tile-main {
  position: relative; z-index: 1;
  display: flex; width: 100%; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 12px 40px 12px 12px; border: 0; border-radius: inherit;
  background: transparent; color: inherit; text-align: left; cursor: pointer;
  /* 纵向滚动照常留给页面；横向手势才是拖砖。 */
  touch-action: pan-y;
}
.tile-main:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tile-glyph {
  display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 50%;
  background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--glyph-neutral);
  transition: background var(--dur-base) ease, color var(--dur-base) ease;
}
.tile.on .tile-glyph { background: var(--accent); box-shadow: none; color: var(--accent-ink); }
.tile-text { display: grid; min-width: 0; gap: 1px; line-height: 1.3; }
.tile-text strong { overflow: hidden; color: var(--ink); font-size: var(--fs-sm); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.tile-text small { color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.tile-text small.warn { color: var(--warning); }

/* 砖底覆盖条：一天（窗口长时几天）一格，亮 = 有数据；一格只覆盖到一部分时
   按比例淡一点，不把「三天里有一天」说成整天。 */
.tile-strip { display: flex; flex: 1 1 100%; height: 4px; gap: 2px; margin-top: 2px; }
.tile-strip .cell { flex: 1 1 0; min-width: 0; border-radius: 2px; background: color-mix(in srgb, var(--ink) 12%, transparent); }
.tile-strip .cell.lit { background: var(--accent); opacity: calc(.35 + .65 * var(--v, 1)); }

.tile-gear {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: grid; width: 26px; height: 26px; place-items: center;
  border: 0; border-radius: 50%; background: transparent; color: var(--subtle); cursor: pointer;
}
.tile-gear:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.tile-gear:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* —— 搁置架 —— */
.shelf { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line-strong); transition: border-color var(--dur-fast) ease; }
.shelf.hot { border-color: var(--accent); }
.shelf-label { margin-right: 4px; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; transition: color var(--dur-fast) ease; }
.shelf.hot .shelf-label { color: var(--accent); }
.shelf-chip {
  display: inline-flex; min-height: 30px; align-items: center; gap: 6px; padding: 3px 12px;
  border: 0; border-radius: 999px; background: color-mix(in srgb, var(--ink) 6%, transparent);
  color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
}
.shelf-chip:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }
.shelf-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.shelf-plus { color: var(--subtle); }

/* —— 单砖设置弹层 —— */
.tile-pop {
  position: absolute; z-index: 5; display: grid; width: 248px; gap: 10px; padding: 12px 14px 14px;
  border-radius: var(--radius-md);
}
.tp-head { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: var(--fs-sm); }
.tp-head strong { flex: 1; min-width: 0; }
.tp-close { display: grid; width: 24px; height: 24px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.tp-close:hover { background: var(--glass-press); color: var(--ink); }
.tp-label { margin: 0; color: var(--muted); font-size: var(--fs-2xs); font-weight: 600; }
.tp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink); font-size: var(--fs-sm); }

.pop-enter-active, .pop-leave-active { transition: opacity .2s ease, translate .28s var(--ease-out); }
.pop-enter-from, .pop-leave-to { opacity: 0; translate: 0 -4px; }

@media (max-width: 1500px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .tiles { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) {
  .fill, .tile, .tile.settling, .tile-glyph { transition: none; }
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
