/**
 * 收集箱并进舞台左边的牌（2026-10-08 横向舞台，用户拍板「一类一张，收集箱并进去」）。
 *
 * 在「交给 AI」舞台上，箱子里的「哪一项 × 哪一天」不再等着按箭头开新任务：只要没有牌桌开着、箱子没铺开、
 * 也不在寄出途中，箱子就倒一次——每一类蹦出几张小牌飞进那一类的牌（那一类还没在左边就飞进撒牌区），
 * 落定后那一类改成「挑了 N 天」（`mergePicks`，和已经挑过的合在一起，别的类别不动），箱子清空。
 * 什么时候倒：进舞台时（等页面长出来）、箱子里多了牌、牌桌收起、在舞台上按了箱子的箭头。
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { AI_TASK_CATEGORY_META } from '../../lib/aiTask/categories';
import { dayKey } from '../../lib/aiTask/bridgeScale';
import { pourFromBox } from '../../lib/motion/cards';
import type { AiTaskCategory } from '../../lib/bridge/types';
import { useAiTaskDraft } from '../useAiTaskDraft';
import { useCardCollection } from '../useCardCollection';

const ARRIVE_MS = 700;
const SETTLE_MS = 300;

export const useBoxPour = (options: {
  /** 这一类在左边的牌面；还没有就 null。 */
  cardOf: (category: AiTaskCategory) => HTMLElement | null;
  /** 那一类不在左边时，小牌飞去哪（撒牌区）。 */
  fallback: () => HTMLElement | null;
  /** 寄出途中：不倒。 */
  busy: () => boolean;
}) => {
  const box = useCardCollection();
  const ctl = useAiTaskDraft();
  let running = false;
  let timer = 0;

  const pour = async () => {
    if (running || !box.count.value || box.tableOpen.value || options.busy()) return;
    const source = document.getElementById('card-collection-box');
    if (source?.classList.contains('open')) return;
    running = true;
    try {
      const byCategory = box.byCategory();
      const workoutIds = box.workoutIds();
      const counts = new Map<AiTaskCategory, number>([...byCategory].map(([category, days]) => [category, days.length]));
      if (workoutIds.length) counts.set('workout', (counts.get('workout') ?? 0) + workoutIds.length);
      const targets = [...counts].flatMap(([category, count]) => {
        const el = options.cardOf(category) ?? options.fallback();
        return el ? [{ el, tint: AI_TASK_CATEGORY_META[category].tint, count }] : [];
      });
      await pourFromBox(source, targets);
      ctl.mergePicks(byCategory, dayKey(), workoutIds);
      box.handedToTask.value = false;
      box.clear();
    } finally {
      running = false;
    }
  };
  const later = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void pour(); }, ms);
  };

  watch([box.count, box.tableOpen, box.pourRequest], () => later(SETTLE_MS));
  onMounted(() => later(ARRIVE_MS));
  onBeforeUnmount(() => window.clearTimeout(timer));
  return { pour };
};
