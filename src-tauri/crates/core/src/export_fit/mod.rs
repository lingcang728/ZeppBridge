use chrono::{DateTime, FixedOffset};

use embedded_io_adapters::std::FromStd;

use rustyfit::{
    profile::{mesgdef, typedef},
    proto::{Field, Message, Value as FitValue, FIT},
    Encoder,
};

use serde_json::Value;

use std::collections::BTreeMap;

mod fields;
mod laps;
mod records;

use fields::*;
use laps::*;
use records::*;

/// FIT 纪元是 1989-12-31T00:00:00Z，比 Unix 纪元晚这么多秒。
const FIT_EPOCH_OFFSET: i64 = 631_065_600;

/// 经纬度用 semicircles：`度 × 2^31 / 180`。
const SEMICIRCLES_PER_DEGREE: f64 = 2_147_483_648.0 / 180.0;

/// FIT 的 `altitude` 是 `(米 + 500) × 5` 存进 u16，于是可表示范围就是
/// -500 m 到 about 8192 m。超出这个范围的读数不写，而不是截断成一个假高度。
const ALTITUDE_OFFSET_M: f64 = 500.0;

const ALTITUDE_SCALE: f64 = 5.0;

/// 一次导出产出的所有文件：`(文件名, FIT 字节)`，外加所有文件里 `record`
/// 消息的总数。
pub type FitFiles = (Vec<(String, Vec<u8>)>, usize);

/// 把一份标准化导出转成若干 `(文件名, FIT 字节)`，每条运动一份。
///
/// 返回的第二个值是所有文件里 `record` 消息的总数，和 `to_gpx` 返回轨迹点数
/// 是同一个意思：让调用方能如实报告「写出去了多少个采样点」。
pub fn to_fit(export: &Value) -> Result<FitFiles, String> {
    let data = export
        .get("data")
        .ok_or_else(|| "导出数据结构异常：缺少 data 段".to_string())?;

    let mut files = Vec::new();
    let mut total_records = 0usize;
    let mut used_names: BTreeMap<String, usize> = BTreeMap::new();

    for workout in array(data, "workouts") {
        let Some((bytes, records)) = encode_workout(workout)? else {
            continue;
        };
        let mut name = file_name_for(workout);
        // 同一秒开始的两条运动会撞名字。加序号，而不是让后一个覆盖前一个。
        let seen = used_names.entry(name.clone()).or_insert(0);
        *seen += 1;
        if *seen > 1 {
            name = format!("{}-{}", name.trim_end_matches(".fit"), seen);
            name.push_str(".fit");
        }
        files.push((name, bytes));
        total_records += records;
    }

    if files.is_empty() {
        return Err(
            "这段时间没有可导出的运动明细（只有带逐秒采样或 GPS 轨迹的运动才能生成 FIT）"
                .to_string(),
        );
    }

    Ok((files, total_records))
}

#[cfg(test)]
mod tests;
