import type { PlaybackClock } from '../playback';
import type { DemoPresentation, FilmWall } from '../../../demo/presentation';
import type { Camera, Pose, Shot, Stage, WatchState } from './types';
import type { CaptionKey } from './copy';
import type { LandingLocale } from '../../../composables/useLandingLocale';

/** 演示应用在窗口里的固定尺寸（CSS 像素）。镜头、指针都用这套坐标。 */
export const APP_W = 1280;
export const APP_H = 800;
/** 推近后目标四周至少留这么多（应用坐标），不再把内容切在框外。 */
const SAFE = 36;
/**
 * 整片倍速（10-14 用户：太慢，观众没耐心）。导演层的等待、指针、镜头都按它缩短，
 * 应用里的 Web Animations / CSS 动画也按它加速；只有每镜的计划时长是真实毫秒。
 */
export const SPEED = 1.4;

type Target = string | Element;
interface Point { x: number; y: number }
interface Box { x: number; y: number; width: number; height: number }

/**
 * 一镜里能做的事。所有等待都走 PlaybackClock：观众暂停、切章、离开页面都能干净地停下。
 * 只通过 `__ZB_PRESENTATION__` 操作应用（真事件、真路由、真动画），不改应用状态的捷径。
 * 点、按、拖、推镜头之前都先等应用里的动画落定、目标停稳——不在牌展开一半时点下一步，也不量到还在飞的位置。
 */
export class Director {
  private pointerAt: Point = { x: APP_W / 2, y: APP_H / 2 };
  /** 跨镜记住的东西（比如最近一晚睡眠页的地址），省得每次在黑场里绕路去找。 */
  readonly memo = new Map<string, string>();
  constructor(readonly view: Window, readonly clock: PlaybackClock, readonly stage: Stage, readonly locale: LandingLocale = 'en') {}

  get api(): DemoPresentation {
    const api = this.view.__ZB_PRESENTATION__;
    if (!api) throw new Error('Demo presentation is not ready');
    return api;
  }
  get doc(): Document { return this.view.document; }

  /** 影片时间（按倍速缩短）。 */
  wait(ms: number) { return this.clock.wait(ms / SPEED); }

