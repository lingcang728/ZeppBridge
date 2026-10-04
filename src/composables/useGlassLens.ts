/**
 * 给一块元素挂上折射（lib/glassLens.ts）。胶囊滑块、胶囊传送带、日期滚轮都用它：
 * 在会动的内容上面盖一块同样形状的玻璃，`backdrop-filter` 折射它底下画出来的东西。
 *
 * 滤镜盯着元素自己的 ResizeObserver，尺寸变了就重摆（同一尺寸是空操作）。重摆会让 Chromium 重建整条滤镜，
 * 所以组件要让玻璃在运动中保持同一尺寸、只用 transform 移动。
 * 这台机器画不出来、或者用户关掉了，就什么都不挂，返回空样式。
 *
 * 祖先里有 backdrop-filter / filter / mask 时也不挂：那种情况下 Chromium 只把那个祖先里面的内容交给透镜，
 * 透镜外的页面看不见、输出还会把原图换掉，浮起来是一块发暗的方块（2026-10-01 实测）。外层的毛玻璃要让
 * 透镜看得见背后，就把玻璃挪到垫底的一层上（material.css 的 .glass-control.is-lens-host）。
 */
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { createLensFilter, lensEnabled, lensSupported, type LensFilter, type LensKind } from '../lib/glassLens';
import { afterMotion } from '../lib/motion/budget';

/** 空闲时再做（没有 requestIdleCallback 的内核退回一帧以后）。 */
const whenIdle = (run: () => void) => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 400 });
  else window.setTimeout(run, 16);
};

/** 从 from 往上，有没有会把透镜和背后页面隔开的东西（backdrop root）。透明度不算：页面切换的淡入淡出会误判。 */
const isolatedFromPage = (from: HTMLElement | null): boolean => {
  for (let node = from; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backdropFilter !== 'none' && style.backdropFilter !== '') return true;
    if (style.filter !== 'none') return true;
    if (style.maskImage !== 'none' && style.maskImage !== '') return true;
  }
  return false;
};

export const useGlassLens = (target: Ref<HTMLElement | null>, kind: LensKind = 'thumb', when = true) => {
  const instance = getCurrentInstance();
  const filterRef = ref<string | null>(null);
  let lens: LensFilter | null = null;
  let observer: ResizeObserver | null = null;

  const fit = (el: HTMLElement) => lens?.resize(el.offsetWidth, el.offsetHeight);

  let disposed = false;
  let stopWatch: (() => void) | null = null;
  /* 挂透镜要沿祖先一路读计算样式（isolatedFromPage），在刚插进文档的新页里每读一次都逼浏览器先把整页样式算完。
     设置卡里有十几个胶囊和滚轮：以前它们在切页形变途中一起挂，主线程一卡 40–100ms，形变跟着一顿一跳
     （用户 2026-10-04 录屏：从「数据来源」点进设置、设置里左右翻卡）。透镜只在拖动 / 转动时才浮起来，
     晚一点挂看不出来：等形变放完、浏览器空下来再挂。 */
  const attach = () => {
    if (disposed) return;
    // 透镜元素多半要等 active 以后才挂上：那时还没有它，就从组件根往上查。
    const root = instance?.proxy?.$el as unknown;
    const from = target.value?.parentElement ?? (root instanceof HTMLElement ? root : null);
    if (isolatedFromPage(from)) return;
    lens = createLensFilter(kind);
    filterRef.value = lens.ref;
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) fit(entry.target as HTMLElement);
    });
    // 这时已经不在 setup 里了：watch 不会随组件自动停，卸载时手动停。
    stopWatch = watch(target, (el, previous) => {
      if (previous) observer?.unobserve(previous);
      if (el) {
        observer?.observe(el);
        fit(el);
      }
    }, { immediate: true });
  };
  onMounted(() => {
    if (!when || !lensEnabled.value || !lensSupported()) return;
    afterMotion(() => whenIdle(attach));
  });

  onBeforeUnmount(() => {
    disposed = true;
    stopWatch?.();
    observer?.disconnect();
    lens?.dispose();
    lens = null;
  });

  /** 有没有挂上：组件据此打开「开着折射」时的样式。 */
  const active = computed(() => filterRef.value !== null);
  /** 放进元素 `style` 的那一段；`extra` 是同一条 backdrop-filter 里要排在折射前面的滤镜（例如玻璃的模糊）。 */
  const style = (extra = '') => {
    if (!filterRef.value) return {};
    const value = `${extra} ${filterRef.value}`.trim();
    return { backdropFilter: value, WebkitBackdropFilter: value };
  };

  return { active, style };
};
