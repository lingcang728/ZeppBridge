import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import korean from '../ko';
import { P4_COPY } from '../p4Copy';
import { JOURNEY } from '../journeyCopy';
import { reelCopy } from '../reelCopy';
import { filmPlayerLabels } from '../film/copy';
import { LANDING_LOCALES, LOCALE_LABELS } from '../../../composables/useLandingLocale';

const leafPaths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`))
    : [prefix];

describe('Korean website integration', () => {
  it('sits in the language menu where the app puts it, under its own name', () => {
    expect(LANDING_LOCALES.slice(-3)).toEqual(['pl', 'ko', 'zh-TW']);
    expect(LOCALE_LABELS.ko).toBe('한국어');
  });

  it('provides the complete landing, chapter, journey and player shapes', () => {
    expect(leafPaths(korean.copy).sort()).toEqual(leafPaths(COPY.en).sort());
    expect(leafPaths(korean.meta).sort()).toEqual(['.description', '.ogDescription', '.ogTitle', '.title']);
    expect(leafPaths(JOURNEY.ko).sort()).toEqual(leafPaths(JOURNEY.en).sort());
    expect(P4_COPY.ko?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)])).toEqual(
      P4_COPY.en?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)]),
    );
    expect(leafPaths(reelCopy('ko')).sort()).toEqual(leafPaths(reelCopy('en')).sort());
    expect(leafPaths(filmPlayerLabels('ko')).sort()).toEqual(leafPaths(filmPlayerLabels('en')).sort());
  });
});
