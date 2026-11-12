/**
 * 弹窗从哪里来回哪里去：从点开它的那个按钮里长出来，关的时候原路缩回那个按钮。
 *
 * 2026-11-12 修复计划 A2：换到可折返飞行（lib/motion/flight.ts）。
 * - **点下去就动**：不再先等帧稳（以前遮罩先糊 0.3 秒、面板干等），第一帧面板就在按钮那里。
 * - **开到一半关 = 掉头**：同一组动画翻方向，走了多久就花多久回去；关的时候已经开好了，就把「开」那一段
 *   原样摆到终点再倒着放——回程的路线、曲线、遮罩和来路是同一条，面板落回按钮和背景变清楚是同一刻。
 * - **收到一半又点开**（新弹窗、同一个来处）：从旧的那段此刻的进度接着长，遮罩不叠两层。
 *
 * 两种面板：
 * - **信封这类无底板的物件**（`is-bare`）：整块面板从按钮的位置、按钮的大小长大飞到中间，第一帧就看得见，
 *   不再套「内容藏到 35%」（以前那条是给普通弹窗的正文用的，信封整个在 .dialog-scroll 里，飞行那段全被藏掉了）。
 *   缩放按面板里标了 `data-flight-subject` 的那样东西算（信封本身），没有就按面板。
 * - **普通弹窗**（有玻璃底）：窗口形变（lib/motion/window.ts）：内容 1:1 不缩放，裁切框从来处那张卡的矩形长成面板；
 *   窗口里先是那张卡的拷贝（替身），内容画好了才和替身交叉换手（规则 3）。
 *
 * 只动 transform / clip-path（定圆角）/ opacity。淡入淡出只动毛玻璃层自己（遮罩的 ::before），不动它们的祖先：
 * 祖先 opacity < 1 会变成背景滤镜的取样边界，模糊要到淡完才「啪」地出现（2026-10-06）。
 *
 * 关的时候面板已经被 Vue 卸载了：ModalDialog 把摘下来的节点交过来，这里挂回 body、放完再移除——
 * 节点还是原来那个（输入框里的字不会在收起的一瞬间变空），开的那组动画也还在，可以直接掉头。
 */
import { createFlight, NEARLY_HIDDEN, whileShown, type Flight } from './flight';
import { onMotionEscape } from './interrupt';
import { easeAt, HANDOFF_EARLIEST, OPEN_EASE as WINDOW_EASE, OPEN_MS, timeAt, turnedEase } from './timing';
import { lessMotion } from './lessMotion';
import { bleedRect, cardReplica, visibleWindow, windowInset, windowPoses, WINDOW_OFFSETS, type WindowRect } from './window';

export { visibleWindow };

export interface FlightOrigin {
  /** 点开它的元素；关的时候它还在就重新量一次（页面可能滚过）。 */
  el: HTMLElement | null;
  rect: DOMRect | null;
}

/** 物件飞行与窗口形变统一对齐页面过场时长（OPEN_MS = paced(500)）。 */
const OBJECT_MS = OPEN_MS;
const WINDOW_MS = OPEN_MS;
/*
 * 关（2026-11-12 第三轮，用户 4K 录屏：「记一件事 / 记一个伤病……最后一刻依旧像截图定格一样」）：
 * 以前关 = 开的那组动画原样倒放。开的曲线前冲，倒过来就是**慢起、最后一下猛冲进按钮**；内容在半路就淡没了，
 * 后面是一块空的灰板飞回去，落地那一帧真按钮才冒出来。现在关的这组用「掉了头的曲线」（turnedEase）倒着放——
 * 画面上就是一条减速落定的回程；落地也改成淡入淡出：
 *   换手（内容 → 那张卡的拷贝）在窗口还在明显缩小时做完，真按钮在窗口底下提前亮好，最后整块面板淡掉。
 * 下面这些进度都是「开」那条时间轴上的（关是倒着放，所以数越小越靠近落地）。
 */
/*
 * 关回去时内容和替身换手（2026-11-12 第四轮录屏：「添加事件」一直留到窗口缩成按钮那么大，最后两帧才换成「记一件事」，
 * 像是硬跳）：换手挪到窗口还明显比按钮大的时候，拉长、先后交替不叠影——内容先淡掉，替身紧接着亮起来，
 * 后半程窗口里就是那颗按钮的拷贝跟着缩回去。区间是「开」那条时间轴上的（关是倒着放：数越大越早）。
 */
