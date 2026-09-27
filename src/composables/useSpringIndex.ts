import { onBeforeUnmount, ref } from 'vue';

/**
 * 一个会「弹到整数格」的连续下标，给 coverflow 这类拖着转、松手吸附的控件用。
 *
 * 临界阻尼弹簧：没有过冲，也没有慢慢蹭到位的尾巴。`pos` 是浮点，拖动时由
 * 调用方直接写；`animateTo` 负责吸附，停稳后回调 `onSettle`（提交选中值
 * 放在这里，不要放在动画中途——那会让提交引起的重绘卡住动画）。
 */
export const useSpringIndex = (options: {
  count: () => number;
  initial?: number;
  onSettle?: (index: number) => void;
  /** 角频率，越大越快。22 ≈ 0.3 秒到位。 */
  omega?: number;
  /** 首尾相接：pos 不设上下限，回调给的下标已经折回 [0, count)。 */
  wrap?: boolean;
}) => {
  const pos = ref(options.initial ?? 0);
  const omega = options.omega ?? 22;
  let target = pos.value;
  let velocity = 0;
  let raf = 0;
  let lastTs = 0;

  const clamp = (value: number) => (options.wrap ? value : Math.min(Math.max(0, options.count() - 1), Math.max(0, value)));
  const settleIndex = (value: number) => {
    const n = Math.max(1, options.count());
    return options.wrap ? ((value % n) + n) % n : value;
  };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const tick = (ts: number) => {
    const dt = Math.min(34, lastTs ? ts - lastTs : 16.7) / 1000;
    lastTs = ts;
    const accel = -omega * omega * (pos.value - target) - 2 * omega * velocity;
    velocity += accel * dt;
    pos.value += velocity * dt;
    if (Math.abs(pos.value - target) < 0.002 && Math.abs(velocity) < 0.01) {
      pos.value = target;
      velocity = 0;
      raf = 0;
      lastTs = 0;
      options.onSettle?.(settleIndex(target));
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  /** 停下正在进行的吸附（开始拖动时调用），保留当前位置。 */
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    lastTs = 0;
    velocity = 0;
  };

  /** 吸附到某一格。`fling` 是松手时的速度（格/秒），让甩出去的手感延续进弹簧。 */
  const animateTo = (index: number, fling = 0) => {
    target = clamp(Math.round(index));
    if (reduced()) {
      stop();
      pos.value = target;
      options.onSettle?.(settleIndex(target));
      return;
    }
    velocity = fling;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  /** 不做动画，直接放到某一格（初次挂载、外部改了选中项）。 */
  const place = (index: number) => {
    stop();
    target = clamp(index);
    pos.value = target;
  };

  onBeforeUnmount(stop);

  return { pos, animateTo, place, stop, target: () => target };
};
