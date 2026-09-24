//! BETA1 A7-P1/P2 的数据结构。字段名两侧一律 snake_case，是对外契约。
//!
//! 关键边界：
//! - [`AiTaskAttachmentRef`] 是**存库形态**，带本机 `path`；它只能留在本机。
//! - [`AiTaskAttachmentPublicRef`] 是**出仓形态**——导出 JSON 和 MCP 输出里
//!   允许出现的唯一附件引用，类型上就不存在 `path` 字段。
//! - 预览/准备结果里的 `AiTaskIssue` 是「状态不是异常」：走 `ui.ai_task.*`
//!   码，真正的 `Err` 才用 `err.ai_task.*`（P3 补充规则）。

use serde::{Deserialize, Serialize};

/// 任务/模板载荷的 schema 版本。payload JSON 与 `schema_version` 字段一致。
pub const AI_TASK_SCHEMA_VERSION: i64 = 1;

fn default_schema_version() -> i64 {
    AI_TASK_SCHEMA_VERSION
}

fn default_days_before() -> i64 {
    14
}

fn default_true() -> bool {
    true
}

/// 分析任务覆盖的数据类别。`personal_note` / `attachment` 是任务级内容，
/// 不参与「按运动开始日回溯」的窗口数据取数。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskCategory {
    Workout,
    Sleep,
    Recovery,
    HeartRate,
    Training,
    Body,
    PersonalNote,
    Attachment,
}

impl AiTaskCategory {
    /// 这个类别要不要按运动窗口取数。
    ///
    /// `personal_note` / `attachment` 不产窗口：前者是用户写的一段话，
    /// 后者是用户挑的文件，都没有「某个日期范围内有没有数据」这回事。
    pub fn is_windowed(self) -> bool {
        !matches!(self, Self::PersonalNote | Self::Attachment)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskDetailLevel {
    Summary,
    #[default]
    Standard,
    /// detailed 才附逐点序列（workout_samples / 轨迹）。
    Detailed,
}

/// 一个类别的窗口设置：`[运动本地开始日 - days_before, 运动开始日]`
/// （`include_workout_day=false` 时右端为前一日）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskCategoryRange {
    pub category: AiTaskCategory,
    #[serde(default)]
    pub enabled: bool,
    /// 每次运动独立按其开始日回溯。默认 14。
    #[serde(default = "default_days_before")]
    pub days_before: i64,
    /// 默认 true。
    #[serde(default = "default_true")]
    pub include_workout_day: bool,
    /// 用户在关系网里单独拖出去的指标名（指标类类别）或字段名
    /// （运动/睡眠类别，取 `units` 里的键）。导出时跳过它们；
    /// 覆盖统计 `metric_days` 仍然给出它们的天数，界面才能显示「拖回来会有多少」。
    #[serde(default)]
    pub excluded_metrics: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskAttachmentKind {
    Pdf,
    Image,
}

/// 存库形态的附件引用。`path` 是本机绝对路径——**只在 sqlite 与 stat 之间
/// 流动**，任何导出 JSON / MCP 输出都不得包含它。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskAttachmentRef {
    pub id: String,
    /// 本机路径。出仓前必须经 [`AiTaskAttachmentPublicRef::from`] 换形态。
    pub path: String,
    pub display_name: String,
    pub kind: AiTaskAttachmentKind,
    /// 加入时记下的大小，preview/prepare 拿它当基线判断 `changed`。
    /// `None` 表示加入时没记录（老数据或手填），无法判断变化。
    #[serde(default)]
    pub byte_len: Option<i64>,
    pub added_at: String,
}

/// 出仓形态的附件引用：展示名、类型、大小。类型上没有 `path`，
/// 所以「构造干净数据再脱敏」这条老路在这里连走错的机会都没有。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskAttachmentPublicRef {
    pub display_name: String,
    pub kind: AiTaskAttachmentKind,
    #[serde(default)]
    pub byte_len: Option<i64>,
}

impl From<&AiTaskAttachmentRef> for AiTaskAttachmentPublicRef {
    fn from(reference: &AiTaskAttachmentRef) -> Self {
        Self {
            display_name: reference.display_name.clone(),
            kind: reference.kind,
            byte_len: reference.byte_len,
        }
    }
}

