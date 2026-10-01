/**
 * 给一块元素挂上折射（lib/glassLens.ts）。胶囊滑块、胶囊传送带、日期滚轮都用它：
 * 在会动的内容上面盖一块同样形状的玻璃，`backdrop-filter` 折射它底下画出来的东西。
 *
 * 折射往外取样，而 backdrop-filter 取不到元素框外的像素，所以元素要比看得见的那块胶囊四周各大
 * `--lens-m`：组件按 `inset: calc(-1 * var(--lens-m))` 把元素撑出去，再 `clip-path: inset(var(--lens-m) round 999px)`
 * 裁回胶囊（见 SegmentTrack / CapsuleWheel / WheelColumn 的样式）。margin 按胶囊高度算、只增不减，
 * 动画途中不会来回跳。
 *
 * 滤镜盯着元素自己的 ResizeObserver，尺寸在过渡里逐帧变化时也跟着变（同一尺寸是空操作）。
 * 这台机器画不出来、或者用户关掉了，就什么都不挂，返回空样式。
 *
 * 祖先里有 backdrop-filter / filter / mask 时也不挂：那种情况下 Chromium 只把那个祖先里面的内容交给透镜，
 * 透镜外的页面看不见、输出还会把原图换掉，浮起来是一块发暗的方块（2026-10-01 实测）。外层的毛玻璃要让
 * 透镜看得见背后，就把玻璃挪到垫底的一层上（material.css 的 .glass-control.is-lens-host）。
 */
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { createLensFilter, lensEnabled, lensMargin, lensSupported, type LensFilter, type LensKind } from '../lib/glassLens';

/** 祖先里有没有会把透镜和背后页面隔开的东西（backdrop root）。透明度不算：页面切换的淡入淡出会误判。 */
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
  const margin = ref(lensMargin(kind, 32));
  let lens: LensFilter | null = null;
  let observer: ResizeObserver | null = null;

  const fit = (el: HTMLElement) => {
    const inner = el.offsetHeight - 2 * margin.value;
    const need = lensMargin(kind, inner);
    if (need > margin.value) {
      // 撑大以后元素尺寸会变，ResizeObserver 再来一次，那时按新的 margin 摆。
      margin.value = need;
      return;
    }
    lens?.resize(el.offsetWidth, el.offsetHeight, margin.value);
  };

  onMounted(() => {
    if (!when || !lensEnabled.value || !lensSupported()) return;
    // 透镜元素多半要等 active 以后才挂上：那时还没有它，就从组件根往上查。
    const root = instance?.proxy?.$el as unknown;
    const from = target.value?.parentElement ?? (root instanceof HTMLElement ? root : null);
    if (isolatedFromPage(from)) return;
    lens = createLensFilter(kind);
    filterRef.value = lens.ref;
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) fit(entry.target as HTMLElement);
    });
    watch(target, (el, previous) => {
      if (previous) observer?.unobserve(previous);
      if (el) {
        observer?.observe(el);
        fit(el);
      }
    }, { immediate: true });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    lens?.dispose();
    lens = null;
  });

  /** 有没有挂上：组件据此打开「开着折射」时的样式（例如拖动时滑块换成透镜）。 */
  const active = computed(() => filterRef.value !== null);
  /** 放进元素 `style` 的那一段；`extra` 是同一条 backdrop-filter 里要排在折射前面的滤镜（例如玻璃的模糊）。 */
  const style = (extra = '') => {
    if (!filterRef.value) return {};
    const value = `${extra} ${filterRef.value}`.trim();
    return { backdropFilter: value, WebkitBackdropFilter: value, '--lens-m': `${margin.value}px` };
  };

  return { active, style };
};
