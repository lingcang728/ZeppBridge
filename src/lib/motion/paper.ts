/**
 * 接回定稿的玻璃纸片（2026-10-12 第 3 批，替换原来「JSON 飘一下就没」的 paper-scatter）。
 *
 *   1. 读剪贴板时，一张玻璃纸片从按钮里抽出来，停在按钮旁边，上面是定稿的头几行；
 *   2. 读到定稿：纸片滑到日程处盖住它，底下旧的几行退下（`[data-paper-row]`）；
 *   3. 存好、新的几行画出来以后：纸片一段一段让开，每让开一行，那一行才落定——纸片和新行交替出现，
 *      从不同时半透明叠在一起（让开的方向跟着行的排法：竖排往下、横排往右）；
 *   4. 失败：纸片上写出原因，停一下，原路退回按钮。
 *
 * 只动 transform / opacity；外层（.zb-paper）裁切，里面的纸（.zb-paper-sheet）平移出去就是「让开」。
 * 每一段动画放完都 commitStyles 落成内联样式再取消，换向时从此刻的位置出发，不叠 fill。
 * 样式在 styles/ai-task.css（纸片挂在 body 上，组件的 scoped 样式够不着）。
 */
import { reducedMotion } from './cards';
import { paced } from './timing';

const EASE = 'cubic-bezier(.4, .6, .2, 1)';
const W = 260;
const H = 150;
const MARGIN = 12;

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (box: DOMRect): Rect => ({ x: box.left, y: box.top, w: box.width, h: box.height });
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
/** 等日程停稳：空态变成日程时牌高还在过渡（FutureCard），量到一半的位置纸片会对不上行。最多等 600ms。 */
const settled = async (el: HTMLElement) => {
  let last = '';
  for (let i = 0; i < 36; i += 1) {
    await frame();
    const r = el.getBoundingClientRect();
    const now = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (now === last) return;
    last = now;
  }
};

export interface Paper {
  /** 从按钮里抽出来，停在按钮旁边。 */
  pullOut(): Promise<void>;
  /** 写上定稿的头几行和一行说明。 */
  fill(lines: string[], caption: string): void;
  /** 失败：写出原因，停一下，原路退回按钮。 */
  fail(reason: string): Promise<void>;
  /**
   * 滑到 `host` 盖住它、旧行退下，等 `commit()`（存草稿）；成功就一行一行让开、新行落定，返回 true。
   * `commit` 失败（返回 false）时旧行回来、纸片退回按钮，返回 false。
   */
  land(host: HTMLElement | null, commit: () => Promise<boolean>, reason: () => string): Promise<boolean>;
  dispose(): void;
}

