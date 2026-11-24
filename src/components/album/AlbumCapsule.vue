<script setup lang="ts">
/* 列表左下角的网格按钮 → 一枚浮着的玻璃胶囊「✕｜年｜月｜日」。胶囊从按钮那里横着长出来，✕ / Esc 原路收回按钮里
   （同时回到「日」那一层）。贴着视口底部（sticky），列表多长都够得着。 */
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
    <Transition name="dock" mode="out-in">
      <button v-if="!open" key="button" class="dock-button" type="button" :aria-label="t.open" :title="t.open" @click="open = true">
        <Icon name="grid" :size="18" />
      </button>
      <div v-else key="capsule" class="dock-capsule" role="toolbar" :aria-label="t.levels">
        <button class="dock-close" type="button" :aria-label="t.close" :title="t.close" @click="close"><Icon name="x" :size="16" /></button>
        <SegmentTrack v-model="model" :items="items" :aria-label="t.levels" variant="bare" no-wrap />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.album-dock { position: sticky; bottom: 18px; z-index: 6; display: flex; width: max-content; max-width: 100%; margin-top: 14px; pointer-events: none; }
.dock-button, .dock-capsule {
  pointer-events: auto;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 60%), var(--glass);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-rim), var(--glass-shadow);
}
.dock-button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 999px; color: var(--ink); cursor: pointer; transition: scale var(--dur-fast) var(--ease-out); }
.dock-button:hover { scale: 1.05; }
.dock-button:active { scale: .96; }
.dock-capsule { display: flex; align-items: center; gap: 4px; min-width: 0; padding: 4px; border-radius: 999px; }
.dock-close { display: grid; flex: none; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.dock-close:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--ink); }
:is(.dock-button, .dock-close):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 按钮 ↔ 胶囊：从左边那一点横着长出来 / 收回去（只动 transform、opacity）。 */
.dock-enter-active { transition: opacity 260ms ease, transform 420ms cubic-bezier(.32, .72, .24, 1); }
.dock-leave-active { transition: opacity 160ms ease, transform 220ms cubic-bezier(.32, .08, .24, 1); }
.dock-enter-from, .dock-leave-to { opacity: 0; transform: scale(.72); }
.dock-capsule.dock-enter-from, .dock-capsule.dock-leave-to { transform: scale(.4, .8); }
.dock-button, .dock-capsule { transform-origin: 22px 50%; }
@media (prefers-reduced-motion: reduce) {
  .dock-enter-active, .dock-leave-active { transition: opacity 120ms ease; }
  .dock-enter-from, .dock-leave-to, .dock-capsule.dock-enter-from, .dock-capsule.dock-leave-to { transform: none; }
}
</style>
