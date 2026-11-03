/*
 * 新手引导「看过没有」的规矩（纯函数，Vitest 守着；读写存储在 sandbox.ts）。
 *
 * - 走完一章才算看过；点「跳过」只记当前这一章——跳过总览不连带跳过各板块。
 * - 就地讲解中途离开页面只是暂停，什么都不记，下次打开再讲。
 * - 引导内容大改时升 TOUR_VERSION：老安装（首次启动早已处理过）看到版本落后，就清空看过、重看总览。
 */
import type { TourStep } from './chapters';

/** 3.1.1 重写引导时定为 2；以前的安装没有这个键，算 1。 */
export const TOUR_VERSION = 2;

/** 一章是怎么结束的：走完 / 点了跳过 / 就地讲解时离开了页面 / 眼前没有可讲的东西。 */
export type TourEnd = 'done' | 'skip' | 'pause' | 'abort';

/** 结束时哪几章记为看过。 */
export const chaptersToMark = <T extends string>(end: TourEnd, chapters: readonly T[], current: number): T[] => {
  if (end === 'done') return [...chapters];
  if (end === 'skip') return chapters[current] ? [chapters[current]!] : [];
  return [];
};

/** 存着的引导版本；读不到、不是数字都算 1（升级前的安装）。 */
export const storedTourVersion = (raw: string | null): number => {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

/** 老安装要不要重看：首次启动早已处理过（有过引导），版本又落后。新装走首次启动那条路，不归这里管。 */
export const needsRetour = (firstLaunchHandled: boolean, rawVersion: string | null): boolean =>
  firstLaunchHandled && storedTourVersion(rawVersion) < TOUR_VERSION;

/**
 * 就地讲解只讲眼前已经出现的步骤；返回保留下来的步骤下标（文案序号不变）。
 * `open: 'pickDays'` 的那一步要先点开牌桌，牌还没出来：只要「挑日子」按钮在，就算在。
 */
export const presentSteps = (steps: readonly TourStep[], visible: (css: string) => boolean): number[] =>
  steps.flatMap((step, index) => {
    if (step.target === null) return [index];
    if (step.open === 'pickDays') return visible('.pick-days') ? [index] : [];
    return visible(step.target) ? [index] : [];
  });
