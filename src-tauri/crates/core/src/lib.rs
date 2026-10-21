//! ZeppBridge 共享核心。
//!
//! 桌面应用（Tauri）、命令行、MCP server 和本机 REST API 都只是这层的适配器：
//! 数据模型、SQLite schema 与迁移、归一化、查询语义、导出、洞察和写入协调全部
//! 只在这里实现一次，任何出口都不得复制 SQL、单位换算或缺失值规则。

pub mod access;
pub mod ai_tasks;
pub mod auth;
pub mod connectors;
pub mod contract;
pub mod decoder;
pub mod device_catalog;
pub mod event_days;
pub mod export_fit;
pub mod export_formats;
pub mod fetcher;
pub mod insight;
pub mod letters;
pub mod local_api;
pub mod models;
pub mod normalizer;
pub mod official;
pub mod paths;
pub mod redact;
pub mod sport_catalog;
pub mod sync;
pub mod training_plan;
pub mod workout_climbs;

pub mod storage;

/// 临时文件、临时目录名的唯一后缀：纳秒时间戳 + 进程内序号。进程号由调用方另外带上。
///
/// 只用时间戳不够：macOS 的系统时钟只精确到微秒，两个并行测试在同一微秒里拿到同一个名字，
/// `create_dir` 报 AlreadyExists（3.0.6 的 `fit_override` 测试在 macOS CI 上就这么挂的，
/// 7350d07c 修过同一类）。写盘的临时文件同理：同一进程两个线程撞名会互相覆盖半截内容。
/// 序号让同一进程里永不重复，时间戳让前一次运行留下的同名残留几乎不可能撞上。
pub fn unique_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    format!("{nanos}-{}", NEXT.fetch_add(1, Ordering::Relaxed))
}
