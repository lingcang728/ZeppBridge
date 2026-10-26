//! Strava 的「下载你的数据」整包（zip）：`activities.csv` 是目录，`activities/` 下是每次活动的
//! 原始文件（`.fit` / `.gpx` / `.tcx`，常带 `.gz`）。
//!
//! 类型和名字以 CSV 为准（那是用户在 Strava 里改过的）；CSV 里没有文件的条目是手动补录的，
//! 只有一行汇总、没有时间轴，算进 `unreadable`，不硬造。CSV 缺了（老格式）就把
//! `activities/` 下的文件挨个读，类型取文件自己写的。

use std::io::{Read, Seek};

use flate2::read::GzDecoder;

use super::gpx::{parse_gpx, parse_tcx};
use super::{activity_from_fit, text_sport, ParsedActivity, ParsedFile, MAX_IMPORT_FILE_BYTES};

/// 读整个 Strava 导出包。
pub fn parse_strava_archive<R: Read + Seek>(reader: R) -> Option<ParsedFile> {
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    let csv = entry_name(&mut archive, |name| name == "activities.csv")
        .and_then(|name| read_entry(&mut archive, &name))
        .and_then(|bytes| String::from_utf8(bytes).ok());
    let mut file = ParsedFile::default();
    match csv.map(|text| parse_csv(&text)) {
        Some(rows) if rows.len() > 1 => {
            let header = &rows[0];
            let column = |name: &str| header.iter().position(|h| h.trim() == name);
            let (Some(file_col), type_col, name_col) = (
                column("Filename"),
                column("Activity Type"),
                column("Activity Name"),
            ) else {
                return None;
            };
            for row in &rows[1..] {
                let Some(path) = row
                    .get(file_col)
                    .map(|p| p.trim())
                    .filter(|p| !p.is_empty())
                else {
                    file.unreadable += 1;
                    continue;
                };
                let hint = type_col
                    .and_then(|i| row.get(i))
                    .map(|kind| text_sport(kind))
                    .filter(|kind| *kind != "activity");
                let name = name_col.and_then(|i| row.get(i)).cloned();
                let one = read_entry(&mut archive, path)
                    .map(|bytes| parse_activity_file(path, &bytes, hint))
                    .unwrap_or_else(|| ParsedFile {
                        activities: Vec::new(),
                        unreadable: 1,
                    });
                file.unreadable += one.unreadable;
                file.activities
                    .extend(one.activities.into_iter().map(|mut activity| {
                        activity.name = activity
                            .name
                            .or_else(|| name.clone().filter(|n| !n.is_empty()));
                        activity
                    }));
            }
        }
        _ => {
            let names: Vec<String> = (0..archive.len())
                .filter_map(|i| {
                    archive
                        .by_index(i)
                        .ok()
                        .map(|entry| entry.name().to_string())
                })
                .filter(|name| name.starts_with("activities/") && !name.ends_with('/'))
                .collect();
            for name in names {
                match read_entry(&mut archive, &name) {
                    Some(bytes) => {
                        let one = parse_activity_file(&name, &bytes, None);
                        file.unreadable += one.unreadable;
                        file.activities.extend(one.activities);
                    }
                    None => file.unreadable += 1,
                }
            }
        }
    }
    Some(file)
}

/// 按文件名读一份活动文件（`.fit` / `.gpx` / `.tcx`，可带 `.gz`）。
pub fn parse_activity_file(name: &str, bytes: &[u8], hint: Option<&str>) -> ParsedFile {
    let lower = name.to_ascii_lowercase();
    let (stem, bytes) = match lower.strip_suffix(".gz") {
        Some(stem) => {
            let mut out = Vec::new();
            let ok = GzDecoder::new(bytes)
                .take(MAX_IMPORT_FILE_BYTES)
                .read_to_end(&mut out)
                .is_ok();
            if !ok {
                return ParsedFile {
                    activities: Vec::new(),
                    unreadable: 1,
                };
            }
            (stem.to_string(), out)
        }
        None => (lower.clone(), bytes.to_vec()),
    };
    let one = |activity: Option<ParsedActivity>| match activity {
        Some(activity) => ParsedFile {
            activities: vec![activity],
            unreadable: 0,
        },
        None => ParsedFile {
            activities: Vec::new(),
            unreadable: 1,
        },
    };
    if stem.ends_with(".fit") {
        return one(activity_from_fit(&bytes).map(|mut activity| {
            if let Some(hint) = hint {
                activity.sport = hint.to_string();
            }
            activity
        }));
    }
    let Ok(text) = String::from_utf8(bytes) else {
        return ParsedFile {
            activities: Vec::new(),
            unreadable: 1,
        };
    };
    if stem.ends_with(".gpx") {
        parse_gpx(&text, hint)
    } else if stem.ends_with(".tcx") {
        // Strava 导出的 TCX 开头常有一段空白，XML 声明前也算。
        parse_tcx(text.trim_start(), hint)
    } else {
        ParsedFile {
            activities: Vec::new(),
            unreadable: 1,
        }
    }
}

fn entry_name<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    matches: impl Fn(&str) -> bool,
) -> Option<String> {
    (0..archive.len()).find_map(|i| {
        let entry = archive.by_index(i).ok()?;
        let name = entry.name().to_string();
        let tail = name.rsplit('/').next().unwrap_or(&name).to_string();
        // 有的解压再打包工具会多套一层目录。
        (matches(&name) || matches(&tail)).then_some(name)
    })
}

fn read_entry<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Option<Vec<u8>> {
    let name = if archive.index_for_name(name).is_some() {
        name.to_string()
    } else {
        // CSV 里的路径不带外层目录，包里却有。
        entry_name(archive, |candidate| candidate.ends_with(name))?
    };
    let entry = archive.by_name(&name).ok()?;
    if entry.size() > MAX_IMPORT_FILE_BYTES {
        return None;
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(MAX_IMPORT_FILE_BYTES)
        .read_to_end(&mut bytes)
        .ok()?;
    Some(bytes)
}

/// RFC 4180 的 CSV：引号里的逗号、换行、两个引号转义一个引号。
pub(crate) fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            ('"', true) => quoted = false,
            ('"', false) if field.is_empty() => quoted = true,
            (',', false) => row.push(std::mem::take(&mut field)),
            ('\r', false) => {}
            ('\n', false) => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}
