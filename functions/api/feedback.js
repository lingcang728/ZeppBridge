const MAX_BODY_BYTES = 32 * 1024;
const MAX_STRING = 128;

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
    'workoutTypeConflicts',
    'userNote',
    'category',
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
  if (!boundedInteger(report.workoutTypeConflicts, 0, 1_000_000_000)) return false;
  // 用户自己写的一句说明。客户端发之前已经脱敏并截到 500 字，这里按同样的上限
  // 再校验一次——服务端不能因为「客户端应该已经处理过」就放行。字段可缺省：
  // 没填的报告和旧客户端都不会带它。
  if (report.userNote !== undefined && !boundedString(report.userNote, USER_NOTE_MAX)) return false;
  // 分类是固定取值，不是又一个自由文本框。
  if (report.category !== undefined && !REPORT_CATEGORIES.includes(report.category)) return false;
  // 自动检测到问题，或者用户自己说明了要报什么——两条路都算数。只认前者的话，
  // 本机没检测到异常的人就永远提交不了，哪怕他真的遇到了问题。
  return report.deviceEvidence.unknownDeviceCount > 0
    || (report.userAssignedModels?.length ?? 0) > 0
    || report.unknownWorkoutCodes.length > 0
    || report.workoutTypeConflicts > 0
    || report.category !== undefined;
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

  const reportId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  try {
    await context.env.FEEDBACK_DB.prepare(`
      INSERT INTO feedback_reports (
        id, received_at, app_version, operating_system, schema_version,
        normalizer_revision, device_status, unknown_device_count,
        device_evidence_json, unknown_workout_codes_json, workout_type_conflicts,
        user_assigned_models_json, user_note, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ).run();
  } catch {
    return response({ ok: false, error: 'storage_unavailable' }, 503);
  }
  return response({ reportId, submittedAt }, 201);
}

export function onRequest() {
  return response({ ok: false, error: 'method_not_allowed' }, 405);
}
