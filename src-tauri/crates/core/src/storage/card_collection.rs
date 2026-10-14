//! 收集箱（精修批次 7.3）：用户从指标卡 / 「你的过去」里挑出来、准备交给 AI 的「指标 × 天」。
//!
//! 只是界面状态，但要重启还在，所以放 `app_meta` 的一个键里（一份 JSON）。不碰健康数据本身；
//! 交给 AI 之后界面会把它清空。写入照例先拿跨进程写锁（调用方用 `with_write`）。

use super::*;
use crate::ai_tasks::AiTaskCategory;

const CARD_COLLECTION_KEY: &str = "ui.card_collection";
/// 收集箱最多放多少张：六个月的牌挑满两三项也够，再多就是误操作。
pub const MAX_CARD_PICKS: usize = 800;

/// 收集箱里的一张牌：哪一项（指标名，或 `cat:<类别>` 表示整类）、属于哪一类、哪一天。
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CardPick {
    pub key: String,
    pub category: AiTaskCategory,
    pub date: String,
}

impl Database {
    /// 收集箱里现在有哪些牌。没存过或存坏了都当空的（这只是界面状态，不值得为它报错）。
    pub fn card_collection(&self) -> Result<Vec<CardPick>> {
        Ok(self
            .get_app_meta(CARD_COLLECTION_KEY)?
            .and_then(|text| serde_json::from_str::<Vec<CardPick>>(&text).ok())
            .unwrap_or_default())
    }

    /// 整份替换收集箱。日期必须是 `YYYY-MM-DD`，重复的只留一张，按（项, 天）排好。
    pub fn set_card_collection(&self, picks: &[CardPick]) -> Result<Vec<CardPick>> {
        if picks.len() > MAX_CARD_PICKS {
            return Err(ZeppBridgeError::ConfigError("收集箱里的牌太多了".into()));
        }
        let mut clean = BTreeSet::new();
        for pick in picks {
            let date = NaiveDate::parse_from_str(pick.date.trim(), "%Y-%m-%d")
                .map_err(|_| ZeppBridgeError::ConfigError("收集箱里的日期无效".into()))?;
            let key = pick.key.trim();
            if key.is_empty() || key.chars().count() > 64 {
                return Err(ZeppBridgeError::ConfigError("收集箱里的指标名无效".into()));
            }
            clean.insert(CardPick {
                key: key.to_string(),
                category: pick.category,
                date: date.to_string(),
            });
        }
        let picks: Vec<CardPick> = clean.into_iter().collect();
        let encoded = serde_json::to_string(&picks)
            .map_err(|error| ZeppBridgeError::ParseError(error.to_string()))?;
        self.set_app_meta(CARD_COLLECTION_KEY, &encoded)?;
        Ok(picks)
    }
}
