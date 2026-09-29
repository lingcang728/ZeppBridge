//! 按时间块同步一条流：从最新一块往回拉，**每块拉到就落库并通知界面**。
//!
//! 以前心率、每日概览、睡眠都是整段时间窗拉完才写库、才发 `stream_completed`，
//! 首页于是要等到这一步的最后一块才动——而最新的数据恰好在最后一块。现在块从新
//! 到旧排，每块落库后回调一次，首页的最新心率、今天步数、昨晚睡眠在第一块落库时
//! 就能出来。
//!
//! 失败语义与原来的切片归并（`fetcher::pages::conclude_slices`）一致：取消与需要
//! 重新登录立刻返回；一块都没拿到就把错误交还调用方；拿到了一部分，这条流按
//! 未完成记（已写入的保留，但不报成功）。

use super::*;
use std::future::Future;

/// 某一块抓取失败后，后面更早的块还拉不拉。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OnChunkError {
    /// 继续拉更早的块（睡眠、每日概览：一块坏了不该连累别的夜晚 / 日子）。
    Continue,
    /// 除「这一块不可用」外的错误就停下（心率：原来就是网络错误立即中止，
    /// 不在断网时把每一块都重试一遍）。
    StopUnlessUnavailable,
}

impl SyncManager {
    pub(super) async fn sync_chunked_stream<F, Fut>(
        &self,
        stream: &str,
        window: FetchWindow,
        chunk_days: i64,
        on_error: OnChunkError,
        mut fetch: F,
        mut on_commit: impl FnMut(),
    ) -> Result<StreamReport>
    where
        F: FnMut(FetchWindow) -> Fut,
        Fut: Future<Output = Result<Vec<FetchedRecord>>>,
    {
        let mut reports = Vec::new();
        let mut reasons = std::collections::BTreeSet::new();
        let mut last_error: Option<ZeppBridgeError> = None;
        for chunk in window.chunks_newest_first(chunk_days) {
            self.abort_if_cancelled()?;
            match fetch(chunk).await {
                Ok(records) => {
                    for record in records.iter().filter(|record| record.incomplete) {
                        reasons.insert(
                            record
                                .incomplete_reason
                                .clone()
                                .unwrap_or_else(|| partial_window_reason().1),
                        );
                    }
                    let db = self.write_db().await?;
                    for record in records {
                        reports.push(Self::persist_record(&db, record)?.report);
                    }
                    drop(db);
                    on_commit();
                }
                Err(error) if error.is_cancelled() || error.needs_reauth() => return Err(error),
                Err(error) => {
                    let stop =
                        on_error == OnChunkError::StopUnlessUnavailable && !error.is_unavailable();
                    // 别让后面一块的 404 把前面真正的请求失败降级成「不可用」。
                    if !error.is_unavailable() || last_error.is_none() {
                        last_error = Some(error);
                    }
                    if stop {
                        break;
                    }
                }
            }
        }
        if reports.is_empty() {
            return Err(last_error.unwrap_or_else(|| {
                ZeppBridgeError::Unavailable(format!("{stream} 窗口没有可识别记录"))
            }));
        }
        if let Some(error) = last_error {
            reasons.insert(error.to_string());
        }
        let incomplete =
            (!reasons.is_empty()).then(|| reasons.into_iter().collect::<Vec<_>>().join("; "));
        let db = self.write_db().await?;
        Self::finish_stream(&db, stream, &reports, incomplete)
    }
}
