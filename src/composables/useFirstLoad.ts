import { computed, ref, watch, type Ref } from 'vue';
import { whenMotionIdle } from '../lib/motion/budget';

/**
 * 只有「第一次还没拿到数据」才算在加载。
 *
 * 页面换范围（7 天 / 1 个月）、同步完成后重读时，以前会把 `loading` 置回 true，
 * 整页内容换成骨架屏再换回来——看起来就是整页闪一下，连范围胶囊都被卸载重建。
 * 之后的重读保留旧内容，图表自己过渡到新数据。
 *
 * 从卡片展开进来时，切页动画不等这次加载：页面先带着骨架长出来。数据照常马上去取，
 * 但骨架换成内容这一步（整页重排）等形变放完再做（lib/motion/budget.ts）——在形变途中换，
 * 主线程一下被占掉七八十毫秒，窗口就卡一下。换的时候骨架交叉淡成内容（模板里的 skeleton-out）。
 */
export const useFirstLoad = (loading: Ref<boolean>) => {
  const settled = ref(!loading.value);
  watch(loading, (value) => {
    if (!value && !settled.value) void whenMotionIdle().then(() => { settled.value = true; });
  });
  return computed(() => !settled.value);
};

/**
 * 每次加载都算的「还在加载」，但加载完以后等卡 ↔ 页的形变放完才翻成 false（详情页按 URL 取数，
 * 每次进来都是新的一次加载）。理由同上：别在形变途中整页换成内容。
 */
export const useLoadingAfterMotion = (loading: Ref<boolean>): Readonly<Ref<boolean>> => {
  const shown = ref(loading.value);
  watch(loading, (value) => {
    if (value) {
      shown.value = true;
      return;
    }
    void whenMotionIdle().then(() => { if (!loading.value) shown.value = false; });
  });
  return shown;
};