export const createPaper = (button: HTMLElement): Paper => {
  const wrap = document.createElement('div');
  wrap.className = 'zb-paper';
  wrap.setAttribute('aria-hidden', 'true');
  const sheet = document.createElement('div');
  sheet.className = 'zb-paper-sheet';
  const text = document.createElement('div');
  text.className = 'zb-paper-text';
  sheet.append(text);
  wrap.append(sheet);
  wrap.style.width = `${W}px`;
  wrap.style.height = `${H}px`;
  wrap.style.opacity = '0';
  document.body.append(wrap);
  let box = { w: W, h: H };

  const pose = (r: Rect) => `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) scale(${(r.w / box.w).toFixed(4)}, ${(r.h / box.h).toFixed(4)})`;
  const go = async (el: HTMLElement, to: Keyframe, duration: number, easing = EASE) => {
    const from = getComputedStyle(el);
    const start: Keyframe = { transform: from.transform === 'none' ? 'none' : from.transform, opacity: from.opacity };
    const anim = el.animate([start, to], { duration: reducedMotion() ? 1 : paced(duration), easing, fill: 'forwards' });
    await anim.finished.catch(() => undefined);
    try { anim.commitStyles(); } catch { /* 元素已经不在文档里 */ }
    anim.cancel();
  };
  const buttonRect = () => rectOf(button.getBoundingClientRect());
  /** 按钮旁边停纸片的位置：上面放得下放上面，否则放下面；左右夹在窗口里。 */
  const outRect = (): Rect => {
    const b = buttonRect();
    const x = Math.min(window.innerWidth - W - MARGIN, Math.max(MARGIN, b.x + b.w / 2 - W / 2));
    const y = b.y - H - 10 >= MARGIN ? b.y - H - 10 : Math.min(window.innerHeight - H - MARGIN, b.y + b.h + 10);
    return { x, y, w: W, h: H };
  };

  const pullOut = async () => {
    wrap.style.transform = pose(buttonRect());
    await frame();
    await go(wrap, { transform: pose(outRect()), opacity: '1' }, 500);
  };

  const fill = (lines: string[], caption: string) => {
    text.replaceChildren(...lines.map((line) => {
      const row = document.createElement('span');
      row.textContent = line;
      return row;
    }));
    const small = document.createElement('small');
    small.textContent = caption;
    text.append(small);
  };

  const back = async () => {
    // 回到按钮时纸片要恢复成按钮旁边那张的大小再缩回去（落到日程处时换过基准尺寸）。
    await go(wrap, { transform: pose(buttonRect()), opacity: '0' }, 440, 'cubic-bezier(.4, 0, .7, .2)');
    dispose();
  };

  const fail = async (reason: string) => {
    fill([], reason);
    wrap.classList.add('is-failed');
    await go(text, { opacity: '1' }, 1);
    await wait(reducedMotion() ? 600 : 1100);
    await back();
  };

  const land = async (host: HTMLElement | null, commit: () => Promise<boolean>, reason: () => string): Promise<boolean> => {
    if (!host || !host.isConnected) {
      const ok = await commit();
      if (!ok) { await fail(reason()); return false; }
      await go(wrap, { transform: `${pose(outRect())} translateY(-14px)`, opacity: '0' }, 360);
      dispose();
      return true;
    }
    const target = rectOf(host.getBoundingClientRect());
    const old = [...host.querySelectorAll<HTMLElement>('[data-paper-row]')];
    // 纸片滑过去的同时上面的字淡掉：盖到日程上的是一张干净的玻璃。
    void go(text, { opacity: '0' }, 200);
    const retreat = old.map((row, i) => row.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }],
      { duration: paced(200), delay: paced(180 + i * 30), easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
    await go(wrap, { transform: pose(target), opacity: '1' }, 500);
    // 换基准尺寸：纸片就是日程这么大，后面的平移不再带缩放（圆角不被拉扁）。
    box = { w: target.w, h: target.h };
    wrap.style.width = `${target.w}px`;
    wrap.style.height = `${target.h}px`;
    wrap.style.transform = pose(target);
    host.setAttribute('data-paper-hold', '');
    for (const anim of retreat) anim.finish();

    const ok = await commit();
    if (!ok) {
      host.removeAttribute('data-paper-hold');
      for (const anim of retreat) anim.reverse();
      box = { w: W, h: H };
      wrap.style.width = `${W}px`;
      wrap.style.height = `${H}px`;
      wrap.style.transform = pose(target);
      await fail(reason());
      for (const anim of retreat) anim.cancel();
      return false;
    }
    for (const anim of retreat) anim.cancel();
    // 等新的几行画出来、牌高过渡完；日程的大小可能变了（空态 → 有计划），纸片跟着换成新尺寸。
    await frame();
    await settled(host);
    const now = rectOf(host.getBoundingClientRect());
    box = { w: now.w, h: now.h };
    wrap.style.width = `${now.w}px`;
    wrap.style.height = `${now.h}px`;
    wrap.style.transform = pose(now);
    const rows = [...host.querySelectorAll<HTMLElement>('[data-paper-row]')];
    const across = rows.length > 1 && rows[1]!.getBoundingClientRect().left >= rows[0]!.getBoundingClientRect().right - 1;
    const MOVE = reducedMotion() ? 1 : paced(170);
    const SHOW = reducedMotion() ? 1 : paced(150);
    const step = MOVE + SHOW;
    // 一行一个台阶：纸先让开到这一行的边，再让这一行落下。所有动画一次排好（delay + backwards），不靠定时器。
    const edges = rows.map((row) => {
      const r = row.getBoundingClientRect();
      return across ? r.right - now.x : r.bottom - now.y;
    });
    const total = rows.length * step + MOVE;
    const offsets: Keyframe[] = [{ transform: 'translate(0, 0)', offset: 0 }];
    edges.forEach((edge, i) => {
      const at = (i * step) / total;
      const done = (i * step + MOVE) / total;
      const prev = i === 0 ? 0 : edges[i - 1]!;
      offsets.push({ transform: across ? `translate(${prev}px, 0)` : `translate(0, ${prev}px)`, offset: at, easing: EASE });
      offsets.push({ transform: across ? `translate(${edge}px, 0)` : `translate(0, ${edge}px)`, offset: done });
    });
    offsets.push({ transform: across ? `translate(${now.w + 4}px, 0)` : `translate(0, ${now.h + 4}px)`, offset: 1 });
    const slide = sheet.animate(offsets, { duration: total, easing: 'linear', fill: 'forwards' });
    host.removeAttribute('data-paper-hold');
    rows.forEach((row, i) => {
      row.animate([{ opacity: 0, transform: across ? 'translateX(-6px)' : 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: SHOW + 120, delay: i * step + MOVE, easing: EASE, fill: 'backwards' });
    });
    await slide.finished.catch(() => undefined);
    dispose();
    return true;
  };

  const dispose = () => wrap.remove();

  return { pullOut, fill, fail, land, dispose };
};
