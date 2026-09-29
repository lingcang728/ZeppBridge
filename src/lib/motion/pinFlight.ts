/**
 * 「我的指标」挑选面板里，一枚指标从候选胶囊飞进上面的空位（或从空位飞回胶囊）。
 *
 * 飞的是一枚临时的胶囊替身，挂在 body 上、固定定位（弹窗本身在做缩放动画，挂在里面
 * 坐标会跟着歪）。只动 transform 和 opacity：走一条向上拱起的弧线，落地前略微放大再
 * 回落，像把卡片「放」进槽里；到了以后替身淡出，槽里的真内容接着出现。
 * 减少动态效果时直接跳过。
 */

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const PIN_FLIGHT_MS = 420;

export const flyPin = (from: DOMRect, to: DOMRect, label: string, options: { back?: boolean } = {}): Promise<void> => {
  if (reducedMotion() || !from.width || !to.width) return Promise.resolve();
  const flyer = document.createElement('div');
  flyer.textContent = label;
  flyer.setAttribute('aria-hidden', 'true');
  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    zIndex: '2200',
    display: 'grid',
    placeItems: 'center',
    padding: '0 12px',
    borderRadius: '999px',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    font: '600 var(--fs-xs, 14px)/1 var(--font-sans, sans-serif)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    boxShadow: '0 12px 28px -10px color-mix(in srgb, var(--accent) 70%, transparent)',
    pointerEvents: 'none',
    willChange: 'transform, opacity',
  });
  document.body.appendChild(flyer);

  // 终点取目标的中心：替身保持自己的大小，只是整体移过去、按比例缩到目标的宽度。
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.max(0.6, Math.min(1.6, to.width / from.width));
  const lift = Math.min(60, 24 + Math.abs(dx) * 0.06);
  const frames: Keyframe[] = [
    { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + scale) / 2 + 0.08})`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale * 1.04})`, opacity: 1, offset: 0.85 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: options.back ? 0 : 0.9, offset: 1 },
  ];
  const flight = flyer.animate(frames, { duration: PIN_FLIGHT_MS, easing: 'cubic-bezier(.3, .7, .2, 1)', fill: 'forwards' });
  return flight.finished
    .catch(() => undefined)
    .then(() => {
      // 落地后替身淡出（真内容在它下面淡入），不要硬消失。
      const fade = flyer.animate([{ opacity: options.back ? 0 : 0.9 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      return fade.finished.then(() => undefined, () => undefined);
    })
    .finally(() => flyer.remove());
};
