/*
 * 新手引导的章节与步骤（纯数据，脚本见桌面《计划.md》二·2 的草稿）。
 *
 * 每一步圈住页面上的一样东西：`target` 是 CSS 选择器（多数页面元素已有稳定的类名，个别补了
 * data-tour），`route` 是这一步要在哪一页。没有 target 的步骤是居中的一张说明卡。
 * 文案在 components/tour/tour.i18n.ts，按 `<章>.<步>` 取。
 *
 * 两种跑法：
 *   - sandbox：完整引导、设置里点开的单章。整页重新载入成示例沙盒（?demo=1&tour=…），
 *     后端换成演示运行时，真实库碰不到（lib/tour/sandbox.ts）。
 *   - inline：第一次碰到牌桌、收集箱、寄出前检查、训练计划时，就地在真实界面上圈一下，
 *     不重载、不打断手上的事；引导本身不写库。取代以前的 CoachTip。
 */

export interface TourStep {
  /** 页面上圈住的元素；null = 居中说明卡。 */
  target: string | null;
  /** 这一步在哪一页；省略 = 留在当前页。 */
  route?: string;
  /** 圈住选择器匹配到的**所有**可见元素的外接框（一组牌），而不是第一个。 */
  all?: boolean;
  /** 圈住的那一块可以直接上手（拨语言轮、换主题、拖牌）；圈外仍然挡住，免得点跑。 */
  interactive?: boolean;
  /** 在 `route` 上找不到 `target`（窄窗口里顶栏收起了语言轮）时，去这一页圈这个。 */
  fallback?: { route: string; target: string };
  /** 进这一步先做的事：`pickDays` = 点开这一页的「挑日子」，把牌桌摊出来（离开这一步时收回去）。 */
  open?: 'pickDays';
}

/** 完整引导按这个顺序走。 */
export const FULL_TOUR = ['basics', 'connect', 'overview', 'detail', 'pick', 'handoff', 'plan', 'settings'] as const;
/** 就地出现、每章只自动出现一次的。 */
export const INLINE_CHAPTERS = ['cards', 'box', 'check', 'planFirst'] as const;

export type FullChapterId = (typeof FULL_TOUR)[number];
export type InlineChapterId = (typeof INLINE_CHAPTERS)[number];
export type TourChapterId = 'whatsnew' | FullChapterId | InlineChapterId;

export const TOUR_STEPS: Record<TourChapterId, TourStep[]> = {
  whatsnew: [
    { route: '/', target: '.pins' },
    // 宽屏是顶栏导航胶囊，窄屏是底部导航；哪个看得见圈哪个。
    { route: '/', target: '.pill-nav .segment-item[data-value="/ai"], .bottom-track .segment-item[data-value="/ai"]' },
    { route: '/ai/plan', target: '.ai-plan-week .bridge-future' },
    { route: '/settings/ai', target: '.deck-stage .open-card' },
    { route: '/settings/account', target: '.deck-stage .open-card' },
  ],
  basics: [
    { route: '/', target: '.theme-toggle', interactive: true },
    // 「随时换语言」圈的就是顶栏的语言轮，原地拨（10-13：以前先跳到设置的「显示」卡，圈的却是右上角，货不对板）。
    // 顶栏放不下时（手机）语言轮会被收起，那时才去「显示」卡圈语言那一行。
    { route: '/', target: '.locale-wheel', interactive: true, fallback: { route: '/settings/display', target: '.deck-stage .open-card [data-tour="locale"]' } },
  ],
  connect: [
    { route: '/settings/account', target: '.deck-stage .open-card' },
    { route: '/settings/sync', target: '.deck-stage .open-card' },
  ],
  overview: [
    { route: '/', target: '.pins' },
    { route: '/', target: '.pins .baseline-tag' },
    { route: '/', target: '.overview-focus' },
  ],
  // 「没有数据的指标收成一行」那一步 10-13 拿掉了：要专门跳到身体页去看一行灰字，用户觉得没必要。
  detail: [
    { route: '/heart', target: '.range-bar' },
  ],
  pick: [
    { route: '/heart', target: '.pick-days' },
    // 牌桌真的摊开（10-13：以前只出一张居中的说明卡，嘴上说牌桌、眼前没有牌），圈住牌，可以直接翻、拖。
    { route: '/heart', target: '.card-table .table-layer:not(.pending) .pcard', all: true, open: 'pickDays', interactive: true },
  ],
  handoff: [
    { route: '/ai', target: '.ai-stage-page .cloud .slot', all: true, interactive: true },
    { route: '/ai', target: '.ai-stage-page .future' },
    // 交出去以后怎么放进 AI：文件进剪贴板、Ctrl+V；全自动的开关在设置卡（10-13，计划 12.1）。
    { route: '/ai', target: '.ai-stage-page .bridge-lock' },
  ],
  plan: [
    { route: '/ai/plan', target: '.ai-plan-week .future-days' },
    { route: '/ai/plan', target: '.ai-plan-week .future-day' },
    { route: '/ai/plan', target: '.ai-plan-week .hold-button' },
  ],
  settings: [
    { route: '/settings/archive', target: '.deck-stage .open-card' },
    { route: '/settings/ai', target: '.deck-stage .open-card' },
    { route: '/settings/guide', target: '.deck-stage .open-card' },
  ],
  // 牌桌、铺开的收集箱本身占满一屏：圈它没有意义，就是一张居中的说明卡。
  cards: [{ target: null }],
  box: [{ target: null }],
  check: [{ target: '.ai-sub-page.story .check-grid' }],
  planFirst: [{ target: '.ai-plan-week .future-days' }],
};

export const isFullChapter = (id: string): id is FullChapterId => (FULL_TOUR as readonly string[]).includes(id);
export const isTourChapter = (id: string): id is TourChapterId => id in TOUR_STEPS;
