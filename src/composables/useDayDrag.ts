/**
 * 周视图里拖一整天（批次 4.1）：卡片跟着手走，其余卡片用弹簧让位；放在另一张卡上是交换，放在两张卡之间的
 * 缝隙是插入并顺移。
 *
 * - 只动 `translate`（合成器上跑）；让位的卡带一条有回弹的过渡，被拖的那张每帧跟手、不带过渡。
 * - 松手以后先把被拖的卡滑到落点，等草稿改完、新数据画上来的那一帧，再一次性撤掉所有位移——
 *   格子是按日期排的，数据换过来以后格子里的内容正好是刚才预览的样子，看不出跳。
 * - 拖过就吞掉随后那一下 click（格子本身是去单天页的链接）。按下没动（< 6px）就是普通的点。
 * - 键盘替代：格子上的 ← / → 和相邻一天交换（BridgeFuture 里），Delete 删掉这天。
 */
import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';

const SPRING = 'cubic-bezier(.34, 1.36, .64, 1)';
const SETTLE = 'cubic-bezier(.4, .6, .2, 1)';
/** 指针落在卡片中间这一段算「放在卡上」（交换），两边各 22% 算「放在缝隙里」（插入）。 */
const EDGE = 0.22;

export type DayDrop = { kind: 'swap' | 'insert'; date: string };

export const useDayDrag = (options: {
  root: Ref<HTMLElement | null>;
  enabled: () => boolean;
  swap: (from: string, to: string) => Promise<unknown> | void;
  insert: (from: string, to: string) => Promise<unknown> | void;
}) => {
  const dragging = ref<string | null>(null);
  const drop = ref<DayDrop | null>(null);
  type Cell = { el: HTMLElement; date: string; rect: DOMRect };
  let start: { x: number; y: number; el: HTMLElement; date: string } | null = null;
  let cells: Cell[] = [];
  let moved = false;
  let swallowClick = false;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const cellsNow = (): Cell[] => [...(options.root.value?.querySelectorAll<HTMLElement>('[data-day]') ?? [])]
    .map((el) => ({ el, date: el.dataset.day ?? '', rect: el.getBoundingClientRect() }));

  const reset = (animate: boolean) => {
    for (const cell of cellsNow()) {
      cell.el.style.transition = animate && !reduced() ? `translate 320ms ${SETTLE}` : 'none';
      cell.el.style.translate = '';
      cell.el.style.zIndex = '';
      cell.el.classList.remove('is-lifted', 'is-target');
    }
    if (!animate) requestAnimationFrame(() => { for (const cell of cellsNow()) cell.el.style.transition = ''; });
  };

  /** 预览：别的卡让到它们落定后的位置。 */
  const layout = (fromIndex: number, target: DayDrop | null) => {
    const destIndex = target ? cells.findIndex((c) => c.date === target.date) : -1;
    cells.forEach((cell, j) => {
      if (j === fromIndex) return;
      let dx = 0;
      if (target?.kind === 'swap' && j === destIndex) dx = cells[fromIndex]!.rect.left - cell.rect.left;
      if (target?.kind === 'insert' && destIndex >= 0) {
        if (fromIndex < destIndex && j > fromIndex && j <= destIndex) dx = cells[j - 1]!.rect.left - cell.rect.left;
        if (destIndex < fromIndex && j >= destIndex && j < fromIndex) dx = cells[j + 1]!.rect.left - cell.rect.left;
      }
      cell.el.style.transition = reduced() ? 'none' : `translate 380ms ${SPRING}`;
      cell.el.style.translate = dx ? `${dx}px 0` : '';
      cell.el.classList.toggle('is-target', target?.kind === 'swap' && j === destIndex);
    });
  };

  /** 指针在哪：放在哪张卡上（交换），或者哪条缝里（插入，换算成落到哪一天）。 */
  const targetAt = (x: number, fromIndex: number): DayDrop | null => {
    for (let i = 0; i < cells.length; i += 1) {
      const rect = cells[i]!.rect;
      if (x < rect.left - 4 || x > rect.right + 4) continue;
      const rel = (x - rect.left) / Math.max(1, rect.width);
      if (rel >= EDGE && rel <= 1 - EDGE) return i === fromIndex ? null : { kind: 'swap', date: cells[i]!.date };
      const gap = rel < EDGE ? i : i + 1;
      const dest = gap <= fromIndex ? gap : gap - 1;
      if (dest === fromIndex || dest < 0 || dest >= cells.length) return null;
      return { kind: 'insert', date: cells[dest]!.date };
    }
    return null;
  };

  const onMove = (event: PointerEvent) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!moved) {
      if (Math.hypot(dx, dy) < 6) return;
      moved = true;
      dragging.value = start.date;
      cells = cellsNow();
      start.el.classList.add('is-lifted');
      start.el.style.transition = 'none';
      start.el.style.zIndex = '3';
    }
    start.el.style.translate = `${dx}px ${dy * 0.35}px`;
    const fromIndex = cells.findIndex((c) => c.date === start!.date);
    const next = targetAt(event.clientX, fromIndex);
    if (next?.kind !== drop.value?.kind || next?.date !== drop.value?.date) {
      drop.value = next;
      layout(fromIndex, next);
    }
  };

  const finish = async () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    const began = start;
    start = null;
    if (!began || !moved) return;
    swallowClick = true;
    const target = drop.value;
    drop.value = null;
    dragging.value = null;
    if (!target) { reset(true); return; }
    // 被拖的卡滑到落点上（交换落在那张卡的位置；插入落在那一天的位置）。
    const fromRect = cells.find((c) => c.date === began.date)!.rect;
    const toRect = cells.find((c) => c.date === target.date)!.rect;
    began.el.style.transition = reduced() ? 'none' : `translate 260ms ${SETTLE}`;
    began.el.style.translate = `${toRect.left - fromRect.left}px 0`;
    try {
      await (target.kind === 'swap' ? options.swap(began.date, target.date) : options.insert(began.date, target.date));
      await nextTick();
      reset(false);
    } catch {
      reset(true);
    }
  };
  const onUp = () => { void finish(); };
  const onCancel = () => { moved = false; void finish(); reset(true); };

  const onPointerDown = (event: PointerEvent) => {
    if (!options.enabled() || event.button !== 0) return;
    const el = (event.target as Element | null)?.closest<HTMLElement>('[data-day]');
    if (!el || (event.target as Element).closest('button')) return;
    start = { x: event.clientX, y: event.clientY, el, date: el.dataset.day ?? '' };
    moved = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };
  /** 拖过以后的那一下 click 不算「点开这一天」。 */
  const onClickCapture = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  });

  return { dragging, drop, onPointerDown, onClickCapture };
};
