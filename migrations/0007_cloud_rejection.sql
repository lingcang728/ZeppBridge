-- 云端在 HTTP 200 里写的那个「不成功」。
--
-- 客户端的 `classify_business_code` 已经能把「HTTP 200 + 非成功 code」认出来，
-- 但它**故意不把这个 code 敎定为「需要重新登录」**：一份真实本地库里的
-- 1075 条带包裹的留存报文，每一条的 code 都是 1——一个失败码都没观测到。
-- 凭一个没见过的数字把用户踢去重新扫码登录，是拿一个确定的坏体验去换
-- 一个猜测。所以它得从真的遇到这件事的用户那里回来。
--
-- 对得上的真实反馈：`c1f03eb2`「All my readings are showing empty」（v2.0.0）、
-- Reddit `u/WatercressAromatic79`「登进去是个空账号，一条数据都没有」。
--
-- 只收三样东西，都不是自由文本：哪条流、哪个 code、什么时候。
-- **云端的原话不收**——那是服务端给的自由文本，而这份报告对用户的承诺
-- 是只发白名单字段。
--
-- 默认值让旧行和旧客户端都不受影响：code 为 NULL 就是「没遇到过」。
ALTER TABLE feedback_reports ADD COLUMN cloud_rejection_code INTEGER;
ALTER TABLE feedback_reports ADD COLUMN cloud_rejection_stream TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback_reports ADD COLUMN cloud_rejection_at TEXT NOT NULL DEFAULT '';
