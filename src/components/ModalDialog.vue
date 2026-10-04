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
        <span class="dialog-glass" aria-hidden="true"></span>
        <div class="dialog-scroll"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 两层毛玻璃（全屏遮罩的模糊、面板的磨砂）都画在**垫底的一层**上，不画在遮罩 / 面板自己身上：
   祖先只要带 backdrop-filter，里面胶囊和日期滚轮的液态玻璃透镜就看不见背后、挂不上（lib/glassLens.ts、
   composables/useGlassLens.ts），弹窗里的选中块只剩一块不透明的深色胶囊（用户 2026-10-04：「添加事件」
   里的分类和日期滚轮要做成液态玻璃）。和顶栏图标组的 .glass-control.is-lens-host 同一个做法。 */
.dialog-backdrop { position: fixed; inset: 0; z-index: 2100; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, .55); }
.dialog-backdrop::before { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.dialog-panel { position: relative; z-index: 1; display: flex; width: 100%; max-width: 560px; min-width: 0; max-height: calc(100vh / var(--ui-scale, 1) - 40px); border-radius: var(--radius-lg); color: var(--ink); box-shadow: var(--mat-glass-shadow); overflow-wrap: anywhere; }
.dialog-glass { position: absolute; inset: 0; z-index: 0; border: 1px solid var(--mat-glass-line); border-radius: inherit; background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur); pointer-events: none; }
.dialog-scroll { position: relative; z-index: 1; flex: 1 1 auto; min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px; border-radius: inherit; }
</style>
