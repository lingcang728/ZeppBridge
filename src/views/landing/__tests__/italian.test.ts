import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import italian from '../it';
import { P4_COPY } from '../p4Copy';
import { JOURNEY } from '../journeyCopy';
import { filmCaption, filmLocale, filmScript } from '../film/copy';
import film from '../film/locales/it';
import { dialogueCopy } from '../../../demo/dialogueCopy';

const leafPaths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`))
    : [prefix];

describe('Italian website and embedded demonstrations', () => {
  it('provides all landing and journey fields without falling back to English', () => {
    expect(leafPaths(italian.copy).sort()).toEqual(leafPaths(COPY.en).sort());
    expect(leafPaths(JOURNEY.it).sort()).toEqual(leafPaths(JOURNEY.en).sort());
    expect(P4_COPY.it).toBeDefined();
    expect(JOURNEY.it).not.toBe(JOURNEY.en);
    expect(italian.copy.hero.edition).not.toContain('in fase di sviluppo');
  });

  it('keeps the film, watch and AI conversation in Italian', () => {
    expect(filmLocale('it')).toBe('it');
    expect(filmCaption('it', 'tagline')).toEqual(film.captions.tagline);
    expect(filmCaption('it', 'ash').sub).toContain('Dodici');
    expect(filmScript('it')).toEqual(film.script);
    expect(filmScript('it').watchName).toBe('Corsa facile');
    expect(dialogueCopy('it').example).toBe('Conversazione di esempio');
  });
});
