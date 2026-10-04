/**
 * 等画面「跟得上」再开跑：连着两帧的间隔都正常（不到 `GOOD_MS`）才 resolve，最多等 `maxMs`。
 *
 * 切页时新页（或从缓存插回来的旧页）第一次上屏要整页光栅化，GPU 一忙，下一帧要等一两百毫秒。动画是按时间走的，
 * 它要是已经在放，这一下就被吞掉——放出来的第一帧已经走完一半路程，用户看到的是「一跳」
 * （2026-10-04 录屏：从数据来源点进设置、设置返回概览；无头 Chrome 里收回第一帧卡 192ms，一帧走掉七成）。
 * 所以形变先停在起点（画面上就是那张卡 / 那一页，看不出在等），等帧节奏恢复再放。
 */
const GOOD_MS = 24;

export const whenFramesSteady = (maxMs = 260, minFrames = 2): Promise<void> =>
  new Promise((resolve) => {
    const started = performance.now();
    let last = 0;
    let frames = 0;
    let good = 0;
    const tick = (now: number) => {
      frames += 1;
      if (last) good = now - last < GOOD_MS ? good + 1 : 0;
      last = now;
      if ((frames >= minFrames && good >= 2) || now - started > maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
