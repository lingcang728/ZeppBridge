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
});
