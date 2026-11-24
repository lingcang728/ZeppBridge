<script setup lang="ts">
/**
 * 全局唯一的应用内确认框（composables/useConfirm.ts）。从按下的按钮里长出来、关时缩回去，保留毛玻璃（ModalDialog）。
 * 焦点先落在「取消」上：回车不会误点不可逆操作。
 */
import { computed, nextTick, ref, watch } from 'vue';
import ModalDialog from '../ModalDialog.vue';
import { useMessages } from '../../i18n';
import { confirmState, settleConfirm } from '../../composables/useConfirm';
import { confirmMessages } from './ConfirmHost.i18n';

const t = useMessages(confirmMessages);
const cancelButton = ref<HTMLButtonElement | null>(null);

const lines = computed(() => (confirmState.value?.text ?? '').split('\n').map((line) => line.trim()).filter(Boolean));
const heading = computed(() => confirmState.value?.title ?? lines.value[0] ?? '');
const body = computed(() => (confirmState.value?.title ? lines.value : lines.value.slice(1)));
const confirmText = computed(() => {
  const choice = confirmState.value?.confirm ?? 'continue';
  return typeof choice === 'string' ? t.value[choice] : choice.text;
});

watch(() => confirmState.value?.id, async (id) => {
  if (!id) return;
  // ModalDialog 挂载时先把焦点放在面板上（读屏念标题），再交给取消。
  await nextTick();
  cancelButton.value?.focus({ preventScroll: true });
});
</script>

<template>
  <ModalDialog v-if="confirmState" :key="confirmState.id" labelledby="app-confirm-title" :max-width="440" :origin="confirmState.origin" @close="settleConfirm(false)">
    <div class="app-confirm" :aria-describedby="body.length ? 'app-confirm-body' : undefined">
      <h2 id="app-confirm-title">{{ heading }}</h2>
      <div v-if="body.length" id="app-confirm-body" class="app-confirm-body">
        <p v-for="(line, index) in body" :key="index">{{ line }}</p>
      </div>
      <footer>
        <button ref="cancelButton" type="button" class="pill-button quiet" @click="settleConfirm(false)">{{ t.cancel }}</button>
        <button type="button" :class="['pill-button', 'app-confirm-go', { 'is-danger': confirmState.danger }]" @click="settleConfirm(true)">{{ confirmText }}</button>
      </footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.app-confirm { display: grid; gap: 12px; min-width: 0; }
.app-confirm h2 { margin: 0; font-size: var(--fs-lg); line-height: 1.4; overflow-wrap: anywhere; }
.app-confirm-body { display: grid; gap: 6px; }
.app-confirm-body p { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; overflow-wrap: anywhere; }
/* 长按钮文字（德语、俄语）放不下一行就折到第二行，不溢出面板。 */
.app-confirm footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.app-confirm footer .pill-button { max-width: 100%; white-space: normal; text-align: center; line-height: 1.3; padding-block: 7px; }
.app-confirm-go.is-danger { background: color-mix(in srgb, var(--danger) 18%, var(--cap-thumb)); color: var(--danger); }
</style>
