import type { Director } from '../director';
import type { Shot } from '../types';
import { page, tapNth, toSleep } from './look';

const TABLE = '.card-table';
const DAY = `${TABLE} button.pcard.day:not(.disabled)`;
const MONTH = `${TABLE} button.pcard.month:not(.empty)`;
const WEEK = `${TABLE} button.pcard.week:not(.empty)`;
const BOX = '#card-collection-box:not(.empty)';

/** 从概览的睡眠卡进睡眠页，再点「挑几天交给 AI」打开牌桌（默认 7 天，发牌）。 */
export const openTable = async (d: Director) => {
  await toSleep(d);
  await d.pressUntil('button.pick-days', `${TABLE} .segment-item`);
};

/** 把一张牌拖到另一张上（叠成一叠）。 */
const pileOnto = async (d: Director, from: HTMLElement, onto: HTMLElement) => {
  const a = d.center(from), b = d.center(onto);
  await d.drag(from, { x: b.x - a.x, y: b.y - a.y }, { ms: 560, settle: 450, grab: 160 });
};

/**
 * 第一章 外观中段：牌墙 + 扑克牌三页（计划 1.4）、设置大卡（1.5）、交给 AI 线条卡（1.6）。
 * 每一页只做一件事；每次点之前导演层会等上一段动画落定（10-14：以前展开到一半就点回去了）。
 */
export const lookCards: Shot[] = [
  {
    // 牌墙：三排真牌并排滚，颜色跟着指标；时不时翻到背面「交给 AI ✓」。
    id: 'deckwall', ms: 6000, pose: 'full', caption: 'poker',
    async run(d) {
      await d.cut(async () => { await d.wall('cards'); });
      await d.wait(1200);
      await d.camera(d.all('.film-wall.cards .wall-row'), { zoom: 1.18, fill: 1, ms: 3600, hold: 3600 });
    },
  },
  {
    // 一层层展开：6 个月 → 点进十月（月牌收到左上角、周牌展开）→ 点进一周（日牌展开）。
    id: 'layers', ms: 6800, pose: 'full', caption: 'poker',
    async run(d) {
      await d.cut(() => openTable(d));
      await tapNth(d, `${TABLE} .segment-item`, 2, 600);
      await d.tap(await d.find(MONTH, { index: 5 }), { after: 700 });
      await d.tap(await d.find(WEEK, { index: 1 }), { after: 700 });
    },
  },
  {
    // 挑牌：翻面点「✓ 交给 AI」→ 两张叠成一叠 → 长按整叠飞进箱子。
    id: 'pick', ms: 7000, pose: 'full', caption: 'poker',
    async run(d) {
      await d.tap(await d.find(DAY, { index: 1 }), { after: 500 });
      await d.tap(`${TABLE} .pcard.confirm .back-send`, { after: 700 });
      const days = d.all(DAY);
      if (days.length >= 4) {
        await pileOnto(d, days[days.length - 1]!, days[days.length - 2]!);
        await pileOnto(d, days[days.length - 3]!, days[days.length - 2]!);
        await d.hold(days[days.length - 2]!, 600, { after: 800 });
      }
    },
  },
  {
    // 收集箱：打开、一手牌摊开；往上甩掉一张；清空，逐张落下消失。
    id: 'box', ms: 5600, pose: 'full', caption: 'poker',
    async run(d) {
      await d.tap(BOX, { after: 600 });
      const hand = () => d.all('.box-spread .hand-card');
      await d.camera(hand(), { zoom: 1.4, ms: 600 });
      const cards = hand();
      if (cards.length > 1) await d.drag(cards[cards.length - 1]!, { x: 0, y: -320 }, { flick: true, ms: 200, settle: 600, grab: 140 });
      await d.tap('.box-spread .spread-foot .foot-button', { after: 900 });
      await d.camera(null, { ms: 400, hold: 0 });
    },
  },
  {
    // 1.5 设置大卡：小卡叠（cover）→ 展开全部成大卡 → 点开一张 → 收回原位。
    id: 'deck', ms: 6200, pose: 'full', caption: 'deck',
    async run(d) {
      await d.cut(async () => {
        await d.clear();
        // 从小卡叠（cover）开始：直接写进演示自己的一次性存储（CardDeck 的 LAYOUT_KEY），不用进页面再点「收起」。
        d.view.localStorage.setItem('zeppbridge-settings-layout', 'cover');
        await d.go('/settings', 200);
        await d.find('.deck-unbox');
      });
      await d.tap('.deck-unbox', { after: 700 });
      await d.tap(await d.find('button.list-open', { index: 2 }), { after: 900 });
      await d.tap('.deck-close', { after: 600 });
    },
  },
  {
    // 1.6 交给 AI 的线条卡：拖开一张、松手回弹（旁边的被碰开），点开一张浮起来。
    id: 'lines', ms: 5600, pose: 'full', caption: 'lines',
    async run(d) {
      await page(d, '/ai');
      const slots = d.all('.slot-button');
      if (slots.length >= 3) {
        await d.drag(slots[1]!, { x: 150, y: 70 }, { ms: 520, settle: 700, grab: 160 });
        await d.tap(slots[0]!, { after: 1300 });
        await d.escape(300);
      }
    },
  },
];
