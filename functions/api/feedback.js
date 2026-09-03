const MAX_BODY_BYTES = 32 * 1024;
const MAX_STRING = 128;

/**
 * 限流窗口，以及一个来源在一个窗口里最多能提交多少份**新内容**的报告。
 *
 * 重复内容不计数（那一条先被去重挡掉，直接返回原来的 id），所以这个额度
 * 约束的是「不断变造新报告」这一种行为。一个真实用户一小时里提交 12 份
 * 内容各不相同的报告已经远超正常使用；一个想灌库的脚本一分钟就能做到。
 *
 * 挡的不是 D1 的空间，是**证据被污染**：设备编号和运动编号的收录规则是
 * 「每个编号至少两份互相独立的报告」，重复提交会让任何一个编号看起来都有
 * 很多份报告。
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REPORTS = 12;

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  },
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => isObject(value)
  && Object.keys(value).every((key) => keys.includes(key));
const boundedString = (value, max = MAX_STRING) => typeof value === 'string'
  && value.length > 0
  && value.length <= max;
const boundedInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const validField = (field) => hasOnlyKeys(field, ['name', 'jsonType'])
  && boundedString(field.name, 64)
  && boundedString(field.jsonType, 16);

const validShape = (shape) => hasOnlyKeys(shape, ['path', 'fields'])
  && boundedString(shape.path, 256)
  && Array.isArray(shape.fields)
  && shape.fields.length <= 64
  && shape.fields.every(validField);

const validCandidate = (candidate) => hasOnlyKeys(
  candidate,
  ['catalogId', 'canonicalName', 'firmware', 'matchStatus'],
)
  && boundedString(candidate.catalogId, 80)
  && boundedString(candidate.canonicalName, 100)
  && (candidate.firmware === null || candidate.firmware === undefined || boundedString(candidate.firmware, 40))
  && ['exact', 'alias', 'unknown'].includes(candidate.matchStatus);

const validDeviceEvidence = (device) => hasOnlyKeys(device, [
  'status',
  'objectCount',
  'unknownDeviceCount',
  'idAliasObjects',
  'serialAliasObjects',
  'nameFieldObjects',
  'firmwareFieldObjects',
  'candidates',
  'unmatchedProductHints',
  'modelIdentifierHints',
  'shapes',
])
  && boundedString(device.status, 40)
  && ['objectCount', 'unknownDeviceCount', 'idAliasObjects', 'serialAliasObjects', 'nameFieldObjects', 'firmwareFieldObjects']
    .every((key) => boundedInteger(device[key], 0, 10000))
  && Array.isArray(device.candidates)
  && device.candidates.length <= 24
  && device.candidates.every(validCandidate)
  && Array.isArray(device.unmatchedProductHints)
  && device.unmatchedProductHints.length <= 12
  && device.unmatchedProductHints.every((hint) => boundedString(hint, 64))
  // 型号类数字标识（deviceSource / deviceType）。有些账号的设备响应里没有任何
  // 产品名字段，这两个数字是仅有的型号线索。形状被钉死成 `名字:整数`，所以
  // 序列号、MAC 或任何字符串都进不来。字段可缺省：旧客户端不会发它。
  && (device.modelIdentifierHints === undefined
    || (Array.isArray(device.modelIdentifierHints)
      && device.modelIdentifierHints.length <= 8
      && device.modelIdentifierHints.every((hint) => boundedString(hint, 32)
        && /^(deviceSource|deviceType):\d{1,8}$/.test(hint))))
  && Array.isArray(device.shapes)
  && device.shapes.length <= 40
  && device.shapes.every(validShape);

// 「用户指认的型号 ↔ 这台设备的型号类编号」。这一对是内置目录唯一可能的成长
// 来源：华米没有公开编号对照表，而有些账号的设备响应里除了这些数字什么都没有。
// 两半都被钉死成型号级取值 —— catalogId 必须长得像目录 id，hints 只能是
// `名字:整数`，所以序列号、MAC、账号都进不来。
const validAssignedModel = (entry) => hasOnlyKeys(entry, ['catalogId', 'modelIdentifierHints'])
  && boundedString(entry.catalogId, 80)
  && /^[a-z0-9][a-z0-9-]*$/.test(entry.catalogId)
  && Array.isArray(entry.modelIdentifierHints)
  && entry.modelIdentifierHints.length >= 1
  && entry.modelIdentifierHints.length <= 8
  && entry.modelIdentifierHints.every((hint) => boundedString(hint, 32)
    && /^(deviceSource|deviceType):\d{1,8}$/.test(hint));

/** 和客户端 `DIAGNOSTIC_NOTE_MAX_CHARS` 保持一致。 */
const USER_NOTE_MAX = 500;

