import type { Director } from '../director';
import type { Chapter, Shot } from '../types';

/** 序：黑场里只有标语，同时把应用在后台摆到概览、记下睡眠页地址（遮住第一次加载，后面换页一步到位）。 */
export const prologue: Chapter = {
  id: 'prologue',
  label: 'tagline',
  shots: [{
    id: 'tagline', ms: 3000, pose: 'title', caption: 'tagline',
    async run(d) {
      await d.clear();
      await d.go('/');
      const link = await d.find('a.sleep-panel[href]');
      d.memo.set('sleep', link.getAttribute('href') ?? '/sleep');
    },
  }],
};

/** 按位置点（不按文字：访客用别的语言时 iframe 里也是那种语言）。 */
export const tapNth = async (d: Director, selector: string, index: number, after = 450) => d.tap(await d.find(selector, { index }), { after, travel: 260 });
export const ADD_EVENT = '#life-events .le-head .pill-button';
/** 换到一页：关掉展示墙和浮层、到路由、滚到顶。 */
export const page = (d: Director, path: string) => d.cut(async () => { await d.clear(); await d.go(path, 200); });
/** 黑场里直接进最近一晚的睡眠页（第一次跟着概览睡眠卡的链接走并记下地址，之后一步跳到；不演形变）。 */
export const toSleep = async (d: Director) => {
  await d.clear();
  const known = d.memo.get('sleep');
  if (known) { await d.go(known, 150); return; }
  await d.go('/', 150);
  await d.follow('a.sleep-panel');
  d.memo.set('sleep', d.view.location.pathname);
};

/**
 * 第一章 外观前半（计划 1.1–1.3）。10-14 用户：一镜只停一页，别来回切；玻璃像两排手表那样并排滚。
 */
export const lookIntro: Shot[] = [
  {
    // 1.1 一见，倾心：玻璃墙——应用里各处的玻璃条三排并排滚，透镜此起彼伏；镜头慢慢推近。
    id: 'glass', ms: 7000, pose: 'full', caption: 'glass',
    async run(d) {
      await d.cut(async () => { await d.wall('glass'); });
      await d.wait(1600);
      await d.camera(d.all('.film-wall.glass .wall-row'), { zoom: 1.22, fill: 1, ms: 4200, hold: 4200 });
    },
  },
  {
    // 1.2 从哪里来，回哪里去：首页睡眠卡展开成睡眠页，再收回原位。
    id: 'morph', ms: 5200, pose: 'full', caption: 'morph',
    async run(d) {
      await page(d, '/');
      await d.tap('.sleep-panel', { after: 1300 });
      await d.tap('.quick-back', { after: 1100 });
    },
  },
  {
    // 1.3 一处清晰，万物退后：睡眠页上点「睡眠时长」的说明，居中浮起、四周虚化。
    id: 'focus', ms: 4600, pose: 'full', caption: 'focus',
    async run(d) {
      await d.cut(() => toSleep(d));
      await d.tap('.hero-duration .metric-info', { after: 1700 });
      await d.escape(300);
    },
  },
];
