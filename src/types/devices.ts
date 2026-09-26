/* 设备档案与能力看板。从 types/index.ts 按领域拆出，形状不变。 */

export interface DeviceProfile {
  name?: string;
  canonical_name?: string;
  display_name?: string;
  catalog_id?: string;
  kind?: 'watch' | 'strap' | 'ring' | 'band' | 'scale' | 'unknown' | string;
  image_key?: string | null;
  /** `user_assigned` = 用户自己指认的型号，不是识别结果。 */
  match_status?: 'exact' | 'alias' | 'user_assigned' | 'unknown';
  has_local_data?: boolean;
  last_data_at?: string | null;
  firmware?: string;
  serial?: string;
  device_id?: string;
  timezone?: string;
}

export interface DeviceCacheMetadata {
  status: 'fresh' | 'stale' | 'missing' | 'refresh_failed' | 'unavailable' | string;
  cached_at?: string | null;
  age_seconds?: number | null;
  refreshed: boolean;
  refresh_error?: string | null;
  /** `refresh_error` 那句话的稳定码。界面按它取自己语言的说法。 */
  refresh_error_code?: string | null;
}

export interface DeviceProfilesResult {
  profiles: DeviceProfile[];
  cache: DeviceCacheMetadata;
}

/**
 * One row of the capability overview.
 *
 * `status` is not a boolean on purpose: the Zepp events endpoint answers
 * "200 with no items" for names that cannot exist, so missing data never
 * proves a device lacks a sensor. Only `unsupported` — an outright rejection —
 * licenses saying so.
 */
export interface CapabilityItem {
  stream: string;
  status: 'available' | 'no_records' | 'unsupported' | 'unknown' | string;
  records: number;
  recordsUnit: string;
  /** 单位的稳定码：`days` / `records`。界面按它出文案。 */
  recordsUnitCode?: string;
  /** 这条流的判定窗口有多少天。界面写「最近 N 天没有记录」要用它。 */
  windowDays?: number;
  latestDate?: string | null;
  note?: string | null;
  source: 'derived' | 'probed' | string;
  /** ZeppBridge 是否真的把这条流读进了本机库。云端有 ≠ 本机有。 */
  ingested?: boolean;
}

export interface CapabilityOverview {
  items: CapabilityItem[];
  probedAt?: string | null;
}

/**
 * The result of asking the server whether one candidate stream exists.
 *
 * Which Zepp event streams answer depends on the account, the devices and the
 * region, and the endpoint has no discovery call — so availability is probed,
 * not assumed. A probe reports status and field names only; no measured value
 * is read and nothing is stored.
 */
export interface CapabilityProbe {
  stream: string;
  /** Which surface answered — the same event name behaves differently on each. */
  surface: 'v2_events' | 'user_events' | 'user_events_day' | string;
  /** How often the stream is measured; decides how far back the probe looks. */
  cadence: 'continuous' | 'episodic' | string;
  windowDays: number;
  eventType: string;
  subType: string;
  status: 'available' | 'empty' | 'unavailable' | 'error';
  records: number;
  /** Newest item's calendar date — the answer for episodic metrics. */
  latestDate?: string | null;
  fields: string[];
}
