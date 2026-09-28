/* 账号、应用状态、同步报告、本地 API 状态、存储估算与偏好。从 types/index.ts 按领域拆出，形状不变。 */

export interface AuthInfo {
  appToken: string;
  userId: string;
  regionHost: string;
}

export type SourceScope = 'user_fused' | 'device' | 'unknown' | string;

export interface StreamStatus {
  stream: string;
  status: string;
  records?: number;
  last_sync?: string;
  last_cloud_sync_at?: string;
  newest_sample_at?: string;
  message?: string;
  needs_reauth?: boolean;
}

export interface CapabilityStatus {
  capability: string;
  available: boolean;
  reason?: string;
  /** `reason` 那句话的稳定码。为空表示它是云端透传的原文，翻不了。 */
  reason_code?: string | null;
}

export interface AppStatus {
  configured: boolean;
  auth_state: string;
  connection_state: 'unconfigured' | 'configured' | 'connected' | 'needs_reauth' | string;
  masked_user_id?: string;
  region_host?: string;
  last_sync?: string;
  last_cloud_sync_at?: string;
  last_cloud_sync_outcome?: SyncOutcome;
  streams: StreamStatus[];
  capabilities: CapabilityStatus[];
  database_path?: string;
  retention_days: number;
  history_sync_days?: number;
  /**
   * 一次增量同步往回拉多少天。契约值来自后端
   * （`zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`）。
   *
   * 界面上那句「正在同步最近 N 天」的 N 只能从这里来。写死过一次，后端从
   * 7 改成 30 之后界面整整一个版本还在说 7。
   */
  incremental_sync_days?: number;
  /**
   * 静默的定时同步这一次会往回拉多少天：平时是最近几天，整窗刷新（每天一次）
   * 到期时等于 `incremental_sync_days`。同样只能从后端来。
   */
  auto_sync_days?: number;
  storage?: StorageEstimate;
  /** 本机实际有数据的那段日子。界面上每个「最近 N 天」读的都是本机库。 */
  coverage?: LocalCoverage;
  /**
    * 凭什么认定当前 `region_host` 属于这个账号。
    *
    * `identified` 拿到了这个账号绑定的设备；`hinted` 是 Zepp 在登录响应里指名
    * 的；`unconfirmed` 是从兜底列表里猜的——同步之后一条记录都没有时，这一档
    * 是用户唯一能看到的线索。进程重启后无从得知，为 `unknown`。
    */
  region_confidence?: 'identified' | 'hinted' | 'unconfirmed' | 'unknown' | string;
  /** 后台是否正在压缩历史报文。事件可能在前端监听之前就发出去了，所以状态里也要有。 */
  compacting?: boolean;
}

/**
 * 本机实际有数据的那段日子。
 *
 * 存在的理由：图表和导出的「最近 N 天」读的都是本机库，不是云端。库里只有 30 天
 * 时选 6 个月，只会把坐标轴拉长、前五个月空着——在此之前没有任何一处说明这件事。
 */
export interface LocalCoverage {
  /** 最早一天（`YYYY-MM-DD`）。库是空的时候为 null。 */
  earliest_day: string | null;
  /** 最晚一天（`YYYY-MM-DD`）。 */
  latest_day: string | null;
  /** `earliest_day` 到今天的天数。用来和用户选的范围直接比较。 */
  covered_days: number;
}

/** 单条流的占用估算。样本不足时 measured 为 false，且不给速率。 */
export interface StreamStorageEstimate {
  stream: string;
  observed_days: number;
  observed_bytes: number;
  bytes_per_day: number;
  measured: boolean;
  estimated_add_bytes: number;
}

export interface RawPayloadCompaction {
  compacted: number;
  skipped: number;
  bytesBefore: number;
  bytesAfter: number;
}

export interface StorageEstimate {
  free_bytes: number;
  estimated_add_bytes: number;
  database_bytes: number;
  allow_long_history: boolean;
  warn_tight_space: boolean;
  message: string;
  /** `message` 那句话的稳定码（`ui.estimate.*`）。界面按它选说法，再用
      上面这些数字自己排版——后端不按界面语言出文案。 */
  message_code?: string;
  requested_days: number;
  streams: StreamStorageEstimate[];
  /** 六条流全部有足够本机样本时才为真。为假时总数只是粗略参考。 */
  measured: boolean;
  /** 非 null 表示空间不足，补拉不会开始。 */
  stop_reason: string | null;
  /** `stop_reason` 那句话的稳定码。 */
  stop_reason_code?: string | null;
  /** 这次补拉预计需要的字节数，含安全余量。排 stop_reason 那句话要用。 */
  needed_bytes?: number;
}

export interface UserPrefs {
  retention_days: number;
  /** 历史补拉往回覆盖多少天。和保留期解耦，上限 3650。 */
  history_sync_days: number;
  /** 长期归档：开启后成功同步不再自动清理历史。 */
  archive_enabled: boolean;
}

export interface SyncProgress {
  completed?: boolean;
  stream: string;
  current: number;
  total: number;
  /** 后端的中文原文。界面优先用 `code` 自己写句子，这一份是兜底。 */
  message: string;
  /** `syncing` / `backfilling`。后端不按 locale 出文案，所以它发码。 */
  code?: string;
  /** 补拉时这一块是哪个月（`YYYY-MM`）。 */
  detail?: string | null;
}

export type LoginState = 'idle' | 'waiting' | 'extracting' | 'verifying' | 'connected' | 'failed';

export interface LoginStatus {
  state: LoginState | string;
  message: string;
  page_url: string;
  /** `message` 那句话的稳定码（`err.login.*`）。界面按它取自己语言的文案。 */
  code?: string;
}

export interface SyncStreamResult {
  stream: string;
  status: string;
  records_written: number;
  message?: string;
  needs_reauth?: boolean;
  last_cloud_sync_at?: string;
  newest_sample_at?: string;
}

/**
 * `deferred` is not a failure: the library is replaying its stored raw
 * payloads after a normalizer upgrade and the sync stood aside rather than
 * fight it for the write lock. Nothing was lost and the caller retries.
 */
export type SyncOutcome =
  | 'updated'
  | 'no_new_data'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'deferred';

export interface SyncReport {
  success: boolean;
  outcome: SyncOutcome;
  started_at: string;
  finished_at: string;
  last_cloud_sync_at: string;
  total_records: number;
  streams: SyncStreamResult[];
  message?: string;
  /** `message` 那句话的稳定码（`err.sync.*`）。界面按它取自己语言的文案。 */
  message_code?: string | null;
}

export interface LocalApiStatus {
  /** 用户保存的启用意图；首次安装为 false。 */
  enabled: boolean;
  /** 端口此刻是否真的在监听，来自 controller 实时状态而非启动快照。 */
  running: boolean;
  base_url: string;
  address: string;
  workout_series_path: string;
  /** 是否已生成过访问 token。关闭状态下也可能为真。 */
  token_present: boolean;
  error?: string | null;
  /** `error` 那句话的稳定码。界面按它取自己语言的说法。 */
  error_code?: string | null;
}
