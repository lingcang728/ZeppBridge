/** Detail routes keep the tab they were opened from. */
export const navigationBranch = (path: string): string => {
  if (path === '/ai' || path.startsWith('/ai/')) return '/ai';
  if (path === '/settings' || path.startsWith('/settings/') || path === '/health-check' || path.startsWith('/devices')) return '/settings';
  return '/';
};

/** 从路由记录里读「上一页」：vue-router 把它放在 history.state.back。 */
export const historyBackPath = (): string | null => {
  const back = (window.history.state as { back?: unknown } | null)?.back;
  return typeof back === 'string' && back ? back : null;
};

export interface BackDestination {
  path: string;
  /** true：走 router.back()，历史里退一格；false：push 这个路径（没有来处可回）。 */
  viaHistory: boolean;
}

/**
 * 返回键回到哪儿：从哪里来回哪里去。
 *
 * 从概览的「数据来源 · 管理」点进设置的某张卡，左上角返回回到概览，而不是设置首页；
 * 从最近记录点进睡眠详情，返回回到最近记录。只有直接打开的深链接（没有来处）
 * 才退到所在入口的根。
 */
export const backDestination = (current: string, back: string | null): BackDestination => (
  back && back !== current ? { path: back, viaHistory: true } : { path: navigationBranch(current), viaHistory: false }
);

/**
 * 关掉一张设置卡（× 或 Esc）去哪儿：从卡组里打开的回卡组；从别处（概览的「管理」、
 * 数据健康页的「去重新连接」）直接打开的，回那一处。上一页是另一张卡时（翻卡用的是
 * replace，一般不会出现）回卡组。
 */
export const cardCloseDestination = (back: string | null): BackDestination => {
  if (!back || /^\/settings\/[^/?#]+/.test(back)) return { path: '/settings', viaHistory: false };
  return { path: back, viaHistory: true };
};

/** 三个主入口在导航胶囊里的顺序；横向切页的方向按它算。 */
export const TAB_ORDER = ['/', '/ai', '/settings'] as const;

/** expand / collapse：从某张卡展开成详情页、返回时缩回那张卡（composables/usePageMorph.ts）。 */
export type PageMotion = 'forward' | 'back' | 'left' | 'right' | 'expand' | 'collapse' | 'none';

const isTabRoot = (path: string) => (TAB_ORDER as readonly string[]).includes(path);

/**
 * 切页时画面往哪儿走。
 *
 * 同一个入口里往深处走（概览 → 睡眠详情）是「聚焦进去」，回来是「退出来」；
 * 换入口是横向滑，方向跟导航胶囊里的左右顺序一致——手指往哪边拨，画面就从哪边来。
 */
export const pageMotion = (from: string, to: string): PageMotion => {
  if (from === to) return 'none';
  const a = navigationBranch(from);
  const b = navigationBranch(to);
  if (a === b) {
    const da = isTabRoot(from) ? 0 : 1;
    const db = isTabRoot(to) ? 0 : 1;
    if (db > da) return 'forward';
    if (db < da) return 'back';
    return 'forward';
  }
  return TAB_ORDER.indexOf(b as (typeof TAB_ORDER)[number]) > TAB_ORDER.indexOf(a as (typeof TAB_ORDER)[number])
    ? 'left'
    : 'right';
};

export interface SegmentStop<T = string> {
  left: number;
  width: number;
  value: T;
}

export function dragThumb<T>(stops: SegmentStop<T>[], center: number, velocity = 0) {
  if (!stops.length) return { left: 0, width: 0 };
  const centers = stops.map((stop) => stop.left + stop.width / 2);
  const clamped = Math.max(centers[0], Math.min(centers[centers.length - 1], center));
  const right = Math.max(1, centers.findIndex((value) => value >= clamped));
  const a = stops[right - 1];
  const b = stops[right] ?? a;
  const span = (centers[right] ?? centers[right - 1]) - centers[right - 1] || 1;
  const fraction = Math.max(0, Math.min(1, (clamped - centers[right - 1]) / span));
  const width = a.width + (b.width - a.width) * fraction + Math.min(10, Math.abs(velocity) * 6);
  const maxLeft = stops[stops.length - 1].left + stops[stops.length - 1].width - width;
  return { left: Math.max(stops[0].left, Math.min(maxLeft, clamped - width / 2)), width };
}

export function snapStop<T>(stops: SegmentStop<T>[], center: number, velocity: number): SegmentStop<T> {
  const projected = center + Math.max(-90, Math.min(90, velocity * 110));
  return stops.reduce((best, stop) =>
    Math.abs(stop.left + stop.width / 2 - projected) < Math.abs(best.left + best.width / 2 - projected) ? stop : best);
}

