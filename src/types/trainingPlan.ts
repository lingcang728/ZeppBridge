/* 训练计划（发到 Zepp App 与手表）。形状与 core `training_plan` / `storage::training_plan` 一致。 */

/** 书写格式：人和 AI 写的那一份。时长写 `20min` / `90s` / `5km`，目标写 `hr 135-150`。 */
export interface PlanDocument {
  from?: string;
  to?: string;
  workouts: PlanWorkoutInput[];
}

export interface PlanWorkoutInput {
  date: string;
  sport: string;
  name: string;
  description?: string;
  steps: PlanStepInput[];
}

export type PlanStepInput =
  | { repeat: number; steps: PlanStepInput[] }
  | { kind: string; duration: string; target?: string; note?: string };

export type PlanSport = 'running' | 'cycling' | 'pool_swim' | 'open_water_swim';
export type PlanIntensity = 'warmup' | 'active' | 'interval' | 'recovery' | 'rest' | 'cooldown';

export type PlanStepLength = { type: 'time'; seconds: number } | { type: 'distance'; meters: number };

export type PlanTarget =
  | { type: 'open' }
  | { type: 'heart_rate'; low: number; high: number }
  | { type: 'pace'; fast: number; slow: number }
  | { type: 'power'; low: number; high: number };

export interface PlanStep {
  intensity: PlanIntensity;
  length: PlanStepLength;
  target: PlanTarget;
  note?: string;
}

export type PlanStepNode =
  | ({ type: 'step' } & PlanStep)
  | { type: 'repeat'; times: number; steps: PlanStep[] };

/** 校验过的一条训练。 */
export interface PlanWorkout {
  date: string;
  sport: PlanSport;
  name: string;
  description?: string;
  steps: PlanStepNode[];
}

export interface PlanIssue {
  severity: 'error' | 'unverified';
  workout?: number;
  step?: string;
  /** 中文兜底；界面按 message_code 取文案。 */
  message: string;
  message_code: string;
  params: Record<string, unknown>;
}

export interface PlanCheck {
  from: string | null;
  to: string | null;
  workouts: PlanWorkout[];
  issues: PlanIssue[];
}

export type PlanDayChange = 'rest' | 'unchanged' | 'added' | 'replaced' | 'removed';

export interface PlanDayPreview {
  date: string;
  change: PlanDayChange;
  before: PlanWorkout[];
  after: PlanWorkout[];
}

export interface PlanWindow {
  start: string;
}

export interface PlanDraftPreview {
  check: PlanCheck;
  window: PlanWindow;
  days: PlanDayPreview[];
}

export interface PlanDraft {
  id: string;
  origin: 'user' | 'ai_paste' | 'mcp';
  status: string;
  document: PlanDocument;
  created_at: string;
  updated_at: string;
}

export interface PlanPublishRecord {
  id: number;
  kind: 'publish' | 'roll' | 'undo' | 'clear' | 'revoked';
  window_start: string;
  workout_count: number;
  state: 'pending' | 'sent' | 'rejected' | 'unknown';
  http_status: number | null;
  error_code: string | null;
  undone: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface TrainingPlanState {
  window: PlanWindow;
  /** 按账本，上次发到手表的（官方没有读取接口，不能说成「手表上现在有的」）。 */
  sent: PlanWorkout[];
  planned: PlanWorkout[];
  uncertain: boolean;
  last_publish: PlanPublishRecord | null;
  can_undo: boolean;
  drafts: PlanDraft[];
  ai_may_publish: boolean;
}

export type PlanPublishAction = { kind: 'draft'; id: string } | { kind: 'undo' } | { kind: 'clear' };

export type PlanPrepared =
  | { outcome: 'send'; publish_id: number; body: unknown }
  | { outcome: 'not_needed' }
  | { outcome: 'needs_clear_confirmation' }
  | { outcome: 'invalid'; check: PlanCheck }
  | { outcome: 'nothing_to_undo' };

export interface PlanPublishResult {
  outcome: PlanPrepared;
  record: PlanPublishRecord | null;
}