/// P1：分析任务。`created_at`/`updated_at` 由后端写，前端发来什么都会被覆盖。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTask {
    #[serde(default = "default_schema_version")]
    pub schema_version: i64,
    /// 空 id 表示未保存的草稿——`ai_task_save` 会分配 `task-*` 新 id。
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub template_id: Option<String>,
    /// 1..N，允许为空（尚未选择）。
    #[serde(default)]
    pub workout_ids: Vec<String>,
    #[serde(default)]
    pub categories: Vec<AiTaskCategoryRange>,
    #[serde(default)]
    pub detail_level: AiTaskDetailLevel,
    /// 用户可编辑的提示词；模板只提供初稿。
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub personal_note: String,
    #[serde(default)]
    pub attachments: Vec<AiTaskAttachmentRef>,
    /// 默认 false。`false` 时导出不含逐点轨迹。
    #[serde(default)]
    pub include_precise_gps: bool,
    /// 默认 false；true = 开放给任务限定 MCP（S5 消费）。
    #[serde(default)]
    pub mcp_shared: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// P1：任务模板。内置模板只读，只能另存为用户模板；
/// 模板**不**保存 workout_ids / attachments / 数据快照。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskTemplate {
    #[serde(default = "default_schema_version")]
    pub schema_version: i64,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default)]
    pub name: String,
    /// 内置模板用 `ui.ai_template.<id>.name` 取文案；用户模板为 null。
    #[serde(default)]
    pub name_code: Option<String>,
    #[serde(default)]
    pub categories: Vec<AiTaskCategoryRange>,
    #[serde(default)]
    pub detail_level: AiTaskDetailLevel,
    /// 内置模板这里是中文兜底；界面按 `prompt_code` 取本地化文本。
    #[serde(default)]
    pub prompt_template: String,
    #[serde(default)]
    pub prompt_code: Option<String>,
    /// 声明式提示：默认要哪些汇总字段、哪些序列必须有数据。
    /// Beta1 尚无消费方，先存起来给 W3+ 的校验/提示用。
    #[serde(default)]
    pub default_summaries: Vec<String>,
    #[serde(default)]
    pub required_series: Vec<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// P3 `ai_task_list` 的返回行——从索引列直接出，不解析 payload。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskSummary {
    pub id: String,
    pub title: String,
    pub template_id: Option<String>,
    pub workout_count: i64,
    pub updated_at: String,
    pub mcp_shared: bool,
}

/// P2：一个类别在一个窗口里的覆盖事实。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskCoverage {
    pub category: AiTaskCategory,
    /// 每次运动一行；类别有多个运动窗口时另加一行 `null` 的合并视图
    /// （窗口并集、日期去重后的总数）。任务没有关联运动时窗口锚在今天，
    /// 唯一一行也是 `null`。
    pub workout_id: Option<String>,
    /// 本地日 `YYYY-MM-DD`，含端点。
    pub start_date: String,
    pub end_date: String,
    pub days_in_range: i64,
    pub days_with_data: i64,
    /// 命中的 `source_scope` 值（`user_fused` / `device` / `unknown`）。
    pub sources: Vec<String>,
    /// 该类别会查的指标→单位映射（对 workout/sleep 是固定字段单位）。
    pub units: std::collections::BTreeMap<String, String>,
    /// 逐指标（或逐字段）有数据的天数，含被排除的指标。
    #[serde(default)]
    pub metric_days: std::collections::BTreeMap<String, i64>,
    /// 窗口内一天数据都没有。
    pub missing: bool,
}

/// 预览里列给前端的运动摘要。比 [`crate::models::Workout`] 瘦：
/// 没有 `device_id` 这类身份字段，也没有与交接无关的内部列。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskWorkoutBrief {
    pub workout_id: String,
    /// `effective_type`：用户改过的名字优先于归一化类型。
    pub workout_type: String,
    /// RFC3339 UTC。
    pub start_time: String,
    pub end_time: String,
    /// 本地开始日——窗口锚点（P4）。
    pub start_date: String,
    pub distance_meters: Option<f64>,
    pub calories: Option<i32>,
    pub avg_hr: Option<i32>,
    pub max_hr: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskAttachmentState {
    Ok,
    Missing,
    Changed,
}

/// P2：一个附件当前能不能用。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskAttachmentStatus {
    pub id: String,
    pub status: AiTaskAttachmentState,
    /// 当前实测大小；文件不存在时是 `null`。
    pub byte_len: Option<i64>,
}

