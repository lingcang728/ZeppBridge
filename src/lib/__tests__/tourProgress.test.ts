import { describe, expect, it } from 'vitest';
import { ALL_CHAPTERS, SECTIONS, TOUR_STEPS, type TourStep } from '../tour/chapters';
import { tourMessages } from '../../components/tour/tour.i18n';
import { TOUR_VERSION, chaptersToMark, needsRetour, presentSteps, storedTourVersion } from '../tour/progress';
import { forgetLetterPillSeen, forgetSeen, letterPillSeen, markLetterPillSeen, markSeen } from '../tour/sandbox';

describe('新手引导：什么时候算看过', () => {
  it('走完记整趟，跳过只记当前这一章，离开页面和没东西可讲都不记', () => {
    const chapters = ['intro', 'home'] as const;
    expect(chaptersToMark('done', chapters, 1)).toEqual(['intro', 'home']);
    // 跳过总览不连带各板块：只记当下那一章。
    expect(chaptersToMark('skip', chapters, 0)).toEqual(['intro']);
    expect(chaptersToMark('pause', chapters, 1)).toEqual([]);
    expect(chaptersToMark('abort', chapters, 0)).toEqual([]);
  });

  it('老安装引导版本落后要重看；新装和已是当前版本的不重看', () => {
    expect(storedTourVersion(null)).toBe(1);
    expect(storedTourVersion('garbage')).toBe(1);
    expect(needsRetour(true, null)).toBe(true);
    expect(needsRetour(true, '1')).toBe(true);
    expect(needsRetour(true, String(TOUR_VERSION))).toBe(false);
    // 首次启动还没处理过的是新装：走欢迎页 + 总览那条路，不归重看管。
    expect(needsRetour(false, null)).toBe(false);
  });
});

describe('新手引导：就地讲解只讲眼前有的', () => {
  const steps: TourStep[] = [
    { target: '.a' },
    { target: '.missing' },
    { target: '.card', open: 'pickDays' },
    { target: null },
  ];

  it('筛掉圈不到的步骤，下标保持原样（文案序号不变）', () => {
    const visible = (css: string) => css === '.a' || css === '.pick-days';
    expect(presentSteps(steps, visible)).toEqual([0, 2, 3]);
  });

  it('要先摊牌桌的那一步看「挑日子」按钮在不在', () => {
    expect(presentSteps(steps, (css) => css === '.a')).toEqual([0, 3]);
  });

  it('空页一步都不讲', () => {
    expect(presentSteps(steps.slice(0, 3), () => false)).toEqual([]);
  });
});

describe('新手引导：章节', () => {
  it('入门 + 十个板块，每章都有步骤，入门不超过 8 步', () => {
    expect(SECTIONS).toHaveLength(10);
    expect(ALL_CHAPTERS).toHaveLength(11);
    for (const id of ALL_CHAPTERS) expect(TOUR_STEPS[id].length).toBeGreaterThan(0);
    expect(TOUR_STEPS.intro).toHaveLength(8);
    expect(TOUR_STEPS.letters).toHaveLength(3);
  });

  it('每一步都有中英西三份文案，没有多出来的', () => {
    for (const bundle of [tourMessages.zh, tourMessages.en, tourMessages.es]) {
      for (const id of ALL_CHAPTERS) {
        const copy = bundle.steps[id] as Record<string, string>;
        const keys = Object.keys(copy).filter((key) => /^s\d+$/.test(key));
        expect(keys.sort()).toEqual(TOUR_STEPS[id].map((_, index) => `s${index + 1}`).sort());
      }
    }
  });

  it('沙盒要换页：每一步都写明在哪一页', () => {
    for (const id of ALL_CHAPTERS) for (const step of TOUR_STEPS[id]) expect(step.route).toMatch(/^\//);
  });

  it('右上角信件圆钮提示：intro 或 letters 看过即置位，重置引导时一并清空', () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    } as unknown as Storage;
    const prev = (globalThis as { window?: { __ZB_REAL_STORAGE__?: Storage } }).window;
    (globalThis as { window: { __ZB_REAL_STORAGE__?: Storage } }).window = { __ZB_REAL_STORAGE__: fakeStorage };
    try {
      forgetLetterPillSeen();
      expect(letterPillSeen()).toBe(false);
      markLetterPillSeen();
      expect(letterPillSeen()).toBe(true);
      forgetSeen(['letters']);
      expect(letterPillSeen()).toBe(false);
      markSeen(['intro']);
      expect(letterPillSeen()).toBe(true);
      forgetSeen(['intro']);
      expect(letterPillSeen()).toBe(false);
    } finally {
      if (prev === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window: unknown }).window = prev;
    }
  });
});
