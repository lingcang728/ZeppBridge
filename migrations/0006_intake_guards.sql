-- 反馈入口的两道闸：内容去重和按来源限流。
--
-- 校验很严，但严格的校验只能保证「字段合法」，挡不住一份字段全部合法的报告
-- 被反复 POST。真正的风险不是 D1 的空间——是以后拿这些报告学 device code 和
-- workout code 时被污染：收录规则是「每个编号至少两份互相独立的报告」，而
-- 一个人重复提交一百次会让任何一个编号看起来都「有很多份报告」。
--
-- CORS 挡不住这件事：它只约束浏览器页面，curl 和脚本不受影响。

-- 规范化报告的内容摘要。
--
-- 同一份内容重复提交时不再插入新行，而是把原来那一行的 id 原样返回——对客户端
-- 来说是一次成功的提交（重试、断线重发、用户连点两下都不该报错），对统计来说
-- 只算一份。
--
-- 允许为 NULL：这一列加上去之前的历史行没有摘要，而 SQLite 的 UNIQUE 索引把
-- 每个 NULL 都当成互不相同，所以旧行不会互相冲突。
ALTER TABLE feedback_reports ADD COLUMN content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_reports_content_hash
  ON feedback_reports(content_hash)
  WHERE content_hash IS NOT NULL;

-- 按来源限流的计数器。
--
-- **这里存的是盐过的哈希，不是 IP。** 盐每天换一次（见 functions/api/feedback.js
-- 的 `sourceKey`），所以这张表既能在一个窗口内认出「同一个来源」，也无法用来
-- 回查是谁——反查需要枚举 IP 空间，而且隔一天连那条路都断了。
--
-- 它和 feedback_reports 没有任何关联列：拿到这张表推不出哪一份报告来自哪个来源。
CREATE TABLE IF NOT EXISTS feedback_intake_counters (
  source_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  count INTEGER NOT NULL
);

-- 清理过期计数器时按窗口扫。
CREATE INDEX IF NOT EXISTS idx_feedback_intake_counters_window
  ON feedback_intake_counters(window_started_at);