const CLOSE_CONTENT_OUT: readonly [number, number] = [0.64, 0.9];
const CLOSE_REPLICA_IN: readonly [number, number] = [0.46, 0.68];
/** 关的最后这一段整块面板淡掉（此刻面板已经缩在按钮上）。 */
const CLOSE_FADE = 0.2;
/** 真按钮在面板底下亮起来的那一段。 */
const SOURCE_IN: readonly [number, number] = [0.12, 0.3];
/** 背后的暗色和模糊在关的时候散得早一点：面板淡掉时露出来的是清楚的按钮。 */
const CLOSE_VEIL: Keyframe[] = [{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: 0.1 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
/** 关这一组的形状曲线：倒着放时画面上是 WINDOW_EASE 那样减速落定。 */
const CLOSE_EASE = turnedEase(WINDOW_EASE);
/** 开到一半被关 / 关到一半又开：两组曲线不一样，按「窗口此刻在哪」换算成另一组的时间进度，不跳。 */
export const closeTimeFor = (openProgress: number) => 1 - timeAt(WINDOW_EASE, 1 - easeAt(WINDOW_EASE, openProgress));
export const openTimeFor = (closeBuildProgress: number) => timeAt(WINDOW_EASE, easeAt(CLOSE_EASE, closeBuildProgress));
/** 异源快速切换时，旧弹窗独立收拢的轻快时长。 */
const RELAY_CLOSE_MS = 260;

const reducedMotion = () => lessMotion();

/** 最近一次按下的位置：键盘打开、或者打开它的按钮已经没了时，退而从这里长出来。 */
let lastPress: { x: number; y: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => { lastPress = { x: event.clientX, y: event.clientY }; }, true);
}

const usable = (el: HTMLElement | null): el is HTMLElement =>
  !!el && el.isConnected && el !== document.body && el.getClientRects().length > 0;

export const originOf = (el: HTMLElement | null): FlightOrigin => {
  if (usable(el)) return { el, rect: el.getBoundingClientRect() };
  if (lastPress) return { el: null, rect: new DOMRect(lastPress.x - 20, lastPress.y - 20, 40, 40) };
  return { el: null, rect: null };
};

const currentRect = (origin: FlightOrigin | null): DOMRect | null =>
  usable(origin?.el ?? null) ? whileShown(origin!.el!, () => origin!.el!.getBoundingClientRect()) : origin?.rect ?? null;

type Box = { left: number; top: number; width: number; height: number };

/**
 * 物件（信封）从按钮里长出来的起点：面板绕自己的中心缩放，让面板里的那样东西（`subject`）的中心落在按钮中心、
 * 宽度等于按钮宽度（纯函数，方便测）。按钮比物件还宽时不放大（上限 1）。
 */
export const objectTransform = (from: Box, panel: Box, subject: Box = panel): string => {
  const scale = Math.min(1, Math.max(0.04, from.width / Math.max(1, subject.width)));
  const c = { x: panel.left + panel.width / 2, y: panel.top + panel.height / 2 };
  const q = { x: subject.left + subject.width / 2, y: subject.top + subject.height / 2 };
  const o = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const dx = o.x - c.x - scale * (q.x - c.x);
  const dy = o.y - c.y - scale * (q.y - c.y);
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
};

/** Shared by dialogs and the stage-local star card. Content stays at 1:1 throughout. */
export function dialogWindowFrames(from: WindowRect, to: WindowRect, panel: WindowRect, radius: number, bleedEnd = false): Keyframe[] {
  const poses = windowPoses({ rect: from, anchor: { x: from.left, y: from.top } }, { rect: to, anchor: { x: to.left, y: to.top } });
  const last = poses.length - 1;
  return poses.map((pose, i) => {
    const dx = pose.anchor.x - panel.left, dy = pose.anchor.y - panel.top;
    const clipRect = bleedEnd && i === last ? bleedRect(pose.rect, Math.max(radius, 36)) : pose.rect;
    return { offset: WINDOW_OFFSETS[i], transform: `translate(${dx}px, ${dy}px)`,
      // DOMRect dimensions are prototype getters, so spreading the object loses them.
      clipPath: windowInset(clipRect, { left: panel.left + dx, top: panel.top + dy, width: panel.width, height: panel.height }, radius, true) };
  });
}

/* ---------------------------------------------------------------- 来处藏着 */

/* 弹窗开着、收回还没落地时，来处（被点的那一行、那张卡）藏起来（用户 2026-10-27 跑鞋：「点开后后面的字消失；点回去时，
   除非那块界面完全落地，否则字绝不应该先于动画出现」）。来处的替身就是窗口里那份拷贝，和藏起来是同一帧（规则 4）。
   用属性不用行内样式 / 类名：来处多半有 Vue 绑着的 class，补丁时会被冲掉（样式见 ModalDialog.vue 的全局一条）。 */
const sources = new WeakMap<HTMLElement, HTMLElement>();
function hideSource(backdrop: HTMLElement, el: HTMLElement | null | undefined) {
  if (!el?.isConnected) return;
  el.setAttribute('data-dialog-source', '');
  sources.set(backdrop, el);
}
function showSource(backdrop: HTMLElement) {
  const el = sources.get(backdrop);
  sources.delete(backdrop);
  el?.removeAttribute('data-dialog-source');
}

/* ---------------------------------------------------------------- 一段飞行 */

interface Live {
  flight: Flight;
  backdrop: HTMLElement;
  panel: HTMLElement;
  origin: FlightOrigin | null;
  /** 关着（已经从 Vue 那里摘下来、挂回 body 当一段画面）。 */
  closing: boolean;
}

const lives = new WeakMap<HTMLElement, Live>();
/** 正在收起的画面集合（同一个来处收到一半重开就原地接手；不同来处快速连点则让旧面板独立收完、新面板同步飞出）。 */
const ghosts = new Set<Live>();
/** 正在打开的那几个弹窗各自的 Esc 登记，开完或关掉时注销。 */
const escapes = new WeakMap<HTMLElement, () => void>();
const forgetEscape = (backdrop: HTMLElement) => { escapes.get(backdrop)?.(); escapes.delete(backdrop); };
/** 弹窗入场动画落定信号：供内部二级动画（如写信信封自动拆封抽纸）等待面板到位后再量几何。 */
const landings = new WeakMap<HTMLElement, { promise: Promise<void>; resolve: () => void }>();
export const whenDialogLanded = (panel: HTMLElement | null | undefined): Promise<void> =>
  (panel ? landings.get(panel)?.promise : undefined) ?? Promise.resolve();

const removeGhost = (live: Live) => {
  showSource(live.backdrop);
  live.backdrop.remove();
  ghosts.delete(live);
};

/** 挂回去的只是一段收起的画面：不再是对话框，不能被聚焦、点中，也不能被别的逻辑当成「还有弹窗开着」。 */
const detachAsPicture = (backdrop: HTMLElement, panel: HTMLElement) => {
  panel.removeAttribute('data-modal-dialog');
  panel.removeAttribute('role');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  backdrop.style.pointerEvents = 'none';
  document.body.appendChild(backdrop);
};

/** 物件（信封）在面板里的那一块：缩放按它算。 */
const subjectOf = (panel: HTMLElement): Box => {
  const el = panel.querySelector<HTMLElement>('[data-flight-subject]');
  const box = (el ?? panel).getBoundingClientRect();
  return box.width && box.height ? box : panel.getBoundingClientRect();
};

const radiusFor = (origin: FlightOrigin | null, panel: HTMLElement) => {
  const from = currentRect(origin);
  return Math.min(parseFloat(getComputedStyle(origin?.el ?? panel).borderRadius) || 16, (from?.height ?? 32) / 2, (from?.width ?? 32) / 2, 24);
};

/**
 * 建「开」的那一段（往终点放的方向）。`closing` 时建好以后摆到终点、倒着放——关就是开的原路倒回。
 * 返回飞行；落地时：往终点落 = 开好了，往起点落 = 收回去了（撤掉这段画面）。
 */
function build(backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, closing: boolean, veilFrom = NEARLY_HIDDEN): Live | null {
  const bare = panel.classList.contains('is-bare');
  const windowEl = panel.querySelector<HTMLElement>('[data-dialog-window]');
  const objectMode = bare && !windowEl;
  const final = panel.getBoundingClientRect();
  const target = windowEl ? windowEl.getBoundingClientRect() : final;
  const from = currentRect(origin);
  const live: Live = { flight: null as unknown as Flight, backdrop, panel, origin, closing };
  const flight = createFlight({
    duration: objectMode ? OBJECT_MS : WINDOW_MS,
    onLand: (direction) => {
      forgetEscape(backdrop);
      if (lives.get(backdrop) === live) lives.delete(backdrop);
      if (direction > 0 && !live.closing) {
        landings.get(panel)?.resolve();
        return;
      }
      // 落回起点：这段画面收回去了（关）。开到一半被关、又掉头回来开好的，上面那一支已经处理。
      landings.get(panel)?.resolve();
      removeGhost(live);
    },
  });
  live.flight = flight;
  const shapeEase = closing ? CLOSE_EASE : WINDOW_EASE;
  // 背后的暗色和模糊：和面板同长、同一刻起止（信封落回按钮那一刻背景正好变清楚）。
  if (closing) flight.add(backdrop, CLOSE_VEIL, { pseudoElement: '::before' });
  else flight.add(backdrop, [{ opacity: Math.max(NEARLY_HIDDEN, veilFrom) }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { easing: 'ease-out', pseudoElement: '::before' });
  // 关：落地前整块面板淡掉，不在按钮上停一下再一帧消失。
  if (closing && from) flight.add(panel, [{ opacity: NEARLY_HIDDEN }, { opacity: 1, offset: CLOSE_FADE }, { opacity: 1 }]);
  if (objectMode) {
    const start = from ? objectTransform(from, final, subjectOf(panel)) : 'scale(.96)';
    flight.add(panel, [{ transform: start }, { transform: 'none' }], { easing: shapeEase });
    // 没有来处（键盘打开、来处没了）：原地浮现。有来处时第一帧就看得见（在按钮那里）。
    if (!from) flight.add(panel, [{ opacity: NEARLY_HIDDEN }, { opacity: 1, offset: 0.4 }, { opacity: 1 }]);
  } else {
    const start = from ?? { left: target.left + target.width / 2 - 20, top: target.top + target.height / 2 - 20, width: 40, height: 40 };
    if (!bare) {
      panel.classList.add('is-flying');
      flight.own(() => panel.classList.remove('is-flying'));
    }
    flight.add(panel, dialogWindowFrames(start, target, final, radiusFor(origin, windowEl ?? panel), true), { easing: shapeEase });
    const content = windowEl
      ? (windowEl.querySelector<HTMLElement>('[data-dialog-content]') ?? windowEl)
      : panel.querySelector<HTMLElement>(':scope > .dialog-scroll');
    const source = origin?.el?.isConnected ? origin.el : null;
    // 替身（那张卡的拷贝）先从被藏着的状态里拷出来，再藏真卡：同一帧，规则 4。
    const replica = source ? whileShown(source, () => cardReplica(source).el) : null;
    if (replica) {
      replica.querySelectorAll('[data-dialog-source]').forEach((node) => node.removeAttribute('data-dialog-source'));
      replica.dataset.dialogReplica = '';
      Object.assign(replica.style, { position: 'absolute', left: '0', top: '0', zIndex: '4', pointerEvents: 'none' });
      panel.appendChild(replica);
      flight.own(() => replica.remove());
      flight.add(replica, [{ opacity: 1 }, { opacity: 1 }]);
    }
    if (content) flight.add(content, [{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN }]);
    hideSource(backdrop, source);
    if (closing && source) {
      // 真按钮在面板底下提前亮起来（[data-dialog-source="fading"] 不再被样式表压成透明，透明度交给这一段）。
      source.setAttribute('data-dialog-source', 'fading');
      flight.add(source, [{ opacity: 1 }, { opacity: 1, offset: SOURCE_IN[0] }, { opacity: 0, offset: SOURCE_IN[1] }, { opacity: 0 }]);
    }
    // 来处很小（一颗按钮、一枚胶囊）：拷贝只占窗口一角，留着它只会是一块「跟着走」的色块（用户 2026-11-12：
    // 「动笔写信」的绿色块会一直跟着走到后面）——窗口一开始长就换手。卡片这类大来处才等到 HANDOFF_EARLIEST。
    const small = !!from && from.width * from.height < 0.25 * target.width * target.height;
    const earliest = windowEl || small ? 0.04 : HANDOFF_EARLIEST;
    if (closing) {
      // 关：倒着放。内容在回程前段淡掉，替身接着亮起来（CLOSE_CONTENT_OUT / CLOSE_REPLICA_IN 上面的说明）。
      if (content) flight.add(content, [{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: CLOSE_CONTENT_OUT[0] }, { opacity: 1, offset: CLOSE_CONTENT_OUT[1] }, { opacity: 1 }]);
      if (replica) flight.add(replica, [{ opacity: 1 }, { opacity: 1, offset: CLOSE_REPLICA_IN[0] }, { opacity: 0, offset: CLOSE_REPLICA_IN[1] }, { opacity: 0 }]);
    } else {
      // 开：内容画好了（下一帧以后）才和替身换手，最早在 earliest。
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (flight.running()) flight.handoff({ show: content ? [content] : [], hide: replica ? [replica] : [] }, earliest);
      }));
    }
  }
  if (closing) flight.startFromEnd();
  lives.set(backdrop, live);
  return live;
}

