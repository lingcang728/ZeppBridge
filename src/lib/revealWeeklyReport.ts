/**
 * 回到概览后，把「这一周」周报（components/WeeklyReportCard.vue）带进视野。
 *
 * 第一次同步完成时顶栏和账号卡都会把人带到这里（体验评估 #1）。概览是异步读数据的，
 * 周报要等一会儿才渲染出来：每帧找一次，最多等 1.5 秒。用 `nearest`，已经看得见就不动；
 * 不加任何闪框（返回时的绿框用户嫌突兀，2026-09-30 已删）。
 * 以前带去的是第一屏的「这一周」摘要，它和这张周报重复，2026-10-04 删了。
 */
export const revealWeeklyReport = (): void => {
  const started = performance.now();
  const tick = () => {
    const report = document.querySelector<HTMLElement>('.weekly-card');
    if (report) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      report.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      return;
    }
    if (performance.now() - started < 1500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
