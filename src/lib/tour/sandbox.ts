/*
 * 新手引导的进度，以及「示例沙盒」的进出。
 *
 * 沙盒 = 整页重新载入成 `?demo=1&tour=…`：demo/early.ts 在一切之前把后端换成演示运行时
 * （demo/runtime.ts），localStorage 也换成内存里的一份。于是引导期间读的是示例数据、写什么都
 * 落不到真实库，结束时再载入回来，真实的应用从头起。
 *
 * 进度存在**真实的** localStorage：沙盒里那份是内存的、一载入就没了，所以 early.ts 在换掉之前
 * 把真实的那份挂在 `window.__ZB_REAL_STORAGE__` 上，只有这里读它。不存后端偏好：沙盒里后端是
 * 假的，存后端还得新增 command；以前的一次性提示（CoachTip）也一直存在这里。
 */
import type { TourChapterId } from './chapters';
import { isTourChapter } from './chapters';
import { TOUR_VERSION, needsRetour } from './progress';

declare global {
  interface Window { __ZB_REAL_STORAGE__?: Storage }
}

const SEEN_KEY = 'zeppbridge.tour.seen';
const FIRST_LAUNCH_KEY = 'zeppbridge.tour.firstLaunch';
/** 引导内容的版本（lib/tour/progress.ts 的 TOUR_VERSION）。老安装落后就清空看过、重看总览。 */
const VERSION_KEY = 'zeppbridge.tour.version';
const TOOLS_REMINDER_KEY = 'zeppbridge.tour.toolsReminder';
const THEME_KEY = 'zeppbridge-theme';
const LOCALE_KEY = 'zeppbridge-locale';

const realStorage = (): Storage | null => {
  try {
    return window.__ZB_REAL_STORAGE__ ?? window.localStorage;
  } catch {
    return null;
  }
};

export const seenChapters = (): Set<string> => {
  const seen = new Set<string>();
  try {
    const storage = realStorage();
    const parsed = JSON.parse(storage?.getItem(SEEN_KEY) ?? '[]') as unknown;
    if (Array.isArray(parsed)) for (const item of parsed) if (typeof item === 'string' && isTourChapter(item)) seen.add(item);
  } catch {
    // 读不到就当都没看过。
  }
  return seen;
};

export const markSeen = (ids: readonly string[]): void => {
  const seen = seenChapters();
  for (const id of ids) seen.add(id);
  try {
    realStorage()?.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // 存不下：下次还会再提示一次，不算坏事。
  }
};

/** 设置里「全部重新提示」。 */
export const forgetSeen = (ids: readonly string[]): void => {
  const seen = seenChapters();
  for (const id of ids) seen.delete(id);
  try {
    realStorage()?.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // 同上。
  }
};

/** 首次启动的那一问已经处理过（看了、跳过了、或者是老用户点了「以后再说」）。 */
export const firstLaunchHandled = (): boolean => {
  try {
    return realStorage()?.getItem(FIRST_LAUNCH_KEY) === '1';
  } catch {
    return true;
  }
};

export const markFirstLaunchHandled = (): void => {
  try {
    realStorage()?.setItem(FIRST_LAUNCH_KEY, '1');
  } catch {
    // 存不下就每次启动问一次，比不问强。
  }
};

/** 老安装、引导版本落后：该清空看过、重看总览了（新装走首次启动，不算）。 */
export const retourDue = (): boolean => {
  try {
    const storage = realStorage();
    return needsRetour(storage?.getItem(FIRST_LAUNCH_KEY) === '1', storage?.getItem(VERSION_KEY) ?? null);
  } catch {
    return false;
  }
};

/** 启动时马上要整页载入进总览（首次启动还没处理、或老安装该重看了）：这时不出就地讲解，免得讲到一半被载入打断。 */
export const introPending = (): boolean => !firstLaunchHandled() || retourDue();

/** 记下引导已是当前版本；`fresh` 时连带清空看过（老安装重看，各板块也重新就地讲）。 */
export const markTourVersion = (fresh = false): void => {
  try {
    const storage = realStorage();
    if (fresh) storage?.removeItem(SEEN_KEY);
    storage?.setItem(VERSION_KEY, String(TOUR_VERSION));
  } catch {
    // 存不下：下次启动还会再走一遍，不算坏事。
  }
};

/** 升级来的库首次启动时发现 AI 客户端里还登记着旧版 MCP：记下，等引导走完回到真实应用再提醒。 */
export const markToolsReminder = (): void => {
  try {
    realStorage()?.setItem(TOOLS_REMINDER_KEY, '1');
  } catch {
    // 存不下就不提醒，设置卡里那行黄字还在。
  }
};

/** 取走提醒（只提醒一次）。 */
export const takeToolsReminder = (): boolean => {
  try {
    const storage = realStorage();
    if (storage?.getItem(TOOLS_REMINDER_KEY) !== '1') return false;
    storage.removeItem(TOOLS_REMINDER_KEY);
    return true;
  } catch {
    return false;
  }
};

export interface SandboxFlags {
  chapters: TourChapterId[];
  welcome: boolean;
  /** 结束后回到哪一页。 */
  ret: string;
}

const safePath = (value: string | null | undefined, fallback: string): string =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

/** 这一次载入是不是引导沙盒；不是就 null。 */
export const sandboxFlags = (): SandboxFlags | null => {
  const flags = window.__ZB_DEMO__;
  if (!flags?.demo || !flags.tour) return null;
  const chapters = flags.tour.split(',').filter(isTourChapter);
  if (!chapters.length && !flags.welcome) return null;
  return { chapters, welcome: flags.welcome === true, ret: safePath(flags.ret, '/') };
};

export const inSandbox = (): boolean => sandboxFlags() !== null;

/** 整页载入回某一页的地址：只能载入根路径，页面放在 `route` 参数里（见 demo/early.ts）。 */
export const reloadUrl = (path: string | null | undefined): string => {
  const target = safePath(path, '/');
  return target === '/' ? '/' : `/?${new URLSearchParams({ route: target }).toString()}`;
};

/** 进沙盒：整页载入成示例模式。`route` 是第一步所在的页，载入时直接落在那里。 */
export const enterSandbox = (options: { chapters: TourChapterId[]; welcome?: boolean; ret: string; route: string; theme: string; locale: string }): void => {
  const params = new URLSearchParams({
    demo: '1',
    tour: options.chapters.join(','),
    ret: safePath(options.ret, '/'),
    route: safePath(options.route, '/'),
    theme: options.theme,
    lang: options.locale,
  });
  if (options.welcome) params.set('welcome', '1');
  window.location.assign(`/?${params.toString()}`);
};

/** 出沙盒：沙盒里换过的语言和主题带回真实设置，再载入回真实应用。 */
export const leaveSandbox = (ret: string): void => {
  const real = window.__ZB_REAL_STORAGE__;
  const flags = window.__ZB_DEMO__;
  try {
    const memory = window.localStorage;
    const locale = memory.getItem(LOCALE_KEY);
    const theme = memory.getItem(THEME_KEY);
    if (real && locale && locale !== flags?.lang) real.setItem(LOCALE_KEY, locale);
    if (real && theme && theme !== flags?.theme) real.setItem(THEME_KEY, theme);
  } catch {
    // 带不回来就沿用原来的设置。
  }
  window.location.replace(reloadUrl(ret));
};
