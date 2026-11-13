import { describe, expect, it } from 'vitest';
import { fadeSourceIn, holdSource, isSourceHeld, sourceInFrames } from '../sourceHold';

/* 只要属性和 animate：Vitest 跑在 node 里，没有 DOM。 */
const fakeEl = () => {
  const attrs = new Map<string, string>();
  const anims: Array<{ cancelled: boolean }> = [];
  const el = {
    isConnected: true,
    setAttribute: (k: string, v: string) => { attrs.set(k, v); },
    removeAttribute: (k: string) => { attrs.delete(k); },
    animate: () => { const a = { cancelled: false, cancel() { this.cancelled = true; } }; anims.push(a); return a; },
  };
  return { el: el as unknown as HTMLElement, attrs, anims };
};

describe('sourceHold', () => {
  it('藏到最后一个按住的人放开才露出来', () => {
    const { el, attrs } = fakeEl();
    const a = holdSource(el);
    const b = holdSource(el);
    expect(attrs.get('data-source-hold')).toBe('held');
    a();
    a(); // 放两次只算一次
    expect(isSourceHeld(el)).toBe(true);
    b();
    expect(isSourceHeld(el)).toBe(false);
    expect(attrs.has('data-source-hold')).toBe(false);
  });

  it('淡回来的那段在放开或重新按住时撤掉', () => {
    const { el, attrs, anims } = fakeEl();
    const release = holdSource(el);
    fadeSourceIn(el, sourceInFrames(0.6, 0.9), { duration: 400 });
    expect(attrs.get('data-source-hold')).toBe('fading');
    const again = holdSource(el);
    expect(anims[0]?.cancelled).toBe(true);
    expect(attrs.get('data-source-hold')).toBe('held');
    release();
    again();
    expect(attrs.has('data-source-hold')).toBe(false);
  });

  it('没按住的元素不淡、不在文档里的不藏', () => {
    const { el, attrs } = fakeEl();
    expect(fadeSourceIn(el, sourceInFrames(0, 1), { duration: 1 })).toBeNull();
    const detached = fakeEl();
    (detached.el as unknown as { isConnected: boolean }).isConnected = false;
    holdSource(detached.el)();
    expect(detached.attrs.size).toBe(0);
    expect(attrs.size).toBe(0);
  });
});
