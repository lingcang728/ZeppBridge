/* 导出、交给 AI 与本地重解析。从 types/index.ts 按领域拆出，形状不变。 */

export type ExportDataType =
  | 'life_events'
  | 'heart_rate'
  | 'sleep'
  | 'workouts'
  | 'steps'
  | 'spo2'
  | 'stress'
  | 'hrv'
  | 'hrv_rmssd'
  | 'respiratory_rate'
  | 'pai'
  | 'lactate_threshold'
  | 'training_load'
  | 'vo2max'
  | 'daily_activity'
  | 'recovery';

/** Which section of the export picker a data type belongs to. */
/* 分组是码，不是中文。写成中文的话界面上到处会出现 `group === '活动'`
   这种判断，一翻译就默默失效。显示交给 useExport 的分组名表。 */
export type ExportTypeGroup = 'activity' | 'sleep' | 'body' | 'training' | 'context';

/**
 * How much of each stream an export carries.
 *
 * `summary` aggregates the two streams that dominate an export's size
 * (per-minute heart rate, per-second workout series) and keeps every
 * structured metric intact, so a month of data stays small enough to hand to a
 * model. `full` keeps the raw series and is what the CSV/GPX converters use.
 */
export type ExportDetail = 'summary' | 'full';

/**
 * 一次导出覆盖什么。两个变体互斥，不是「都传了谁优先」。
 */
export type ExportScope =
  | { kind: 'dateRange'; start: string; end: string }
  | { kind: 'workout'; workoutId: string };

export interface ExportSelection {
  /** 新调用方传这个。 */
  scope?: ExportScope;
  /** 旧调用方的日期范围。和 `scope` 同时提供会被后端拒绝。 */
  startDate?: string;
  endDate?: string;
  dataTypes: ExportDataType[];
  detail?: ExportDetail;
}

export interface ExportEstimate {
  recordCount: number;
  estimatedBytes: number;
  scopeKind: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ExportResult {
  path: string;
  record_count: number;
  bytes: number;
  generated_at: string;
  /** 只有 FIT 会给：一次导出写了几个文件，`path` 则是装它们的目录。 */
  file_count?: number;
}

export type AiHandoffMode = 'inline' | 'attachment';

export interface AiHandoffMetadata {
  preciseRouteIncluded: boolean;
  authenticationFieldsRemoved: boolean;
  identityFieldsRemoved: boolean;
}

export interface AiHandoffResult {
  mode: AiHandoffMode;
  clipboardText: string;
  filePath?: string;
  bytes: number;
  records: number;
  redactions: string[];
  metadata: AiHandoffMetadata;
}

export interface ReprocessResult {
  total_records: number;
  streams: Record<string, number>;
  message: string;
}
