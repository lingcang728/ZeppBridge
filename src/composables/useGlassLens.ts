/**
 * 给一块元素挂上折射（lib/glassLens.ts）。胶囊滑块、胶囊传送带、日期滚轮都用它：
 * 在会动的内容上面盖一块同样形状的玻璃，`backdrop-filter` 折射它底下画出来的东西。
 *
 * 滤镜按元素的实际尺寸拉伸位移图：盯着元素自己的 ResizeObserver，尺寸在过渡里逐帧变化时也跟着变
 * （resize 对同一尺寸是空操作）。这台机器画不出来、或者用户关掉了，就什么都不挂，返回空样式。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { createLensFilter, lensEnabled, lensSupported, type LensFilter, type LensKind } from '../lib/glassLens';

export const useGlassLens = (target: Ref<HTMLElement | null>, kind: LensKind = 'thumb', when = true) => {
  const filterRef = ref<string | null>(null);
  let lens: LensFilter | null = null;
  let observer: ResizeObserver | null = null;

  const fit = (el: HTMLElement) => lens?.resize(el.offsetWidth, el.offsetHeight);

  onMounted(() => {
    if (!when || !lensEnabled.value || !lensSupported()) return;
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

  /** 有没有挂上：组件据此打开「开着折射」时的样式（例如拖动时滑块不再放大、底色变清透）。 */
  const active = computed(() => filterRef.value !== null);
  /** 放进元素 `style` 的那一段；`extra` 是同一条 backdrop-filter 里要排在折射前面的滤镜（例如玻璃的模糊）。 */
  const style = (extra = '') => (filterRef.value
    ? { backdropFilter: `${extra} ${filterRef.value}`.trim(), WebkitBackdropFilter: `${extra} ${filterRef.value}`.trim() }
    : {});

  return { active, style };
};
