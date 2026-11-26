import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACHMENT_BUDGET_BYTES, ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_DAY, ATTACHMENTS_PER_REPLY, SAMPLE_FORMAT, SAMPLE_MAX_BYTES, SAMPLES_PER_REPLY, installHash, isStructureSample, onRequestPost, sniffImage } from '../functions/api/letters/[action].js';

const INSTALL = '3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f';
const OTHER_INSTALL = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d';
const REPLY = '0b6f3a52-6c1e-4d7a-9f20-6a1d2c3b4e5f';
const jpeg = (fill = 1, size = 64) => {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** 只模拟附图接口用到的 SQL：回信归属、附图去重 / 计数 / 插入 / 过期清理、限流计数。 */
const fakeEnv = async ({ replyAgeDays = 0 } = {}) => {
  const attachments = [];
  const objects = new Map();
  const counters = new Map();
  const reply = { id: REPLY, install_hash: await installHash(INSTALL), received_at: new Date(Date.now() - replyAgeDays * 86_400_000).toISOString() };
  const db = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() {
          if (sql.includes('FROM letter_replies WHERE id')) return args[0] === reply.id ? reply : null;
          if (sql.includes('FROM letter_attachments WHERE reply_id = ? AND sha256')) return attachments.find((row) => row.reply_id === args[0] && row.sha256 === args[1]) ?? null;
          if (sql.includes('SUM(bytes)')) {
            return {
              stored: attachments.reduce((sum, row) => sum + row.bytes, 0),
              today: attachments.filter((row) => row.received_at >= args[0]).length,
            };
          }
          if (sql.includes('COUNT(*)')) {
            const rows = attachments.filter((row) => row.reply_id === args[1]);
            return { count: rows.length, samples: rows.filter((row) => row.content_type === args[0]).length };
          }
          if (sql.includes('FROM feedback_intake_counters')) return counters.get(args[0]) ?? null;
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO letter_attachments')) {
            const [id, reply_id, received_at, content_type, bytes, sha256, object_key] = args;
            attachments.push({ id, reply_id, received_at, content_type, bytes, sha256, object_key });
          } else if (sql.includes('DELETE FROM letter_attachments')) {
            attachments.splice(attachments.findIndex((row) => row.id === args[0]), 1);
          } else if (sql.includes('INSERT INTO feedback_intake_counters')) {
            counters.set(args[0], { window_started_at: args[1], count: 1 });
          } else if (sql.includes('UPDATE feedback_intake_counters')) {
            counters.get(args[0]).count += 1;
          }
          return {};
        },
        async all() {
          if (sql.includes('received_at < ?')) return { results: attachments.filter((row) => row.received_at < args[0]) };
          return { results: [] };
        },
      };
      return statement;
    },
  };
  const bucket = {
    async put(key, value, options) { objects.set(key, { value, options }); },
    async delete(key) { objects.delete(key); },
  };
  return { attachments, objects, env: { FEEDBACK_DB: db, LETTER_ATTACHMENTS: bucket } };
};

const upload = (env, body, { reply = REPLY, install = INSTALL, type = 'image/jpeg' } = {}) => onRequestPost({
  params: { action: 'attachment' },
  env,
  request: new Request(`https://zeppbridge.com/api/letters/attachment?reply=${reply}`, {
    method: 'POST',
    headers: { 'content-type': type, 'x-zeppbridge-install-id': install, 'CF-Connecting-IP': '203.0.113.9' },
    body,
  }),
});

test('images are recognised by their header, not by what the client claims', () => {
  assert.equal(sniffImage(jpeg()), 'image/jpeg');
  assert.equal(sniffImage(png()), 'image/png');
  assert.equal(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  assert.equal(sniffImage(new Uint8Array()), null);
});

test('the sender of a reply can attach a screenshot; it lands in the private bucket with its record', async () => {
  const { env, attachments, objects } = await fakeEnv();
  const response = await upload(env, jpeg());
  assert.equal(response.status, 201);
  const { attachmentId } = await response.json();
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].id, attachmentId);
  assert.equal(attachments[0].bytes, 64);
  const key = attachments[0].object_key;
  assert.match(key, new RegExp(`^letters/${REPLY}/${attachmentId}\\.jpg$`));
  assert.equal(objects.get(key).options.httpMetadata.contentType, 'image/jpeg');
  // 记录里没有 install id 原文。
  assert.ok(!JSON.stringify(attachments).includes(INSTALL));
});

test('someone else, an unknown reply, or an old reply cannot get images attached', async () => {
  const { env, attachments } = await fakeEnv();
  assert.equal((await upload(env, jpeg(), { install: OTHER_INSTALL })).status, 404);
  assert.equal((await upload(env, jpeg(), { reply: '1b6f3a52-6c1e-4d7a-9f20-6a1d2c3b4e5f' })).status, 404);
  assert.equal((await upload(env, jpeg(), { reply: 'not-a-reply' })).status, 422);
  assert.equal(attachments.length, 0);
  const old = await fakeEnv({ replyAgeDays: 8 });
  assert.equal((await upload(old.env, jpeg())).status, 410);
});

