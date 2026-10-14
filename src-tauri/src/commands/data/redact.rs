//! 交给 AI 之前的脱敏：规则在 core 的 `zeppbridge_core::redact`（和 ai_tasks 共用一份），
//! 这里只负责把脱敏后的 JSON 编码成交接文本，并把错误换成界面认识的码。

use super::*;

pub(crate) use zeppbridge_core::redact::sanitize_local_paths as sanitize_clipboard_text;

/// 就地脱敏一份导出（JSON 树，不再先序列化再解析），返回编码后的文本和脱敏类别。
pub(crate) fn redact_ai_export(
    mut value: Value,
    include_precise_route: bool,
) -> std::result::Result<(String, Vec<String>), AppError> {
    let redactions = zeppbridge_core::redact::redact_ai_export(&mut value, include_precise_route);
    let encoded = serde_json::to_string_pretty(&value).map_err(|error| {
        AppError::new(
            "err.handoff.encode_failed",
            format!("编码脱敏 AI 导出失败: {error}"),
        )
    })?;
    Ok((encoded, redactions))
}
