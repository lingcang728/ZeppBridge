/**
 * 把 lib/aiTask/cloudPhysics.ts 的「力」接到舞台上（10-08 H16）：拖牌时别的牌被挤开、松手弹回，线跟着轻轻晃。
 *
 * 只在有东西在动的时候跑 rAF（拖着、或者还没停稳）；停稳就停。每帧把各张牌被挤开的位移写进一个 shallowRef，
 * 舞台的 `placed`（牌的位置、线的端点）读它。减少动效时不跑（牌不挤、线不晃）。页面看不见时也不跑。
 */
import { onBeforeUnmount, shallowRef } from 'vue';
import { stepCloud, type CloudBody } from '../../lib/aiTask/cloudPhysics';
import { reducedMotion } from '../../lib/motion/cards';

export interface CloudPhysicsOptions {
  /** 此刻在场的牌（id + 牌位左上角，不含任何偏移）。 */
  slots: () => Array<{ id: string; x: number; y: number }>;
  /** 用户拖过、停下来的偏移。 */
  offsetOf: (id: string) => { x: number; y: number };
  /** 正被拖着的那张和它此刻的偏移。 */
  live: () => { id: string; x: number; y: number } | null;
  card: () => { width: number; height: number };
}

const NONE = Object.freeze({ x: 0, y: 0 });

export const useCloudPhysics = (options: CloudPhysicsOptions) => {
  const shifts = shallowRef<ReadonlyMap<string, { x: number; y: number }>>(new Map());
  const bodies = new Map<string, CloudBody>();
  let frame = 0;
  let last = 0;

  const sync = () => {
    const live = options.live();
    const seen = new Set<string>();
    for (const slot of options.slots()) {
      seen.add(slot.id);
      const o = options.offsetOf(slot.id);
      const rest = { x: slot.x + o.x, y: slot.y + o.y };
      const body = bodies.get(slot.id) ?? { id: slot.id, rest, d: { x: 0, y: 0 }, v: { x: 0, y: 0 } };
      body.rest = rest;
      body.pinned = live?.id === slot.id;
      if (body.pinned) {
        body.at = { x: slot.x + live!.x, y: slot.y + live!.y };
        body.d = { x: 0, y: 0 };
        body.v = { x: 0, y: 0 };
      } else body.at = undefined;
      bodies.set(slot.id, body);
    }
    for (const id of [...bodies.keys()]) if (!seen.has(id)) bodies.delete(id);
  };

  const tick = (now: number) => {
    frame = 0;
    sync();
    const calm = stepCloud([...bodies.values()], options.card(), last ? (now - last) / 1000 : 1 / 60);
    last = now;
    shifts.value = new Map([...bodies.values()].map((b) => [b.id, b.pinned ? NONE : { x: b.d.x, y: b.d.y }]));
    if (calm && [...bodies.values()].every((b) => Math.abs(b.d.x) < 0.3 && Math.abs(b.d.y) < 0.3)) {
      shifts.value = new Map();
      for (const b of bodies.values()) { b.d = { x: 0, y: 0 }; b.v = { x: 0, y: 0 }; }
      last = 0;
      return;
    }
    if (calm && !options.live()) { last = 0; return; }
    frame = requestAnimationFrame(tick);
  };

  /** 有东西动了（拖着、刚松手、牌的多少变了）：跑起来，直到停稳。 */
  const kick = () => {
    if (reducedMotion() || frame || document.hidden) return;
    frame = requestAnimationFrame(tick);
  };
  /** 换任务、重新撒牌：全部归位、不放。 */
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    bodies.clear();
    shifts.value = new Map();
  };
  const shiftOf = (id: string) => shifts.value.get(id) ?? NONE;
  /** 一张牌此刻比它要停的位置多出 (dx, dy)（松手被夹回来）：从这里弹回去，线跟着走。同一帧就生效，不闪到终点。 */
  const nudge = (id: string, dx: number, dy: number) => {
    sync();
    const body = bodies.get(id);
    if (!body) return;
    body.pinned = false;
    body.at = undefined;
    body.d = { x: body.d.x + dx, y: body.d.y + dy };
    shifts.value = new Map([...shifts.value, [id, { ...body.d }]]);
    kick();
  };

  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return { shiftOf, kick, reset, nudge };
};
