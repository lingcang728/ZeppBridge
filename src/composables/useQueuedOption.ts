import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue';

/**
 * 图表换数据时排队：一帧只让一张图 setOption。
 *
 * 切 7 天 / 1 个月 / 6 个月时，身体状态页十来张趋势图的 option 同时变，vue-echarts
 * 在同一个任务里挨个 setOption——在高分屏的 WebView 里这一下能卡 100–200ms，范围胶囊的
 * 滑块也跟着停住，看起来就是「切一下顿一下」。排队以后每帧只处理一张：主线程每帧都有
 * 空隙画滑块，图表从上到下依次过渡到新数据，像一道波。
 *
 * 第一次挂载不排队（直接用当前 option），只有之后的变化才排。
 */
const jobs = new Map<object, () => void>();
let frame = 0;

const run = () => {
  frame = 0;
  const next = jobs.entries().next();
  if (!next.done) {
    const [owner, job] = next.value;
    jobs.delete(owner);
    job();
  }
  if (jobs.size) frame = requestAnimationFrame(run);
};

const enqueue = (owner: object, job: () => void) => {
  // 同一张图又变了：换成最新的那份，位置不变（Map 保留首次插入的顺序）。
  jobs.set(owner, job);
  if (!frame) frame = requestAnimationFrame(run);
};

export const useQueuedOption = <T>(source: Ref<T>): Ref<T> => {
  const owner = {};
  const shown = shallowRef(source.value) as Ref<T>;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  watch(source, (value) => {
    // 从「没图」变成「有图」（或反过来）是换组件，不是换数据：直接给，别让卡片空着等。
    if (value === null || shown.value === null || reduced()) {
      jobs.delete(owner);
      shown.value = value;
      return;
    }
    enqueue(owner, () => { shown.value = value; });
  });
  onBeforeUnmount(() => { jobs.delete(owner); });
  return shown;
};
