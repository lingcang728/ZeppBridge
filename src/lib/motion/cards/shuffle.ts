/**
 * 洗牌 / 切牌（精修批次 7.1）。
 *
 * 洗牌：牌一左一右错开、略歪，再合拢——用在牌桌换范围（7 天 ↔ 1 个月 ↔ 6 个月）时，告诉人「换了一副」。
 * 切牌：上半叠抬起滑到一边，下半叠让位，再合回去——用在收集箱按指标归拢时，告诉人「重新理过了」。
 * 只动单独的 translate / rotate 属性：叠在牌原有的 transform 上（收集箱圈上的牌本身就转着角度），
 * 不会把它们拽回原点。减少动效时什么都不放。
 */
import { reducedMotion, settled } from './spring';

const SHUFFLE_MS = 420;
const CUT_MS = 480;

export const shuffleCards = async (cards: HTMLElement[]): Promise<void> => {
  if (!cards.length || reducedMotion()) return;
  await settled(cards.map((card, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const dx = side * (22 + ((i * 13) % 18));
    const tilt = side * (3 + ((i * 7) % 5));
    return card.animate(
      [{ translate: '0 0', rotate: '0deg' }, { translate: `${dx}px 0`, rotate: `${tilt}deg`, offset: 0.45 }, { translate: '0 0', rotate: '0deg' }],
      { duration: SHUFFLE_MS, delay: i * 22, easing: 'cubic-bezier(.45, 0, .2, 1)' },
    );
  }));
};

export const cutDeck = async (cards: HTMLElement[]): Promise<void> => {
  if (cards.length < 2 || reducedMotion()) return;
  const half = Math.ceil(cards.length / 2);
  await settled(cards.map((card, i) => {
    const top = i < half;
    const lifted = top ? { translate: '34px -18px', rotate: '4deg' } : { translate: '-14px 6px', rotate: '-2deg' };
    return card.animate(
      [{ translate: '0 0', rotate: '0deg' }, { ...lifted, offset: 0.5 }, { translate: '0 0', rotate: '0deg' }],
      { duration: CUT_MS, easing: 'cubic-bezier(.4, .6, .2, 1)' },
    );
  }));
};
