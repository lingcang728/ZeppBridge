/**
 * 发牌规则的阈值。只在这里定义：规则、测试、界面说明都从这里读。
 * （首页建议卡的触发阈值在后端 `insight::suggest::thresholds`，这里不再写一份。）
 */

/** 一手牌最多几张、候补最多几张。 */
export const HAND_MAX = 8;
export const BENCH_MAX = 8;
/** 发牌往回看多少天（一次取事实）。 */
export const FACT_DAYS = 365;

/* —— 同一路线 —— */
/** 起点、终点各自离得不超过这么远（米）。 */
export const ROUTE_END_METERS = 250;
/** 距离差在这个比例以内。 */
export const ROUTE_DISTANCE_RATIO = 0.12;
/** 轨迹缩略的平均最近点距离不超过这么远（米），才算同一条路线（拿到小图以后再细筛）。 */
export const ROUTE_TRACK_METERS = 160;
/** 至少这么多次（含锚点）才发「同一路线」。 */
export const ROUTE_MIN_RUNS = 3;
/** 找锚点时最多看最近多少次带轨迹的运动。 */
export const ROUTE_ANCHOR_SCAN = 60;

/* —— 同距离段 / PR —— */
/** 距离段（公里）与容差：5 km、10 km、半马、全马附近。 */
export const DISTANCE_BUCKETS = [
  { key: '5k', km: 5, min: 4.8, max: 5.5 },
  { key: '10k', km: 10, min: 9.6, max: 10.9 },
  { key: 'half', km: 21.0975, min: 20.6, max: 22.2 },
  { key: 'full', km: 42.195, min: 41.6, max: 43.6 },
] as const;
export type DistanceBucket = (typeof DISTANCE_BUCKETS)[number]['key'];
/** 标准距离段凑不够时，退到「自己常跑的整公里数」（±0.5 km）：至少这么长才算一段。 */
export const OWN_BUCKET_MIN_KM = 3;
/** 一个距离段至少几次才发牌。 */
export const DISTANCE_MIN_RUNS = 2;
/** PR 链最多留几张、再加最近几次。 */
export const PR_KEEP = 4;
export const DISTANCE_RECENT = 3;
/** 配速超出这个范围（秒 / 公里）的多半是距离或时长坏了，不参与比。和后端周报同一个范围。 */
export const PACE_RANGE: readonly [number, number] = [120, 1800];
/** 各大类配速（秒 / 公里）的合理范围：跑步同上；骑行 6–60 km/h；游泳每百米 1–5 分钟；徒步、健走 2.5–15 km/h。 */
export const PACE_RANGES: Readonly<Record<'run' | 'ride' | 'swim' | 'hike', readonly [number, number]>> = {
  run: PACE_RANGE, ride: [60, 600], swim: [600, 3000], hike: [240, 1440],
};
/** 骑行没有标准距离段：按 5 公里一档分（至少 10 公里）。 */
export const RIDE_BUCKET_KM = 5;
export const RIDE_BUCKET_MIN_KM = 10;
/** 游泳按 100 米一档分（至少 300 米）。 */
export const SWIM_BUCKET_M = 100;
export const SWIM_BUCKET_MIN_M = 300;

/* —— 比赛复盘 —— */
/** 没有标比赛时：配速比此前 90 天同类中位数快这么多（速度比），且距离够长，算「像比赛的一次」。 */
export const RACE_SPEED_RATIO = 1.08;
export const RACE_MIN_KM = 3;
/** 骑行、游泳各自要多长才可能是比赛（短途通勤骑得快不算比赛）。 */
export const RACE_MIN_KM_BY_SPORT = { run: RACE_MIN_KM, ride: 15, swim: 0.4 } as const;
export const RACE_BASELINE_DAYS = 90;
export const RACE_BASELINE_MIN = 5;
/** 赛前带几天的训练与睡眠（四周）。 */
export const RACE_LEAD_DAYS = 28;

/* —— 恢复异常夜 —— */
/** 只在最近这么多天里找。 */
export const OUTLIER_LOOKBACK_DAYS = 60;
/** 每晚和它之前 28 晚比，至少 7 晚有数才比。 */
export const OUTLIER_BASELINE_DAYS = 28;
export const OUTLIER_BASELINE_MIN = 7;
/** HRV 低于基线这个比例、静息心率高出这么多 bpm、睡眠时长低于这个比例。 */
export const HRV_LOW_RATIO = 0.85;
export const RHR_HIGH_BPM = 5;
export const SLEEP_SHORT_RATIO = 0.8;
/** 最多发几晚（每晚再带上前一天的运动）。 */
export const OUTLIER_KEEP = 4;

/* —— 首页建议卡点进来的几手牌 —— */
/** 「排个恢复日」「帮我排明天」带近几天。 */
export const RECENT_DAYS = 7;
/** 「排个轻松的回归」：带上空档前最后几次，和最近两周的恢复。 */
export const COMEBACK_LAST = 4;
export const COMEBACK_SPAN_DAYS = 14;
/** 一次运动至少这么长才上牌（几分钟的自动识别活动不值得占一张牌）。 */
export const MIN_WORKOUT_SECONDS = 10 * 60;

/* —— 运动大类与用户画像（sport.ts） —— */
/** 看最近多少天常练什么。 */
export const SPORT_PROFILE_DAYS = 90;
/** 一类至少这么多次才算常练。 */
export const SPORT_MIN_SESSIONS = 3;

/* —— 同类训练（力量、拉伸、球类……不按距离比的，按一次次比） —— */
/** 在最近多少天里找、至少几次才发牌、主牌放最近几次。 */
export const SESSION_DAYS = 56;
export const SESSION_MIN = 3;
export const SESSION_KEEP = 6;

/* —— 首页「今日一问」的推荐顺序（rank.ts） —— */
/** 这么多天内（含今天）比过赛：推荐复盘比赛。 */
export const RACE_RECENT_DAYS = 3;
/** 这么多天内（含今天）刷了 PR：推荐「我进步了吗」。 */
export const PR_RECENT_DAYS = 7;

/** 一次最多取几次运动的小图（和后端 `MAX_LINE_WORKOUTS` 一致）。 */
export const MAX_LINE_WORKOUTS = 40;
