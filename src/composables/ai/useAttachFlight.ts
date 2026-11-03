/**
 * 「交给 AI」按满圈以后的交出动画（2026-10-28 重做，用户拍板的隐喻：在和 AI 的对话框里加附件；右牌就是对话框）。
 * 素材在 lib/motion/cards/attach.ts，这里只管先后和状态。
 *
 *   attach：牌按线的顺序错开出发，各自沿线滑进锁、钻到锁盘后面，线跟在后面收走；锁每接一张亮一圈，
 *           这一张的附件小卡从锁的另一边出来，沿右边那束线滑进对话框里的托盘（和准备文件同时跑）。
 *   merge：小卡都落定、文件也备好：小卡收拢并成一枚 .md（回执那一面的文件卡），标题、按钮依次淡入。
 *   retract：半路 Esc / 再点锁 / 准备失败——正在放的全部原地掉头，从此刻的样子沿原路退回。
 *   detach：回执上「改问题」——整段严格倒放：.md 拆开成小卡、穿回锁、牌沿线飞回原位，线在后面重新长出。
 *
 * **牌不回来**：交没交出去只看 `face === 'receipt'`（`away`）：牌位隐身但不卸载（倒放要量它的位置）、左边的线收着，
 * 右边那束留着。这些是样式类，不是留着的动画——缓存页回场、切走再回来都不重放、不重画。
 * 别处把右牌翻到 / 翻离回执（只导出、计划那一面）时不飞，牌和线就地淡出 / 淡入。减少动效、窄窗口没有线时也只淡。
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import type { IconName } from '../../components/Icon.vue';
import { slotRoute, strandRoute, traceEven, type Pt, type ThreadTree } from '../../lib/aiTask/threads';
import {
  cancelPlayed, cardStep, chipStep, gateRing, gateStep, GATE_AT, FLY_MS, mergeSteps, planOf, play, popStep, positionOf, reelStep, rewind, riseStep,
  STAGGER, CHIP_MS, type Played, type Step,
} from '../../lib/motion/cards/attach';
import { animateFromNow, reducedMotion, settled } from '../../lib/motion/cards';
import { paced } from '../../lib/motion/timing';
import type { StageCardModel } from './useStageCards';
import type { FutureFace } from './useStageSend';

export interface AttachItem { id: string; icon: IconName; tint: string; title: string; meta: string }

interface Options {
  stage: Ref<HTMLElement | null>;
  face: Ref<FutureFace>;
  /** 右牌：`body` 是换面时淡出淡入的那一层，`front` 里有回执各块（`data-enter`）。 */
  future: () => { front: HTMLElement | null; body: HTMLElement | null } | null;
  tree: () => ThreadTree | null;
  /** 锁心和半径（舞台坐标）。 */
  lock: () => { x: number; y: number; r: number };
  /** 要交的牌，按飞的先后；`side` 是线接在牌的哪一边。 */
  cards: () => Array<{ card: StageCardModel; side: 'left' | 'right' }>;
  slotOf: (id: string) => HTMLElement | null;
}

const FADE_MS = paced(260);

