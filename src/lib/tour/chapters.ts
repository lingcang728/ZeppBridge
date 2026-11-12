/*
 * 新手引导的章节与步骤（纯数据；3.1.1 重写，桌面《计划.md》四）。
 *
 * 每一步圈住页面上的一样东西：`target` 是 CSS 选择器（多数页面元素已有稳定的类名，个别补了
 * data-tour / data-deck-open），`route` 是这一步在示例沙盒里要去哪一页。没有 target 的步骤是居中的一张说明卡。
 * 文案在 components/tour/tour.i18n.ts，按 `<章>.s<序号>` 取（序号是这里的下标 + 1，筛掉的步骤不改序号）。
 *
 * 两种跑法：
 *   - sandbox：「总览」以及设置里点「看看」的单章。整页重新载入成示例沙盒（?demo=1&tour=…），
 *     后端换成演示运行时，真实库碰不到（lib/tour/sandbox.ts）。按 `route` 换页。
 *   - inline：某个板块第一次打开时就地讲（页面根组件里 useSectionTour）。不换页、不重载，
 *     只讲眼前已经出现的那几步（`route` 不管）；一步都没有就不讲、也不记看过（空页不讲）。
 */

export interface TourStep {
  /** 页面上圈住的元素；null = 居中说明卡。 */
  target: string | null;
  /** 沙盒里这一步在哪一页；省略 = 留在当前页。就地讲解不看它。 */
  route?: string;
  /** 圈住选择器匹配到的**所有**可见元素的外接框（一组牌），而不是第一个。 */
  all?: boolean;
  /** 圈住的那一块可以直接上手（拨语言轮、换主题、拖牌）；圈外仍然挡住，免得点跑。 */
  interactive?: boolean;
  /** 在 `route` 上找不到 `target`（窄窗口里顶栏收起了语言轮）时，去这一页圈这个。只在沙盒里用。 */
  fallback?: { route: string; target: string };
  /** 进这一步先做的事：`pickDays` = 点开这一页的「挑日子」，把牌桌摊出来（离开这一步时收回去）。 */
  open?: 'pickDays';
}

/** 总览：示例沙盒里走一遍。首次启动、老用户升级到新引导时自动出现。 */
export const INTRO = 'intro' as const;
/** 十个板块：真实界面上第一次打开时就地讲；设置里也能在沙盒里「看看」。顺序就是设置卡里的顺序。 */
export const SECTIONS = ['home', 'metric', 'workouts', 'sleep', 'ai', 'plan', 'journal', 'letters', 'devices', 'settings'] as const;

export type SectionId = (typeof SECTIONS)[number];
export type TourChapterId = typeof INTRO | SectionId;
/** 设置卡里列出来、计「看过 X / 11」的全部章节。 */
export const ALL_CHAPTERS: readonly TourChapterId[] = [INTRO, ...SECTIONS];

const openCard = (id: string) => `.deck-stage .open-card[data-deck-open="${id}"]`;

export const TOUR_STEPS: Record<TourChapterId, TourStep[]> = {
  intro: [
    { route: '/', target: '.theme-toggle', interactive: true },
    // 顶栏放不下时（手机）语言轮会被收起，那时才去「显示」卡圈语言那一行。
    { route: '/', target: '.locale-wheel', interactive: true, fallback: { route: '/settings/display', target: `${openCard('display')} [data-tour="locale"]` } },
    { route: '/settings/account', target: openCard('account') },
    { route: '/', target: '.pins' },
    // 宽屏是顶栏导航胶囊，窄屏是底部导航；哪个看得见圈哪个。
    { route: '/', target: '.pill-nav, .bottom-track' },
    { route: '/', target: '.sync-pill' },
    { route: '/', target: '[data-tour="letter-pill"]' },
    { route: '/settings/guide', target: openCard('guide') },
  ],
  home: [
    { route: '/', target: '.overview-focus', interactive: true },
    { route: '/', target: '.overview-page .dashboard-grid' },
    { route: '/', target: '.overview-page .feedback-card' },
    { route: '/', target: '.overview-page .coach-inbox' },
    { route: '/', target: '.overview-page .journal-entry' },
  ],
  metric: [
    { route: '/heart', target: '.range-bar', interactive: true },
    { route: '/heart', target: '[data-tour="metric-info"]' },
    { route: '/heart', target: '.pick-days' },
    // 牌桌真的摊开，圈住牌，可以直接翻、拖。
    { route: '/heart', target: '.card-table .table-layer:not(.pending) .pcard', all: true, open: 'pickDays', interactive: true },
  ],
  workouts: [
    { route: '/workouts', target: '.selectable-record' },
    { route: '/workouts', target: '.selection-actions' },
  ],
  sleep: [
    { route: '/sleep', target: '.list-page .record-row.tone-sleep' },
  ],
  ai: [
    { route: '/ai', target: '.ai-stage-page .cloud .slot', all: true, interactive: true },
    { route: '/ai', target: '.ai-stage-page .future' },
    // 交出去以后怎么放进 AI：文件进剪贴板、Ctrl+V；全自动的开关在设置卡。
    { route: '/ai', target: '.ai-stage-page .bridge-lock' },
    { route: '/ai', target: '.ai-stage-page .mcp-pill' },
  ],
  plan: [
    { route: '/ai/plan', target: '.ai-plan-week .future-days' },
    { route: '/ai/plan', target: '.ai-plan-week .future-day' },
    { route: '/ai/plan', target: '.ai-plan-week .hold-button' },
    { route: '/ai/plan', target: '.ai-plan-week [data-tour="plan-history"]' },
  ],
  journal: [
    { route: '/journal', target: '.journal-page .year-dashboard' },
    { route: '/journal', target: '.journal-page .record-wall' },
    { route: '/journal', target: '.journal-page .tone-race' },
    { route: '/journal', target: '.journal-page .tone-shoe' },
    { route: '/rings', target: '.rings-page .tree-rings' },
  ],
  letters: [
    { route: '/letters', target: '[data-tour="letter-pill"]' },
    { route: '/letters', target: '.letter-box .letter-rail' },
    { route: '/letters', target: '.letter-box [data-tour="letter-tabs"]', interactive: true },
  ],
  devices: [
    { route: '/settings/account', target: `${openCard('account')} [data-tour="devices"]` },
    { route: '/health-check', target: '.health-page .summary-card' },
  ],
  settings: [
    { route: '/settings', target: '.card-deck .deck-list' },
    { route: '/settings/archive', target: openCard('archive') },
    { route: '/settings/ai', target: openCard('ai') },
  ],
};

export const isSection = (id: string): id is SectionId => (SECTIONS as readonly string[]).includes(id);
export const isTourChapter = (id: string): id is TourChapterId => id in TOUR_STEPS;
