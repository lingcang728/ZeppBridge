/**
 * 「新页有内容了」的信号，给切页动画用。
 *
 * 从一张卡展开进详情页时，幽灵板长满以后要等新页第一批数据到位再揭开——否则揭开的是
 * 骨架屏，数据一到整块内容换掉，看上去就是「点开闪一下」。页面首次加载经由
 * useFirstLoad 登记（它本来就知道「第一次还没拿到数据」），拿到数据就注销。
 *
 * 只记「首次加载」：KeepAlive 缓存着的页面回来时不登记，立刻算就绪。
 */
let pending = 0;
let waiters: Array<() => void> = [];

const flush = () => {
  if (pending > 0) return;
  const ready = waiters;
  waiters = [];
  for (const resolve of ready) resolve();
};

/** 登记一次首次加载；返回的 done 可以重复调用，只生效一次。 */
export const trackPageLoad = () => {
  pending += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending = Math.max(0, pending - 1);
    flush();
  };
};

/**
 * 等到所有登记过的首次加载都完成，或者超时（不能让动画卡在半路）。
 *
 * 先让出一帧：新页的 setup 在插入前就跑完了，但同一帧里可能还有子组件在登记。
 */
export const whenPageReady = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.setTimeout(done, timeoutMs);
    requestAnimationFrame(() => {
      if (pending === 0) done();
      else waiters.push(done);
    });
  });

/** 测试用：清空状态。 */
export const resetPageReady = () => {
  pending = 0;
  waiters = [];
};
