import assert from 'node:assert/strict';
import test from 'node:test';
import { installHash, onRequestPost, validateReply } from '../functions/api/letters/[action].js';

const INSTALL = '3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f';
const reply = (extra = {}) => ({
  format: 'zeppbridge.letter-reply.v1', installId: INSTALL, appVersion: '3.1.0', letterVersion: '3.1.0',
  locale: 'zh', text: '补拉还是卡住。', allowQuote: false, alsoHit: [], ...extra,
});

/** 只模拟本接口用到的几条 SQL：按内容哈希去重、计数、插入、按 install 取回执。 */
const fakeDb = () => {
  const rows = [];
  const counters = new Map();
  return {
    rows,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() {
          if (sql.includes('FROM letter_replies WHERE content_hash')) {
            const row = rows.find((r) => r.content_hash === args[0]);
            return row ? { id: row.id, received_at: row.received_at } : null;
          }
          if (sql.includes('FROM feedback_intake_counters')) return counters.get(args[0]) ?? null;
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO letter_replies')) {
            const [id, received_at, install_hash, app_version, letter_version, locale, body, allow_quote, also_hit_json, content_hash] = args;
            rows.push({ id, received_at, install_hash, app_version, letter_version, locale, body, allow_quote, also_hit_json, content_hash, read_at: null, category: '', status: '', fixed_in: '' });
          } else if (sql.includes('INSERT INTO feedback_intake_counters')) {
            counters.set(args[0], { window_started_at: args[1], count: 1 });
          } else if (sql.includes('UPDATE feedback_intake_counters')) {
            counters.get(args[0]).count += 1;
          }
          return {};
        },
        async all() {
          return { results: rows.filter((r) => r.install_hash === args[0]).slice(0, args[1]) };
        },
      };
      return statement;
    },
  };
};

const post = (db, action, body) => onRequestPost({
  params: { action },
  env: { FEEDBACK_DB: db },
  request: new Request(`https://zeppbridge.com/api/letters/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, body: JSON.stringify(body),
  }),
});

test('a reply carries only its own fields, a bounded text, and something to say', () => {
  assert.equal(validateReply(reply()), true);
  assert.equal(validateReply(reply({ text: '', alsoHit: ['backfill-stuck'] })), true);
  assert.equal(validateReply(reply({ text: '   ', alsoHit: [] })), false);
  assert.equal(validateReply(reply({ text: '字'.repeat(1001) })), false);
  assert.equal(validateReply(reply({ email: 'a@b.c' })), false);
  assert.equal(validateReply(reply({ installId: 'not-a-uuid' })), false);
  assert.equal(validateReply(reply({ alsoHit: ['Bad Id'] })), false);
  assert.equal(validateReply(reply({ alsoHit: ['a', 'a'] })), false);
});

test('the same reply sent twice is one letter; receipts return status, never the text', async () => {
  const db = fakeDb();
  const first = await post(db, 'reply', reply());
  assert.equal(first.status, 201);
  const { replyId } = await first.json();
  const again = await post(db, 'reply', reply());
  assert.equal((await again.json()).replyId, replyId);
  assert.equal(db.rows.length, 1);
  // 库里存的是哈希，不是原始 install id。
  assert.equal(db.rows[0].install_hash, await installHash(INSTALL));
  assert.ok(!JSON.stringify(db.rows).includes(INSTALL));

  db.rows[0].read_at = '2026-10-22T08:00:00Z';
  db.rows[0].category = 'backfill-stuck';
  db.rows[0].status = 'fixed';
  db.rows[0].fixed_in = '3.1.1';
  const receipts = await (await post(db, 'receipts', { format: 'zeppbridge.letter-receipts.v1', installId: INSTALL })).json();
  assert.deepEqual(receipts.receipts, [{
    replyId, letterVersion: '3.1.0', receivedAt: db.rows[0].received_at,
    readAt: '2026-10-22T08:00:00Z', category: 'backfill-stuck', status: 'fixed', fixedIn: '3.1.1',
  }]);
  assert.ok(!JSON.stringify(receipts).includes('补拉还是卡住'));
});

test('unknown actions and malformed bodies are refused', async () => {
  const db = fakeDb();
  assert.equal((await post(db, 'list', reply())).status, 404);
  assert.equal((await post(db, 'reply', reply({ text: '' }))).status, 422);
  assert.equal((await post(db, 'receipts', { format: 'zeppbridge.letter-receipts.v1' })).status, 422);
});
