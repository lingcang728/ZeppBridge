import { computed, ref, watch, type Ref } from 'vue';

/**
 * 只有「第一次还没拿到数据」才算在加载。
 *
 * 页面换范围（7 天 / 1 个月）、同步完成后重读时，以前会把 `loading` 置回 true，
 * 整页内容换成骨架屏再换回来——看起来就是整页闪一下，连范围胶囊都被卸载重建。
 * 之后的重读保留旧内容，图表自己过渡到新数据。
 */
export const useFirstLoad = (loading: Ref<boolean>) => {
  const settled = ref(!loading.value);
  watch(loading, (value) => {
    if (!value) settled.value = true;
  });
  return computed(() => loading.value && !settled.value);
};
