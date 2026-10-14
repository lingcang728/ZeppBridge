//! 参数与输出：--json 开关、统一的成功 / 失败输出、打印契约（从 main.rs 拆出，逻辑不变）。

use super::*;

pub(super) struct Flags {
    pub(super) values: Vec<(String, Option<String>)>,
}

impl Flags {
    pub(super) fn parse(args: &[String]) -> Result<Self, String> {
        let mut values = Vec::new();
        let mut index = 0;
        while index < args.len() {
            let arg = &args[index];
            let Some(name) = arg.strip_prefix("--") else {
                return Err(format!("Unexpected argument: {arg}"));
            };
            if let Some((key, value)) = name.split_once('=') {
                values.push((key.to_string(), Some(value.to_string())));
                index += 1;
                continue;
            }
            let next = args.get(index + 1);
            match next {
                Some(value) if !value.starts_with("--") => {
                    values.push((name.to_string(), Some(value.clone())));
                    index += 2;
                }
                _ => {
                    values.push((name.to_string(), None));
                    index += 1;
                }
            }
        }
        Ok(Self { values })
    }

    pub(super) fn get(&self, key: &str) -> Option<&str> {
        self.values
            .iter()
            .find(|(name, _)| name == key)
            .and_then(|(_, value)| value.as_deref())
    }

    pub(super) fn has(&self, key: &str) -> bool {
        self.values.iter().any(|(name, _)| name == key)
    }

    /// 未知开关一律报错。静默忽略拼错的开关，会让 `--form json` 悄悄跑出
    /// 一个默认格式的结果，而调度脚本毫无察觉。
    pub(super) fn reject_unknown(&self, known: &[&str]) -> Result<(), String> {
        for (name, _) in &self.values {
            if !known.contains(&name.as_str()) {
                return Err(format!("Unknown option: --{name}"));
            }
        }
        Ok(())
    }

    /// 重复的开关一律报错，而不是悄悄用第一个出现的那个。
    ///
    /// `--mode incremental --mode history` 静默选中 `incremental`：脚本拼接
    /// 命令行、在末尾追加覆盖参数时，很容易以为后面那个才是生效的。
    pub(super) fn reject_duplicates(&self) -> Result<(), String> {
        let mut seen = BTreeSet::new();
        for (name, _) in &self.values {
            if !seen.insert(name.as_str()) {
                return Err(format!("--{name} must not be repeated"));
            }
        }
        Ok(())
    }
}

/// `--json` 的值要在参数真正解析成功之前就知道：解析或校验本身失败时，
/// 错误也要按调用方要的格式吐出来（`--json` 一旦失效，机器可读输出的契约
/// 就没有意义了），不能因为解析失败就悄悄退回人读文本。
pub(super) fn scan_json_flag(args: &[String]) -> bool {
    args.iter()
        .any(|arg| arg == "--json" || arg.starts_with("--json="))
}

/* ------------------------------ 输出 ------------------------------ */

pub(super) fn emit(json_mode: bool, value: serde_json::Value, human: &str) {
    if json_mode {
        println!(
            "{}",
            serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".into())
        );
    } else {
        println!("{human}");
    }
}

pub(super) fn fail(json_mode: bool, code: u8, kind: &str, message: &str) -> u8 {
    if json_mode {
        println!(
            "{}",
            serde_json::json!({ "ok": false, "errorKind": kind, "message": message })
        );
    } else {
        eprintln!("{message}");
    }
    code
}

pub(super) fn print_contract() {
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "contractVersion": contract::CONTRACT_VERSION,
            "time": contract::TIME_CONVENTION,
            "missingValues": contract::MISSING_VALUE_CONVENTION,
            "source": contract::SOURCE_CONVENTION,
            "privacy": contract::PRIVACY_NOTE,
            "metrics": contract::METRICS.iter().map(|item| serde_json::json!({
                "metric": item.metric,
                "unit": item.unit,
                "description": item.description,
            })).collect::<Vec<_>>(),
        }))
        .unwrap_or_default()
    );
}