/// `warnings` / `blocked` 的元素：状态不是异常，所以走 `ui.ai_task.*` 码。
/// `params` 给界面排版用的数字/名字，不含路径与身份键。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskIssue {
    pub code: String,
    /// 中文兜底文案。
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl AiTaskIssue {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            params: None,
        }
    }

    pub fn with_params(mut self, params: serde_json::Value) -> Self {
        self.params = Some(params);
        self
    }
}

/// P2：预览结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskPreview {
    /// 草稿（未保存）时是 `"draft"`。
    pub task_id: String,
    pub workouts: Vec<AiTaskWorkoutBrief>,
    pub coverage: Vec<AiTaskCoverage>,
    pub attachments: Vec<AiTaskAttachmentStatus>,
    /// 会写出的 `health-context.json` 的 UTF-8 字节数估算（构建同一文档实测）。
    pub estimated_bytes: i64,
    pub warnings: Vec<AiTaskIssue>,
}

/// P2：准备结果。`status=blocked` 时不写任何文件，`json_path`/`prompt_path`
/// 为 `null`。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskPrepareResult {
    pub status: AiTaskPrepareStatus,
    pub task_id: String,
    pub output_dir: String,
    pub json_path: Option<String>,
    pub prompt_path: Option<String>,
    /// 后端拼装：用户/模板提示词 + 前端本地化好的覆盖说明段（verbatim）。
    /// blocked 时也会带上，前端可以直接拿去显示。
    pub prompt_text: String,
    /// `health-context.json` 的字节数；blocked 时为 0。
    pub byte_len: i64,
    /// 复制进 `<output_dir>/attachments/` 的附件原件个数。
    #[serde(default)]
    pub copied_attachments: i64,
    pub attachments: Vec<AiTaskAttachmentStatus>,
    pub blocked: Vec<AiTaskIssue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskPrepareStatus {
    Ready,
    Blocked,
}

/// P3 `ai_task_attachment_stat` 的行。`path` 在这里合法——这是本机 UI
/// 在核对用户给的文件，不是出仓数据。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiTaskAttachmentStat {
    pub path: String,
    pub exists: bool,
    pub byte_len: Option<i64>,
    /// RFC3339；文件不存在时是 `null`。
    pub mtime: Option<String>,
}

/// 迁移 v32 种入的内置模板。
pub(crate) struct BuiltinTemplateSeed {
    pub id: &'static str,
    /// 列里的兜底名；payload 里另有 `name_code` 供界面取本地化文案。
    pub name: &'static str,
    /// 完整的 AiTaskTemplate JSON（schema_version=1）。
    pub payload: String,
}

/// 内置行的固定时间戳：它们不是用户数据，写死让所有库字节一致，
/// `INSERT OR IGNORE` 重跑也不会漂移。
pub(crate) const BUILTIN_SEED_TIMESTAMP: &str = "2026-09-23T00:00:00Z";

/// 按 (category, enabled, days_before) 三元组补齐全八类的列表——
/// 未列出的类别以 `enabled=false, days_before=14` 落库，前端拿到的
/// `categories` 总是完整八项，不必猜缺省。
fn builtin_categories(entries: &[(AiTaskCategory, bool, i64)]) -> Vec<AiTaskCategoryRange> {
    [
        AiTaskCategory::Workout,
        AiTaskCategory::Sleep,
        AiTaskCategory::Recovery,
        AiTaskCategory::HeartRate,
        AiTaskCategory::Training,
        AiTaskCategory::Body,
        AiTaskCategory::PersonalNote,
        AiTaskCategory::Attachment,
    ]
    .into_iter()
    .map(|category| {
        let (enabled, days_before) = entries
            .iter()
            .find(|(c, _, _)| *c == category)
            .map(|(_, e, d)| (*e, *d))
            .unwrap_or((false, 14));
        AiTaskCategoryRange {
            category,
            enabled,
            days_before,
            include_workout_day: true,
            excluded_metrics: Vec::new(),
        }
    })
    .collect()
}

