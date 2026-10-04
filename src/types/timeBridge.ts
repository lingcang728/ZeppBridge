import type { AiTaskCategory, AiTaskCategoryRange } from '../lib/bridge/types';
import type { PlanDocument, PlanSport, PlanCheck } from './trainingPlan';

export interface DayStripCell { date: string; has: boolean; value: number | null; unit: string | null; workout_ids: string[] }
export interface DayStripRow { category: AiTaskCategory; metric: string | null; cells: DayStripCell[] }
export interface AdherenceDay {
  date: string;
  planned: { name: string; sport: PlanSport; seconds: number | null; hr_low: number | null; hr_high: number | null } | null;
  actual: { workout_id: string; seconds: number | null; avg_hr: number | null; sport: string; compatible: boolean }[];
  verdict: 'done' | 'missed' | 'extra' | 'none';
}
export interface AiExchange {
  id: string; task_id: string; provider: string; question: string; days_before: number;
  categories: AiTaskCategoryRange[]; workout_ids: string[]; personal_note: string;
  sent_at: string; md_path: string; plan_draft_id: string | null; received_at: string | null;
  publish_id: number | null; publish_state: string | null; undone: boolean; document: PlanDocument | null;
  plan?: PlanCheck | null;
}
