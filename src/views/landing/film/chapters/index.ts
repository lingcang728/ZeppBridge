import type { Chapter } from '../types';
import { lookIntro, prologue } from './look';
import { lookCards } from './cards';
import { lookSwitches } from './switches';
import { connect } from './connect';
import { read } from './read';
import { ai } from './ai';
import { finale, settings } from './settings';
import { short } from './short';

/** 第一章 外观（计划 1.1–1.8）。 */
const look: Chapter = { id: 'look', label: 'chapterLook', shots: [...lookIntro, ...lookCards, ...lookSwitches] };

/** 完整长版的章节顺序（计划第四节，约 3 分 20 秒），`?cut=full`。 */
export const FULL_FILM: Chapter[] = [prologue, look, connect, read, ai, settings, finale];
/** 一分钟短片（网站开场与社交平台用的就是它）。 */
export const SHORT_FILM: Chapter[] = [short];
/** 这次放哪一版：默认短片，地址里带 `cut=full` 放长版。 */
export const pickFilm = (search: string): Chapter[] => (new URLSearchParams(search).get('cut') === 'full' ? FULL_FILM : SHORT_FILM);
/** 配乐（scripts/site/compose-score.py）只为短片编排；长版不配乐。 */
export const FILM_SCORE = '/landing/media/film-score.m4a';
