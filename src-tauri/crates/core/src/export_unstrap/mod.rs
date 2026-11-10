//! 把本机的运动写成 unstrap（Helio Strap 的开源伴侣应用）备份能导入的 zip（Beta 实验室，计划 C3）。
//!
//! unstrap 的 `CsvImporter` 按文件名认表、按列名读，包里有它认识的表就收，其它表缺了不算错。
//! 这里只写两张：`workout.csv`（一次运动一行）和 `workout_hr.csv`（运动里的逐点心率）。
//!
//! 只写库里真有的值：没有的格子留空，绝不填 0（unstrap 读空格子是「没有」，读 0 是「0」）。
//! Zepp 自己算的训练负荷、VO₂max、训练效果不写——那几列在 unstrap 里是带子自己的算法结果，
//! 混进去会污染它的趋势。运动类型按 unstrap 的编号（Zepp OS 协议）写，认不出的写成它的
//! 通用「活动」（223）。
//!
//! 文件名故意不叫 `unstrap-backup-*.zip`：unstrap 的自动备份会按这个名字轮换删除旧文件。

use std::io::{Cursor, Write};

use chrono::{DateTime, SecondsFormat, Utc};

use crate::import::unstrap::unstrap_sport;
use crate::models::error::{Result, ZeppBridgeError};
use crate::storage::Database;

#[cfg(test)]
mod tests;

const WORKOUT_HEADER: &str = "start,start_epoch,end_epoch,sport_type,exercise_seconds,calories,avg_hr,max_hr,min_hr,aerobic_te,anaerobic_te,training_load,vo2max,steps,subtype";
const WORKOUT_HR_HEADER: &str = "workout_start_epoch,epoch,bpm";

/// unstrap 的通用「活动」。
const GENERIC_ACTIVITY: i64 = 223;

/// 一页读多少条运动。
const PAGE: usize = 200;

#[derive(Debug, Clone, PartialEq)]
pub struct UnstrapExport {
    pub bytes: Vec<u8>,
    pub workouts: usize,
    pub heart_rate_points: usize,
}

/// 运动目录 key → unstrap 的编号。同一个 key 有几个编号时取带子现在用的那个
/// （足球 191、板式网球 216，和 unstrap 自己的 `STRAP_IDS` 一致）。
pub fn unstrap_code(key: &str) -> i64 {
    const PREFERRED: [i64; 2] = [191, 216];
    PREFERRED
        .into_iter()
        .chain(0..300)
        .find(|code| unstrap_sport(*code) == key && key != "activity")
        .unwrap_or(GENERIC_ACTIVITY)
}

fn cell<T: ToString>(value: Option<T>) -> String {
    value.map(|v| v.to_string()).unwrap_or_default()
}

fn zip_error(error: zip::result::ZipError) -> ZeppBridgeError {
    ZeppBridgeError::IoError(std::io::Error::other(error))
}

/// 读出 `since` 之后（含）开始的全部可见运动，写成 zip。`since` 为空就是全部。
pub fn build_unstrap_export(db: &Database, since: Option<DateTime<Utc>>) -> Result<UnstrapExport> {
    let mut workouts_csv = String::from(WORKOUT_HEADER);
    workouts_csv.push('\n');
    let mut hr_csv = String::from(WORKOUT_HR_HEADER);
    hr_csv.push('\n');
    let mut workouts = 0;
    let mut heart_rate_points = 0;
    let mut offset = 0;
    'pages: loop {
        let page = db.workouts_page(PAGE, offset)?;
        if page.is_empty() {
            break;
        }
        offset += page.len();
        for summary in page {
            if since.is_some_and(|since| summary.start_time < since) {
                // 新的在前：再往后都更早。
                break 'pages;
            }
            let Some(workout) = db.get_workout_detail(&summary.workout_id)? else {
                continue;
            };
            let start = workout.start_time.timestamp();
            let end = workout.end_time.timestamp();
            if end <= start {
                continue;
            }
            workouts += 1;
            let row = [
                workout
                    .start_time
                    .to_rfc3339_opts(SecondsFormat::Secs, true),
                start.to_string(),
                end.to_string(),
                unstrap_code(&workout.effective_type).to_string(),
                cell(workout.moving_seconds.filter(|s| *s > 0)),
                cell(workout.calories.filter(|c| *c > 0)),
                cell(workout.avg_hr.filter(|hr| *hr > 0)),
                cell(workout.max_hr.filter(|hr| *hr > 0)),
                cell(workout.min_hr.filter(|hr| *hr > 0)),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                cell(workout.total_steps.filter(|s| *s > 0)),
                String::new(),
            ];
            workouts_csv.push_str(&row.join(","));
            workouts_csv.push('\n');
            let series = db.get_workout_series(&workout.workout_id)?;
            let mut last_second = None;
            for sample in series.samples {
                let (Some(bpm), Ok(time)) = (
                    sample.heart_rate.filter(|bpm| (25..=250).contains(bpm)),
                    DateTime::parse_from_rfc3339(&sample.timestamp),
                ) else {
                    continue;
                };
                // unstrap 的心率按秒为键：同一秒只留第一个。
                let second = time.timestamp();
                if last_second == Some(second) {
                    continue;
                }
                last_second = Some(second);
                heart_rate_points += 1;
                hr_csv.push_str(&format!("{start},{second},{bpm}\n"));
            }
        }
    }

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, text) in [("workout.csv", &workouts_csv), ("workout_hr.csv", &hr_csv)] {
        zip.start_file(name, options).map_err(zip_error)?;
        zip.write_all(text.as_bytes())?;
    }
    let bytes = zip.finish().map_err(zip_error)?.into_inner();
    Ok(UnstrapExport {
        bytes,
        workouts,
        heart_rate_points,
    })
}

/// 导出文件名：`zeppbridge-for-unstrap-<本地日期>.zip`。
pub fn export_file_name(today: chrono::NaiveDate) -> String {
    format!("zeppbridge-for-unstrap-{today}.zip")
}
