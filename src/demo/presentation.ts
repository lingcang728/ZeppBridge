import type { Router } from 'vue-router';

export interface DemoPresentation {
  go(path: string): Promise<void>;
  pointer(el: Element, type: string, x: number, y: number): void;
  click(el: Element): void;
  escape(): void;
  pause(value: boolean): void;
  glass(value: boolean): void;
  /** Scale every web animation in the frame (film speed). Direction is kept, so reverse() still reverses. JS-driven springs keep their own pace. */
  rate(value: number): void;
  /** Cover the app with a film wall (demo/walls) built from the app's own components; null removes it. */
  wall(kind: FilmWall | null): void;
  /** Pace of the scripted demo conversation (1 = as on the website's try-it; the film plays it faster). */
  pace(value: number): void;
  /** Replace the scripted conversation's turns (the short film sends one message about how the body feels); null restores the default. */
  script(turns: DemoTurn[] | null): void;
}
export interface DemoTurn { prompt: string; answer: string }
export type FilmWall = 'glass' | 'cards' | 'devices' | 'metrics';
declare global { interface Window { __ZB_PRESENTATION__?: DemoPresentation } }

/** Only installed in disposable demo frames. Desktop code and real input keep native capture. */
export function installPresentation(router: Router) {
  const frozen = new Set<Animation>();
  let paused = false;
  const freeze = () => {
    if (!paused) return;
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'running') { animation.pause(); frozen.add(animation); }
    }
  };
  const observer = new MutationObserver(freeze);
  let rate = 1, rateLoop = 0;
  /* Which factor each animation already carries: scale relative to it, never overwrite (a reversed animation stays reversed). */
  const applied = new WeakMap<Animation, number>();
  const applyRate = () => {
    for (const animation of document.getAnimations()) {
      const had = applied.get(animation) ?? 1;
      if (had !== rate) { animation.playbackRate = (animation.playbackRate / had) * rate; applied.set(animation, rate); }
    }
    rateLoop = rate === 1 ? 0 : requestAnimationFrame(applyRate);
  };
  let wall: { unmount(): void } | null = null, wallToken = 0;
  const pointer = (el: Element, type: string, x: number, y: number) => {
    // Synthetic events have no browser pointer to capture. Scope the shim to this dispatch,
    // including capture-phase handlers on window; never patch the browser's prototype.
    const patched: Array<{ el: Element; descriptor?: PropertyDescriptor }> = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      patched.push({ el: node, descriptor: Object.getOwnPropertyDescriptor(node, 'setPointerCapture') });
      const native = node.setPointerCapture;
      Object.defineProperty(node, 'setPointerCapture', { configurable: true, value(id: number) { if (id !== 31337) native.call(this, id); } });
    }
    try {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 31337,
        pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1 }));
    } finally {
      for (const item of patched) {
        if (item.descriptor) Object.defineProperty(item.el, 'setPointerCapture', item.descriptor);
        else Reflect.deleteProperty(item.el, 'setPointerCapture');
      }
    }
  };
  const style = document.createElement('style');
  style.textContent = '.showcase-glass .bottom-nav{position:fixed;inset:auto 24px 28px;z-index:20;display:flex!important;justify-content:center;background:transparent}.showcase-glass .bottom-track{width:460px;max-width:100%}.showcase-glass .bottom-track .segment-item,.showcase-glass .bottom-track .segment-ink-item{min-height:48px}.showcase-glass .pill-nav{visibility:hidden}.showcase-glass .main-content{padding-bottom:90px}';
  document.head.append(style);
  window.__ZB_PRESENTATION__ = {
    async go(path) { if (path.startsWith('/') && !path.startsWith('//')) await router.push(path); },
    pointer,
    click(el) {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      pointer(el, 'pointerdown', x, y); pointer(el, 'pointerup', x, y);
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    },
    escape() {
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (dialog) { dialog.dispatchEvent(new Event('cancel')); dialog.close(); }
      else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    },
    pause(value) {
      if (paused === value) return;
      paused = value;
      document.documentElement.classList.toggle('is-backgrounded', value);
      window.dispatchEvent(new CustomEvent('showcase-playback', { detail: value }));
      if (value) { freeze(); observer.observe(document.body, { childList: true, subtree: true }); }
      else { observer.disconnect(); frozen.forEach(animation => { if (animation.playState === 'paused') animation.play(); }); frozen.clear(); }
    },
    glass(value) { document.documentElement.classList.toggle('showcase-glass', value); },
    rate(value) {
      rate = value > 0 ? value : 1;
      cancelAnimationFrame(rateLoop);
      applyRate();
    },
    pace(value) { (window as Window & { __ZB_DEMO_PACE__?: number }).__ZB_DEMO_PACE__ = value > 0 ? value : 1; },
    script(turns) { (window as Window & { __ZB_DEMO_TURNS__?: DemoTurn[] | null }).__ZB_DEMO_TURNS__ = turns?.length ? turns : null; },
    wall(kind) {
      const token = ++wallToken;
      wall?.unmount(); wall = null;
      if (kind) void import('./walls/mount').then(({ mountWall }) => { if (token === wallToken) wall = mountWall(kind); });
    },
  };
  window.addEventListener('pagehide', () => { observer.disconnect(); frozen.clear(); }, { once: true });
}
