import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost, validateFeedbackReport } from '../functions/api/feedback.js';

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