const quickOpen = (backdrop: HTMLElement, panel: HTMLElement) => {
  for (const old of [...ghosts]) { old.flight.dispose(); removeGhost(old); }
  backdrop.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: 180, easing: 'ease-out', fill: 'backwards', pseudoElement: '::before' });
  const quick = panel.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out', fill: 'backwards' });
  const done = () => landings.get(panel)?.resolve();
  quick.finished.then(done, done);
};

const quickClose = (backdrop: HTMLElement, panel: HTMLElement) => {
  detachAsPicture(backdrop, panel);
  for (const animation of backdrop.getAnimations({ subtree: true })) animation.cancel();
  const timing = { duration: 180, easing: 'ease-in', fill: 'forwards' as const };
  panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.95)' }], timing);
  const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, pseudoElement: '::before' });
  const cleanup = () => { showSource(backdrop); backdrop.remove(); };
  fade.finished.then(cleanup, cleanup);
};

/** `onEscape`：开到一半按 Esc 时调用（弹窗据此关掉自己，关的动画从此刻原路收回）。 */
const open = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, onEscape?: () => void) => {
  let resolve: () => void = () => undefined;
  landings.set(panel, { promise: new Promise<void>((r) => { resolve = r; }), resolve: () => resolve() });
  if (reducedMotion()) { quickOpen(backdrop, panel); return; }
  // 收到一半又开：同一个来处就从它此刻的进度接着长；别的来处让旧面板卸掉遮罩继续收拢回原处，新弹窗同步飞出（不瞬灭）。
  let resumeAt: number | null = null;
  let veilFrom = NEARLY_HIDDEN;
  for (const previous of [...ghosts]) {
    if (!previous.flight.running()) {
      previous.flight.dispose();
      removeGhost(previous);
      continue;
    }
    const same = previous.origin?.el && previous.origin.el === origin?.el
      && previous.panel.classList.contains('is-bare') === panel.classList.contains('is-bare');
    if (same && resumeAt === null) {
      resumeAt = previous.flight.progress();
      previous.flight.dispose();
      removeGhost(previous);
    } else {
      const seenVeil = Number(getComputedStyle(previous.backdrop, '::before').opacity) || NEARLY_HIDDEN;
      veilFrom = Math.max(veilFrom, seenVeil);
      previous.backdrop.classList.add('is-ghost-panel-only');
      previous.flight.hurry(RELAY_CLOSE_MS);
    }
  }
  const live = build(backdrop, panel, origin, false, veilFrom);
  if (!live) return;
  if (resumeAt !== null) {
    const at = openTimeFor(resumeAt);
    for (const animation of live.flight.anims) animation.currentTime = at * live.flight.duration;
  }
  if (onEscape) escapes.set(backdrop, onMotionEscape(() => { if (!live.flight.running()) return false; forgetEscape(backdrop); onEscape(); return true; }));
};

