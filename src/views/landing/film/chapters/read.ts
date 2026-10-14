import type { Chapter } from '../types';
import { ADD_EVENT, page, tapNth } from './look';
import { openTable } from './cards';

const PAGE_TRACK = '.main-content .page .segment-track';

/**
 * 第三章 看懂（计划 3.1–3.6）：指标墙、按关注组卡、每小时步数、运动详情与 FIT、缺了就留白、生活事件。
 * 每镜一页；生活事件那镜顺带拍到「生活事件分类」玻璃条和滚轮式日期（计划 1.1 的 ⑦⑧）。
 */
export const read: Chapter = {
  id: 'read',
  label: 'chapterRead',
  shots: [
    {
      // 3.1 数十项指标，尽收眼底：概览的指标磁贴一齐飞入，三排左右滚。
      id: 'metrics', ms: 6000, pose: 'full', caption: 'metrics',
      async run(d) {
        await d.cut(async () => { await d.wall('metrics'); });
        await d.wait(1600);
        await d.camera(d.all('.film-wall.metrics .wall-row'), { zoom: 1.12, fill: 1, ms: 3600, hold: 3600 });
      },
    },
    {
      // 3.2 睡眠还是训练，首页随你排：概览「我关注」在 睡眠 → 日常状态 → 训练 → 均衡 之间切，指标卡跟着换。
      id: 'focusAreas', ms: 5600, pose: 'full', caption: 'focusAreas',
      async run(d) {
        await page(d, '/');
        for (const index of [1, 2, 3, 0]) await tapNth(d, `${PAGE_TRACK} .segment-item`, index, 700);
      },
    },
    {
      // 3.3 一日之步，按时细数：今日步数下钻到每小时（步数、距离、热量、活动时长）。
      id: 'hourly', ms: 5200, pose: 'full', caption: 'hourly',
      async run(d) {
        await page(d, '/activity');
        await d.camera('.hourly-card', { zoom: 1.5, fill: 0.9, ms: 900, hold: 1600 });
        await d.camera(null, { ms: 800, hold: 1000 });
      },
    },
    {
      // 3.4 跑过的路，都有回声：一次跑步的详情，推近到「和你自己距离相近的最近几次相比」那张卡（10-14 用户：以前没凸显对比）。
      id: 'workout', ms: 6400, pose: 'full', caption: 'workout',
      async run(d) {
        await d.cut(async () => {
          await d.clear();
          await d.go('/workouts', 200);
          await d.follow('.record-list a');
          await d.scrollTo('.insight-card', 70, 1);
        });
        const card = await d.find('.insight-card');
        await d.camera(card, { zoom: 1.6, fill: 0.96, ms: 900, hold: 2600 });
        await d.camera(null, { ms: 700, hold: 200 });
      },
    },
    {
      // 四种格式，一次满足：同一次运动的「导出与分享」，JSON → CSV → GPX → FIT 四格都在（设置里只有前三种）。
      id: 'formats', ms: 4400, pose: 'full', caption: 'formats',
      async run(d) {
        await d.scrollTo('.deliver-card', 160, 600);
        const track = d.all('.deliver-card .segment-track')[0];
        if (track) {
          await d.camera(track.closest('.deliver-card') ?? track, { zoom: 1.8, fill: 0.8, ms: 500, hold: 100 });
          const items = [...track.querySelectorAll<HTMLElement>('.segment-item')];
          for (const item of items.slice(1)) await d.tap(item, { after: 380, travel: 200 });
        }
      },
    },
    {
      // 3.5 绝不编造任何数据：牌桌里没有记录的那天，读数是「—」，压暗、不能挑。
      id: 'blank', ms: 6000, pose: 'full', caption: 'blank',
      async run(d) {
        await d.cut(() => openTable(d));
        await tapNth(d, '.card-table .segment-item', 1, 400);
        // 1 个月按自然周叠成 5 叠，第 4 叠（10/5–10/11）两头各有一天没测到。
        await d.tap(await d.find('.card-table button.pcard.week:not(.empty)', { index: 3 }), { after: 400 });
        await d.find('.card-table button.pcard.day');
        const gaps = d.all('.card-table button.pcard.day.disabled');
        if (gaps.length) await d.camera(gaps[gaps.length - 1]!, { zoom: 2.2, fill: 0.5, ms: 900, hold: 2200 });
      },
    },
    {
      // 3.6 身有起伏，事出有因：添加生活事件——分类玻璃条（身体与恢复 / 旅行与出差 …）、滚轮选日期。
      id: 'events', ms: 6800, pose: 'full', caption: 'events',
      async run(d) {
        await d.cut(async () => { await d.clear(); await d.go('/', 200); await d.scrollTo(ADD_EVENT, 300, 1); });
        await d.tap(ADD_EVENT, { after: 500 });
        const dialog = await d.find('[data-modal-dialog] .segment-track');
        const box = dialog.closest('[data-modal-dialog]') ?? dialog;
        await d.camera(box, { zoom: 1.5, fill: 0.92, ms: 600, hold: 100 });
        const items = [...box.querySelectorAll<HTMLElement>('.segment-item')];
        // 默认是「其他」：点到「身体与恢复」再到「旅行与出差」，透镜滑两下；再拨一下日期滚轮。弹窗留到下一镜切走。
        for (const index of [0, 1]) if (items[index]) await d.tap(items[index]!, { after: 420, travel: 220 });
        const day = box.querySelector<HTMLElement>('.wheel-col.col-d');
        if (day) await d.drag(day, { x: 0, y: -60 }, { ms: 480, settle: 500, grab: 140 });
      },
    },
  ],
};