/** 用户自己选的问题类型。和客户端 `normalize_report_category` 保持一致。 */
const REPORT_CATEGORIES = ['device', 'workout', 'data', 'other'];

const validWorkoutCode = (entry) => hasOnlyKeys(entry, ['code', 'records'])
  && boundedInteger(entry.code, -1, 65535)
  && boundedInteger(entry.records, 1, 1_000_000_000);

/**
 * 云端在 HTTP 200 里写的那个「不成功」。
 *
 * 三个字段全是形状受限的，没有一个是自由文本；云端的原话（`message`）
 * 客户端根本不发。`stream` 取值只能是那七条固定的流名。
 */
const CLOUD_REJECTION_STREAMS = [
  'workouts', 'workout_detail', 'daily_summary', 'wellness', 'sleep', 'hrv', 'heart_rate',
];
const validCloudRejection = (entry) => hasOnlyKeys(entry, ['stream', 'code', 'at'])
  && CLOUD_REJECTION_STREAMS.includes(entry.stream)
  && boundedInteger(entry.code, -1_000_000_000, 1_000_000_000)
  && (entry.at === undefined || (boundedString(entry.at, 40) && !Number.isNaN(Date.parse(entry.at))));

/**
 * 运动 key 的形状。和随包运动目录的 key 一致：小写字母、数字、下划线。
 *
 * 钉死形状是因为这两个字段最终会被人当成「用户说这个编号是什么」来读。
 * 放开成自由文本的话，它会变成又一个可以塞任意内容的通道。
 */
const WORKOUT_KEY = /^[a-z][a-z0-9_]{0,47}$/;

/**
 * 「Zepp 编号 → 我们的解释 → 用户的解释」。
 *
 * issue #24 那类问题唯一可能的证据：编号我们认识，只是认错了，所以
 * `unknownWorkoutCodes` 和 `workoutTypeConflicts` 都是空的。三个字段全是
 * 类型级事实，没有 workout_id、时间、距离或 GPS 的位置。
 */
const validWorkoutCorrection = (entry) => hasOnlyKeys(
  entry,
  ['code', 'interpreted', 'corrected', 'records'],
)
  && boundedInteger(entry.code, -1, 65535)
  && boundedString(entry.interpreted, 48)
  && WORKOUT_KEY.test(entry.interpreted)
  && boundedString(entry.corrected, 48)
  && WORKOUT_KEY.test(entry.corrected)
  && boundedInteger(entry.records, 1, 1_000_000_000);

