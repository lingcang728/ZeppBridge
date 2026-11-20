-- 回信附图：图本身在 R2（绑定 LETTER_ATTACHMENTS，私有桶），这里只记归属和校验信息。
-- 每封回信最多 3 张；同一封里同样的图只存一份（UNIQUE reply_id + sha256）。30 天后连同 R2 对象一起删。
CREATE TABLE IF NOT EXISTS letter_attachments (
  id TEXT PRIMARY KEY,
  reply_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  UNIQUE (reply_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_letter_attachments_reply ON letter_attachments (reply_id);
CREATE INDEX IF NOT EXISTS idx_letter_attachments_received ON letter_attachments (received_at);
