<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{ labelledby: string }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const panel = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

const isTopmost = () => {
  const dialogs = document.querySelectorAll('[data-modal-dialog]');
  return dialogs[dialogs.length - 1] === panel.value;
};
const focusableElements = () => Array.from(panel.value?.querySelectorAll<HTMLElement>(
  'button, a[href], input, select, textarea, [tabindex]',
) ?? []).filter((element) => element.tabIndex >= 0
  && !element.matches(':disabled') && element.getClientRects().length > 0);

const onKeydown = (event: KeyboardEvent) => {
  if (!isTopmost()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
  } else if (event.key === 'Tab') {
    const elements = focusableElements();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) {
      event.preventDefault();
      panel.value?.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
};
const keepFocusInside = (event: FocusEvent) => {
  if (isTopmost() && !panel.value?.contains(event.target as Node)) panel.value?.focus();
};

onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Start at the heading/content instead of scrolling a long dialog to its first action.
  panel.value?.focus({ preventScroll: true });
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('focusin', keepFocusInside);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusin', keepFocusInside);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @click.self="emit('close')">
      <section ref="panel" class="dialog-panel" data-modal-dialog role="dialog" aria-modal="true"
        :aria-labelledby="labelledby" tabindex="-1">
        <slot />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 2100; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, .7); }
.dialog-panel { width: 100%; max-width: 560px; min-width: 0; max-height: calc(100vh / var(--ui-scale, 1) - 40px); overflow-y: auto; overscroll-behavior: contain; padding: 20px; border: 1px solid var(--line-control); border-radius: var(--radius-md); background: var(--surface-raised); color: var(--ink); box-shadow: 0 12px 36px rgba(0, 0, 0, .5); overflow-wrap: anywhere; }
</style>
