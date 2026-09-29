import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { trackPageLoad } from '../lib/motion/pageReady';

/**
 * 只有「第一次还没拿到数据」才算在加载。
 *
 * 页面换范围（7 天 / 1 个月）、同步完成后重读时，以前会把 `loading` 置回 true，
 * 整页内容换成骨架屏再换回来——看起来就是整页闪一下，连范围胶囊都被卸载重建。
 * 之后的重读保留旧内容，图表自己过渡到新数据。
 *
 * 首次加载同时登记给切页动画（lib/motion/pageReady）：从卡片展开进来时，
 * 动画等这一次加载完成再揭开新页，而不是先露出骨架屏。
 */
export const useFirstLoad = (loading: Ref<boolean>) => {
  const settled = ref(!loading.value);
  const done = settled.value ? null : trackPageLoad();
  watch(loading, (value) => {
    if (!value) {
      settled.value = true;
      done?.();
    }
  });
  // 页面在加载完之前就被卸载（快速点返回）：别让登记一直挂着。
  onScopeDispose(() => done?.());
  return computed(() => loading.value && !settled.value);
};
