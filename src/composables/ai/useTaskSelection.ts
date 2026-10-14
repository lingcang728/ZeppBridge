/**
 * 已保存任务的批量挑选（第四轮 1D·D7，用户 10-07 拍板「长按进入挑选」）。
 *
 * - 长按一张卡（450ms）进入挑选，那一张先选上；挑选中点卡 = 选上 / 取消；
 * - 按住拖过 = 连选：第一张是选上还是取消，拖过的每一张都照它来（和相册里拖选一样）；
 * - Esc / 「完成」退出；退出时清空。
 * 只管「选了哪几张」，删除和撤销在页面里做（useAiTaskDraft / backend.aiTaskDeleteMany）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { onMotionEscape } from '../../lib/motion/interrupt';

const HOLD_MS = 450;
const MOVE_SLOP = 8;

export const useTaskSelection = () => {
  const selecting = ref(false);
  const selected = ref<ReadonlySet<string>>(new Set());
  const count = computed(() => selected.value.size);
  /** 刚长按进入挑选 / 刚拖选完：吞掉随后浏览器补的那一下 click（不然会接着打开任务）。 */
  let swallow = false;
  let hold: { id: string; x: number; y: number; timer: number } | null = null;
  /** 拖选：这一笔是「选上」还是「取消」。 */
  let paint: { pointer: number; to: boolean } | null = null;

  const set = (id: string, on: boolean) => {
    if (selected.value.has(id) === on) return;
    const next = new Set(selected.value);
    if (on) next.add(id); else next.delete(id);
    selected.value = next;
  };
  const toggle = (id: string) => set(id, !selected.value.has(id));
  const exit = () => { selecting.value = false; selected.value = new Set(); };
  const selectAll = (ids: string[]) => { selected.value = new Set([...selected.value, ...ids]); };

  const idAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId ?? null;

  const down = (event: PointerEvent, id: string) => {
    if (event.button !== 0) return;
    swallow = false;
    if (selecting.value) {
      // 挑选中按下：这一笔从这张起，往哪个方向改由它现在的状态决定。
      const to = !selected.value.has(id);
      set(id, to);
      paint = { pointer: event.pointerId, to };
      swallow = true;
      return;
    }
    hold = { id, x: event.clientX, y: event.clientY, timer: window.setTimeout(() => {
      if (!hold) return;
      selecting.value = true;
      set(hold.id, true);
      paint = { pointer: event.pointerId, to: true };
      swallow = true;
      hold = null;
    }, HOLD_MS) };
  };
  const move = (event: PointerEvent) => {
    if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > MOVE_SLOP) { clearTimeout(hold.timer); hold = null; }
    if (!paint || event.pointerId !== paint.pointer) return;
    const id = idAt(event.clientX, event.clientY);
    if (id) set(id, paint.to);
  };
  const up = () => {
    if (hold) { clearTimeout(hold.timer); hold = null; }
    paint = null;
  };
  /** 这一下 click 要不要吞掉（长按 / 挑选中的点按已经在 pointerdown 里处理了）。 */
  const consumeClick = () => { const was = swallow; swallow = false; return was; };

  // 拖选要跨卡片：在 window 上收 move / up（按下的那张卡不一定是松手的那张）。
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const releaseEscape = onMotionEscape(() => {
    if (!selecting.value) return false;
    exit();
    return true;
  });
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    releaseEscape();
    if (hold) clearTimeout(hold.timer);
  });

  return { selecting, selected, count, toggle, exit, selectAll, down, consumeClick };
};
