<script setup lang="ts">
/* 列表左下角的托盘（运动、睡眠列表共用）。
 *
 * - 收起时是一枚玻璃小把手（浮层，留毛玻璃）：左边一根竖着的三点刻度（上 = 年、中 = 月、下 = 日），右边写此刻是哪一档。
 * - 按住上下拖 = 在三档之间吸附切换，走和 Ctrl + 滚轮同一个 `go()`（父组件处理 `zoom` 事件）；
 *   ↑ / ↓ 键也一样。
 * - 单击展开一块小面板：最上面是日 / 月 / 年三档（看得到此刻在哪档、也能直接点），下面放本页操作（插槽）。
 *   面板从把手里长出来，Esc / 再点把手 / 点面板外原路缩回把手。
 * - `mode`：本页进了某个模式（运动列表的「选择记录」）：把手换成「完成」，点一下退出，不展开面板、不能拖。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { trayZoomAt, zoomIndex, ZOOMS, type AlbumZoom } from '../../lib/album/album';

const props = defineProps<{ zoom: AlbumZoom; disabled?: boolean; mode?: { label: string; icon: IconName } | null }>();
const emit = defineEmits<{ zoom: [AlbumZoom]; 'exit-mode': [] }>();
defineSlots<{ actions?(props: { close: () => void }): unknown }>();
const t = useMessages(albumMessages);
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const handle = ref<HTMLButtonElement | null>(null);

const labels = computed<Record<AlbumZoom, string>>(() => ({ day: t.value.day, month: t.value.month, year: t.value.year }));
const items = computed(() => ZOOMS.map((value) => ({ value, label: labels.value[value] })));
/** 拖动中预览的那一档（松手前把手上的点和字先跟着走）。 */
const preview = ref<number | null>(null);
const shownIndex = computed(() => preview.value ?? zoomIndex(props.zoom));
const shownLabel = computed(() => labels.value[ZOOMS[shownIndex.value]!]);
const model = computed({ get: () => props.zoom, set: (value: AlbumZoom) => emit('zoom', value) });

const close = () => { open.value = false; };
const onKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  close();
  handle.value?.focus();
};
const onOutside = (event: PointerEvent) => { if (root.value && !root.value.contains(event.target as Node)) close(); };
watch(open, (value) => {
  if (value) { window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', onOutside, true); }
  else { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onOutside, true); }
});
watch(() => props.mode, (mode) => { if (mode) close(); });

/* ---------- 把手：拖 = 换档，点 = 开合 ---------- */
/** 每拖这么多像素走一档。 */
const PITCH = 30;
let drag: { id: number; y: number; start: number; moved: boolean; last: number } | null = null;
const onDown = (event: PointerEvent) => {
  if (event.button !== 0 || props.mode || props.disabled) return;
  drag = { id: event.pointerId, y: event.clientY, start: zoomIndex(props.zoom), moved: false, last: zoomIndex(props.zoom) };
  handle.value?.setPointerCapture(event.pointerId);
};
const onMove = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.abs(dy) < 5) return;
  drag.moved = true;
  const next = trayZoomAt(drag.start, dy, PITCH);
  preview.value = next;
  if (next !== drag.last) { drag.last = next; emit('zoom', ZOOMS[next]!); }
};
const onUp = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const moved = drag.moved;
  const last = drag.last;
  drag = null;
  preview.value = null;
  // 拖的途中换档可能撞上上一次的动画没放完：松手再要一次，停在手放开的那一档。
  if (moved) { if (ZOOMS[last] !== props.zoom) emit('zoom', ZOOMS[last]!); return; }
};
const onClick = (event: MouseEvent) => {
  if (props.mode) { emit('exit-mode'); return; }
  // pointerup 之后的 click：拖过就不算点。detail === 0 是键盘触发的。
  if (event.detail !== 0 && dragJustEnded) return;
  open.value = !open.value;
};
let dragJustEnded = false;
const onUpCapture = (event: PointerEvent) => {
  dragJustEnded = !!drag?.moved;
  onUp(event);
  window.setTimeout(() => { dragJustEnded = false; }, 0);
};
const onArrow = (event: KeyboardEvent) => {
  if (props.mode || props.disabled) return;
  const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = Math.max(0, Math.min(ZOOMS.length - 1, zoomIndex(props.zoom) + step));
  if (ZOOMS[next] !== props.zoom) emit('zoom', ZOOMS[next]!);
};
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onOutside, true); });
</script>

<template>
  <div ref="root" class="album-tray">
    <Transition name="tray-panel">
      <div v-if="open" class="tray-panel" role="group" :aria-label="t.tray">
        <span class="panel-glass" aria-hidden="true" />
        <SegmentTrack v-model="model" :items="items" :aria-label="t.levels" :disabled="disabled" variant="glass" no-wrap />
        <div v-if="$slots.actions" class="tray-actions"><slot name="actions" :close="close" /></div>
      </div>
    </Transition>
    <button ref="handle" :class="['tray-handle', { open, 'is-mode': !!mode, dragging: preview !== null }]" type="button"
      :aria-label="mode ? mode.label : t.trayHandle(shownLabel)" :title="mode ? mode.label : t.trayHandle(shownLabel)" :aria-expanded="mode ? undefined : open"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUpCapture" @pointercancel="onUpCapture" @click="onClick" @keydown="onArrow">
      <span class="handle-glass" aria-hidden="true" />
      <Transition name="handle-swap" mode="out-in">
        <span v-if="mode" key="mode" class="handle-body"><Icon :name="mode.icon" :size="16" /><span class="handle-label">{{ mode.label }}</span></span>
        <span v-else key="zoom" class="handle-body">
          <span class="rail" :style="{ '--at': shownIndex }" aria-hidden="true"><i /><i /><i /><b /></span>
          <Transition name="label-roll" mode="out-in"><span :key="shownLabel" class="handle-label">{{ shownLabel }}</span></Transition>
        </span>
      </Transition>
    </button>
  </div>
