/**
 * 回到概览后，把「这一周」摘要（components/overview/WeekDigest.vue）带进视野。
 *
 * 第一次同步完成时顶栏和账号卡都会把人带到这里（体验评估 #1）。概览是异步读数据的，
 * 摘要要等一会儿才渲染出来：每帧找一次，最多等 1.5 秒。它本来就在第一屏，用 `nearest`，
 * 已经看得见就不动；不加任何闪框（返回时的绿框用户嫌突兀，2026-09-30 已删）。
 */
export const revealWeekDigest = (): void => {
  const started = performance.now();
  const tick = () => {
    const digest = document.querySelector<HTMLElement>('.week-digest');
    if (digest) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      digest.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      return;
    }
    if (performance.now() - started < 1500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
