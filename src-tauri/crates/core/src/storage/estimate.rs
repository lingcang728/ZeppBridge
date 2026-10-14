//! 存储空间估算（按流的每日体积、磁盘剩余）（从 storage/mod.rs 按领域拆出，逻辑不变）。

use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct CachedPayloadStats {
    pub(super) token: String,
    pub(super) streams: HashMap<String, (u64, i64)>,
}

pub(super) fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{bytes} B")
    }
}

pub(super) fn disk_free_bytes(path: &std::path::Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" {
            fn GetDiskFreeSpaceExW(
                directory: *const u16,
                free_bytes_available: *mut u64,
                total_bytes: *mut u64,
                total_free_bytes: *mut u64,
            ) -> i32;
        }
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let mut free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        (ok != 0).then_some(free)
    }
    // macOS / Linux 走 statvfs。
    //
    // 这里以前直接返回 None，于是每台 Mac 上 `free_bytes` 恒为 0，补拉估算永远
    // 只会说「未能读取磁盘剩余空间」——既给不出占用预估，`allow_long_history`
    // 也拿不到判断依据。README 里写着支持 macOS，这一条就不能只在 Windows 上成立。
    #[cfg(not(windows))]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let c_path = CString::new(path.as_os_str().as_bytes()).ok()?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } != 0 {
            return None;
        }
        // f_bavail 是**非特权用户**真正能用的块数；f_bfree 含保留给 root 的部分，
        // 拿它报给用户会偏大。f_frsize 为 0 的文件系统退回 f_bsize。
        let block = if stat.f_frsize > 0 {
            stat.f_frsize
        } else {
            stat.f_bsize
        };
        if block == 0 {
            return None;
        }
        // 中间走 u128。
        //
        // 这些字段的宽度随平台变：macOS 上 fsblkcnt_t 是 u32、c_ulong 是 u64，
        // Linux 上两个都是 u64。所以「转成 u64」这件事在一个平台上是必要的、
        // 在另一个平台上就是多余的——`as u64` 会被 unnecessary_cast 判错，
        // `u64::from` 会被 useless_conversion 判错，而 CI 是 `-D warnings`，
        // 两种写法都至少在一个平台上过不去。
        //
        // 转到 u128 则在任何平台上都是真实的加宽，没有哪条 lint 能说它多余；
        // 顺带把「块数乘块大小」可能溢出这件事也一并解决了。
        let free = u128::from(stat.f_bavail) * u128::from(block);
        u64::try_from(free).ok()
    }
}

