//! 诊断报告（从 models/types.rs 按领域拆出，形状不变）。

use super::*;

/// One allowlisted field description. Only the key and JSON kind are carried;
/// the value is structurally impossible to serialize into a diagnostic report.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticField {
    pub name: String,
    pub json_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticObjectShape {
    pub path: String,
    pub fields: Vec<DiagnosticField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticDeviceCandidate {
    pub catalog_id: String,
    pub canonical_name: String,
    pub firmware: Option<String>,
    pub match_status: DeviceMatchStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticDeviceEvidence {
    pub status: String,
    pub object_count: usize,
    pub unknown_device_count: usize,
    pub id_alias_objects: usize,
    pub serial_alias_objects: usize,
    pub name_field_objects: usize,
    pub firmware_field_objects: usize,
    pub candidates: Vec<DiagnosticDeviceCandidate>,
    pub unmatched_product_hints: Vec<String>,
    /// 型号类数字标识，形如 `deviceSource:7930112` / `deviceType:5`。
    ///
    /// 有些账号的设备响应里根本没有产品名字段，这两个数字是仅有的型号线索。
    /// 它们描述的是「哪一款表」，不是「哪一台表」：没有序列号、MAC、
    /// 绑定时间或任何随设备实例变化的值，所以可以安全地用来补内置目录。
    /// 只收整数，其他一律丢弃。
    #[serde(default)]
    pub model_identifier_hints: Vec<String>,
    pub shapes: Vec<DiagnosticObjectShape>,
}

/// 用户手动指认的型号，配上这台设备的型号类编号。
///
/// 这一对是内置目录唯一可能的成长来源：华米没有公开「编号 → 型号」的对照，
/// 而有些账号的设备响应里除了这些数字什么都没有。一个用户指认一次，下一版
/// 目录就能让所有同款设备自动识别。
///
/// 两半都是型号级事实：`catalog_id` 是随包目录里的产品，`hints` 只含
/// `deviceSource:整数` 这种取值。没有序列号、MAC、账号或任何设备实例信息。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticAssignedModel {
    pub catalog_id: String,
    pub model_identifier_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWorkoutCode {
    pub code: i32,
    pub records: i64,
}

/// 云端在 HTTP 200 里写的那个「不成功」。
///
/// 只有三个字段，里面没有一个是自由文本：哪条流、哪个 code、什么时候。
/// 云端的原话（`message`）刷意不收——那是服务端给的自由文本，而这份报告
/// 对用户的承诺是只发白名单字段。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCloudRejection {
    /// 哪条流被拒了（`workouts` / `sleep` / …）。
    pub stream: String,
    /// 报文里的 `code`。成功是 1；其余值目前一个都没观测到过。
    pub code: i64,
    /// RFC3339。取三个阶段里最先有值的那个。
    pub at: Option<String>,
}

/// 用户把某个 Zepp 运动编号纠正成了什么。
///
/// 这是 issue #24 那类问题唯一可能的证据来源。报告者说「越野跑被识别成了
/// 公开水域游泳」，而当时的诊断报告里 `unknown_workout_codes` 是空的、
/// `workout_type_conflicts` 是 0 —— 因为那个编号我们**认识**，只是认错了。
/// 认错和不认识在旧字段里长得完全一样：都没有任何编号信息。
///
/// 三个字段都是类型级事实：云端给的编号、我们的解释、用户的解释。**不含
/// 任何实例信息**——没有 workout_id、没有时间、没有距离、没有 GPS。
/// `corrected` 的取值被随包运动目录的 key 约束死（见
/// `set_workout_type_override`），不是自由文本。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWorkoutCorrection {
    /// 云端给的原始运动编号。
    pub code: i32,
    /// ZeppBridge 自己解释成的运动 key（例如 `open_water_swimming`）。
    pub interpreted: String,
    /// 用户改成的运动 key（例如 `trail_running`）。
    pub corrected: String,
    /// 用户这样改过多少条记录。一条和二十条的分量不一样。
    pub records: i64,
}

/// Strongly typed, allowlist-only issue report. It has no slots for account
/// identifiers, tokens, serial values, GPS, health measurements, raw payloads,
/// or filesystem paths.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub format: String,
    pub app_version: String,
    pub schema_version: i64,
    pub normalizer_revision: String,
    pub operating_system: String,
    pub device_evidence: DiagnosticDeviceEvidence,
    /// 用户手动指认的型号与该设备的型号类编号。只有用户在选择器里勾选了
    /// 「帮忙补充目录」时才会有内容；没勾选就是空的，报告里也就没有这一段。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub user_assigned_models: Vec<DiagnosticAssignedModel>,
    pub unknown_workout_codes: Vec<DiagnosticWorkoutCode>,
    /// 用户做过的运动类型纠正，按「编号 → 我们的解释 → 用户的解释」聚合。
    ///
    /// 没有纠正过就整段不出现，报告不会因此变大。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub workout_type_corrections: Vec<DiagnosticWorkoutCorrection>,
    pub workout_type_conflicts: i64,
    /// 用户自己选的问题类型（`device` / `workout` / `data` / `other`）。
    ///
    /// 本机的自动检测只能发现「有未识别的设备或运动编号」这类问题。用户遇到的
    /// 可能是别的——数据对不上、某项一直是空。没有这个字段时，这些人连报都报
    /// 不了，因为服务端会判定「没有可处理的内容」。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// 用户自己写的一句说明（「我的表是 Balance 2，但没被识别」）。
    ///
    /// 光有字段结构和编号，收到报告的人经常判断不出这到底是哪一款表；一句人话
    /// 往往比十个字段更有用。但它是自由文本，所以在发出之前要过一遍脱敏和长度
    /// 上限——用户可能顺手把 token 或本机路径粘进来。没填就整段不出现。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_note: Option<String>,
    /// 最近一次云端业务拒绝。没遇到过就整段不出现。
    ///
    /// 这是为了把 `classify_business_code` 那个环闭上：它已经能把「HTTP 200
    /// 但云端说不成功」认出来了，却故意不敲定它是不是「需要重新登录」——
    /// 因为本机根本没有观测到任何一个失败码。下一份带着具体 code 的报告
    /// 就能把它精确地映成 `NeedsReauth`。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_cloud_rejection: Option<DiagnosticCloudRejection>,
}

/// 自由文本备注的上限。够写清「设备是 Balance 2，固件 3.5.1，运动类型显示成未知」，
/// 又不至于让人把整段日志粘进来。
pub const DIAGNOSTIC_NOTE_MAX_CHARS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSubmissionResult {
    pub report_id: String,
    pub submitted_at: DateTime<Utc>,
}
