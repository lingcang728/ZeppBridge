import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackClock } from '../playback';

afterEach(() => vi.useRealTimers());
describe('presentation playback clock', () => {
  it('preserves the remaining beat while paused offscreen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const clock = new PlaybackClock(new AbortController().signal);
    clock.setPaused(false);
    let completed = false;
    const beat = clock.wait(400).then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(160);
    clock.setPaused(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(completed).toBe(false);
    clock.setPaused(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await beat;
    expect(completed).toBe(true);
  });
  it('cancels a paused story immediately when the visitor changes chapters', async () => {
    const controller = new AbortController();
    const clock = new PlaybackClock(controller.signal);
    const waiting = expect(clock.wait(1000)).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await waiting;
  });
  it('cancels an active beat without leaving a timer behind', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const controller = new AbortController();
    const clock = new PlaybackClock(controller.signal);
    clock.setPaused(false);
    const waiting = expect(clock.wait(1000)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(80);
    controller.abort(); await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });
});
