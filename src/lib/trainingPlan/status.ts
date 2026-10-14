/**
 * 「上次发到手表」状态胶囊显示哪一种（2026-10-12 第 3 批，合并原来计划牌和账本行各自的一份判断）。
 * 纯函数，不出文案。
 *
 * 诚实：官方没有读取接口，这里只是账本记录。最近一次结果不确定（`uncertain`）时不说「已送达」。
 */
import type { TrainingPlanState } from '../../types/trainingPlan';

export type PlanStatusKind = 'sending' | 'draft' | 'delivered' | 'partial' | 'unconfirmed' | 'rejected';

export const planStatus = (state: TrainingPlanState | null, drafting: boolean, sending = false): PlanStatusKind | null => {
  if (sending) return 'sending';
  if (drafting) return 'draft';
  const record = state?.last_publish;
  if (!record) return null;
  if (record.state === 'rejected') return 'rejected';
  if (record.state === 'partial') return 'partial';
  if (record.state === 'sent' && !state?.uncertain) return 'delivered';
  return 'unconfirmed';
};

/** 胶囊上那颗点的颜色。 */
export const statusTone = (kind: PlanStatusKind): 'ok' | 'warn' | 'bad' | 'draft' | 'sending' => {
  switch (kind) {
    case 'delivered': return 'ok';
    case 'rejected': return 'bad';
    case 'draft': return 'draft';
    case 'sending': return 'sending';
    default: return 'warn';
  }
};