impl Database {
    /// 每条流在本机的实际占用速率。
    ///
    /// 用本机已有的原始报文长度除以**这些报文覆盖的日历跨度**，而不是一个
    /// 写死的常数：「再补三年要多大」只有用这个人自己的数据算才有意义。
    ///
    /// 分母刻意不是「有多少个不同的抓取日期」。抓取是按月批量做的，一条
    /// `daily_summary` 报文可能覆盖整整一个月，于是一年的数据只落在十几个
    /// 抓取日上——拿 19 去除 1.5 GB，会得出「每天 76 MB」这种荒唐结论，
    /// 再乘一年就是 27 GB，足够把人吓得不敢补拉。真正的问题是「每天历史
    /// 占多少」，分母就该是这些报文覆盖的天数。
    ///
    /// 跨度不足 `MIN_OBSERVED_DAYS` 天的流标 `measured: false`，宁可说不知道，
    /// 也不拿一个从几天样本外推出来的速率去乘三年。
    pub(super) fn payload_stats_token(&self) -> Result<String> {
        let (count, max_id): (i64, i64) = self.conn.query_row(
            "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM raw_records",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let generation = self
            .get_app_meta(RAW_PAYLOAD_STATS_GEN_KEY)?
            .unwrap_or_else(|| "0".into());
        Ok(format!("{count}:{max_id}:{generation}"))
    }

    pub(super) fn compute_raw_payload_stats(
        &self,
    ) -> Result<std::collections::HashMap<String, (u64, i64)>> {
        let mut stmt = self.conn.prepare(
            // 占用要算**实际落盘**的那一份：压过的行按压缩后的字节数算，
            // 否则估算会按明文报价，用户看到的数字比真实占用大好几倍。
            "SELECT stream,
                    SUM(CASE
                          WHEN payload_zip IS NOT NULL AND LENGTH(payload_zip) > 0
                            THEN LENGTH(payload_zip)
                          ELSE LENGTH(CAST(payload AS BLOB))
                        END),
                    CAST(julianday(MAX(start_utc)) - julianday(MIN(start_utc)) AS INTEGER) + 1
             FROM raw_records
             GROUP BY stream",
        )?;
        let observed = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (
                        row.get::<_, i64>(1).unwrap_or(0).max(0) as u64,
                        row.get::<_, i64>(2).unwrap_or(0).max(0),
                    ),
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .collect();
        Ok(observed)
    }

    pub(super) fn raw_payload_stats_by_stream(
        &self,
    ) -> Result<std::collections::HashMap<String, (u64, i64)>> {
        let token = self.payload_stats_token()?;
        if let Ok(guard) = PAYLOAD_STATS_MEM.lock() {
            if let Some((cached_token, stats)) = guard.as_ref() {
                if cached_token == &token {
                    return Ok(stats.clone());
                }
            }
        }
        if let Some(value) = self.get_app_meta(RAW_PAYLOAD_STATS_KEY)? {
            if let Ok(cached) = serde_json::from_str::<CachedPayloadStats>(&value) {
                if cached.token == token {
                    if let Ok(mut guard) = PAYLOAD_STATS_MEM.lock() {
                        *guard = Some((cached.token.clone(), cached.streams.clone()));
                    }
                    return Ok(cached.streams);
                }
            }
        }
        let computed = self.compute_raw_payload_stats()?;
        if let Ok(mut guard) = PAYLOAD_STATS_MEM.lock() {
            *guard = Some((token, computed.clone()));
        }
        Ok(computed)
    }

    pub(super) fn persist_raw_payload_stats(&self) -> Result<()> {
        let token = self.payload_stats_token()?;
        let streams = self.compute_raw_payload_stats()?;
        let encoded = serde_json::to_string(&CachedPayloadStats {
            token: token.clone(),
            streams: streams.clone(),
        })
        .unwrap_or_else(|_| "{}".into());
        self.set_app_meta(RAW_PAYLOAD_STATS_KEY, &encoded)?;
        if let Ok(mut guard) = PAYLOAD_STATS_MEM.lock() {
            *guard = Some((token, streams));
        }
        Ok(())
    }

    pub(super) fn bump_payload_stats_generation(&self) -> Result<()> {
        let next = self
            .get_app_meta(RAW_PAYLOAD_STATS_GEN_KEY)?
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0)
            .saturating_add(1);
        self.set_app_meta(RAW_PAYLOAD_STATS_GEN_KEY, &next.to_string())?;
        if let Ok(mut guard) = PAYLOAD_STATS_MEM.lock() {
            *guard = None;
        }
        Ok(())
    }

    pub(super) fn stream_storage_rates(&self, days: i64) -> Result<Vec<StreamStorageEstimate>> {
        let observed = self.raw_payload_stats_by_stream()?;

        Ok(coverage::BACKFILL_STREAMS
            .iter()
            .map(|stream| {
                let (bytes, observed_days) = observed.get(*stream).copied().unwrap_or((0, 0));
                let measured = observed_days >= MIN_OBSERVED_DAYS;
                let bytes_per_day = if measured {
                    bytes / observed_days.max(1) as u64
                } else {
                    0
                };
                StreamStorageEstimate {
                    stream: (*stream).to_string(),
                    observed_days,
                    observed_bytes: bytes,
                    bytes_per_day,
                    measured,
                    estimated_add_bytes: bytes_per_day.saturating_mul(days.max(0) as u64),
                }
            })
            .collect())
    }