export const validateFeedbackReport = (report) => {
  if (!hasOnlyKeys(report, [
    'format',
    'appVersion',
    'schemaVersion',
    'normalizerRevision',
    'operatingSystem',
    'deviceEvidence',
    'userAssignedModels',
    'unknownWorkoutCodes',
    'workoutTypeCorrections',
    'workoutTypeConflicts',
    'userNote',
    'category',
    'lastCloudRejection',
  ])) return false;
  if (report.format !== 'zeppbridge.feedback.v1') return false;
  if (!boundedString(report.appVersion, 32) || !/^[0-9A-Za-z.+-]+$/.test(report.appVersion)) return false;
  if (!boundedInteger(report.schemaVersion, 0, 10000)) return false;
  if (!boundedString(report.normalizerRevision, 100)) return false;
  if (!['windows', 'macos', 'linux'].includes(report.operatingSystem)) return false;
  if (!validDeviceEvidence(report.deviceEvidence)) return false;
  // 字段可缺省：只有用户在设备选择器里勾选了「帮忙补充目录」才会带上它。
  if (report.userAssignedModels !== undefined
    && (!Array.isArray(report.userAssignedModels)
      || report.userAssignedModels.length > 8
      || !report.userAssignedModels.every(validAssignedModel))) return false;
  if (!Array.isArray(report.unknownWorkoutCodes)
    || report.unknownWorkoutCodes.length > 100
    || !report.unknownWorkoutCodes.every(validWorkoutCode)) return false;
  // 字段可缺省：用户没纠正过任何记录，以及旧客户端，都不会带它。
  if (report.workoutTypeCorrections !== undefined
    && (!Array.isArray(report.workoutTypeCorrections)
      || report.workoutTypeCorrections.length > 64
      || !report.workoutTypeCorrections.every(validWorkoutCorrection))) return false;
  if (!boundedInteger(report.workoutTypeConflicts, 0, 1_000_000_000)) return false;
  // 用户自己写的一句说明。客户端发之前已经脱敏并截到 500 字，这里按同样的上限
  // 再校验一次——服务端不能因为「客户端应该已经处理过」就放行。字段可缺省：
  // 没填的报告和旧客户端都不会带它。
  if (report.userNote !== undefined && !boundedString(report.userNote, USER_NOTE_MAX)) return false;
  // 分类是固定取值，不是又一个自由文本框。
  if (report.category !== undefined && !REPORT_CATEGORIES.includes(report.category)) return false;
  // 字段可缺省：没遇到过业务拒绝的人和旧客户端都不会带它。
  if (report.lastCloudRejection !== undefined
    && !validCloudRejection(report.lastCloudRejection)) return false;
  // 自动检测到问题，或者用户自己说明了要报什么——两条路都算数。只认前者的话，
  // 本机没检测到异常的人就永远提交不了，哪怕他真的遇到了问题。
  return report.deviceEvidence.unknownDeviceCount > 0
    || (report.userAssignedModels?.length ?? 0) > 0
    || report.unknownWorkoutCodes.length > 0
    // 一次运动类型纠正本身就是一条可处理的线索。
    || (report.workoutTypeCorrections?.length ?? 0) > 0
    || report.workoutTypeConflicts > 0
    // 一次业务拒绝本身就是一条可处理的线索——而且恰恰是那些「什么都
    // 看不到」的人手里唯一的证据：他们的库里本来就没有未识别设备、
    // 也没有未知运动编号，旧判据下他们根本提交不了。
    || report.lastCloudRejection !== undefined
    || report.category !== undefined;
};

/** 十六进制的 SHA-256。 */
const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * 报告内容的规范化摘要。
 *
 * 规范化是必须的：`JSON.stringify` 的输出跟着键的插入顺序走，同一份内容换个
 * 字段顺序就是另一个哈希，去重会整个失效。这里递归地按键排序再序列化。
 *
 * 刻意**不包含** `userNote`：同一台设备、同样的编号、只改了一句备注再发一次，
 * 对补目录来说仍然是同一份证据。
 */
export const contentHashInput = (report) => {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, key) => {
        if (key === 'userNote') return acc;
        // 业务拒绝只拿 `stream` + `code` 参与去重，`at` 不算。
        //
        // 带上时间戳的话，同一个人反复遇到同一个 code 会每次都建一行；
        // 而把整段排除的话，他第一次带着 code 提交会和之前一份不带 code 的
        // 旧报告撞哈希，那个 code 就被当成重复提交丢了——而那正是我们唯一
        // 想要的东西。
        if (key === 'lastCloudRejection' && isObject(value[key])) {
          acc[key] = { code: value[key].code, stream: value[key].stream };
          return acc;
        }
        acc[key] = canonical(value[key]);
        return acc;
      }, {});
    }
    return value;
  };
  return JSON.stringify(canonical(report));
};

/**
 * 这次请求的来源键。
 *
 * **存进 D1 的是这个哈希，不是 IP。** 盐里带了当天的日期，所以：
 *   * 一个窗口（1 小时）之内，同一个来源算同一个来源；
 *   * 跨天之后，同一个 IP 会得到完全不同的哈希，历史行再也对不上任何人；
 *   * 想反查是谁，得枚举整个 IP 空间，而且只有当天有效。
 *
 * 拿不到 `CF-Connecting-IP` 时（本地 wrangler dev、某些代理）退回一个固定
 * 桶。那意味着这些请求共享一个额度——宁可偶尔误伤本地调试，也不要在没有
 * 来源信息时静默地把限流整个关掉。
 */
const sourceKey = async (request) => {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown-source';
  const day = new Date().toISOString().slice(0, 10);
  return sha256Hex(`zeppbridge-feedback:${day}:${ip}`);
};