const close = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) => {
  forgetEscape(backdrop);
  // 已经化成灰飞走了（ashDissolve.ts）：不再挂回去缩一遍。
  if (backdrop.isConnected || backdrop.dataset.dissolved !== undefined) { showSource(backdrop); landings.get(panel)?.resolve(); return; }
  if (reducedMotion()) { quickClose(backdrop, panel); return; }
  detachAsPicture(backdrop, panel);
  for (const old of [...ghosts]) {
    if (old !== lives.get(backdrop) && !old.flight.running()) {
      old.flight.dispose();
      removeGhost(old);
    }
  }
  const current = lives.get(backdrop);
  const interruptedAt = current && current.flight.running() ? current.flight.progress() : null;
  current?.flight.dispose();
  const live = build(backdrop, panel, origin, true);
  if (live) {
    if (interruptedAt !== null && interruptedAt < 1) {
      const pos = Math.max(16, closeTimeFor(interruptedAt) * live.flight.duration);
      const rate = pos < 150 ? -(pos / 150) : -1;
      for (const animation of live.flight.anims) {
        animation.currentTime = pos;
        animation.playbackRate = rate;
      }
    }
    ghosts.add(live);
  } else {
    removeGhost({ backdrop, panel, origin, closing: true, flight: null as unknown as Flight });
  }
};

export const dialogFlight = { open, close };
