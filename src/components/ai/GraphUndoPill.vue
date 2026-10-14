<script setup lang="ts">
/**
 * 包裹区标题行右侧的撤销胶囊。改完一步（移出一类、勾一次运动），胶囊里
 * 亮出「已移出『睡眠』· 撤销」几秒，宽度平滑伸开，然后缩回一个「撤销」。
 * 文案由 PackageZone / AiComposer 给，这里只管显示和计时。
 */
import { ref, watch } from 'vue';
import Icon from '../Icon.vue';
import { useWidthMorph } from '../../composables/useWidthMorph';

const props = defineProps<{
  canUndo: boolean;
  /** 「撤销」两个字（跟界面语言走）。 */
  label: string;
  /** 刚才改了什么；没有就只显示「撤销」。 */
  hint?: string | null;
  /** 每改一步加一：同一句话再出现一次也要重新计时。 */
  seq?: number;
}>();
const emit = defineEmits<{ (event: 'undo'): void }>();

const HINT_MS = 5000;
const pill = ref<HTMLElement | null>(null);
const shown = ref(false);
let timer = 0;
watch(() => props.seq, () => {
  window.clearTimeout(timer);
  shown.value = Boolean(props.hint);
  if (shown.value) timer = window.setTimeout(() => { shown.value = false; }, HINT_MS);
});
watch(() => props.hint, (hint) => { if (!hint) shown.value = false; });
useWidthMorph(pill, () => (shown.value ? props.hint : ''));
</script>

<template>
  <button ref="pill" type="button" :class="['undo-pill', 'glass-control', { 'has-hint': shown && hint }]"
    :disabled="!canUndo" :title="`${label} · Ctrl+Z`" @click="emit('undo')">
    <Icon name="undo" :size="15" />
    <span v-if="shown && hint" :key="seq" class="undo-hint" role="status">{{ hint }}</span>
    <span class="undo-word">{{ label }}</span>
  </button>
</template>

<style scoped>
.undo-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  color: var(--ink);
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
  transition: opacity var(--dur-base) ease, scale var(--dur-fast) var(--ease-out);
}
.undo-pill:disabled { opacity: .4; cursor: default; }
.undo-pill:active:not(:disabled) { scale: .96; }
.undo-hint { max-width: 280px; overflow: hidden; color: var(--muted); text-overflow: ellipsis; animation: undo-hint-in .32s var(--ease-out); }
.undo-hint::after { content: '·'; margin-left: 7px; color: var(--subtle); }
.undo-pill.has-hint .undo-word { color: var(--accent); font-weight: 600; }
@keyframes undo-hint-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .undo-hint { animation: none; } }
</style>
