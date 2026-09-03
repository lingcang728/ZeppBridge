import assert from 'node:assert/strict';
import test from 'node:test';
import { contentHashInput, onRequestPost, validateFeedbackReport } from '../functions/api/feedback.js';

const report = () => ({
  format: 'zeppbridge.feedback.v1',
  appVersion: '0.11.0',
  schemaVersion: 11,
  normalizerRevision: 'zepp-normalizer-2026-08-v16-workout-catalog',
  operatingSystem: 'windows',
  deviceEvidence: {
    status: 'available',
    objectCount: 3,
    unknownDeviceCount: 1,
    idAliasObjects: 1,
    serialAliasObjects: 1,
    nameFieldObjects: 1,
    firmwareFieldObjects: 1,
    candidates: [],
    unmatchedProductHints: ['Amazfit Future Watch'],
    modelIdentifierHints: ['deviceSource:7930112', 'deviceType:5'],
    shapes: [{ path: '$.items[]', fields: [{ name: 'productCode', jsonType: 'string' }] }],
  },
  unknownWorkoutCodes: [{ code: 240, records: 2 }],
  workoutTypeConflicts: 0,
});

test('accepts allowlist-only actionable reports', () => {
  assert.equal(validateFeedbackReport(report()), true);
});

test('rejects extra fields and reports without an actionable problem', () => {
  const withToken = { ...report(), token: 'must-never-be-accepted' };
  assert.equal(validateFeedbackReport(withToken), false);
  const clean = report();
  clean.deviceEvidence.unknownDeviceCount = 0;
  clean.unknownWorkoutCodes = [];
  assert.equal(validateFeedbackReport(clean), false);
});

test('model identifier hints only accept model-class integers', () => {
  const withoutHints = report();
  delete withoutHints.deviceEvidence.modelIdentifierHints;
  assert.equal(validateFeedbackReport(withoutHints), true, '旧客户端不发这个字段也要能收');

  for (const bad of [
    ['sn:ABC123'],
    ['deviceSource:not-a-number'],
    ['macAddress:001122334455'],
    ['deviceSource:123456789'],
    ['deviceSource:12 deviceType:3'],
    [''],
  ]) {
    const invalid = report();
    invalid.deviceEvidence.modelIdentifierHints = bad;
    assert.equal(validateFeedbackReport(invalid), false, `不该接受 ${JSON.stringify(bad)}`);
  }

  const tooMany = report();
  tooMany.deviceEvidence.modelIdentifierHints = Array.from({ length: 9 }, (_, i) => `deviceType:${i}`);
  assert.equal(validateFeedbackReport(tooMany), false);
});

test('user-assigned model pairings are model-class only, and optional', () => {
  const base = report();
  assert.equal(base.userAssignedModels, undefined);
  assert.equal(validateFeedbackReport(base), true, '不勾选就不发这个字段');

  const good = report();
  good.userAssignedModels = [
    { catalogId: 'amazfit-balance-2', modelIdentifierHints: ['deviceSource:7930112'] },
  ];
  assert.equal(validateFeedbackReport(good), true);

  // 一个只有指认、没有其他问题的报告也算「有事可报」：它就是来补目录的。
  const onlyAssignment = report();
  onlyAssignment.deviceEvidence.unknownDeviceCount = 0;
  onlyAssignment.unknownWorkoutCodes = [];
  onlyAssignment.userAssignedModels = [
    { catalogId: 'amazfit-balance-2', modelIdentifierHints: ['deviceSource:7930112'] },
  ];
  assert.equal(validateFeedbackReport(onlyAssignment), true);

  for (const bad of [
    [{ catalogId: 'amazfit-balance-2', modelIdentifierHints: [] }],
    [{ catalogId: 'amazfit-balance-2', modelIdentifierHints: ['sn:ABC123'] }],
    [{ catalogId: '../../etc/passwd', modelIdentifierHints: ['deviceSource:1'] }],
    [{ catalogId: 'Amazfit Balance 2', modelIdentifierHints: ['deviceSource:1'] }],
    [{ catalogId: 'amazfit-balance-2', modelIdentifierHints: ['deviceSource:1'], sn: 'leak' }],
    [{ catalogId: '', modelIdentifierHints: ['deviceSource:1'] }],
  ]) {
    const invalid = report();
    invalid.userAssignedModels = bad;
    assert.equal(validateFeedbackReport(invalid), false, `不该接受 ${JSON.stringify(bad)}`);
  }
});

test('stores accepted reports and returns an opaque report id', async () => {
  let values;
  const db = {
    prepare() {
      return {
        bind(...bound) {
          values = bound;
          return { run: async () => ({ success: true }) };
        },
      };
    },
  };
  const request = new Request('https://zeppbridge.pages.dev/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report()),
  });
  const result = await onRequestPost({ request, env: { FEEDBACK_DB: db } });
  assert.equal(result.status, 201);
  const body = await result.json();
  assert.match(body.reportId, /^[0-9a-f-]{36}$/);
  assert.equal(values[2], '0.11.0');
  assert.equal(values[7], 1);
  // 没填备注的报告存空串，不是 undefined —— 读的人不用分两种情况处理。
  assert.equal(values[12], '');
});

