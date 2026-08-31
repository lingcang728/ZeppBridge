/**
 * 把一个浮层摆在触发按钮旁边，并且保证它在视口里看得全。
 *
 * 这段逻辑原本只长在 `SelectMenu.vue` 里。日期选择器另写了一套
 * `position: absolute; top: calc(100% + 6px)`，于是在窗口底部必然被裁掉——
 * 那正是 issue #9：日历落在窗口下沿之外，既看不见也滚不到。
 *
 * 纯函数放在这里，好处是能直接测：不需要 jsdom 布局，也不需要挂载组件。
 * 组件那边只负责量 `getBoundingClientRect()` 再把结果套上去。
 */

/** 浮层与视口边缘之间至少留这么多，避免正好贴着边。 */
export const VIEWPORT_MARGIN = 8;

export interface TriggerRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PopoverSizing {
  /** 浮层最高能有多高。空间不够时会被压到比这更小。 */
  maxHeight: number;
  /** 浮层的宽度。不传就跟触发按钮一样宽。 */
  width?: number;
  /** 优先向上展开。触发按钮天生靠近底部时用。 */
  preferUp?: boolean;
  /** 压缩后仍要保证的最小可用高度。 */
  minHeight?: number;
}

export interface PopoverStyle {
  position: 'fixed';
  left: string;
  width?: string;
  maxHeight: string;
  top?: string;
  bottom?: string;
}

/**
 * 决定往上还是往下展开。
 *
 * 下方放不下就翻上去；两边都不宽裕时选空间大的那一侧，并把高度压到放得下。
 * 这和 `SelectMenu` 原来的判断一致，只是搬了出来。
 */
export const resolveDropUp = (
  trigger: TriggerRect,
  viewport: Viewport,
  sizing: PopoverSizing,
): boolean => {
  const spaceBelow = viewport.height - trigger.bottom - VIEWPORT_MARGIN;
  const spaceAbove = trigger.top - VIEWPORT_MARGIN;
  return sizing.preferUp
    ? spaceAbove > sizing.maxHeight || spaceAbove > spaceBelow
    : spaceBelow < Math.min(sizing.maxHeight, 160) && spaceAbove > spaceBelow;
};

/**
 * 算出浮层的 `fixed` 定位样式。
 *
 * 用 `fixed` 而不是 `absolute`：只要祖先里有 `overflow`、`transform` 或自己的
 * 层叠上下文，绝对定位的浮层就会被裁掉或被盖住，调 z-index 是救不回来的。
 * 配合 Teleport 到 body，从根上避开这一类问题。
 */
export const popoverStyle = (
  trigger: TriggerRect,
  viewport: Viewport,
  sizing: PopoverSizing,
): PopoverStyle => {
  const dropUp = resolveDropUp(trigger, viewport, sizing);
  const spaceBelow = viewport.height - trigger.bottom - VIEWPORT_MARGIN;
  const spaceAbove = trigger.top - VIEWPORT_MARGIN;
  const minHeight = sizing.minHeight ?? 120;
  const available = Math.max(minHeight, Math.floor(dropUp ? spaceAbove : spaceBelow));

  const width = sizing.width ?? trigger.width;
  // 横向也不能越界：浮层比触发按钮宽时（日历就是），靠右的按钮会把它推出屏幕。
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN);
  const left = Math.round(Math.min(Math.max(VIEWPORT_MARGIN, trigger.left), maxLeft));

  return {
    position: 'fixed',
    left: `${left}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.min(sizing.maxHeight, available)}px`,
    ...(dropUp
      ? { bottom: `${Math.round(viewport.height - trigger.top + 4)}px` }
      : { top: `${Math.round(trigger.bottom + 4)}px` }),
  };
};
