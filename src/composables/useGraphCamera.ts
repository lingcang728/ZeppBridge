import { onBeforeUnmount, ref } from 'vue';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.2;

/**
 * 关系网的镜头：平移、缩放，以及「从上方俯冲到某一类」的镜头过渡。
 *
 * 过渡用 easeOutCubic 插值，中途被用户拖动 / 滚轮打断时立即停在当前帧，
 * 不和手势抢镜头。减少动效时直接切到终点。
 */
export const useGraphCamera = () => {
  const camera = ref<Camera>({ x: 0, y: 0, zoom: 1 });
  /** 镜头正在飞：TaskGraph 用它给背景加一层运动模糊。 */
  const flying = ref(false);
  let raf = 0;

  const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const cancel = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    flying.value = false;
  };

  /** 飞到目标镜头。返回的 Promise 在到位（或被打断）时结束。 */
  const flyTo = (target: Camera, duration = 620): Promise<void> => {
    cancel();
    const goal = { ...target, zoom: clampZoom(target.zoom) };
    if (reduced()) {
      camera.value = goal;
      return Promise.resolve();
    }
    const from = { ...camera.value };
    const start = performance.now();
    flying.value = true;
    return new Promise((resolve) => {
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - p, 3);
        // 缩放按对数插值：放大和缩小的「速度感」对称。
        const zoom = Math.exp(Math.log(from.zoom) + (Math.log(goal.zoom) - Math.log(from.zoom)) * e);
        camera.value = { x: from.x + (goal.x - from.x) * e, y: from.y + (goal.y - from.y) * e, zoom };
        if (p < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = 0;
          flying.value = false;
          resolve();
        }
      };
      raf = requestAnimationFrame(tick);
    });
  };

  /** 以视口里某一点为锚缩放（滚轮 / 按钮）。 */
  const zoomAt = (zoom: number, size: { width: number; height: number }, local?: { x: number; y: number }) => {
    cancel();
    const next = clampZoom(zoom);
    const cur = camera.value;
    if (!local || Math.abs(next - cur.zoom) < 1e-6) {
      camera.value = { ...cur, zoom: next };
      return;
    }
    camera.value = {
      zoom: next,
      x: cur.x + (local.x - size.width / 2) * (1 / cur.zoom - 1 / next),
      y: cur.y + (local.y - size.height / 2) * (1 / cur.zoom - 1 / next),
    };
  };

  /* 拖空白处平移：记下按下时的镜头和指针，之后指针走多少镜头反着走多少（按缩放换算）。 */
  let pan: { x: number; y: number; camX: number; camY: number } | null = null;
  const panStart = (local: { x: number; y: number }) => {
    cancel();
    pan = { x: local.x, y: local.y, camX: camera.value.x, camY: camera.value.y };
  };
  const panMove = (local: { x: number; y: number }) => {
    if (!pan) return;
    camera.value = {
      ...camera.value,
      x: pan.camX - (local.x - pan.x) / camera.value.zoom,
      y: pan.camY - (local.y - pan.y) / camera.value.zoom,
    };
  };
  const panEnd = () => { pan = null; };

  onBeforeUnmount(cancel);

  return { camera, flying, flyTo, zoomAt, cancel, clampZoom, panStart, panMove, panEnd };
};
