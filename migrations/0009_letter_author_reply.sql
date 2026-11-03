-- 作者对某一封回信的一对一回复（3.1.1）。
--
-- 作者用 scripts/letters/replies.mjs reply 写（译成来信人的语言），用户的应用凭本机
-- install id 取回执时一并取回，盖在「我的回信」那只信封上。空串 = 没回复 / 已撤回。
-- 只追加列，不动 0008 的表结构。
ALTER TABLE letter_replies ADD COLUMN author_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE letter_replies ADD COLUMN author_reply_at TEXT;
