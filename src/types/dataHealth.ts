/* 数据健康页：逐流三阶段、数据库体检、建议动作。从 types/index.ts 按领域拆出，形状不变。 */

/** 三阶段中某一阶段的状态。`never` 是「从来没走到这一步」，不是失败。 */
export interface StageState {
  state: 'ok' | 'failed' | 'never' | string;
  at?: string | null;
  last_ok_at?: string | null;
  /** 稳定的失败类别；界面按它分支，不要按文案分支。 */
  error_kind?: string | null;
  message?: string | null;
}

export interface SourceBreakdown {
  source: 'device' | 'user_fused' | 'unknown' | string;
  records: number;
}

/** 覆盖解释。`gaps` 能说缺了哪几天，`observations` 只能说哪几天观察到了。 */
export interface CoverageExplanation {
  kind: 'gaps' | 'observations' | string;
  window_days: number;
  observed_days: number;
  gap_dates: string[];
  gap_total: number;
  first_observed_at?: string | null;
  latest_observed_at?: string | null;
  note: string;
}

export interface StreamHealth {
  stream: string;
  label: string;
  cadence: 'continuous' | 'daily' | 'nightly' | 'per_event' | 'occasional' | string;
  fetch: StageState;
  parse: StageState;
  write: StageState;
  raw_records: number;
  canonical_records: number;
  last_written_records: number;
  sources: SourceBreakdown[];
  coverage: CoverageExplanation;
}

export interface IntegrityCheckResult {
  checked_at: string;
  ok: boolean;
  detail?: string | null;
}

export interface DatabaseHealth {
  schema_version: number;
  /** 这个程序按哪一版规则解析。 */
  normalizer_revision: string;
  /** 库里的派生数据是哪一版规则产出的。null = 从没重放过。 */
  stored_normalizer_revision?: string | null;
  /** 库里存着报文，而它们是另一版解析器归一化的——欠一次重放。 */
  normalizer_replay_pending?: boolean;
  replay_in_progress: boolean;
  database_bytes: number;
  raw_records: number;
  canonical_records: number;
  pending_normalization: number;
  last_integrity_check?: IntegrityCheckResult | null;
}

/** 四个互不冒充的时间。 */
export interface HealthTimings {
  last_cloud_sync_at?: string | null;
  last_cloud_sync_outcome?: string | null;
  last_local_replay_at?: string | null;
  last_manual_reprocess_at?: string | null;
  newest_sample_at?: string | null;
}

export interface HealthAction {
  /** 执行用。两个不同的动作可能共用一个 id（都跑同步）。 */
  id: string;
  /** 显示用的稳定码；能区分「再同步一次」和「做第一次同步」。 */
  code?: string;
  /** 后端的中文原文，给 CLI 用；界面按 `code` 出文案，认不出来时才回退到它。 */
  label: string;
  reason: string;
  destructive: boolean;
}

export interface DataHealth {
  generated_at: string;
  database: DatabaseHealth;
  timings: HealthTimings;
  streams: StreamHealth[];
  occasional_metrics: StreamHealth[];
  actions: HealthAction[];
}
