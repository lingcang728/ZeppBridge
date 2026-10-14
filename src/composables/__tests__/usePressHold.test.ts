import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('vue', () => ({ ref: (value: unknown) => ({value}), onMounted: () => undefined, onBeforeUnmount: () => undefined }));
import { usePressHold } from '../usePressHold';
let clock = 0, next = 0;
const frames = new Map<number, FrameRequestCallback>();
const step = (at: number) => { clock = at; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(at)); };
beforeEach(() => {
  clock = 0; frames.clear();
  vi.spyOn(performance,'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame',(fn: FrameRequestCallback) => { frames.set(++next,fn); return next; });
  vi.stubGlobal('cancelAnimationFrame',(id: number) => frames.delete(id));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('early release cancels delivery and a fresh hold needs the full duration', () => {
  const sent = vi.fn(), hold = usePressHold(sent);
  hold.start(); step(550); expect(sent).not.toHaveBeenCalled();
  hold.cancel(); step(600); expect(sent).not.toHaveBeenCalled(); expect(hold.progress.value).toBe(0);
  hold.start(); step(1199); expect(sent).not.toHaveBeenCalled(); step(1200); expect(sent).toHaveBeenCalledTimes(1);
  step(1800); expect(sent).toHaveBeenCalledTimes(1);
});
it('repeated keyboard events cannot restart a hold or deliver twice', () => {
  const sent = vi.fn(), hold = usePressHold(sent), preventDefault = vi.fn();
  hold.keydown({code:'Space',repeat:false,preventDefault} as unknown as KeyboardEvent);
  step(300); hold.keydown({code:'Space',repeat:true,preventDefault} as unknown as KeyboardEvent);
  step(600); expect(sent).toHaveBeenCalledTimes(1);
  hold.keyup({code:'Space',preventDefault} as unknown as KeyboardEvent); expect(hold.progress.value).toBe(0);
});
it('a frame stamped before the press never reports negative progress', () => {
  // rAF passes the frame's start time, which can precede the performance.now() taken on press.
  const sent = vi.fn(), hold = usePressHold(sent);
  clock = 1000; hold.start(); step(984);
  expect(hold.progress.value).toBe(0);
  expect(Number.isNaN(hold.progress.value ** 2.2)).toBe(false);
});
