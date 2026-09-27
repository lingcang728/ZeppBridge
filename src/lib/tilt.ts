import type { Directive } from 'vue';

/**
 * 概览卡的立体感：指针在卡上时卡片抬起、投影加深，一层镜面高光跟着指针走；离开时落回。
 *
 * 不旋转：卡片一转，里面的字就按 3D 变换栅格化——变糊、变斜。实测悬停倾斜时文字清晰度
 * 只剩平放时的七成。立体感靠抬起、投影和高光给，字始终正对屏幕、清清楚楚。
 *
 * 为什么不写 CSS 变量：变量会继承，往卡片根上写一次就让整棵子树（图表、文字、图标）
 * 重算样式；高光用 `radial-gradient(at var(--x) var(--y))` 则每帧整卡重绘。
 * 在 3300 px 宽的窗口上，鼠标扫过概览时这两样占掉了大半主线程——鼠标会跟着卡。
 * 现在只写两处内联 transform：卡自己的倾斜、高光层自己的位移。两者都不继承、
 * 都只走合成器；高光是一张画好一次的渐变，跟着指针平移，不重画。
 *
 * rect 在指针进卡时量一次（滚动、缩放时作废重量），不在每帧里量——每帧量会在
 * 样式脏的时候逼出一次同步布局。
 *
 * 倾角随卡片宽度收小：整行宽的大卡只斜一度左右，不会像一块翘起来的板。
 * 没有悬停能力的设备、开了减少动效时不启用。每帧最多算一次。
 */
type TiltHost = HTMLElement & { __tiltOff?: () => void };


export const vTilt: Directive<TiltHost> = {
  mounted(el) {
    const media = window.matchMedia?.bind(window);
    if (!media || media('(prefers-reduced-motion: reduce)').matches || !media('(hover: hover)').matches) return;
    const glare = document.createElement('span');
    glare.className = 'tilt-glare';
    glare.setAttribute('aria-hidden', 'true');
    el.appendChild(glare);

    let frame = 0;
    let last: PointerEvent | null = null;
    let rect: DOMRect | null = null;
    const forget = () => { rect = null; };
    const apply = () => {
      frame = 0;
      if (!last) return;
      rect ??= el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.min(1, Math.max(0, (last.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (last.clientY - rect.top) / rect.height));
      // 高光层是以左上角为中心画好的圆，平移到指针处（相对卡片的布局尺寸，不受倾斜影响）。
      glare.style.transform = `translate3d(${(px * el.offsetWidth).toFixed(1)}px, ${(py * el.offsetHeight).toFixed(1)}px, 0)`;
    };
    const enter = () => {
      rect = null;
      el.classList.add('is-tilting');
      window.addEventListener('scroll', forget, { capture: true, passive: true });
      window.addEventListener('resize', forget, { passive: true });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (!el.classList.contains('is-tilting')) enter();
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      last = null;
      rect = null;
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove('is-tilting');
      window.removeEventListener('scroll', forget, { capture: true });
      window.removeEventListener('resize', forget);
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.__tiltOff = () => {
      leave();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      glare.remove();
    };
  },
  unmounted(el) {
    el.__tiltOff?.();
    delete el.__tiltOff;
  },
};