</template>

<style scoped>
.album-tray { position: sticky; bottom: 18px; z-index: 6; display: grid; justify-items: start; width: max-content; max-width: 100%; margin-top: 14px; pointer-events: none; }
.tray-handle, .tray-panel { position: relative; isolation: isolate; pointer-events: auto; }
/* 把手和面板的玻璃画在里面一层，边上一圈很细的高光（和顶栏、导航胶囊同一种）。 */
.handle-glass, .panel-glass {
  position: absolute; z-index: -1; inset: 0; border-radius: inherit;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
}
.tray-handle::after, .tray-panel::after {
  content: ''; position: absolute; inset: 0; padding: 1px; border-radius: inherit; background: var(--glass-edge); pointer-events: none;
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
.tray-handle {
  display: inline-flex; align-items: center; min-height: 46px; padding: 0 16px 0 12px; border: 0; border-radius: 999px;
  background: none; box-shadow: var(--glass-outline, var(--glass-rim)), var(--glass-shadow); color: var(--ink);
  font: inherit; font-size: var(--fs-sm); font-weight: 650; cursor: grab; touch-action: none; user-select: none;
  transition: scale 260ms cubic-bezier(.2, 1.4, .4, 1);
}
.tray-handle.is-mode { cursor: pointer; padding-inline: 14px 16px; }
.tray-handle.dragging { cursor: grabbing; scale: 1.04; }
.tray-handle:hover:not(.dragging) { scale: 1.04; }
.tray-handle:active:not(.dragging) { scale: .96; }
.tray-handle:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.handle-body { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
.is-mode .handle-body { gap: 7px; color: var(--accent); }
.is-mode .handle-label { color: var(--ink); }
/* 竖着的三点刻度：上年、中月、下日；亮的那颗滑到此刻的档。只动 transform。 */
.rail { position: relative; display: grid; gap: 4px; width: 8px; }
.rail i { width: 4px; height: 4px; margin-inline: auto; border-radius: 50%; background: color-mix(in srgb, var(--ink) 28%, transparent); }
.rail b {
  position: absolute; top: -2px; left: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  transform: translateY(calc((2 - var(--at)) * 8px)); transition: transform 300ms cubic-bezier(.32, .72, .24, 1);
}
.handle-label { min-width: 2ch; font-variant-numeric: tabular-nums; }
.tray-panel {
  display: grid; gap: 10px; min-width: 220px; max-width: min(92vw, 420px); margin-bottom: 10px; padding: 10px;
  border-radius: 24px; box-shadow: var(--glass-outline, var(--glass-rim)), var(--glass-shadow);
  transform-origin: 23px calc(100% + 33px);
}
.tray-actions { display: grid; gap: 4px; }
.tray-actions :deep(.tray-action) {
  display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px; border: 0; border-radius: 14px;
  background: transparent; color: var(--ink); font: inherit; font-size: var(--fs-sm); font-weight: 600; text-align: start; cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.tray-actions :deep(.tray-action svg) { flex: none; color: var(--accent); }
.tray-actions :deep(.tray-action:hover) { background: var(--glass-press); }
.tray-actions :deep(.tray-action:focus-visible) { outline: 2px solid var(--focus); outline-offset: 1px; }
@media (prefers-reduced-transparency: reduce) {
  .handle-glass, .panel-glass { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
/* 面板从把手的中心长出来，收起时缩回同一点（原路）。只动 transform、opacity。 */
.tray-panel-enter-active { transition: opacity 200ms ease, transform 460ms cubic-bezier(.32, .72, .24, 1); }
.tray-panel-leave-active { transition: opacity 180ms ease 80ms, transform 300ms cubic-bezier(.4, 0, .6, 1); }
.tray-panel-enter-from, .tray-panel-leave-to { opacity: 0; transform: scale(.2, .3); }
.handle-swap-enter-active, .handle-swap-leave-active { transition: opacity 160ms ease, transform 220ms var(--ease-out); }
.handle-swap-enter-from { opacity: 0; transform: translateY(6px); }
.handle-swap-leave-to { opacity: 0; transform: translateY(-6px); }
.label-roll-enter-active, .label-roll-leave-active { transition: opacity 140ms ease, transform 180ms var(--ease-out); }
.label-roll-enter-from { opacity: 0; transform: translateY(5px); }
.label-roll-leave-to { opacity: 0; transform: translateY(-5px); }
@media (prefers-reduced-motion: reduce) {
  .tray-panel-enter-active, .tray-panel-leave-active { transition: opacity 120ms ease; }
  .tray-panel-enter-from, .tray-panel-leave-to { transform: none; }
  .rail b, .handle-swap-enter-active, .handle-swap-leave-active, .label-roll-enter-active, .label-roll-leave-active { transition-duration: 1ms; }
}
</style>
