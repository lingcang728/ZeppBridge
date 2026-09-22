/*
 * prefers-reduced-motion detection, injectable for tests.
 *
 * The app-wide CSS rule (`@media (prefers-reduced-motion: reduce)` in
 * App.vue) collapses CSS animations but cannot stop a JS rAF loop — the
 * canvas has to ask for itself. Everything here is window-guarded so the
 * same module imports cleanly in vitest's node environment and during SSR.
 */

export type ReducedMotionCheck = () => boolean;

/** Reads the live system setting. Safe to call without a DOM (returns false). */
export const systemReducedMotion: ReducedMotionCheck = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Effective flag: an explicit prop override wins; otherwise follow the
 * system. `check` is injectable so tests don't need to mock matchMedia.
 */
export const effectiveReducedMotion = (
  override: boolean | undefined,
  check: ReducedMotionCheck = systemReducedMotion,
): boolean => override ?? check();

/**
 * Subscribe to system changes (user flips the OS toggle while the canvas is
 * mounted). Returns an unsubscribe; a no-op where matchMedia doesn't exist.
 */
export const watchReducedMotion = (
  onChange: (reduced: boolean) => void,
): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
};
