<script setup lang="ts">
/**
 * 一次性提示条（第三轮精修 A6）：第一次打开时从底部浮上来，点「知道了」就不再出现（useCoachTips）。
 * 只动 opacity / transform。
 */
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { useCoachTip } from '../../composables/useCoachTips';
import { useCardsText } from './cards.i18n';

const props = defineProps<{ id: string; text: string }>();
const t = useCardsText();
const tip = useCoachTip(props.id);
const shown = computed(() => tip.visible());
</script>

<template>
  <Transition name="coach" appear>
    <div v-if="shown" class="coach-tip" role="note">
      <Icon name="spark" :size="15" />
      <p>{{ text }}</p>
      <button type="button" @click.stop="tip.dismiss()">{{ t.gotIt }}</button>
    </div>
  </Transition>
</template>

<style scoped>
.coach-tip { display: flex; align-items: center; gap: 10px; width: fit-content; max-width: min(720px, 100%); margin: 0 auto; padding: 8px 8px 8px 14px; border: 1px solid var(--mat-glass-line);
  border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--mat-glass-shadow); color: var(--muted); font-size: var(--fs-xs); line-height: 1.5; }
.coach-tip :deep(svg) { flex: 0 0 auto; color: var(--accent); }
.coach-tip p { margin: 0; }
.coach-tip button { flex: 0 0 auto; height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent);
  font: inherit; font-weight: 700; cursor: pointer; transition: transform 160ms ease; }
.coach-tip button:hover { transform: translateY(-1px); }
.coach-tip button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.coach-enter-active { transition: opacity 360ms cubic-bezier(.2, .8, .2, 1) 420ms, transform 420ms cubic-bezier(.2, .8, .2, 1) 420ms; }
.coach-leave-active { transition: opacity 200ms ease, transform 220ms ease; }
.coach-enter-from, .coach-leave-to { opacity: 0; transform: translateY(14px); }
@media (max-width: 640px) { .coach-tip { border-radius: 18px; } }
@media (prefers-reduced-motion: reduce) { .coach-enter-active, .coach-leave-active { transition-duration: 1ms; transition-delay: 0ms; } }
</style>