test('a user note is accepted, bounded, and stored', async () => {
  // 这一句话往往比十个字段都管用（「我的表是 Balance 2，但显示未识别」），
  // 所以它必须能过校验；但它是自由文本，上限不能只靠客户端自觉。
  assert.equal(validateFeedbackReport({ ...report(), userNote: '我的表是 Balance 2，但显示未识别' }), true);
  assert.equal(validateFeedbackReport({ ...report(), userNote: 'x'.repeat(500) }), true);
  assert.equal(validateFeedbackReport({ ...report(), userNote: 'x'.repeat(501) }), false);
  assert.equal(validateFeedbackReport({ ...report(), userNote: 42 }), false);

  let values;
  const db = {
    prepare() {
      return {
        bind(...bound) {
          values = bound;
          return { run: async () => ({ success: true }) };
        },
      };
    },
  };
  const request = new Request('https://zeppbridge.pages.dev/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...report(), userNote: '设备是 Balance 2' }),
  });
  const result = await onRequestPost({ request, env: { FEEDBACK_DB: db } });
  assert.equal(result.status, 201);
  assert.equal(values[12], '设备是 Balance 2');
});

test('a user-declared category makes an otherwise quiet report submittable', async () => {
  // 本机什么异常都没检测到时，用户仍然可能真的遇到了问题。
  // 只认自动检测的话，这些人连报都报不了。
  const quiet = {
    ...report(),
    deviceEvidence: { ...report().deviceEvidence, unknownDeviceCount: 0 },
    unknownWorkoutCodes: [],
    workoutTypeConflicts: 0,
  };
  assert.equal(validateFeedbackReport(quiet), false, '没问题也没说明的报告仍然应当拒收');
  assert.equal(validateFeedbackReport({ ...quiet, category: 'data' }), true);
  // 分类是固定取值，不能借它塞任意文本。
  assert.equal(validateFeedbackReport({ ...quiet, category: '随便写的' }), false);
  assert.equal(validateFeedbackReport({ ...quiet, category: 'x'.repeat(200) }), false);
});

/**
 * 一个够真的 D1 替身：按 SQL 文本分流，把行留在内存里。
 *
 * 之前那个替身只有 `bind().run()`，`first()` 一调就抛——去重和限流两条路
 * 全部落进 catch 里放行，于是测试看起来是绿的，实际上一行新代码都没跑到。
 */