fn builtin_payload(
    id: &str,
    name: &str,
    categories: &[(AiTaskCategory, bool, i64)],
    detail_level: AiTaskDetailLevel,
    prompt_template: &str,
    default_summaries: &[&str],
    required_series: &[&str],
) -> String {
    // 种子 payload 是手写字面量还是 serde 序列化都行，但手写字面量容易把
    // 字段名拼错而编译器不吭声。这里直接构造结构体再序列化，播种脚本
    // 与读路径共用同一份字段定义。
    let template = AiTaskTemplate {
        schema_version: AI_TASK_SCHEMA_VERSION,
        id: id.to_string(),
        builtin: true,
        name: name.to_string(),
        name_code: Some(format!("ui.ai_template.{id}.name")),
        categories: builtin_categories(categories),
        detail_level,
        prompt_template: prompt_template.to_string(),
        prompt_code: Some(format!("ui.ai_template.{id}.prompt")),
        default_summaries: default_summaries.iter().map(|s| s.to_string()).collect(),
        required_series: required_series.iter().map(|s| s.to_string()).collect(),
        created_at: BUILTIN_SEED_TIMESTAMP.to_string(),
        updated_at: BUILTIN_SEED_TIMESTAMP.to_string(),
    };
    serde_json::to_string(&template).expect("内置模板序列化不会失败")
}

/// 三个内置模板（A7-P1）：`builtin` 不能删除/覆盖，只能另存为用户模板。
///
/// 用 `LazyLock` 而不是 `const`：payload 由 serde 生成，免去手维护一段
/// 没人复查的 JSON 字面量。
pub(crate) static BUILTIN_TEMPLATE_SEEDS: std::sync::LazyLock<[BuiltinTemplateSeed; 3]> =
    std::sync::LazyLock::new(|| {
        [
            BuiltinTemplateSeed {
                id: "recovery_run",
                name: "恢复跑",
                payload: builtin_payload(
                    "recovery_run",
                    "恢复跑",
                    &[
                        (AiTaskCategory::Workout, true, 7),
                        (AiTaskCategory::Sleep, true, 3),
                        (AiTaskCategory::Recovery, true, 14),
                        (AiTaskCategory::HeartRate, true, 7),
                        (AiTaskCategory::Training, false, 14),
                        (AiTaskCategory::Body, false, 14),
                        (AiTaskCategory::PersonalNote, true, 0),
                        (AiTaskCategory::Attachment, true, 0),
                    ],
                    AiTaskDetailLevel::Standard,
                    "这是一次恢复跑。请结合最近几天的睡眠、静息心率与 HRV 判断恢复是否到位，评估这次训练的强度安排是否合适，并给出下一次训练建议。",
                    &["sleep_score", "resting_hr", "hrv_rmssd"],
                    &["resting_hr", "sleep_hrv", "hrv_rmssd"],
                ),
            },
            BuiltinTemplateSeed {
                id: "long_run_compare",
                name: "多次长跑比较",
                payload: builtin_payload(
                    "long_run_compare",
                    "多次长跑比较",
                    &[
                        (AiTaskCategory::Workout, true, 28),
                        (AiTaskCategory::Sleep, true, 7),
                        (AiTaskCategory::Recovery, true, 14),
                        (AiTaskCategory::HeartRate, true, 14),
                        (AiTaskCategory::Training, true, 28),
                        (AiTaskCategory::Body, false, 14),
                        (AiTaskCategory::PersonalNote, true, 0),
                        (AiTaskCategory::Attachment, true, 0),
                    ],
                    AiTaskDetailLevel::Detailed,
                    "请比较这几次长跑：配速、心率、心率漂移与主观疲劳的对应关系，判断有氧能力的变化趋势，并指出哪一次的质量最高。",
                    &["distance", "avg_hr", "pace"],
                    &["training_load", "resting_hr"],
                ),
            },
            BuiltinTemplateSeed {
                id: "hr_drift",
                name: "心率漂移",
                payload: builtin_payload(
                    "hr_drift",
                    "心率漂移",
                    &[
                        (AiTaskCategory::Workout, true, 14),
                        (AiTaskCategory::Sleep, true, 3),
                        (AiTaskCategory::Recovery, true, 14),
                        (AiTaskCategory::HeartRate, true, 14),
                        (AiTaskCategory::Training, true, 14),
                        (AiTaskCategory::Body, false, 14),
                        (AiTaskCategory::PersonalNote, true, 0),
                        (AiTaskCategory::Attachment, true, 0),
                    ],
                    AiTaskDetailLevel::Detailed,
                    "请分析这次运动的心率漂移：心率与配速/功率的脱钩程度、出现的阶段，并结合近期睡眠与恢复数据推测可能的原因。",
                    &["avg_hr", "max_hr", "pace"],
                    &["heart_rate"],
                ),
            },
        ]
    });