test('only small JPEG or PNG files, at most three per reply, and the same image only once', async () => {
  const { env, attachments } = await fakeEnv();
  assert.equal((await upload(env, new TextEncoder().encode('GIF89a....'), { type: 'image/gif' })).status, 415);
  assert.equal((await upload(env, png(), { type: 'image/jpeg' })).status, 415, '声明和文件头对不上');
  assert.equal((await upload(env, jpeg(1, ATTACHMENT_MAX_BYTES + 1))).status, 413);
  assert.equal((await upload(env, png(), { type: 'image/png' })).status, 201);
  const first = await (await upload(env, jpeg(1))).json();
  const again = await (await upload(env, jpeg(1))).json();
  assert.equal(again.attachmentId, first.attachmentId);
  assert.equal(again.duplicate, true);
  assert.equal((await upload(env, jpeg(2))).status, 201);
  assert.equal(attachments.length, ATTACHMENTS_PER_REPLY);
  assert.equal((await upload(env, jpeg(3))).status, 409);
});

test('without the storage binding the upload is postponed, not lost', async () => {
  const { env } = await fakeEnv();
  const response = await upload({ FEEDBACK_DB: env.FEEDBACK_DB }, jpeg());
  assert.equal(response.status, 503);
});

test('images past their retention are deleted together with their objects', async () => {
  const { env, attachments, objects } = await fakeEnv();
  await upload(env, jpeg(1));
  attachments[0].received_at = '2020-01-01T00:00:00.000Z';
  await upload(env, jpeg(2));
  assert.equal(attachments.length, 1);
  assert.equal(objects.size, 1);
  assert.notEqual(attachments[0].received_at, '2020-01-01T00:00:00.000Z');
});

test('a full bucket or a busy day postpones uploads instead of growing the bill', async () => {
  const full = await fakeEnv();
  full.attachments.push({ id: 'old', reply_id: 'someone-else', received_at: new Date().toISOString(), content_type: 'image/jpeg', bytes: ATTACHMENT_BUDGET_BYTES - 10, sha256: 'x', object_key: 'letters/x/old.jpg' });
  const tooBig = await upload(full.env, jpeg(1));
  assert.equal(tooBig.status, 507);
  assert.equal((await tooBig.json()).error, 'attachments_full');
  assert.equal(full.objects.size, 0, '超出总量时不往桶里写');

  const busy = await fakeEnv();
  for (let index = 0; index < ATTACHMENTS_PER_DAY; index += 1) {
    busy.attachments.push({ id: `today-${index}`, reply_id: 'someone-else', received_at: new Date().toISOString(), content_type: 'image/jpeg', bytes: 10, sha256: String(index), object_key: `letters/x/${index}.jpg` });
  }
  assert.equal((await upload(busy.env, jpeg(1))).status, 507);

  const room = await fakeEnv();
  assert.equal((await upload(room.env, jpeg(1))).status, 201);
});

const sampleBytes = (extra = {}) => new TextEncoder().encode(JSON.stringify({ format: SAMPLE_FORMAT, appVersion: '9.9.9', parts: [], ...extra }));

test('a reply takes up to SAMPLES_PER_REPLY workout structure samples, next to up to three images', async () => {
  const { env, attachments, objects } = await fakeEnv();
  const first = await upload(env, sampleBytes(), { type: 'application/json' });
  assert.equal(first.status, 201);
  assert.equal(attachments[0].content_type, 'application/json');
  assert.match([...objects.keys()][0], /\.json$/);
  for (let index = 1; index < SAMPLES_PER_REPLY; index += 1) {
    assert.equal((await upload(env, sampleBytes({ appVersion: `9.9.${index}` }), { type: 'application/json' })).status, 201);
  }
  assert.equal((await upload(env, sampleBytes({ appVersion: '9.8.0' }), { type: 'application/json' })).status, 409);
  for (let index = 0; index < ATTACHMENTS_PER_REPLY; index += 1) {
    assert.equal((await upload(env, jpeg(index + 2))).status, 201);
  }
  assert.equal((await upload(env, jpeg(9))).status, 409);
});

test('only our own sample format passes as JSON, within its size limit', async () => {
  assert.equal(isStructureSample(sampleBytes()), true);
  assert.equal(isStructureSample(new TextEncoder().encode('{"format":"other","parts":[]}')), false);
  assert.equal(isStructureSample(new TextEncoder().encode('not json')), false);
  const { env } = await fakeEnv();
  assert.equal((await upload(env, new TextEncoder().encode('{"hello":1}'), { type: 'application/json' })).status, 415);
  assert.equal((await upload(env, jpeg(), { type: 'application/json' })).status, 415);
  const big = sampleBytes({ padding: 'x'.repeat(SAMPLE_MAX_BYTES) });
  assert.equal((await upload(env, big, { type: 'application/json' })).status, 413);
});
