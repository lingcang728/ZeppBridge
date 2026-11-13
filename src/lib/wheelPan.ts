/**
 * 横排的一条（信件、最近记录时间轴）用鼠标滚轮也能左右滑：滚动条全局藏起来以后（2026-11-13），
 * 没有触控板的人就没有别的办法横着滑了。只在指针停在这一条上、竖向滚动、而且这一条还能往那边滑时接管；
 * 滑到头就放手，页面照常上下滚。监听挂在这一条自己身上（不在 document 上挂非被动监听，免得拖慢整页滚动）。
 * 用法：<script setup> 里 `const vWheelPan = wheelPan;`，模板上 `v-wheel-pan`。
 */
import type { Directive } from 'vue';

const handlers = new WeakMap<HTMLElement, (event: WheelEvent) => void>();

export const wheelPan: Directive<HTMLElement> = {
  mounted(el) {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY;
      if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return;
      event.preventDefault();
      el.scrollBy({ left: delta });
    };
    handlers.set(el, onWheel);
    el.addEventListener('wheel', onWheel, { passive: false });
  },
  unmounted(el) {
    const onWheel = handlers.get(el);
    if (onWheel) el.removeEventListener('wheel', onWheel);
    handlers.delete(el);
  },
};
