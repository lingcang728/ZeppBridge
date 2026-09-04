//! 只读读取契约。
//!
//! GUI、Local API、CLI 和 MCP 是同一份数据的四个出口。四个出口各自解释一遍
//! 「这个数字是什么单位」「没采到怎么表示」，迟早会给出四种说法，而用户和
//! 外部模型没有办法判断哪一种是对的。所以单位、时区、来源和缺失值的定义只
//! 写在这里一份，四个适配层都从这里取。
//!
//! 这份契约是对外承诺的一部分：改动它等于改动外部工具看到的语义，
//! 应当当作破坏性变更处理。

/// 契约版本。字段含义变了就要 bump；只是新增可选字段不需要。
pub const CONTRACT_VERSION: &str = "1";

/// 一次增量同步往回拉多少天。
///
/// 放在契约里而不是散在代码里，是因为它同时出现在三个地方：后端真正请求的
/// 窗口、界面上那句「正在同步最近 N 天」、以及两份架构文档。它从 7 改成 30
/// 之后，只有后端跟着改了，界面和文档还写着 7——用户看到的数字和程序做的
/// 事不是一回事，而这种漂移不会让任何测试变红。
///
/// **改这个值 = 改契约。** 界面从 `AppStatus.incremental_sync_days` 读它，
/// 不许再在前端写死一个数字。
pub const INCREMENTAL_SYNC_DAYS: i64 = 30;

/// 时间的表达方式。
pub const TIME_CONVENTION: &str = "所有时间戳都是 RFC 3339，带时区偏移。云端拉取时间（synced_at / fetched_at）与健康样本发生时间（start_time / timestamp）是两件事，任何情况下都不会互相替代。";

/// 缺失值的表达方式。这是本项目最重要的一条对外承诺。
pub const MISSING_VALUE_CONVENTION: &str = "没有采样就是缺失：字段为 null 或整段不存在。任何情况下都不会用 0、上一个值或估算值填空。一条曲线的点数少于时间跨度，说明那几天确实没有数据，不是丢了。";

/// 来源的表达方式。
pub const SOURCE_CONVENTION: &str = "source_scope 说明这条记录来自哪一层：device 是某块表上报的，user_fused 是 Zepp 云端跨设备合成的，unknown 是无法判断的——unknown 不会被归并进 device。";

/// 隐私边界。CLI `--help` 与 MCP 的服务器说明都用这一段。
pub const PRIVACY_NOTE: &str =
    "只读本机 SQLite，不联网、不监听端口、不返回凭据或本机绝对路径。数据全部留在本机。";

/// 一条指标的对外定义。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MetricContract {
    pub metric: &'static str,
    pub unit: &'static str,
    pub description: &'static str,
}

/// 可以按天取序列的指标。
///
/// 单位一律用机器可读的短串（`bpm`、`ml/kg/min`），中文说明单独放在
/// `description`，这样 MCP schema 里的单位不会因为语言而变。
pub const METRICS: [MetricContract; 27] = [
    // 饮食记录。来自 `/v2/users/me/events?eventType=Food`（无 subType）。
    // 字段名尚未在真实饮食数据上核对过，超出合理区间的读数会被丢弃。
    MetricContract {
        metric: "intake_calories",
        unit: "kcal",
        description: "当日饮食摄入热量。需要 Zepp 应用的饮食记录功能（中国大陆版没有）",
    },
    MetricContract {
        metric: "intake_protein_g",
        unit: "g",
        description: "当日蛋白质摄入。同上",
    },
    MetricContract {
        metric: "intake_fat_g",
        unit: "g",
        description: "当日脂肪摄入。同上",
    },
    MetricContract {
        metric: "intake_carbs_g",
        unit: "g",
        description: "当日碳水摄入。同上",
    },
    MetricContract {
        metric: "readiness",
        unit: "score",
        description: "综合准备度评分",
    },
    MetricContract {
        metric: "physical_readiness",
        unit: "score",
        description: "身体准备度评分",
    },
    MetricContract {
        metric: "mental_readiness",
        unit: "score",
        description: "精神准备度评分",
    },
    MetricContract {
        metric: "hybrid_charge",
        unit: "score",
        description: "综合能量评分",
    },
    MetricContract {
        metric: "physical_charge",
        unit: "score",
        description: "身体能量评分",
    },
    MetricContract {
        metric: "mental_charge",
        unit: "score",
        description: "精神能量评分",
    },
    MetricContract {
        metric: "stress",
        unit: "score",
        description: "压力评分，带当日实测最小/最大值",
    },
    MetricContract {
        metric: "respiratory_rate",
        unit: "breaths/min",
        description: "呼吸率，带当日实测最小/最大值",
    },
    MetricContract {
        metric: "resting_hr",
        unit: "bpm",
        description: "静息心率",
    },
    MetricContract {
        metric: "spo2_odi",
        unit: "events/h",
        description: "夜间血氧下降指数",
    },
    MetricContract {
        metric: "spo2_night_score",
        unit: "score",
        description: "夜间血氧评分",
    },
    MetricContract {
        metric: "spo2_measured_minutes",
        unit: "min",
        description: "夜间血氧实测时长",
    },
    MetricContract {
        metric: "spo2",
        unit: "%",
        description: "血氧饱和度单次读数，按天折叠",
    },
    MetricContract {
        metric: "training_load",
        unit: "load",
        description: "训练负荷",
    },
    MetricContract {
        metric: "vo2max",
        unit: "ml/kg/min",
        description: "最大摄氧量",
    },
    MetricContract {
        metric: "lactate_threshold_hr",
        unit: "bpm",
        description: "乳酸阈心率",
    },
    MetricContract {
        metric: "lactate_threshold_pace",
        unit: "s/km",
        description: "乳酸阈配速",
    },
    MetricContract {
        metric: "pai_daily",
        unit: "pai",
        description: "当日 PAI",
    },
    MetricContract {
        metric: "pai_low_zone",
        unit: "pai",
        description: "低强度区间 PAI",
    },
    MetricContract {
        metric: "pai_medium_zone",
        unit: "pai",
        description: "中强度区间 PAI",
    },
    MetricContract {
        metric: "pai_high_zone",
        unit: "pai",
        description: "高强度区间 PAI",
    },
    MetricContract {
        metric: "pai_total",
        unit: "pai",
        description: "七日 PAI 总量",
    },
    MetricContract {
        metric: "sleep_score",
        unit: "score",
        description: "睡眠评分",
    },
];

/// 指标名列表，供 MCP schema 的 enum 使用。
pub fn metric_names() -> Vec<&'static str> {
    METRICS.iter().map(|item| item.metric).collect()
}

pub fn unit_for(metric: &str) -> Option<&'static str> {
    METRICS
        .iter()
        .find(|item| item.metric == metric)
        .map(|item| item.unit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_metric_in_the_contract_is_uniquely_named() {
        let mut names = metric_names();
        let total = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), total, "契约里不能有重名指标");
    }

    #[test]
    fn the_missing_value_promise_stays_explicit() {
        // 这条承诺是产品硬约束，不是文案。改掉它等于改变对外语义，
        // 应当是一次有意的破坏性变更，而不是顺手改一句话。
        assert!(MISSING_VALUE_CONVENTION.contains("不会用 0"));
        assert!(!PRIVACY_NOTE.is_empty());
    }
}
