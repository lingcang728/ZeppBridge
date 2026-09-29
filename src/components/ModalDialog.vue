<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue';
import { dialogFlight, originOf, type FlightOrigin } from '../lib/motion/dialogFlight';

defineProps<{ labelledby: string }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const panel = ref<HTMLElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;
let origin: FlightOrigin | null = null;
let leaving: { backdrop: HTMLElement; panel: HTMLElement } | null = null;

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
  // 从打开它的那个按钮里长出来，关的时候缩回去（lib/motion/dialogFlight.ts）。
  origin = originOf(returnFocus);
  if (backdrop.value && panel.value) dialogFlight.open(backdrop.value, panel.value, origin);
  // Start at the heading/content instead of scrolling a long dialog to its first action.
  panel.value?.focus({ preventScroll: true });
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('focusin', keepFocusInside);
});
onBeforeUnmount(() => {
  // 模板 ref 在卸载时会被清成 null，先把节点记下来留给 onUnmounted。
  leaving = backdrop.value && panel.value ? { backdrop: backdrop.value, panel: panel.value } : null;
  document.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusin', keepFocusInside);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
/* 卸载以后节点已经被 Vue 摘下来了，但它还是完整的（输入框里的字也还在）：
   挂回去放完收起的动画再真正移除。 */
onUnmounted(() => {
  if (leaving) dialogFlight.close(leaving.backdrop, leaving.panel, origin);
  leaving = null;
});
</script>

<template>
  <Teleport to="body">
    <div ref="backdrop" class="dialog-backdrop" @click.self="emit('close')">
      <section ref="panel" class="dialog-panel" data-modal-dialog role="dialog" aria-modal="true"
        :aria-labelledby="labelledby" tabindex="-1">
        <slot />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 2100; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, .55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.dialog-panel { width: 100%; max-width: 560px; min-width: 0; max-height: calc(100vh / var(--ui-scale, 1) - 40px); overflow-y: auto; overscroll-behavior: contain; padding: 20px; border: 1px solid var(--mat-glass-line); border-radius: var(--radius-lg); background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); color: var(--ink); box-shadow: var(--mat-glass-shadow); overflow-wrap: anywhere; }
</style>
