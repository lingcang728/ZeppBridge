<script setup lang="ts">
/* 列表左下角的玻璃圆钮 → 旁边长出一条玻璃胶囊「年｜月｜日」（和顶栏、底部导航同一种液态玻璃，滑块带透镜）。
   从哪来回哪去：胶囊从圆钮背后横着长出来，收起时原路缩回圆钮里；圆钮自己不动，图标在网格和 ✕ 之间转一下。
   ✕ / Esc 收起（同时回到「日」那一层）。贴着视口底部（sticky），列表多长都够得着。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import type { AlbumLevel } from '../../lib/album/album';
import { albumMoving } from '../../lib/album/albumMotion';

const props = defineProps<{ level: AlbumLevel }>();
const emit = defineEmits<{ 'update:level': [AlbumLevel] }>();
const t = useMessages(albumMessages);
const open = ref(props.level !== 'day');
const items = computed(() => [
  { value: 'year' as const, label: t.value.year },
  { value: 'month' as const, label: t.value.month },
  { value: 'day' as const, label: t.value.day },
]);
const model = computed({ get: () => props.level, set: (value: AlbumLevel) => emit('update:level', value) });
const close = () => { open.value = false; if (props.level !== 'day') emit('update:level', 'day'); };
const toggle = () => { if (open.value) close(); else open.value = true; };
// 捏合换到了年 / 月（不是点胶囊）：胶囊也跟着出来，看得到此刻在哪一层。
watch(() => props.level, (level) => { if (level !== 'day') open.value = true; });
const onKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || albumMoving()) return;
  event.preventDefault();
  close();
};
watch(open, (value) => {
  if (value) window.addEventListener('keydown', onKey);
  else window.removeEventListener('keydown', onKey);
}, { immediate: true });
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="album-dock">
    <button :class="['dock-button', { open }]" type="button" :aria-label="open ? t.close : t.open" :title="open ? t.close : t.open"
      :aria-expanded="open" @click="toggle">
      <span class="dock-glass" aria-hidden="true" />
      <Icon class="icon grid" name="grid" :size="18" />
      <Icon class="icon x" name="x" :size="17" />
    </button>
    <Transition name="dock">
      <div v-if="open" class="dock-track" role="toolbar" :aria-label="t.levels">
        <SegmentTrack v-model="model" :items="items" :aria-label="t.levels" variant="glass" no-wrap />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.album-dock { position: sticky; bottom: 18px; z-index: 6; display: flex; align-items: center; gap: 8px; width: max-content; max-width: 100%; margin-top: 14px; pointer-events: none; }
.dock-button {
  position: relative;
  z-index: 1;
  display: grid;
  flex: none;
  place-items: center;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: none;
  box-shadow: var(--glass-outline, var(--glass-rim)), var(--glass-shadow);
  color: var(--ink);
  cursor: pointer;
  pointer-events: auto;
  isolation: isolate;
  transition: scale 260ms cubic-bezier(.2, 1.4, .4, 1);
}
/* 和 SegmentTrack 的玻璃同一种做法：毛玻璃画在里面一层，边上一圈很细的高光。 */
.dock-glass {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
}
.dock-button::after {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: var(--glass-edge);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}
.dock-button:hover { scale: 1.06; }
.dock-button:active { scale: .94; }
.dock-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 两个图标叠在一处，开合时一个转着淡出、一个转着淡入。 */
.icon { grid-area: 1 / 1; transition: opacity 200ms ease, rotate 360ms cubic-bezier(.32, .72, .24, 1), scale 360ms cubic-bezier(.32, .72, .24, 1); }
.icon.x { opacity: 0; rotate: -90deg; scale: .6; }
.open .icon.grid { opacity: 0; rotate: 90deg; scale: .6; }
.open .icon.x { opacity: 1; rotate: 0deg; scale: 1; color: var(--muted); }
.dock-track { min-width: 0; pointer-events: auto; transform-origin: -27px 50%; }
@media (prefers-reduced-transparency: reduce) {
  .dock-glass { background: var(--mat-glass-strong); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
/* 胶囊从圆钮的中心横着长出来（原点在圆钮中心），收回时缩回同一点；只动 transform、opacity。 */
.dock-enter-active { transition: opacity 220ms ease, transform 480ms cubic-bezier(.32, .72, .24, 1); }
.dock-leave-active { transition: opacity 200ms ease 60ms, transform 300ms cubic-bezier(.4, 0, .6, 1); }
.dock-enter-from, .dock-leave-to { opacity: 0; transform: translateX(-24px) scale(.35, .7); }
@media (prefers-reduced-motion: reduce) {
  .dock-enter-active, .dock-leave-active { transition: opacity 120ms ease; }
  .dock-enter-from, .dock-leave-to { transform: none; }
  .icon { transition: opacity 120ms ease; }
}
</style>