const fakeDb = () => {
  const reports = [];
  const counters = new Map();
  return {
    reports,
    counters,
    prepare(sql) {
      return {
        bind(...bound) {
          return {
            async first() {
              if (sql.includes('FROM feedback_reports WHERE content_hash')) {
                return reports.find((row) => row.content_hash === bound[0]) ?? null;
              }
              if (sql.includes('FROM feedback_intake_counters')) {
                return counters.get(bound[0]) ?? null;
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO feedback_reports')) {
                reports.push({ id: bound[0], received_at: bound[1], content_hash: bound[15], bound });
              } else if (sql.includes('INSERT INTO feedback_intake_counters')) {
                counters.set(bound[0], { window_started_at: bound[1], count: 1 });
              } else if (sql.includes('UPDATE feedback_intake_counters')) {
                const row = counters.get(bound[0]);
                if (row) row.count += 1;
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
};

const post = (db, body, ip = '203.0.113.7') => onRequestPost({
  request: new Request('https://zeppbridge.pages.dev/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  }),
  env: { FEEDBACK_DB: db },
});

test('a cloud rejection is model-class only, optional, and makes a quiet report submittable', async () => {
  // 那些「什么都看不到」的人（D1 `c1f03eb2`、Reddit u/WatercressAromatic79）
  // 库里本来就没有未识别设备、也没有未知运动编号。旧判据下他们提交不了，
  // 而他们手里的那个 code 恰恰是我们唯一需要的东西。
  const quiet = {
    ...report(),
    deviceEvidence: { ...report().deviceEvidence, unknownDeviceCount: 0 },
    unknownWorkoutCodes: [],
    workoutTypeConflicts: 0,
  };
  assert.equal(validateFeedbackReport(quiet), false);
  const withRejection = {
    ...quiet,
    lastCloudRejection: { stream: 'workouts', code: -1, at: '2026-09-03T10:00:00Z' },
  };
  assert.equal(validateFeedbackReport(withRejection), true);

  // 旧客户端不带这个字段，照收。
  assert.equal(validateFeedbackReport(report()), true);

  for (const bad of [
    { stream: 'workouts', code: -1, message: '云端的原话不收' },
    { stream: '随便写的', code: -1 },
    { stream: 'workouts', code: 'not-a-number' },
    { stream: 'workouts', code: -1, at: 'not-a-date' },
    { code: -1 },
  ]) {
    assert.equal(
      validateFeedbackReport({ ...report(), lastCloudRejection: bad }),
      false,
      `不该接受 ${JSON.stringify(bad)}`,
    );
  }

  // 存进去的是三个列，不是一坨 JSON。
  const db = fakeDb();
  const stored = await post(db, withRejection);
  assert.equal(stored.status, 201);
  const bound = db.reports[0].bound;
  assert.equal(bound[16], -1);
  assert.equal(bound[17], 'workouts');
  assert.equal(bound[18], '2026-09-03T10:00:00Z');
});

test('a fresh cloud rejection is not deduplicated away by an older note-free report', async () => {
  // 时间戳不进哈希，但 code 和 stream 进。
  const db = fakeDb();
  const first = await post(db, report());
  assert.equal(first.status, 201);
  const second = await post(db, {
    ...report(),
    lastCloudRejection: { stream: 'sleep', code: -1, at: '2026-09-03T10:00:00Z' },
  });
  assert.equal(second.status, 201, '带了新 code 就不是同一份报告');
  const third = await post(db, {
    ...report(),
    lastCloudRejection: { stream: 'sleep', code: -1, at: '2026-09-03T23:59:00Z' },
  });
  assert.equal(third.status, 200, '只是时间戳变了，不该再建一行');
  assert.equal(db.reports.length, 2);
});

test('workout type corrections are model-class only, and optional', () => {
  // issue #24 那类问题唯一的证据：编号我们认识，只是认错了。
  const good = {
    ...report(),
    workoutTypeCorrections: [
      { code: 7, interpreted: 'open_water_swimming', corrected: 'trail_running', records: 3 },
    ],
  };
  assert.equal(validateFeedbackReport(good), true);

  // 没有它也要能过——旧客户端和没纠正过的用户都不会带。
  assert.equal(validateFeedbackReport(report()), true);

  // 只有一条纠正、其余全空的报告也算「有可处理的内容」。
  const quiet = report();
  quiet.deviceEvidence.unknownDeviceCount = 0;
  quiet.unknownWorkoutCodes = [];
  assert.equal(validateFeedbackReport(quiet), false);
  quiet.workoutTypeCorrections = [
    { code: 7, interpreted: 'open_water_swimming', corrected: 'trail_running', records: 1 },
  ];
  assert.equal(validateFeedbackReport(quiet), true);

  for (const bad of [
    // 自由文本会让这两个字段变成又一个可以塞任意内容的通道。
    [{ code: 7, interpreted: 'Open Water Swimming', corrected: 'trail_running', records: 1 }],
    [{ code: 7, interpreted: 'open_water_swimming', corrected: '../../etc/passwd', records: 1 }],
    // 实例信息一律不许出现。
    [{ code: 7, interpreted: 'a', corrected: 'b', records: 1, workoutId: 'leak' }],
    [{ code: 7, interpreted: 'a', corrected: 'b' }],
    [{ code: -2, interpreted: 'a', corrected: 'b', records: 1 }],
    [{ code: 7, interpreted: 'a', corrected: 'b', records: 0 }],
  ]) {
    assert.equal(
      validateFeedbackReport({ ...report(), workoutTypeCorrections: bad }),
      false,
      `不该接受 ${JSON.stringify(bad)}`,
    );
  }
});

test('the same report submitted twice is stored once and answered with the first id', async () => {
  const db = fakeDb();
  const first = await post(db, report());
  assert.equal(first.status, 201);
  const firstBody = await first.json();

  const second = await post(db, report());
  // 200 而不是 201：什么都没新建。对客户端仍然是一次成功——断线重发和用户
  // 连点两下不该看到红色错误。
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.reportId, firstBody.reportId);
  assert.equal(secondBody.duplicate, true);
  assert.equal(db.reports.length, 1, '重复内容不该在库里留下第二行');

  // 只改一句备注仍然是同一份证据：备注不进摘要。
  const third = await post(db, { ...report(), userNote: '补一句：表是 Balance 2' });
  assert.equal(third.status, 200);
  assert.equal(db.reports.length, 1);
});

test('one source cannot flood the library with distinct reports', async () => {
  const db = fakeDb();
  // 每份内容都不一样，所以去重挡不住——挡住它的必须是限流。
  const distinct = (index) => {
    const body = report();
    body.unknownWorkoutCodes = [{ code: 300 + index, records: 1 }];
    return body;
  };

  let limited = 0;
  for (let index = 0; index < 20; index += 1) {
    const result = await post(db, distinct(index));
    if (result.status === 429) limited += 1;
  }
  assert.ok(limited > 0, '同一个来源连发 20 份不同报告应当被限流');
  assert.ok(db.reports.length <= 12, `实际存了 ${db.reports.length} 份，超过了窗口额度`);

  // 另一个来源不受影响：限流是按来源分桶的，不是全局开关。
  const other = await post(db, distinct(99), '198.51.100.4');
  assert.equal(other.status, 201);
});

test('the content hash does not depend on key order and never carries the note', () => {
  const a = { format: 'x', unknownWorkoutCodes: [{ code: 1, records: 2 }], userNote: 'hello' };
  const b = { unknownWorkoutCodes: [{ records: 2, code: 1 }], format: 'x' };
  assert.equal(contentHashInput(a), contentHashInput(b));
  assert.ok(!contentHashInput(a).includes('hello'));
});
