-- 写给作者的信可以附一份脱敏诊断报告（3.1.2 起「写信 = 反馈」）：存 /api/feedback 返回的报告编号，
-- 作者读信时据此到 feedback 表里找那份报告。没附就是 NULL。只追加列，不动 0008 / 0009。
ALTER TABLE letter_replies ADD COLUMN report_id TEXT;