  /** 等一个看得见的元素出现（宽度 > 0）。 */
  async find(selector: string, options: { limit?: number; index?: number } = {}): Promise<HTMLElement> {
    const limit = options.limit ?? 12000;
    for (let elapsed = 0; elapsed < limit; elapsed += 80) {
      await this.clock.checkpoint();
      const found = this.all(selector)[options.index ?? 0];
      if (found) return found;
      await this.clock.wait(80);
    }
    throw new Error(`Film target unavailable: ${selector}`);
  }
  all(selector: string): HTMLElement[] {
    return [...this.doc.querySelectorAll<HTMLElement>(selector)].filter((el) => el.getBoundingClientRect().width > 0);
  }
  private async resolve(target: Target): Promise<HTMLElement> {
    return typeof target === 'string' ? this.find(target) : target as HTMLElement;
  }
  center(el: Element): Point { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

  /**
   * 等应用里的转场动画放完，最多等 `limit` 真实毫秒。只算一次性、3 秒以内的动画：
   * 跑马灯、对比条流光、生活事件节点呼吸这类循环装饰一直在跑，算上就每一下都白等到上限。
   */
  async settle(limit = 1600) {
    for (let elapsed = 0; elapsed < limit; elapsed += 50) {
      const busy = this.doc.getAnimations().some((animation) => {
        if (animation.playState !== 'running') return false;
        const timing = animation.effect?.getComputedTiming();
        return !!timing && timing.iterations === 1 && typeof timing.endTime === 'number' && timing.endTime <= 3000;
      });
      if (!busy) return;
      await this.clock.wait(50);
    }
  }
  /** 等元素的位置连续两次量得一样（发牌、扇开这类 JS 驱动的移动也算上）。 */
  async steady(el: Element, limit = 900) {
    let last = el.getBoundingClientRect();
    for (let elapsed = 0; elapsed < limit; elapsed += 60) {
      await this.clock.wait(60);
      const next = el.getBoundingClientRect();
      if (Math.abs(next.x - last.x) < 0.5 && Math.abs(next.y - last.y) < 0.5 && Math.abs(next.width - last.width) < 0.5) return;
      last = next;
    }
  }
  private async ready(target: Target): Promise<HTMLElement> {
    await this.settle();
    const el = await this.resolve(target);
    await this.steady(el);
    return el;
  }

  // ── 指针 ────────────────────────────────────────────────────────────

  /** 指针从当前位置滑到目标（带一点弧线），不按下。 */
  async move(to: Point, ms = 360) {
    const from = { ...this.pointerAt };
    const steps = Math.max(1, Math.round(ms / SPEED / 16));
    const lift = Math.min(50, Math.hypot(to.x - from.x, to.y - from.y) * 0.1);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t * t * (3 - 2 * t);
      this.pointerAt = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * t) * lift };
      this.stage.pointer({ ...this.pointerAt, pressed: false, visible: true });
      await this.wait(ms / steps);
    }
  }
  hidePointer() { this.stage.pointer({ ...this.pointerAt, pressed: false, visible: false }); }

  /** 点一下：等目标停稳，指针过去、按下涟漪、真 click。`after` 是点完留给应用的反应时间。 */
  async tap(target: Target, options: { after?: number; travel?: number } = {}) {
    const el = await this.ready(target);
    const at = this.center(el);
    await this.move(at, options.travel ?? 340);
    this.stage.pointer({ ...at, pressed: true, visible: true });
    this.api.click(el);
    await this.wait(120);
    this.stage.pointer({ ...at, pressed: false, visible: true });
    await this.wait(options.after ?? 500);
    return el;
  }

  /** 黑场里用：直接点，不画指针、不等动画（换页、开牌桌这类布景，观众看不见，越快越好）。 */
  async press(target: Target) { await this.settle(1200); this.api.click(await this.resolve(target)); }
  /** 黑场里用：点到 `expect` 出现为止（页面还在进场时第一下可能没生效），最多点三次。 */
  async pressUntil(target: string, expect: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.press(target);
      try { await this.find(expect, { limit: 2200 }); return; } catch { /* 再点一次 */ }
    }
    await this.find(expect, { limit: 1 });
  }
  /**
   * 黑场里用：跟着一个链接直接换页（不演卡片形变）。先等转场落定——收回动画期间页面上有一张同 class、
   * 没有链接的卡片替身，取到它就跳不过去。
   */
  async follow(selector: string, settle = 200) {
    await this.settle(1500);
    const href = (await this.find(`${selector}[href]`)).getAttribute('href');
    if (!href) throw new Error(`Film link has no href: ${selector}`);
    await this.go(href, settle);
  }

  /** 往输入框里一个字一个字地打（真 input 事件，应用照常响应）。`replace` 先清空。 */
  async type(target: Target, text: string, options: { replace?: boolean; perChar?: number } = {}) {
    const el = await this.tap(target, { after: 120 }) as HTMLInputElement | HTMLTextAreaElement;
    const win = this.view as Window & typeof globalThis;
    const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    let value = options.replace ? '' : el.value;
    for (const char of [...text]) {
      value += char;
      setValue.call(el, value);
      el.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
      await this.wait(options.perChar ?? 45);
    }
  }

  /** 长按：指针上出进度环，`ms`（真实毫秒，应用按真实时间计长按）之后松开。 */
  async hold(target: Target, ms = 600, options: { after?: number } = {}) {
    const el = await this.ready(target);
    const at = this.center(el);
    await this.move(at);
    this.api.pointer(el, 'pointerdown', at.x, at.y);
    this.stage.pointer({ ...at, pressed: true, visible: true, hold: ms });
    try { await this.clock.wait(ms); } finally {
      this.api.pointer(el, 'pointerup', at.x, at.y);
      this.stage.pointer({ ...at, pressed: false, visible: true });
    }
    await this.wait(options.after ?? 600);
    return el;
  }

  /**
   * 按住拖动（缓入缓出）。`flick`：末段加速，松手瞬间速度够大（甩出去）；
   * `roundTrip`：拖出去再回到原处才松手（玻璃条上让透镜滑一趟，不真的换选项）。
   */
  async drag(target: Target, by: Point, options: { ms?: number; settle?: number; flick?: boolean; roundTrip?: boolean; grab?: number } = {}) {
    const el = await this.ready(target);
    const from = this.center(el);
    await this.move(from);
    this.api.pointer(el, 'pointerdown', from.x, from.y);
    this.stage.pointer({ ...from, pressed: true, visible: true });
    let end = from;
    try {
      await this.wait(options.grab ?? 220);
      const ms = options.ms ?? 800;
      const steps = Math.max(2, Math.ceil(ms / SPEED / 16));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = options.roundTrip ? Math.sin(Math.PI * t) : options.flick ? t * t * t : (1 - Math.cos(Math.PI * t)) / 2;
        end = { x: from.x + by.x * e, y: from.y + by.y * e };
        this.api.pointer(el, 'pointermove', end.x, end.y);
        this.pointerAt = end;
        this.stage.pointer({ ...end, pressed: true, visible: true });
        await this.wait(ms / steps);
      }
      if (!options.flick) await this.wait(160);
      this.api.pointer(el, 'pointerup', end.x, end.y);
    } catch (error) {
      this.api.pointer(el, 'pointercancel', end.x, end.y);
      throw error;
    }
    this.stage.pointer({ ...end, pressed: false, visible: true });
    await this.wait(options.settle ?? 650);
    return el;
  }

  // ── 应用 ────────────────────────────────────────────────────────────

  /**
   * 换页并确认真的到了：上一段页面转场（如从卡片页收回）还没放完时，新的跳转会被应用丢掉，
   * 所以跳完核对地址，没到就等转场落定再跳（最多三次）；平时不白等。
   */
  async go(path: string, settle = 500) {
    const want = path.split('?')[0];
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.clock.checkpoint();
      if (attempt) await this.settle(1500);
      await this.api.go(path);
      for (let n = 0; n < 15 && this.view.location.pathname !== want; n++) await this.clock.wait(60);
      if (this.view.location.pathname === want) break;
    }
    await this.find('.main-content');
    const main = this.doc.querySelector<HTMLElement>('.main-content');
    if (main) main.scrollTop = 0;
    await this.wait(settle);
  }
  async escape(after = 400) { this.api.escape(); await this.wait(after); }
  /** 关掉所有浮层、牌桌、收集箱、展示墙，回到干净的页面（章首、跳章时用）。 */
  async clear() {
    this.api.wall(null);
    for (let n = 0; n < 5 && this.doc.querySelector('[data-modal-dialog], .card-table, .box-spread, .anchored-popover, dialog[open]'); n++) await this.escape(160);
  }
  /** 盖在应用上的展示墙（演示专用，见 demo/walls）：多根玻璃条 / 多排牌并排滚动。 */
  async wall(kind: FilmWall | null) { this.api.wall(kind); if (kind) await this.find(`.film-wall.${kind}`); }
  /** 应用里的主滚动区平滑滚到元素（缓出），元素上缘落在 `top` 处。 */
  async scrollTo(target: Target, top = 90, ms = 460) {
    const el = await this.resolve(target);
    const main = this.doc.querySelector<HTMLElement>('.main-content');
    if (!main || !main.contains(el)) return;
    const start = main.scrollTop, end = Math.max(0, start + el.getBoundingClientRect().top - main.getBoundingClientRect().top - top);
    const steps = Math.max(1, Math.round(ms / SPEED / 16));
    for (let i = 1; i <= steps; i++) { main.scrollTop = start + (end - start) * (1 - (1 - i / steps) ** 3); await this.wait(ms / steps); }
  }
  /** 应用动画相对整片倍速再快 / 慢多少（1 = 跟整片一样）。 */
  rate(value = 1) { this.api.rate(value * SPEED); }

  // ── 镜头与舞台 ──────────────────────────────────────────────────────

  /**
   * 推到目标：按它的大小选倍率（`zoom` 是上限），并夹在安全框里——目标完整入画，画面不露窗外。
   * 目标可以是一组元素（取合并范围，牌墙、一手牌）；传 null 拉回全景。量之前先等目标停稳。
   */
  async camera(target: Target | Element[] | null, options: { zoom?: number; ms?: number; fill?: number; hold?: number } = {}) {
    const ms = (options.ms ?? 800) / SPEED;
    if (target === null) { this.stage.camera({ x: 0, y: 0, zoom: 1 }, ms); await this.clock.wait(options.hold === undefined ? ms : options.hold / SPEED); return; }
    await this.settle();
    const els = Array.isArray(target) ? target : [await this.resolve(target)];
    if (!els.length) return;
    await this.steady(els[0]!);
    const r = union(els.map((el) => el.getBoundingClientRect()));
    const fill = options.fill ?? 0.62;
    const fit = Math.min((APP_W * fill) / (r.width + SAFE * 2), (APP_H * fill) / (r.height + SAFE * 2));
    const zoom = Math.max(1, Math.min(options.zoom ?? 2.2, fit));
    this.stage.camera(frame(r, zoom), ms);
    await this.clock.wait(options.hold === undefined ? ms : options.hold / SPEED);
  }
  pose(next: Pose, ms = 800) { this.stage.pose(next, ms / SPEED); return this.wait(ms); }
  /**
   * 换场：窗口边模糊边淡进光晕里（不黑场，10-14 用户：样片的转场丝滑，我们的太生硬），期间做 `setup`（换页、开牌桌），
   * 再从模糊、微微放大处清晰浮回来。镜头同时复位。
   */
  async cut(setup: () => Promise<void>, ms = 300) {
    this.stage.dissolve(true, ms / SPEED); this.hidePointer(); await this.wait(ms);
    this.stage.camera({ x: 0, y: 0, zoom: 1 }, 0);
    await setup();
    await this.settle(500);
    this.stage.dissolve(false, (ms + 260) / SPEED); await this.wait(ms);
  }
  /** 手表道具；给了 `from`（应用里的元素）就先从它飞一张训练卡到表盘上，再亮起来。 */
  watch(state: WatchState, from?: Element, ms = 900) {
    this.stage.watch(state, from ? { from: this.center(from), ms: ms / SPEED } : undefined);
  }
  caption(key: CaptionKey | null) { this.stage.caption(key); }
}

