import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import polish from '../pl';
import { P4_COPY } from '../p4Copy';
import { JOURNEY } from '../journeyCopy';
import { reelCopy } from '../reelCopy';
import { filmCaption, filmLocale, filmPlayerLabels, filmScript } from '../film/copy';
import film from '../film/locales/pl';
import { dialogueCopy } from '../../../demo/dialogueCopy';

const leafPaths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`))
    : [prefix];

describe('Polish website integration (copy awaiting translation)', () => {
  it('provides the complete landing, chapter and journey shapes', () => {
    expect(leafPaths(polish.copy).sort()).toEqual(leafPaths(COPY.en).sort());
    expect(leafPaths(JOURNEY.pl).sort()).toEqual(leafPaths(JOURNEY.en).sort());
    expect(leafPaths(P4_COPY.pl).sort()).toEqual(leafPaths(P4_COPY.en).sort());
    expect(P4_COPY.pl?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)])).toEqual(
      P4_COPY.en?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)]),
    );
  });

  it('keeps Polish selected through films and live conversations', () => {
    expect(filmLocale('pl')).toBe('pl');
    expect(filmCaption('pl', 'tagline')).toEqual(film.captions.tagline);
    expect(filmScript('pl')).toEqual(film.script);
    expect(leafPaths(filmPlayerLabels('pl')).sort()).toEqual(leafPaths(filmPlayerLabels('en')).sort());
    expect(leafPaths(reelCopy('pl')).sort()).toEqual(leafPaths(reelCopy('en')).sort());
    expect(leafPaths(dialogueCopy('pl')).sort()).toEqual(leafPaths(dialogueCopy('en')).sort());
    expect(dialogueCopy('pl').finalTurn.answer).toBeTruthy();
  });
});
