import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import traditionalChinese from '../zh-TW';
import { P4_COPY } from '../p4Copy';
import { JOURNEY } from '../journeyCopy';
import { reelCopy } from '../reelCopy';
import { filmCaption, filmLocale, filmPlayerLabels, filmScript } from '../film/copy';
import film from '../film/locales/zh-TW';
import { dialogueCopy } from '../../../demo/dialogueCopy';

const leafPaths = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`))
    : [prefix];

describe('Traditional Chinese website integration', () => {
  it('provides the complete landing, chapter and journey shapes', () => {
    expect(leafPaths(traditionalChinese.copy).sort()).toEqual(leafPaths(COPY.en).sort());
    expect(leafPaths(JOURNEY['zh-TW']).sort()).toEqual(leafPaths(JOURNEY.en).sort());
    expect(leafPaths(P4_COPY['zh-TW']).sort()).toEqual(leafPaths(P4_COPY.en).sort());
    expect(P4_COPY['zh-TW']?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)])).toEqual(
      P4_COPY.en?.chapters.map(chapter => [chapter.id, chapter.points.map(point => point.scene)]),
    );
  });

  it('keeps Traditional Chinese selected through films and live conversations', () => {
    expect(filmLocale('zh-TW')).toBe('zh-TW');
    expect(filmCaption('zh-TW', 'tagline')).toEqual(film.captions.tagline);
    expect(filmScript('zh-TW')).toEqual(film.script);
    expect(leafPaths(filmPlayerLabels('zh-TW')).sort()).toEqual(leafPaths(filmPlayerLabels('en')).sort());
    expect(leafPaths(reelCopy('zh-TW')).sort()).toEqual(leafPaths(reelCopy('en')).sort());
    expect(leafPaths(dialogueCopy('zh-TW')).sort()).toEqual(leafPaths(dialogueCopy('en')).sort());
    expect(dialogueCopy('zh-TW').finalTurn.answer).toBeTruthy();
    expect(traditionalChinese.meta.title).toContain('手錶記錄，自己的檔案');
    expect(JOURNEY['zh-TW'].nav.download).toBe('下載');
    expect(reelCopy('zh-TW').retry).toBe('重試');
    expect(filmPlayerLabels('zh-TW').play).toBe('播放');
    expect(filmPlayerLabels('zh-TW').skip).toBe('略過');
    expect(filmPlayerLabels('zh-TW').mute).toBe('靜音');
    expect(filmPlayerLabels('zh-TW').soundOn).toBe('開啟聲音');
    expect(filmScript('zh-TW')).not.toEqual(filmScript('en'));
    expect(dialogueCopy('zh-TW').finalTurn.answer).not.toBe(dialogueCopy('en').finalTurn.answer);
  });
});
