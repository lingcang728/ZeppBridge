-- 作者来信的回信（批次 6「信匣」，functions/api/letters/[action].js）。
--
-- 回信是人写给人的话，和诊断报告分开存。install_hash 是本机随机 install id 的加盐哈希，
-- 不绑账号；回执只按它返回状态，不返回原文。
--
-- 后面五列是作者处理时写的（scripts/letters/replies.mjs）：read_at 已读、category 归到哪一类
-- （上期回音里的 #id）、status（next / later / asking / fixed / declined）、fixed_in 哪一版修、
-- handled_at 处理完的时间——处理完满 180 天的从线上删除（本地导出另存，不进仓库）。
CREATE TABLE IF NOT EXISTS letter_replies (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  app_version TEXT NOT NULL,
  letter_version TEXT NOT NULL,
  locale TEXT NOT NULL,
  body TEXT NOT NULL,
  allow_quote INTEGER NOT NULL DEFAULT 0,
  also_hit_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  read_at TEXT,
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  fixed_in TEXT NOT NULL DEFAULT '',
  handled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_letter_replies_content_hash ON letter_replies(content_hash);
CREATE INDEX IF NOT EXISTS idx_letter_replies_install ON letter_replies(install_hash, received_at);
CREATE INDEX IF NOT EXISTS idx_letter_replies_version ON letter_replies(letter_version, received_at);