/**
 * 计数并判断是否超额。
 *
 * 窗口是「首次提交起 1 小时」的固定窗口，不是滑动窗口：滑动窗口要存每一次
 * 提交的时间戳，那反而是更多的来源侧数据。固定窗口在边界上允许最多两倍的
 * 突发，对这个用途完全够了。
 *
 * 限流本身出错时**放行**。这道闸是防滥用的，不是数据完整性的一部分；因为
 * 计数表写不进去就把一个真实用户的报告丢掉，是更糟的结果。
 */
const overRateLimit = async (db, hash, now) => {
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
  try {
    const row = await db
      .prepare('SELECT window_started_at, count FROM feedback_intake_counters WHERE source_hash = ?')
      .bind(hash)
      .first();
    if (!row || row.window_started_at < windowStart) {
      await db
        .prepare(`
          INSERT INTO feedback_intake_counters (source_hash, window_started_at, count)
          VALUES (?, ?, 1)
          ON CONFLICT(source_hash) DO UPDATE SET
            window_started_at = excluded.window_started_at,
            count = 1
        `)
        .bind(hash, now.toISOString())
        .run();
      return false;
    }
    if (row.count >= RATE_LIMIT_MAX_REPORTS) return true;
    await db
      .prepare('UPDATE feedback_intake_counters SET count = count + 1 WHERE source_hash = ?')
      .bind(hash)
      .run();
    return false;
  } catch {
    return false;
  }
};

export async function onRequestPost(context) {
  const contentType = context.request.headers.get('content-type') || '';
  const contentLength = Number(context.request.headers.get('content-length') || 0);
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return response({ ok: false, error: 'unsupported_media_type' }, 415);
  }
  if (contentLength > MAX_BODY_BYTES) {
    return response({ ok: false, error: 'payload_too_large' }, 413);
  }

  let raw;
  try {
    raw = await context.request.text();
  } catch {
    return response({ ok: false, error: 'invalid_request' }, 400);
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return response({ ok: false, error: 'payload_too_large' }, 413);
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    return response({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!validateFeedbackReport(report)) {
    return response({ ok: false, error: 'invalid_report' }, 422);
  }

  const db = context.env.FEEDBACK_DB;
  const now = new Date();
  const contentHash = await sha256Hex(contentHashInput(report));

  // 先查去重。重复提交不该消耗限流额度——断线重发和用户连点两下都会走到
  // 这里，而它们提交的是同一份内容，不是滥用。
  try {
    const existing = await db
      .prepare('SELECT id, received_at FROM feedback_reports WHERE content_hash = ?')
      .bind(contentHash)
      .first();
    if (existing) {
      // 200 而不是 201：没有新建任何东西。客户端看到的仍然是一次成功。
      return response({ reportId: existing.id, submittedAt: existing.received_at, duplicate: true });
    }
  } catch {
    // 去重查不了就当没有重复，继续往下走。宁可多存一份，不要丢一份。
  }

  if (await overRateLimit(db, await sourceKey(context.request), now)) {
    return response({ ok: false, error: 'rate_limited' }, 429);
  }

  const reportId = crypto.randomUUID();
  const submittedAt = now.toISOString();
  try {
    await db.prepare(`
      INSERT INTO feedback_reports (
        id, received_at, app_version, operating_system, schema_version,
        normalizer_revision, device_status, unknown_device_count,
        device_evidence_json, unknown_workout_codes_json, workout_type_conflicts,
        user_assigned_models_json, user_note, category,
        workout_type_corrections_json, content_hash,
        cloud_rejection_code, cloud_rejection_stream, cloud_rejection_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reportId,
      submittedAt,
      report.appVersion,
      report.operatingSystem,
      report.schemaVersion,
      report.normalizerRevision,
      report.deviceEvidence.status,
      report.deviceEvidence.unknownDeviceCount,
      JSON.stringify(report.deviceEvidence),
      JSON.stringify(report.unknownWorkoutCodes),
      report.workoutTypeConflicts,
      JSON.stringify(report.userAssignedModels ?? []),
      report.userNote ?? '',
      report.category ?? '',
      JSON.stringify(report.workoutTypeCorrections ?? []),
      contentHash,
      report.lastCloudRejection?.code ?? null,
      report.lastCloudRejection?.stream ?? '',
      report.lastCloudRejection?.at ?? '',
    ).run();
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  return response({ reportId, submittedAt }, 201);
}

export function onRequest() {
  return response({ ok: false, error: 'method_not_allowed' }, 405);
}
