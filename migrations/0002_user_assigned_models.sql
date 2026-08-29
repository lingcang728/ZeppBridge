-- 用户手动指认的型号，配上这台设备的型号类编号（deviceSource / deviceType）。
--
-- 华米没有公开「编号 → 型号」的对照表，而有些账号的设备响应里除了这些数字
-- 什么都没有，所以本机推不出型号。用户指认一次并勾选「帮忙补充目录」，这一对
-- 就成为下一版内置目录的素材，之后同款设备对所有人都能自动识别。
--
-- 两半都是型号级事实：没有序列号、MAC、账号或任何设备实例信息。
ALTER TABLE feedback_reports ADD COLUMN user_assigned_models_json TEXT NOT NULL DEFAULT '[]';
