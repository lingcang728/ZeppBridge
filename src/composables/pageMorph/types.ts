import type { Flight, FlightSnapshot } from '../../lib/motion/pageFlight';
import type { ScrollGuard } from '../../lib/motion/scrollGuard';
import type { Trail } from './links';

/**
 * 一段正在放的形变。`page` 是在动的那一页（展开时进场的新页、收回时离场的详情页），`under` 是蒙着模糊的那一页
 * （展开时离场的来处页、收回时回到场上的来处页）。两页的痕迹分开撤：被打断后它们可能各有各的去处。
 */
export interface Live {
  kind: 'expand' | 'collapse';
  page: HTMLElement;
  /** 在动的那一页的路由：收到一半又点开同一页时据此认出「倒回去」。 */
  path: string;
  under: HTMLElement | null;
  flight: Flight;
  veil: HTMLElement | null;
  veilAnim: Animation | null;
  hidden: Animation | null;
  release: () => void;
  /** 两页各自那一次 Vue 过渡的 done：钩子被调时就攥住，晚到的旧 done 只是空操作。 */
  pageDone: () => void;
  underDone: () => void;
  /** 停掉这一段的后台事务（Esc 登记、跟踪终点的循环）。 */
  stop: () => void;
  /** 有人想滚：还在等开跑的立刻放，剩下的加速放完。 */
  hurry: () => void;
  /** 起飞前停在起点等来处页画好（收回）：等的途中被打断或有人要快进，先当场放起来。 */
  go?: () => void;
  landed: boolean;
  pageGone: boolean;
  underGone: boolean;
}
/** 被打断、原样停住的那一段，和它停住时的样子。 */
export interface Stale extends Live {
  snap: FlightSnapshot;
  veilNow: number;
  /** 停住时已经走了多久：掉头回去花同样长（规则 2：走了多久就花多久回去）。 */
  elapsed: number;
  /** 不是停住而是当场掉头了（开到一半返回）：合成器上已经在往回走，接手时按那一刻的样子接力。 */
  turned: boolean;
  /** 下一次切页里被 Vue 重新用到的那几页（进场或离场）：它们的痕迹由接手的人撤。 */
  claimed: Set<Element>;
}

/** 收回：详情页已经在离场，等来处页回到场上、滚动位置恢复以后的那一帧才开始缩。 */
export type Collapse = {
  el: HTMLElement; trail: Trail; backdrop: HTMLElement; staying: HTMLElement | null; release: () => void;
  /** 正在收回的那张详情页的路由：收到一半又点开同一张卡时，展开据此从此刻的框接着长。 */
  path: string;
  /** 离开时详情页滚下去了多少：返回时缩回卡的是此刻看得见的那一段，不是页面顶上。 */
  lift: number;
  done: () => void; stayingDone: () => void; frame: number;
};

/** 几段形变共用的可变状态（usePageMorph 一个实例一份）。 */
export interface MorphState {
  live: Live | null;
  stale: Stale | null;
  /** 攥着 done、还没收场的页（兜底扫描用）。 */
  pending: Map<Element, () => void>;
  /** 进过场的页面（KeepAlive 缓存的会原样回来）。 */
  entered: WeakSet<Element>;
  /** decide() 决定要形变时登记的「主线程留给动画」：由接下来的 onEnter / onLeave 接手释放。 */
  hold: (() => void) | null;
  /** 形变期间锁着主滚动区（decide 决定要形变时挂上，落地时放开并补上攒下的滚动）。 */
  guard: ScrollGuard | null;
  pendingCollapse: Collapse | null;
  /** 展开时正在退场的来处页（onLeave 先于 onEnter 被调）和它的 done：等窗口长满再让它走。 */
  expandLeaving: { el: HTMLElement; done: () => void } | null;
  /** 这次展开要去的路由。 */
  expandPath: string;
  /** 每个详情页是从哪张卡展开来的：键是详情页的 fullPath。 */
  trails: Map<string, Trail>;
}

export const createState = (): MorphState => ({
  live: null, stale: null, pending: new Map(), entered: new WeakSet(), hold: null, guard: null,
  pendingCollapse: null, expandLeaving: null, expandPath: '', trails: new Map(),
});
