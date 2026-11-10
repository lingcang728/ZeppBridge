import { afterEach, describe, expect, it } from 'vitest';
import { defineMessages, registerLocalePack, setLocale } from '../../i18n';
import { ownShort } from '../shortLabel';

/*
 * 胶囊短名只用当前语言自己的那一份：短名刚加、还没翻的语言会回落英文，
 * 那时退到短名就成了葡语界面里冒出一个「Forever」。没翻的当作没有短名。
 */
const bundle = defineMessages(
  { forever: '永久保留', foreverShort: '永久' },
  { forever: 'Keep forever', foreverShort: 'Forever' },
  { forever: 'Para siempre' },
  'test/short-label',
);
const pick = (tree: { foreverShort: string }) => tree.foreverShort;

describe('ownShort', () => {
  afterEach(() => setLocale('en'));

  it('英文界面和中文界面用自己写的短名', () => {
    setLocale('en');
    expect(ownShort(bundle, pick)).toBe('Forever');
    setLocale('zh');
    expect(ownShort(bundle, pick)).toBe('永久');
  });

  it('还没翻（回落成英文）的语言当作没有短名', () => {
    setLocale('es');
    expect(ownShort(bundle, pick)).toBeUndefined();
    registerLocalePack('pt-PT', { modules: { 'test/short-label': { forever: 'Manter para sempre' } } });
    setLocale('pt-PT');
    expect(ownShort(bundle, pick)).toBeUndefined();
  });

  it('翻好了就用那一份', () => {
    registerLocalePack('de', { modules: { 'test/short-label': { foreverShort: 'Immer' } } });
    setLocale('de');
    expect(ownShort(bundle, pick)).toBe('Immer');
  });
});
