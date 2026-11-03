declare global {
  interface Window {
    /** Native Linux startup disables snapshot transitions for fallback rendering paths. */
    __ZB_DISABLE_VIEW_TRANSITIONS__?: boolean;
  }
}

/** An exposed API can still crash a WebKitGTK fallback renderer. */
export const canUseViewTransitions = (): boolean =>
  typeof document.startViewTransition === 'function' && !window.__ZB_DISABLE_VIEW_TRANSITIONS__;
