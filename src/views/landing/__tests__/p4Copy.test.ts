import { describe, expect, it } from 'vitest';
import { P4_COPY, type P4Copy } from '../p4Copy';

/** 译文只换字：章节、要点、演示片、设置项、顶栏链接的 id / scene / icon 必须和 zh 一模一样。 */
const shape = (copy: P4Copy) => ({
  chapters: copy.chapters.map((chapter) => [chapter.id, chapter.points.map((point) => [point.id, point.scene])]),
  settings: copy.settings.items.map((item) => [item.id, item.icon]),
  nav: copy.nav.map((column) => column.links.map((link) => link.id)),
});

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

describe('P4 landing copy', () => {
  const zh = P4_COPY.zh!;
  it.each(Object.entries(P4_COPY).filter(([locale]) => locale !== 'zh'))('%s mirrors the zh structure', (_locale, copy) => {
    expect(shape(copy!)).toEqual(shape(zh));
  });

  it.each(Object.entries(P4_COPY).filter(([locale]) => locale !== 'zh'))('%s has no Chinese left in it', (_locale, copy) => {
    expect(strings(copy).filter((text) => /[一-鿿]/.test(text))).toEqual([]);
  });
});
