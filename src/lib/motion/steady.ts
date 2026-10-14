/**
 * 等画面「跟得上」再开跑：连着两帧的间隔都正常（不到 `GOOD_MS`）才 resolve，最多等 `maxMs`。
 *
 * 切页时新页（或从缓存插回来的旧页）第一次上屏要整页光栅化，GPU 一忙，下一帧要等一两百毫秒。动画是按时间走的，
 * 它要是已经在放，这一下就被吞掉——放出来的第一帧已经走完一半路程，用户看到的是「一跳」
 * （2026-10-04 录屏：从数据来源点进设置、设置返回概览；无头 Chrome 里收回第一帧卡 192ms，一帧走掉七成）。
 * 所以形变先停在起点（画面上就是那张卡 / 那一页，看不出在等），等帧节奏恢复再放。
 */
const GOOD_MS = 24;

/**
 * 「正常」按这块屏的帧周期算（性能审计 11）：写死 24ms 在 120 / 240Hz 上等于两三帧，掉了帧也算稳。
 * 帧周期取上一次等待里最短的间隔（屏幕刷新率不会每次都变），和这一次已经看到的最短间隔取小；
 * 超过它一半就算掉帧。上限仍是 GOOD_MS——60Hz 上和以前一模一样，只会在高刷屏上更严，不会更松。
 * 窗口挪到刷新率更低的屏上，第一次等待按旧周期判、最多等到 maxMs，之后就按新屏算。
 */
let lastPeriod = Infinity;
/** 帧周期不取到 4ms 以下：偶尔挨得特别近的两次回调不该把门槛压到谁也过不去。 */
export const goodFrameMs = (period: number): number => {
  const p = Math.max(4, period);
  return Math.min(GOOD_MS, Math.max(p * 1.5, p + 2));
};

export const whenFramesSteady = (maxMs = 260, minFrames = 2): Promise<void> =>
  new Promise((resolve) => {
    const started = performance.now();
    let last = 0;
    let frames = 0;
    let good = 0;
    let shortest = Infinity;
    const finish = () => {
      if (Number.isFinite(shortest)) lastPeriod = shortest;
      resolve();
    };
    const tick = (now: number) => {
      frames += 1;
      if (last) {
        const gap = now - last;
        shortest = Math.min(shortest, gap);
        good = gap < goodFrameMs(Math.min(lastPeriod, shortest)) ? good + 1 : 0;
      }
      last = now;
      if ((frames >= minFrames && good >= 2) || now - started > maxMs) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
