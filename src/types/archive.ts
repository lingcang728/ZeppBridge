/* 长期归档的覆盖账本、补拉失败块、备份与恢复。从 types/index.ts 按领域拆出，形状不变。 */

/** 一条流的历史覆盖。「请求过」「拿到了」「写进去了」是三件事。 */
export interface StreamCoverage {
  stream: string;
  requested_chunks: number;
  persisted_chunks: number;
  /** 请求过、云端明确没有数据的月份数。这不是失败。 */
  empty_chunks: number;
  failed_chunks: number;
  pending_chunks: number;
  persisted_from: string | null;
  persisted_to: string | null;
  empty_months: string[];
  records: number;
}

/** 一个失败块的明细。只显示到月，原因已在后端脱敏。 */
export interface FailedChunk {
  stream: string;
  /** `YYYY-MM-01`。 */
  chunk_start: string;
  error: string | null;
  /** 失败原因的稳定码。界面按它取自己语言的文案，取不到才显示 `error`。 */
  error_code?: string | null;
  attempts: number;
  /** 自动重试已用尽，要用户显式重试才会再动。 */
  exhausted: boolean;
}

export interface CoverageLedger {
  requested_from: string | null;
  requested_to: string | null;
  streams: StreamCoverage[];
  total_chunks: number;
  completed_chunks: number;
  /** 只有每一块都有结论时才为真。「完整副本」这句话只有在这里为真时才成立。 */
  complete: boolean;
  /** 哪个月、为什么失败。界面靠它把「失败 N 块」说清楚。 */
  failed_chunks_detail: FailedChunk[];
  /** 有块的自动重试次数已用尽，需要用户按「重试失败项」。 */
  needs_manual_retry: boolean;
}

export type BackupKind = 'manual' | 'pre_migration' | 'pre_restore';

export interface BackupCoverage {
  earliest_sample_at: string | null;
  latest_sample_at: string | null;
  last_cloud_sync_at: string | null;
}

export interface BackupManifest {
  id: string;
  created_at: string;
  app_version: string;
  schema_version: number;
  normalizer_revision: string;
  kind: BackupKind;
  coverage: BackupCoverage;
  table_counts: Record<string, number>;
  bytes: number;
  sha256: string;
  integrity_ok: boolean;
  pinned: boolean;
}

export interface BackupVerification {
  id: string;
  file_present: boolean;
  bytes_match: boolean;
  sha256_match: boolean;
  integrity_ok: boolean;
  problem: string | null;
  /** `problem` 那句话的稳定码（`ui.backup.*`）。界面按它取自己语言的说法。 */
  problem_code?: string | null;
}

export type RestoreCompatibility =
  | 'same_schema'
  | 'older_schema_will_migrate'
  | 'future_schema_refused';

export interface RestorePreview {
  manifest: BackupManifest;
  verification: BackupVerification;
  compatibility: RestoreCompatibility;
  current_schema_version: number;
  current_table_counts: Record<string, number>;
  can_restore: boolean;
  blocker: string | null;
  /** `blocker` 那句话的稳定码。界面按它取自己语言的说法。 */
  blocker_code?: string | null;
}

export interface PendingRestore {
  backup_id: string;
  staged_at: string;
  rollback_backup_id: string;
}
