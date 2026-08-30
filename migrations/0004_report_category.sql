-- 用户自己选的问题类型。
--
-- 自动检测只能发现「有未识别的设备或运动编号」。用户遇到的可能是别的——
-- 数据对不上、某项一直是空。没有这一列时，这些人连报都报不了：服务端会
-- 判定报告里「没有可处理的内容」而拒收。
--
-- 固定取值：device / workout / data / other，或空串（自动检测出来的报告）。
ALTER TABLE feedback_reports ADD COLUMN category TEXT NOT NULL DEFAULT '';
