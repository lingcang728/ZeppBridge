/** A clock that measures playing time. Pausing never skips a beat or restarts a story. */
export class PlaybackClock {
  private paused = true;
  private disposed = false;
  private waiters = new Set<() => void>();
  constructor(readonly signal: AbortSignal) {}
  setPaused(value: boolean) {
    this.paused = value;
    if (!value) { this.waiters.forEach(wake => wake()); this.waiters.clear(); }
  }
  async checkpoint(): Promise<void> {
    if (this.disposed || this.signal.aborted) throw new DOMException('Playback cancelled', 'AbortError');
    if (!this.paused) return;
    await new Promise<void>((resolve, reject) => {
      const wake = () => { this.signal.removeEventListener('abort', abort); resolve(); };
      const abort = () => { this.waiters.delete(wake); reject(new DOMException('Playback cancelled', 'AbortError')); };
      this.waiters.add(wake);
      this.signal.addEventListener('abort', abort, { once: true });
    });
    return this.checkpoint();
  }
  async wait(ms: number) {
    let remaining = ms;
    while (remaining > 0) {
      await this.checkpoint();
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Playback cancelled', 'AbortError')); };
        const timer = setTimeout(() => { this.signal.removeEventListener('abort', abort); resolve(); }, Math.min(40, remaining));
        this.signal.addEventListener('abort', abort, { once: true });
      });
      if (!this.paused) remaining -= performance.now() - start;
    }
    await this.checkpoint();
  }
  dispose() { this.disposed = true; this.waiters.forEach(wake => wake()); this.waiters.clear(); }
}
