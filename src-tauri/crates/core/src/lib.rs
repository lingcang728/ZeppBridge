//! ZeppBridge 共享核心。
//!
//! 桌面应用（Tauri）、命令行、MCP server 和本机 REST API 都只是这层的适配器：
//! 数据模型、SQLite schema 与迁移、归一化、查询语义、导出、洞察和写入协调全部
//! 只在这里实现一次，任何出口都不得复制 SQL、单位换算或缺失值规则。

pub mod auth;
pub mod connectors;
pub mod contract;
pub mod decoder;
pub mod device_catalog;
pub mod export_fit;
pub mod export_formats;
pub mod fetcher;
pub mod insight;
pub mod local_api;
pub mod models;
pub mod normalizer;
pub mod paths;
pub mod sport_catalog;
pub mod sync;

pub mod storage;
