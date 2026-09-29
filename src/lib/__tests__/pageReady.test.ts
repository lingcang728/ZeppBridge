import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPageReady, trackPageLoad, whenPageReady } from '../motion/pageReady';

/*
 * 展开动画等新页「有内容了」再揭开。这里挡两件事：
 *   - 新页还在首次加载时，动画不能提前揭开（否则揭开的是骨架屏，数据一到整块换掉 = 闪一下）；
 *   - 加载一直不结束时，动画也不能卡在半路。
 */
describe('pageReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    resetPageReady();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for a first load that is still running, and only for that', async () => {
    const done = trackPageLoad();
    let ready = false;
    void whenPageReady(700).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(300);
    expect(ready).toBe(false);
    done();
    done(); // 重复调用只算一次
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(true);
  });

  it('is ready right away when nothing is loading (a cached page coming back)', async () => {
    let ready = false;
    void whenPageReady(700).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(20);
    expect(ready).toBe(true);
  });

  it('gives up after the timeout instead of freezing the animation', async () => {
    trackPageLoad();
    let ready = false;
    void whenPageReady(700).then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(699);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(ready).toBe(true);
  });
});