const union = (rects: Box[]): Box => {
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width)), bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
};

/** 让矩形 `r` 的中心尽量落在画面中央，但不让画面露出应用之外。 */
export const frame = (r: Box, zoom: number): Camera => {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const x = Math.min(0, Math.max(APP_W * (1 - zoom), APP_W / 2 - cx * zoom));
  const y = Math.min(0, Math.max(APP_H * (1 - zoom), APP_H / 2 - cy * zoom));
  return { x, y, zoom };
};

/** `used`：动作本身用了多久（不算补足）；离计划越近，越说明这一镜没有余量。 */
export interface ShotTiming { chapter: string; shot: string; planned: number; actual: number; used: number }

/** 放一镜：先摆姿态、上字幕，做完动作后补足到计划时长（真实毫秒）；回报实际用时（录片和调节奏时看哪一镜超了）。 */
export async function playShot(chapter: string, shot: Shot, director: Director, onShot?: (timing: ShotTiming) => void) {
  const start = director.clock.elapsed();
  director.stage.shot(chapter, shot.id);
  if (shot.pose) director.stage.pose(shot.pose, 700);
  if (shot.caption !== undefined) director.caption(shot.caption);
  await shot.run(director);
  const used = director.clock.elapsed() - start;
  if (used < shot.ms) await director.clock.wait(shot.ms - used);
  onShot?.({ chapter, shot: shot.id, planned: shot.ms, actual: Math.round(Math.max(used, shot.ms)), used: Math.round(used) });
}
