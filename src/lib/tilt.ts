import type { Directive } from 'vue';

/**
 * 概览卡的立体感：指针在卡上移动时，卡朝指针的方向微微倾斜，一层高光跟着指针走；
 * 指针离开时慢慢回正。只写四个 CSS 变量（--tilt-x/--tilt-y/--glare-x/--glare-y），
 * 形变和高光怎么画在 overview/panels.css 里。
 *
 * 倾角随卡片宽度收小：整行宽的大卡只斜一度左右，不会像一块翘起来的板。
 * 没有悬停能力的设备、开了减少动效时不启用。每帧最多算一次。
 */
type TiltHost = HTMLElement & { __tiltOff?: () => void };

const MAX_DEG = 3.2;

export const vTilt: Directive<TiltHost> = {
  mounted(el) {
    const media = window.matchMedia?.bind(window);
    if (!media || media('(prefers-reduced-motion: reduce)').matches || !media('(hover: hover)').matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      if (!last) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.min(1, Math.max(0, (last.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (last.clientY - rect.top) / rect.height));
      const max = Math.min(MAX_DEG, 1200 / rect.width);
      el.style.setProperty('--tilt-x', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`);
      el.classList.add('is-tilting');
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      last = null;
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove('is-tilting');
      for (const name of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) el.style.removeProperty(name);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.__tiltOff = () => {
      leave();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  },
  unmounted(el) {
    el.__tiltOff?.();
    delete el.__tiltOff;
  },
};
