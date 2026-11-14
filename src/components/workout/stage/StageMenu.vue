<script setup lang="ts">
/**
 * 窗口顶上「•••」点开的菜单（台前调度，2026-11-13）。
 *
 * 用户 11-13 定：选项砍到最少——大小 / 比例档、只看这一张、全屏、收进侧栏。「移出组合」直接拖出去，
 * 「隐藏」和收进侧栏是一回事，「放到旁边」从侧栏拖进来，都不再进菜单。
 *
 * 第二轮（同日录屏：点开背景跳、比例档没玻璃、三颗胶囊丑）：
 * - 整块是一块液态玻璃（.glass-control.is-lens-host：毛玻璃垫在 ::before，SegmentTrack 的透镜看得见背后的页面），
 *   从「•••」那颗胶囊长出来、收回去（menuMorph.ts，面板本身不缩放不淡入，不打断背景取样）。
 * - 档位用 SegmentTrack：拖边拖出来的比例不在任何一档上时，滑块停在最近的那档、画成「未选」，打开那一刻就在。
 * - 动作是带图标的菜单行，悬停是行内一层淡亮，不再是三颗各自发灰的胶囊。
 *
 * 开了焦点落在第一项，Esc 关（舞台把焦点还给「•••」）；点菜单外面由舞台关。挑档时滑块先滑过去，
 * 舞台稍后才真的换档（StageShell.pickSnap）。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Icon, { type IconName } from '../../Icon.vue';
import SegmentTrack, { type SegmentItem } from '../../SegmentTrack.vue';
import { useMessages } from '../../../i18n';
import { stageMessages } from './stage.i18n';

type Act = 'solo' | 'full' | 'exitFull' | 'tuck';
const props = defineProps<{
  title: string;
  x: number;
  y: number;
  /** 「•••」相对菜单左上角的矩形（l,t,w,h），开合从它长出来、收回去。 */
  from: string;
  count: number;
  /** 最近的那一档。 */
  snap: number;
  /** 正好落在这一档上（拖边拖出来的比例不在档上时为假：滑块画成未选）。 */
  exact: boolean;
  full: boolean;
}>();
const emit = defineEmits<{
  act: [kind: Act];
  snap: [snap: number];
  close: [];
}>();
const t = useMessages(stageMessages);
const root = ref<HTMLElement | null>(null);

const sizes = computed<SegmentItem<number>[]>(() => {
  const m = t.value;
  if (props.count === 1) return [{ value: 0, label: m.sizeStandard }, { value: 1, label: m.sizeWide }];
  if (props.count === 2) return ['1 : 1', '2 : 1', '1 : 2'].map((label, value) => ({ value, label }));
  if (props.count === 4) {
    return [
      { value: 0, label: m.grid, short: m.gridShort, title: m.grid },
      { value: 1, label: m.oneOverThree, short: m.oneOverThreeShort, title: m.oneOverThree },
      { value: 2, label: m.bigLeft, short: m.bigLeftShort, title: m.bigLeft },
    ];
  }
  return [
    { value: 0, label: m.mainLeft, short: m.mainLeftShort, title: m.mainLeft },
    { value: 1, label: m.mainRight, short: m.mainRightShort, title: m.mainRight },
    { value: 2, label: m.mainTop, short: m.mainTopShort, title: m.mainTop },
  ];
});
/** 滑块停在哪一档（点下去先滑过去，舞台稍后才真的换档）。没落在档上时是 -1，滑块以未选样子停在最近那档。 */
const chosen = ref(props.exact ? props.snap : -1);
watch(() => [props.snap, props.exact] as const, ([snap, exact]) => { chosen.value = exact ? snap : -1; });
const pick = (index: number) => {
  if (chosen.value === index) return;
  chosen.value = index;
  emit('snap', index);
};
const actions = computed<{ kind: Act; label: string; icon: IconName }[]>(() => {
  const m = t.value;
  const rows: { kind: Act; label: string; icon: IconName }[] = [];
  if (props.count > 1 && !props.full) rows.push({ kind: 'solo', label: m.solo, icon: 'cards' });
  rows.push(props.full ? { kind: 'exitFull', label: m.exitFull, icon: 'undo' } : { kind: 'full', label: m.full, icon: 'monitor' });
  rows.push({ kind: 'tuck', label: m.tuck, icon: 'arrow-left' });
  return rows;
});

onMounted(() => { void nextTick(() => root.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })); });

/** ↑ / ↓ 在几行之间走（档位那一行自己用 ← / →）。 */
const step = (event: KeyboardEvent) => {
  const rows = Array.from(root.value?.querySelectorAll<HTMLElement>('.menu-row') ?? []);
  const at = rows.findIndex((row) => row.contains(document.activeElement));
  const next = rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
  (next?.matches('button') ? next : next?.querySelector<HTMLElement>('button[tabindex="0"], button'))?.focus();
};
</script>

<template>
  <div
    ref="root"
    class="stage-menu glass-control is-lens-host"
    role="menu"
    :aria-label="t.menu(title)"
    :style="{ left: `${x}px`, top: `${y}px` }"
    :data-from="from"
    @keydown.esc.stop.prevent="emit('close')"
    @keydown.down.prevent="step"
    @keydown.up.prevent="step"
  >
    <div class="menu-inner">
      <div v-if="!full" class="menu-row menu-seg">
        <SegmentTrack
          compact
          fill
          :items="sizes"
          :model-value="chosen"
          :placeholder="snap"
          :aria-label="count === 1 ? t.size : t.split"
          @update:model-value="pick"
        />
      </div>
      <div v-if="!full" class="menu-sep" aria-hidden="true"></div>
      <button
        v-for="row in actions"
        :key="row.kind"
        type="button"
        role="menuitem"
        class="menu-row menu-action"
        @click="emit('act', row.kind)"
      >
        <Icon :name="row.icon" :size="16" />
        <span>{{ row.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage-menu.glass-control {
  position: absolute;
  z-index: 1000;
  width: 260px;
  border-radius: 22px;
  /* 投影画在玻璃层上（随裁切一起长出来），面板本身不带：不然开合途中整块投影先出现。 */
  box-shadow: none;
}
.stage-menu.glass-control.is-lens-host::before { box-shadow: var(--glass-rim), var(--glass-shadow); }
.menu-inner { display: grid; gap: 2px; padding: 6px; border-radius: inherit; }
.menu-seg { display: flex; min-width: 0; padding: 2px 2px 4px; }
.menu-seg :deep(.segment-track) { flex: 1; max-width: 100%; }
.menu-sep { height: 1px; margin: 2px 10px 4px; background: var(--mat-line); }
.menu-action {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease;
}
.menu-action :deep(svg) { flex: none; color: var(--muted); }
.menu-action:hover, .menu-action:focus-visible { background: color-mix(in srgb, var(--ink) 8%, transparent); outline: none; }
.menu-action:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.menu-action:active { background: color-mix(in srgb, var(--ink) 13%, transparent); }
@media (prefers-reduced-motion: reduce) { .menu-action { transition: none; } }
</style>
