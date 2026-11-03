/**
 * 这一刻该不该放「少动」的版本：系统要求减少动态效果，或者开着低特效（composables/useEffects.ts）。
 *
 * 各处动画原本各自问 `matchMedia('(prefers-reduced-motion: reduce)')`；低特效要让它们一起退成淡入淡出，
 * 所以统一走这里。每次调用现查，不缓存：设置里切档位立刻生效。
 */
export const lessMotion = (): boolean => {
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.effects === 'lite') return true;
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
};
