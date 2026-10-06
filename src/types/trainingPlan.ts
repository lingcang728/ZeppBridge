/* 训练计划（发到 Zepp App 与手表）。形状与 core `training_plan` / `storage::training_plan` 一致。 */

/** 书写格式：人和 AI 写的那一份。时长写 `20min` / `90s` / `5km`，目标写 `hr 135-150`。 */
export interface PlanRestInput { date: string; bedtime?: string; sleepTarget?: string; note?: string }
export interface PlanRestDay { date: string; bedtime_minutes: number | null; sleep_target_seconds: number | null; note: string | null }
export interface PlanDocument {
  format?: string;
  summary?: string;
  rest?: PlanRestInput[];
  from?: string;
  to?: string;
  workouts: PlanWorkoutInput[];
}

export interface PlanWorkoutInput {
  date: string;
  sport: string;
  /** 子类型：跑步 outdoor / treadmill / track，骑行 outdoor / indoor。只进手表描述第一行。 */
  variant?: string;
  name: string;
  /** 训练目的（短词）。zeppbridge-plan/3 起必填。 */
  focus?: string;
  description?: string;
  steps: PlanStepInput[];
}

export type PlanStepInput =
  | { repeat: number; steps: PlanStepInput[] }
  | { kind: string; duration: string; target?: string; note?: string };

export type PlanSport = 'running' | 'cycling' | 'pool_swim' | 'open_water_swim';
export type PlanVariant = 'outdoor' | 'indoor' | 'treadmill' | 'track';
/** 读得懂、但手表收不下的活动（V2 只认四个大类，其余单条静默丢弃）。 */
export type PlanActivity = 'walking' | 'hiking' | 'strength' | 'yoga' | 'rowing' | 'elliptical';
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
  variant?: PlanVariant;
  name: string;
  focus?: string;
  description?: string;
  steps: PlanStepNode[];
}

/** 发不到手表的一条训练，原样留给界面显示（绝不画成休息日）。 */
export interface PlanHeldWorkout {
  /** 草稿原文里第几条。 */
  index: number;
  date: string;
  activity: PlanActivity;
  name: string;
  focus?: string;
  description?: string;
  steps: PlanStepNode[];
}

export interface PlanIssue {
  /** `error` / `unverified` 挡住发送；`warning` 只提醒（名字太长会被手表截断）。 */
  severity: 'error' | 'unverified' | 'warning';
  workout?: number;
  step?: string;
  /** 中文兜底；界面按 message_code 取文案。 */
  message: string;
  message_code: string;
  params: Record<string, unknown>;
}

export interface PlanCheck {
  summary?: string | null;
  rest?: PlanRestDay[];
  from: string | null;
  to: string | null;
  workouts: PlanWorkout[];
  held?: PlanHeldWorkout[];
  issues: PlanIssue[];
}

export type PlanDayChange = 'rest' | 'unchanged' | 'added' | 'replaced' | 'removed';

export interface PlanDayPreview {
  rest?: PlanRestDay | null;
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
  /** 同一批推送（计划覆盖到的每个 7 天窗口各一行）共用的编号。 */
  batch_id: number;
  kind: 'publish' | 'roll' | 'undo' | 'clear' | 'revoked';
  role: 'window' | 'clear' | 'placeholder';
  window_start: string;
  workout_count: number;
  /** 整批汇总时还有 `partial`：有的周送到了、有的没有。 */
  state: 'pending' | 'sent' | 'rejected' | 'unknown' | 'partial';
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
  /** 最近一批推送的逐窗口结果。 */
  last_batch: PlanPublishRecord[];
  /** 从今天起每个有训练（或发过训练）的 7 天窗口。 */
  weeks: PlanWeekStatus[];
  can_undo: boolean;
  drafts: PlanDraft[];
  ai_may_publish: boolean;
}

export interface PlanWeekStatus {
  start: string;
  planned: number;
  sent: number;
  /** in_sync：账本上发过去的和计划一致；uncertain：一致但结果没确认；not_sent：没送达或还没发。 */
  state: 'in_sync' | 'uncertain' | 'not_sent';
  error_code: string | null;
}

export type PlanPublishAction = { kind: 'draft'; id: string } | { kind: 'undo' } | { kind: 'clear' };

export type PlanPrepared =
  | { outcome: 'send'; batch_id: number; sends: { publish_id: number; window_start: string; role: PlanPublishRecord['role'] }[] }
  | { outcome: 'not_needed' }
  | { outcome: 'needs_clear_confirmation' }
  | { outcome: 'invalid'; check: PlanCheck }
  | { outcome: 'nothing_to_undo' };

export interface PlanPublishResult {
  outcome: PlanPrepared;
  /** 这一批的汇总。 */
  record: PlanPublishRecord | null;
  /** 这一批的逐窗口结果。 */
  records: PlanPublishRecord[];
}
