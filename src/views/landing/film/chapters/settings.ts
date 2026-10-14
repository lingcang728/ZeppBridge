import type { Director } from '../director';
import type { Chapter } from '../types';
import { page } from './look';

/** 打开的设置卡里的分段条和开关（排除顶栏的导航、主题两根，和卡叠里「同步」卡头上的开关）。 */
const CARD_TRACK = '.main-content .segment-track:not(.pill-nav):not(.theme-toggle)';
const SWITCH = '.main-content .glass-switch';

const tapIn = async (d: Director, track: HTMLElement | undefined, order: number[], after = 360) => {
  const items = [...(track?.querySelectorAll<HTMLElement>('.segment-item') ?? [])];
  for (const index of order) if (items[index]) await d.tap(items[index]!, { after, travel: 220 });
};
/** 屏幕里第 n 根分段条（按出现顺序；滚动后重新数）。 */
const nthTrack = (d: Director, n: number) => d.all(CARD_TRACK)[n];

/**
 * 第五章 设置（计划第五章，thoughts 五.1–五.3）：MCP 与「允许 AI 直接发布」、默认导出格式、距离单位、
 * 时间 / 日期格式、界面缩放、交给 AI 的文件命名、数据文件夹、数据库快照、本机 REST API。一张卡一页、快切。
 */
export const settings: Chapter = {
  id: 'settings',
  label: 'chapterSettings',
  shots: [
    {
      // 本机 AI，直接来问：MCP 那一块，打开「允许 AI 直接发布训练计划」。
      id: 'mcp', ms: 4600, pose: 'full', caption: 'mcp',
      async run(d) {
        await page(d, '/settings/ai');
        const switches = d.all(SWITCH);
        const publish = switches[switches.length - 2];
        if (publish) {
          await d.camera(publish.closest('.s-row') ?? publish, { zoom: 1.8, fill: 0.7, ms: 500, hold: 100 });
          await d.tap(publish, { after: 700 });
        }
      },
    },
    {
      // 公里或英里：显示与语言卡里切距离单位。
      id: 'units', ms: 3600, pose: 'full', caption: 'display',
      async run(d) {
        await page(d, '/settings/display');
        const track = d.all(CARD_TRACK).find((el) => el.querySelectorAll('.segment-item').length === 2);
        if (track) {
          await d.camera(track, { zoom: 2, ms: 450, hold: 100 });
          await tapIn(d, track, [1, 0], 420);
        }
      },
    },
    {
      // 12 或 24、大小随心：高级卡里切时间格式，界面缩放拉到 125% 再回 100%；顺带文件命名、数据文件夹那几行。
      id: 'scale', ms: 6000, pose: 'full', caption: 'display',
      async run(d) {
        await page(d, '/settings/advanced');
        await tapIn(d, nthTrack(d, 0), [2, 1], 300);
        await tapIn(d, nthTrack(d, 2), [4], 1000);
        await tapIn(d, nthTrack(d, 2), [2], 700);
        await tapIn(d, nthTrack(d, 3), [1, 0], 300);
      },
    },
    {
      // 快照在手：滚到「数据库快照与恢复」，生成一份快照。
      id: 'backup', ms: 4400, pose: 'full', caption: 'backup',
      async run(d) {
        const create = d.all('.main-content .page button.button.primary').pop();
        if (create) {
          await d.scrollTo(create, 300, 500);
          await d.camera(create.closest('section') ?? create, { zoom: 1.5, fill: 0.9, ms: 450, hold: 100 });
          await d.tap(create, { after: 1100 });
          await d.camera(null, { ms: 300, hold: 0 });
        }
      },
    },
    {
      // 本机 API，只对你开门：同一张高级卡再往下，打开「启用本机 API」（隐私卡里只是一个「去设置」入口）。
      id: 'api', ms: 4400, pose: 'full', caption: 'api',
      async run(d) {
        await d.camera(null, { ms: 300, hold: 0 });
        const toggle = d.all(SWITCH).pop();
        if (toggle) {
          await d.scrollTo(toggle, 330, 500);
          await d.camera(toggle.closest('.s-row') ?? toggle, { zoom: 1.8, fill: 0.7, ms: 450, hold: 100 });
          await d.tap(toggle, { after: 1000 });
        }
      },
    },
  ],
};

/** 尾：标语、免费开源三平台、网址。窗口退场，只留大字。 */
export const finale: Chapter = {
  id: 'finale',
  label: 'tryIt',
  shots: [
    { id: 'tagline', ms: 2600, pose: 'title', caption: 'tagline', async run(d) { d.hidePointer(); await d.clear(); } },
    { id: 'free', ms: 2400, pose: 'title', caption: 'free', async run() {} },
    { id: 'try', ms: 3000, pose: 'title', caption: 'tryIt', async run() {} },
  ],
};
