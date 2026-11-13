import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleCssAnimations } from '../settle';

/* jsdom 没有 CSSAnimation / getAnimations：造一个最小的替身，只验「有限次的放完、循环的不动、WAAPI 不碰」。 */
class FakeCssAnimation {
  finish = vi.fn();
  constructor(private iterations: number) {}
  get effect() { return { getTiming: () => ({ iterations: this.iterations }) }; }
}
class FakeWaapi {
  finish = vi.fn();
  effect = { getTiming: () => ({ iterations: 1 }) };
}

const rootWith = (animations: unknown[], connected = true) =>
  ({ isConnected: connected, getAnimations: () => animations }) as unknown as Element;

describe('settleCssAnimations', () => {
  afterEach(() => { delete (globalThis as { CSSAnimation?: unknown }).CSSAnimation; });

  it('finishes finite CSS animations, leaves infinite ones and WAAPI flights alone', () => {
    (globalThis as { CSSAnimation?: unknown }).CSSAnimation = FakeCssAnimation;
    const entrance = new FakeCssAnimation(1);
    const spinner = new FakeCssAnimation(Infinity);
    const flight = new FakeWaapi();
    settleCssAnimations(rootWith([entrance, spinner, flight]));
    expect(entrance.finish).toHaveBeenCalledTimes(1);
    expect(spinner.finish).not.toHaveBeenCalled();
    expect(flight.finish).not.toHaveBeenCalled();
  });

  it('does nothing for detached roots or where CSSAnimation is missing', () => {
    const entrance = new FakeCssAnimation(1);
    settleCssAnimations(rootWith([entrance]));
    (globalThis as { CSSAnimation?: unknown }).CSSAnimation = FakeCssAnimation;
    settleCssAnimations(rootWith([entrance], false));
    settleCssAnimations(null);
    expect(entrance.finish).not.toHaveBeenCalled();
  });
});