export const useAttachFlight = (o: Options) => {
  /** 已交出：牌位隐身、左边的线收着。 */
  const away = computed(() => o.face.value === 'receipt');
  /** 托盘在场（交出途中、拆开途中）。 */
  const tray = ref(false);
  const items = shallowRef<AttachItem[]>([]);
  /** 托盘里已经落定几张。 */
  const landed = ref(0);
  const lit = ref(false);
  /** 编排在跑：别处换面不另外淡入淡出，牌不能点。 */
  const busy = ref(false);

  let flight: Played | null = null;
  let merged: Played | null = null;
  let rings: HTMLElement[] = [];
  let lands: number[] = [];
  let fades: Animation[] = [];
  let raf = 0;

  const host = () => o.stage.value;
  const q = <T extends Element>(sel: string) => host()?.querySelector<T>(sel) ?? null;
  const qa = <T extends Element>(sel: string, root: ParentNode | null | undefined = host()) => [...(root?.querySelectorAll<T>(sel) ?? [])];
  const lockEl = () => q<HTMLElement>('.bridge-lock .lock');
  const chipOf = (id: string) => q<HTMLElement>(`.attach-tray .chip[data-id="${CSS.escape(id)}"]`);
  const chips = () => qa<HTMLElement>('.attach-tray .chip');
  const pieces = () => qa<HTMLElement>('[data-enter]', o.future()?.front);
  const paths = () => qa<SVGPathElement>('.threads .tree path');
  const buttons = () => o.cards().map((c) => o.slotOf(c.card.id)?.querySelector<HTMLElement>('.slot-button')).filter((el): el is HTMLElement => !!el);
  const canFly = () => !!o.tree() && !!host() && !reducedMotion();

  /** 托盘计数跟着计划的时间轴走（放慢、倒放、掉头都对得上），每帧只读一个数。 */
  const count = () => {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!flight) return;
      const at = positionOf(flight);
      const next = lands.filter((t) => t <= at + 1).length;
      if (next !== landed.value) landed.value = next;
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  /** 交出的整段计划：按此刻的牌位、线和托盘格子现量。 */
  const flightPlan = (): Step[] | null => {
    const tree = o.tree();
    const stage = host();
    const lock = lockEl();
    if (!tree || !stage || !lock) return null;
    const box = stage.getBoundingClientRect();
    const view = (p: Pt) => ({ x: p.x + box.left, y: p.y + box.top });
    const l = o.lock();
    const center = { x: l.x, y: l.y };
    const list = o.cards();
    // 一组（同一根主干）里最后飞的那张把主干收走。
    const trunkOf = new Map(tree.strands.map((s) => [s.id, s.trunk]));
    const lastOn = new Map<number, string>();
    for (const c of list) lastOn.set(trunkOf.get(c.card.id) ?? -1, c.card.id);
    const steps: Step[] = [];
    lands = [];
    rings = [];
    let firstChip = Infinity;
    list.forEach((c, i) => {
      const slot = o.slotOf(c.card.id);
      const el = slot?.querySelector<HTMLElement>('.scard');
      const turn = slot?.querySelector('.slot-button');
      const trace = traceEven(strandRoute(tree, c.card.id, center), 28);
      if (!el || !turn || !trace.points.length) return;
      const delay = i * STAGGER;
      const [fork = 0.5, origin = 0.9] = trace.marks.slice(-3);
      steps.push(cardStep(el, turn, c.side, trace.points.map(view), delay));
      const branch = q(`.threads .branch[data-id="${CSS.escape(c.card.id)}"]`);
      if (branch) steps.push(reelStep(branch, 0, fork, delay));
      const trunk = trunkOf.get(c.card.id);
      const trunkEl = trunk === undefined ? null : q(`.threads .trunk[data-i="${trunk}"]`);
      if (trunkEl && lastOn.get(trunk!) === c.card.id) steps.push(reelStep(trunkEl, fork, origin, delay));
      const gate = delay + FLY_MS * GATE_AT;
      const ring = gateRing(lock);
      rings.push(ring);
      steps.push(gateStep(ring, gate));
      const chip = chipOf(c.card.id);
      if (!chip) return;
      const r = chip.getBoundingClientRect();
      const goal = { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      steps.push(chipStep(chip, traceEven(slotRoute(tree, center, l.r, goal), 24).points.map(view), gate));
      firstChip = Math.min(firstChip, gate);
      // 慢落定曲线放到六成时小卡已经贴进格子，计数这时跳（等到最后一毫秒看着像慢半拍）。
      lands.push(gate + CHIP_MS * 0.62);
      const counter = q('.attach-tray .count');
      if (counter) steps.push(popStep(counter, gate + CHIP_MS * 0.62 - 40));
    });
    const panel = q('.attach-tray .tray-panel');
    if (panel && Number.isFinite(firstChip)) steps.push(riseStep(panel, Math.max(0, firstChip - paced(160)), paced(320), 8));
    return steps;
  };

  /** 牌位和左边的线就地淡出（`out`）/ 淡入：不飞的时候用。 */
  const fade = (out: boolean): Promise<void> => {
    for (const a of fades) a.cancel();
    const line = (el: Element) => el.animate(out ? [{ opacity: 1, strokeDashoffset: '0' }, { opacity: 0, strokeDashoffset: '0' }] : [{ opacity: 0, strokeDashoffset: '0' }, { strokeDashoffset: '0' }], { duration: FADE_MS, easing: 'ease-out', fill: out ? 'forwards' : 'none' });
    const card = (el: Element) => el.animate(out ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out', fill: out ? 'forwards' : 'none' });
    fades = [...buttons().map(card), ...paths().map(line)];
    return settled(fades);
  };
  const dropFades = () => { for (const a of fades) a.cancel(); fades = []; };

  const cleanup = () => {
    cancelAnimationFrame(raf);
    cancelPlayed(flight);
    cancelPlayed(merged);
    flight = null;
    merged = null;
    for (const ring of rings) ring.remove();
    rings = [];
    dropFades();
    tray.value = false;
    landed.value = 0;
    lit.value = false;
    busy.value = false;
  };

  const snapshot = () => { items.value = o.cards().map(({ card }) => ({ id: card.id, icon: card.icon, tint: card.tint, title: card.title, meta: card.line })); };

  /** 交出去：牌进锁、附件落进托盘。收回时这个 promise 要等原路退完才 resolve（调用方不等它）。 */
  const attach = async () => {
    busy.value = true;
    lit.value = true;
    snapshot();
    landed.value = 0;
    if (!canFly()) { await fade(true); return; }
    tray.value = true;
    await nextTick();
    const steps = flightPlan();
    if (!steps) { tray.value = false; await fade(true); return; }
    flight = play(planOf(steps));
    count();
    await settled([...flight.animations, flight.clock]);
  };

  /** 原路收回（Esc、再点锁、准备失败、被拦下）。 */
  const retract = async () => {
    if (flight) {
      await rewind(flight);
    } else if (fades.length) {
      const back = [...buttons(), ...paths()].map((el) => animateFromNow(el, { opacity: 1 }, { duration: paced(220), easing: 'ease-out', fill: 'forwards' }));
      dropFades();
      await settled(back);
      for (const a of back) a.cancel();
    }
    cleanup();
  };

  /** 文件备好：附件并成一枚 .md。`swap` 在换成回执那一面的那一刻调用。 */
  const merge = async (swap: () => void) => {
    const body = o.future()?.body ?? null;
    const out = body?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: paced(180), easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    await out?.finished.catch(() => undefined);
    swap();
    await nextTick();
    // 回执那一面换上来了：牌位、线改由样式类收着，飞行那一段的动画同一帧收掉。
    cancelPlayed(flight);
    flight = null;
    cancelAnimationFrame(raf);
    for (const ring of rings) ring.remove();
    rings = [];
    dropFades();
    const tiles = chips();
    if (tiles.length && !reducedMotion()) {
      merged = play(planOf(mergeSteps(tiles, q('.attach-tray .tray-panel'), pieces())));
      out?.cancel();
      await settled(merged.animations);
    } else {
      const fadeIn = body?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
      out?.cancel();
      await fadeIn?.finished.catch(() => undefined);
    }
    cleanup();
  };

  /** 回执 → 问题（「改问题」）：严格倒放。 */
  const detach = async () => {
    if (busy.value) return;
    const body = o.future()?.body ?? null;
    busy.value = true;
    if (!canFly() || !body) {
      await body?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: paced(180), fill: 'forwards' }).finished.catch(() => undefined);
      o.face.value = 'question';
      await nextTick();
      body?.getAnimations().forEach((a) => a.cancel());
      body?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
      await fade(false);
      cleanup();
      return;
    }
    snapshot();
    lit.value = true;
    tray.value = true;
    landed.value = items.value.length;
    await nextTick();
    // 一：.md 拆开成小卡，回执各块倒着淡出。
    merged = play(planOf(mergeSteps(chips(), q('.attach-tray .tray-panel'), pieces())), true);
    await settled(merged.animations);
    // 二：换回问题面（牌位露出来的同一帧，牌已经停在锁心）；小卡穿回锁、牌沿线飞回原位、线在后面长出来。
    o.face.value = 'question';
    await nextTick();
    cancelPlayed(merged);
    merged = null;
    body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: paced(260), easing: 'ease-out' });
    const steps = flightPlan();
    if (steps) {
      flight = play(planOf(steps), true);
      count();
      await settled([...flight.animations, flight.clock]);
    }
    cleanup();
  };

  /* 别处把右牌翻到 / 翻离回执（只导出、计划那一面）：不飞，就地淡。编排自己换面时不管。 */
  watch(away, (on) => { if (!busy.value) void fade(on).then(() => { if (!busy.value) dropFades(); }); });
  onBeforeUnmount(cleanup);

  return { away, tray, items, landed, lit, busy, attach, merge, retract, detach };
};