    pub fn storage_estimate(
        &self,
        days: i64,
        data_dir: &std::path::Path,
    ) -> Result<StorageEstimate> {
        // 这里用补拉的取值范围（最长十年），而不是保留期的 1–365；
        // 「补三年要多大」是这个估算存在的主要原因。
        let days = UserPrefs::clamp_history_days(days).map_err(ZeppBridgeError::ConfigError)?;
        let database_bytes = std::fs::metadata(data_dir.join("zepp.db"))
            .map(|meta| meta.len())
            .unwrap_or(0);

        let streams = self.stream_storage_rates(days)?;
        let measured_bytes: u64 = streams
            .iter()
            .map(|stream| stream.estimated_add_bytes)
            .sum();
        let observed_bytes: u64 = streams.iter().map(|stream| stream.observed_bytes).sum();
        let any_measured = streams.iter().any(|stream| stream.measured);
        let all_measured = streams.iter().all(|stream| stream.measured);

        // 库比原始报文大：还有 canonical 行、索引和 WAL。用本机实测的比例
        // 放大，而不是再猜一个系数；比例只在合理区间内取用。
        let overhead = if observed_bytes > 0 && database_bytes > observed_bytes {
            ((database_bytes as f64) / (observed_bytes as f64)).clamp(1.0, 4.0)
        } else {
            1.0
        };
        let estimated_add_bytes = if any_measured {
            ((measured_bytes as f64) * overhead) as u64
        } else {
            (days as u64).saturating_mul(BYTES_PER_HISTORY_DAY)
        };

        let free_bytes = disk_free_bytes(data_dir).unwrap_or(0);
        // 留一点余量：刚好填满磁盘和放不下一样糟糕。
        let needed_bytes = estimated_add_bytes.saturating_add(SPACE_SAFETY_MARGIN_BYTES);
        let stop_reason = if free_bytes > 0 && needed_bytes > free_bytes {
            Some(format!(
                "这次补拉预计需要 {}（含安全余量），本盘只剩 {}，不会开始。请先腾出空间或缩短范围。",
                format_bytes(needed_bytes),
                format_bytes(free_bytes)
            ))
        } else {
            None
        };
        let stop_reason_code = stop_reason
            .as_ref()
            .map(|_| "ui.estimate.stop_no_space".to_string());

        let warn_tight_space =
            free_bytes < 1_073_741_824 || (free_bytes > 0 && estimated_add_bytes > free_bytes / 5);
        let allow_long_history = stop_reason.is_none()
            && !(free_bytes > 0 && free_bytes < 300 * 1024 * 1024 && days >= 90);
        // 码和中文原文一起给：界面按码排自己的句子（天数和字节它都有），
        // 取不到码才回落到这句中文。
        let (message_code, message) = if let Some(reason) = &stop_reason {
            ("ui.estimate.stop_no_space", reason.clone())
        } else if free_bytes == 0 {
            (
                "ui.estimate.disk_unknown",
                "未能读取磁盘剩余空间，补拉前请确认本机还有足够空间。".to_string(),
            )
        } else if !allow_long_history {
            (
                "ui.estimate.disk_too_small",
                "磁盘剩余不足 300 MB，不能补拉 90 天以上的历史。".to_string(),
            )
        } else if !any_measured {
            (
                "ui.estimate.builtin_guess",
                format!(
                    "本机样本还不够，用的是内置粗略估算：{} 天大约占用 {}，本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        } else if all_measured {
            (
                "ui.estimate.measured",
                format!(
                    "按本机已有数据的实际速率推算，{} 天大约占用 {}，本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        } else {
            (
                "ui.estimate.partial",
                format!(
                    "只按本机已有样本的那几条流推算，{} 天大约占用 {}（其余流样本不足，未计入），本盘剩余 {}。",
                    days,
                    format_bytes(estimated_add_bytes),
                    format_bytes(free_bytes)
                ),
            )
        };

        Ok(StorageEstimate {
            free_bytes,
            estimated_add_bytes,
            database_bytes,
            allow_long_history,
            warn_tight_space,
            message,
            message_code: message_code.to_string(),
            needed_bytes,
            requested_days: days,
            streams,
            measured: all_measured,
            stop_reason,
            stop_reason_code,
        })
    }
}
