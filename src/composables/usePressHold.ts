import { onMounted, onBeforeUnmount, ref } from 'vue';

export const usePressHold = (complete: () => void, duration = 600) => {
  const progress = ref(0), holding = ref(false);
  let frame = 0, started = 0;
  const cancel = () => { cancelAnimationFrame(frame); holding.value = false; progress.value = 0; };
  const tick = (at: number) => {
    progress.value = Math.min(1, (at - started) / duration);
    if (progress.value === 1) { holding.value = false; complete(); }
    else frame = requestAnimationFrame(tick);
  };
  const start = () => { if (holding.value) return; holding.value = true; started = performance.now(); frame = requestAnimationFrame(tick); };
  const pointerdown = (e: PointerEvent) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start(); };
  const keydown = (e: KeyboardEvent) => { if (e.code !== 'Space' && e.code !== 'Enter') return; e.preventDefault(); if (!e.repeat) start(); };
  const keyup = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); cancel(); } };
  const hidden = () => { if (document.hidden) cancel(); };
  onMounted(() => { window.addEventListener('blur',cancel); document.addEventListener('visibilitychange',hidden); });
  onBeforeUnmount(() => { cancel(); window.removeEventListener('blur',cancel); document.removeEventListener('visibilitychange',hidden); });
  return { progress, holding, start, cancel, pointerdown, keydown, keyup };
};
