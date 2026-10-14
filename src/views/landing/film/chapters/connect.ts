import type { Director } from '../director';
import type { Chapter } from '../types';
import { page } from './look';

/** 打开的设置卡里的分段条（排除顶栏的导航和主题两根）。 */
const CARD_TRACK = '.main-content .segment-track:not(.pill-nav):not(.theme-toggle)';
/** 演示数据集里那块表的设备键（demo/dataset.ts 的 DEMO_DEVICE_ID；不 import，免得把演示数据打进网站包）。 */
const DEMO_DEVICE = '/devices/DEMO0000BAND01';

const tapItems = async (d: Director, track: HTMLElement, order: number[], after = 380) => {
  const items = [...track.querySelectorAll<HTMLElement>('.segment-item')];
  for (const index of order) if (items[index]) await d.tap(items[index]!, { after, travel: 220 });
};

/** 第二章 连接（计划 2.1–2.4）：云端同步、自动同步、设备识别与指认、归档留存。每镜一页。 */
export const connect: Chapter = {
  id: 'connect',
  label: 'chapterConnect',
  shots: [
    {
      // 2.1 云上有的，桌上都有：点顶栏同步胶囊，「同步中 3/8 → 8/8 → 数据已备好」，概览的数跟着刷新。
      id: 'cloud', ms: 6600, pose: 'full', caption: 'cloud',
      async run(d) {
        await page(d, '/');
        await d.camera('.sync-pill', { zoom: 2.6, ms: 600, hold: 200 });
        await d.tap('.sync-pill', { after: 2200 });
        await d.camera(null, { ms: 600, hold: 300 });
      },
    },
    {
      // 2.2 你睡你的，它同步它的：同步卡里自动同步 关 → 15 → 30 → 60 分钟。
      id: 'autosync', ms: 6400, pose: 'full', caption: 'autosync',
      async run(d) {
        await page(d, '/settings/sync');
        const track = await d.find(CARD_TRACK);
        await d.camera(track, { zoom: 1.8, ms: 500, hold: 100 });
        // 默认是 15 分钟：关 → 30 → 60，三下走完四档。
        await tapItems(d, track, [0, 2, 3], 300);
      },
    },
    {
      // 2.3 每一块表，都认得：两排设备英雄图并排滚（设备目录）。
      id: 'devices', ms: 4600, pose: 'full', caption: 'devices',
      async run(d) {
        await d.cut(async () => { await d.wall('devices'); });
        await d.camera(d.all('.film-wall.devices .marquee-row'), { zoom: 1.15, fill: 1, ms: 3400, hold: 3400 });
      },
    },
    {
      // 认错了就亲手指认：设备页「不对，我来指认」→ 型号轮播，按类别筛、左右翻。
      id: 'picker', ms: 5600, pose: 'full', caption: 'devices',
      async run(d) {
        await d.cut(async () => {
          await d.clear();
          await d.go(DEMO_DEVICE, 200);
          await d.pressUntil('.main-content .page button.button.primary', '.picker-arrow');
          await d.scrollTo('.picker-arrow', 360, 1);
        });
        await d.camera(d.all('.picker-arrow'), { zoom: 1.35, fill: 1, ms: 500, hold: 100 });
        const wheel = d.all('.main-content .page .capsule-wheel')[0];
        const watches = wheel?.querySelector<HTMLElement>('.wheel-item[data-wheel-index="1"]');
        if (watches) await d.tap(watches, { after: 600 });
        const next = d.all('.picker-arrow')[1];
        if (next) for (let n = 0; n < 3; n++) await d.tap(next, { after: 420, travel: 160 });
      },
    },
    {
      // 2.4 健康数据只在你的电脑上：归档卡「保留多久」点到「一直保留」。
      id: 'local', ms: 4800, pose: 'full', caption: 'local',
      async run(d) {
        await page(d, '/settings/archive');
        const track = await d.find(CARD_TRACK);
        await d.camera(track, { zoom: 2.2, ms: 600, hold: 200 });
        const count = track.querySelectorAll('.segment-item').length;
        await tapItems(d, track, [count - 3, count - 1], 600);
        await d.camera(null, { ms: 600 });
      },
    },
  ],
};
