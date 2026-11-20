import { describe, expect, it } from 'vitest';
import { ATTACH_LONG_EDGE, ENCODE_STEPS, fitSize, isImageFile } from '../attachImage';

describe('回信附图的尺寸', () => {
  it('长边压到上限以内，比例不变', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitSize(1200, 6000)).toEqual({ width: 400, height: 2000 });
  });

  it('本来就小的图不放大，退化尺寸至少 1 px', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(fitSize(3000, 1, ATTACH_LONG_EDGE)).toEqual({ width: 2000, height: 1 });
  });

  it('压缩步骤只会越来越小，不会越压越大', () => {
    for (let index = 1; index < ENCODE_STEPS.length; index += 1) {
      const before = ENCODE_STEPS[index - 1];
      const after = ENCODE_STEPS[index];
      expect(after.scale * after.quality).toBeLessThan(before.scale * before.quality);
    }
  });

  it('只认常见位图；SVG 这种能带脚本的不收', () => {
    expect(isImageFile(new Blob([], { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new Blob([], { type: 'image/jpeg' }))).toBe(true);
    expect(isImageFile(new Blob([], { type: 'image/svg+xml' }))).toBe(false);
    expect(isImageFile(new Blob([], { type: 'text/plain' }))).toBe(false);
  });
});
