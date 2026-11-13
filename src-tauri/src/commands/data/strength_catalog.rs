//! 力量训练动作目录命令：本机缓存优先，过期才问 Zepp（`/sport/config/muscle`，带 `lang` + `cv`）。

use super::*;
use zeppbridge_core::decoder::strength_catalog::{
    catalog_cache_is_stale, parse_strength_catalog, read_catalog_cache, write_catalog_cache,
    zepp_lang_for_locale, StrengthCatalogAction, StrengthCatalogCache,
    STRENGTH_CATALOG_EXPORT_LANG, STRENGTH_CATALOG_FULL_MIN,
};

/// 同一时间只放一个拉取：运动详情来回切时不会叠出好几个相同请求。
static FETCH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, Serialize)]
pub struct StrengthCatalogResult {
    /// 实际用的 Zepp 语言码（`en_US`、`pt_BR`…）。
    pub lang: String,
    pub fetched_at: Option<String>,
    /// `fresh` = 缓存够新或刚拉到；`stale` = 拉不到、先用旧缓存；`unavailable` = 没有任何目录。
    pub status: String,
    pub actions: Vec<StrengthCatalogAction>,
}

/// 按界面语言取动作目录。拉不到时不报错，返回旧缓存或空目录——界面退回 `#编号`。
#[tauri::command]
pub async fn get_strength_catalog(
    state: tauri::State<'_, AppState>,
    locale: String,
) -> std::result::Result<StrengthCatalogResult, AppError> {
    let lang = zepp_lang_for_locale(&locale);
    let _guard = FETCH_LOCK.lock().await;
    let now = Utc::now();
    let mut cache = read_catalog_cache(&state.data_dir, lang);
    let mut status = "fresh";
    if catalog_cache_is_stale(cache.as_ref(), now) {
        match refresh_strength_catalog(&state, lang).await {
            Some(fresh) => cache = Some(fresh),
            None => {
                status = if cache.is_some() {
                    "stale"
                } else {
                    "unavailable"
                }
            }
        }
    }
    // 导出和 MCP 用英文名：界面不是英文时顺手把英文那份也备上（一个月一次）。
    if lang != STRENGTH_CATALOG_EXPORT_LANG
        && catalog_cache_is_stale(
            read_catalog_cache(&state.data_dir, STRENGTH_CATALOG_EXPORT_LANG).as_ref(),
            now,
        )
    {
        let _ = refresh_strength_catalog(&state, STRENGTH_CATALOG_EXPORT_LANG).await;
    }
    Ok(match cache {
        Some(cache) => StrengthCatalogResult {
            lang: cache.lang,
            fetched_at: Some(cache.fetched_at),
            status: status.to_string(),
            actions: cache.actions,
        },
        None => StrengthCatalogResult {
            lang: lang.to_string(),
            fetched_at: None,
            status: "unavailable".to_string(),
            actions: Vec::new(),
        },
    })
}

/// 拉一种语言并写缓存。没连旧连接器（只有官方授权、没有 apptoken）、网络失败、
/// 回了空目录都返回 `None`，调用方继续用旧缓存。
async fn refresh_strength_catalog(state: &AppState, lang: &str) -> Option<StrengthCatalogCache> {
    let auth = state.auth.load_auth().ok().flatten()?;
    let connector = ZeppConnector::new(auth).ok()?;
    let payload = match connector.fetch_strength_catalog(lang).await {
        Ok(payload) => payload,
        Err(error) => {
            crate::diagnostics::log(&format!(
                "力量动作目录这次没拉到（{lang}）：{}",
                error.code()
            ));
            return None;
        }
    };
    let actions = parse_strength_catalog(&payload);
    if actions.is_empty() {
        crate::diagnostics::log(&format!("力量动作目录为空（{lang}），沿用旧缓存"));
        return None;
    }
    let existing = read_catalog_cache(&state.data_dir, lang);
    // 服务端只回了老子集，而本机已有完整目录：不拿小的盖大的，只把时间往后推，
    // 一天后再试。
    let cache = match existing {
        Some(mut full)
            if actions.len() < STRENGTH_CATALOG_FULL_MIN
                && full.actions.len() >= STRENGTH_CATALOG_FULL_MIN =>
        {
            crate::diagnostics::log(&format!(
                "力量动作目录只回了 {} 条（{lang}），保留本机完整目录",
                actions.len()
            ));
            full.fetched_at = Utc::now().to_rfc3339();
            full
        }
        _ => StrengthCatalogCache {
            version: 1,
            lang: lang.to_string(),
            fetched_at: Utc::now().to_rfc3339(),
            actions,
        },
    };
    if let Err(error) = write_catalog_cache(&state.data_dir, &cache) {
        crate::diagnostics::log(&format!("力量动作目录缓存写入失败：{error}"));
    }
    Some(cache)
}
