//! 交给 AI 时附带的完整轨迹（2026-11-10 用户反馈：选了「详细」+「精确路线」却拿不到全部 GPS 点）。
//!
//! `.md` 为了装进 AI 的上下文，轨迹按 10 / 30 / 60 秒抽点、超预算时整段省掉——这是对的，
//! 但想让 AI 看整条路线的人就没有办法了。所以打开「精确路线」时，在 `.md` 旁边另写一份 GPX：
//! 每个解码出来的点都在（和「导出 GPX」同一个写法，WGS-84、暂停处断段），剪贴板里和 `.md` 一起放。
//! 没开精确路线、不是「详细」、或者一个点都没有时不写。

use crate::export_formats::to_gpx;
use serde_json::{json, Value};

/// 附带轨迹的文件名：和 `.md` 同名、加 `-route`，命令层据此在 `.md` 旁边找到它。
pub fn route_file_name(md_name: &str) -> String {
    format!(
        "{}-route.gpx",
        md_name.strip_suffix(".md").unwrap_or(md_name)
    )
}

/// 从任务文档里的 `workouts[].series.route` 拼出 GPX；返回 `(XML, 点数)`。没有点时 `None`。
pub(super) fn route_gpx(document: &Value) -> Option<(String, usize)> {
    let workouts: Vec<Value> = document
        .get("workouts")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|workout| {
            let series = workout.get("series")?;
            let route = series.get("route").and_then(Value::as_array)?;
            if route.is_empty() {
                return None;
            }
            Some(json!({
                "workout_id": workout.get("workout_id"),
                "effective_type": workout.get("effective_type").or_else(|| workout.get("workout_type")),
                "start_time": workout.get("start_time"),
                "route": route,
                "samples": series.get("samples"),
                "pauses": series.get("pauses"),
            }))
        })
        .collect();
    if workouts.is_empty() {
        return None;
    }
    let export = json!({
        "generated_at": document.get("generated_at"),
        "data": { "workouts": workouts },
    });
    to_gpx(&export).ok()
}

/// `.md` 末尾那一行：告诉 AI 完整轨迹在哪个附件里。节标题和 `.md` 里别的机器名一样不翻译。
pub(super) fn route_note(file_name: &str, points: usize) -> String {
    format!(
        "\n## Full route\n\n_All {points} GPS points of the route(s) above are in the attached file `{file_name}` (GPX 1.1, WGS-84). The route table above is thinned to fit the size budget._\n"
    )
}

#[cfg(test)]
#[path = "route_gpx_tests.rs"]
mod tests;
