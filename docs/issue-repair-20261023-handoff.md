# Issue 修复交接（2026-10-23）

> **2026-10-24 已续接，此页以下为历史交接记录。** 当前实现、门禁、beta.11 本地包与仍需实机/样本的边界，以 [最新验收记录](issue-repair-20261024-validation.md) 和桌面 `修复计划.md` 为准。原先的编译/明细命令连接缺口已修复，翻译.md 已完成本轮复核。下文的“停止”描述不代表本次续接请求。

## 当前状态

用户要求收尾并停止。本轮停止新增功能、构建和测试，保留当前工作树供接手。**当前是尚未验收的开发中改动，不能当作已经修复完成或可发布的版本。**

- 仓库：`C:\Users\15pro\Desktop\MyProject\ZeppBridge`，分支 `main`。
- 实施起点：`f51708fec4ccbe92a692e0e0e12f1e295bfaeaa2`；实施前工作树干净，`git pull --rebase origin main` 返回 Already up to date。
- 本机现有包仍是 `release\ZeppBridge.exe` / **3.0.9-beta.10**。本轮未生成、替换或安装新包。
- 源码静态版本仍为 3.0.6；它不能代替本机 beta 的核查基准。
- 本轮没有提交、推送、打标签、发版、回复或关闭 GitHub issue。
- 未对真实库 `release\data` 执行迁移或写入；新增 schema 43 仅存在于源码。
- 总待办及逐项勾选：`C:\Users\15pro\Desktop\修复计划.md`。
- 翻译交接：仓库根目录 `翻译.md`。用户指定翻译交给其他 Agent。

## 已写入的实现（均需按待办完成验收）

| 范围 | 已写入 | 主要入口 |
|---|---|---|
| #152 长历史 | CLI 超过365天转按月补拉，增加批次上限、失败重试、取消与续传账本输出 | `src-tauri/crates/cli/src/cmd_sync.rs`、`main.rs` |
| #145 认证恢复 | 认证元数据存在与凭据可用分开；拒读返回恢复信息；退出入口与恢复提示 | `core/src/auth/mod.rs`、`auth/tests.rs`；`commands/status.rs`、`ipc_types.rs`；`AccountSection.vue` |
| #154 批量纠正 | 原子批量编辑、清除纠正、整批撤销与修改冲突保护；单条接口复用核心；列表选择及预览；CLI set-type | `storage/workout_edits.rs`、`corrections.rs`；`cmd_workout_edit.rs`；`WorkoutTools.vue`、`WorkoutList.vue` |
| #151 隐藏/恢复 | 独立本地状态和撤销历史；可见/隐藏视图；列表/详情入口及CLI hide/restore；多个统计读取接入可见视图 | `storage/migrations.rs`、`queries.rs`；Bridge、IPC、`WorkoutDetail.vue` |
| #155/#125 类型 | 移除无上下文的15→徒步全局映射；Balance 2云上下文识别开放水域；224按报告映射hiking；重放修订v41 | `sport_catalog.rs`、`normalizer/band.rs`、`src/assets/workouts/catalog.json` |
| #153 明细任务 | 请求状态表、覆盖计数、有限队列、高级/官方通道独立任务、暂停/续传/重试；桌面归档卡入口 | `storage/detail_queue.rs`、`sync/details.rs`、`sync/official.rs`；`commands/sync.rs`；`WorkoutDetailBackfill.vue` |
| 说明与体验 | 旧失败块恢复提示；计划实际发送大类及Trail限制提示；原始海拔/校准差异、力量训练读取边界提示 | `HistoryArchivePanel.vue`、`PlanDetail.vue`、`PlanWorkoutEditor.vue`、`WorkoutDetail.vue` |

表内 Core 路径前缀为 `src-tauri/crates/core/src/`；桌面命令路径前缀为 `src-tauri/src/`。具体文件以当前 git diff 为准，含多个未跟踪的新文件，交接时不能只保存 tracked diff。

## 编译与验证的准确边界

- 修改前审计基线：前端773、Functions75、Rust853，共1701项通过，2项忽略；i18n检查通过。**这些是修改前结果。**
- 实施早期运行过一次 `cargo check --manifest-path src-tauri/Cargo.toml --workspace --locked --all-targets`，通过。覆盖当时的长历史/认证及较早核心改动，不代表最终工作树通过。
- 后一次同命令失败，报告：`OfficialSync::sync_details` 的测试调用参数未跟进；新增桌面命令未正确重导出；伴随 Tauri 宏 never-type-fallback 诊断。
- 随后已补旧测试调用参数，并重导出 `edit_workouts` / `undo_workout_edit` / `get_hidden_workout_page`；**没有再次编译确认这些修正，也没有编译确认后来加入的明细任务及UI改动。**
- 停止时可直接确认的连接缺口：`lib.rs` 引用了 `get_workout_detail_coverage` / `start_workout_detail_backfill`，但 `commands/mod.rs` 的 `pub(crate) use sync::{...}` 尚未重导出这两个函数。接手先修这个缺口。
- 本轮新增认证拒读/拒删用例尚未运行；批量、隐藏和明细任务的完整回归尚未补齐。
- 最终工作树未运行前端构建、完整Rust门禁、i18n/字体/文档/体积检查或打包。不要将现有EXE说成包含本轮修改。

## 接手优先事项

- [ ] 补齐上述明细命令重导出，检查全部IPC/Bridge签名，处理当前编译及格式问题，再运行定向检查。
- [ ] 隐藏查询边界：`get_workout_series` 仍可按ID直接读样本，必须核对MCP、REST、单条导出及各格式读取，防止绕过可见范围。
- [ ] 保留内部写入查询原始运动表：详情解码的存在性/距离/结束时间与训练覆盖证据需包含隐藏原始记录。已回退这些查询，仍需回归，不能把隐藏当数据丢失或伪造完整覆盖。
- [ ] 核对详情任务 `ready` 与当前可用认证通道：总数包括另一通道待办时，桌面自动循环可能没有进展。增加通道筛选或无进展退出，并检查取消跨通道竞态。
- [ ] 核对明细空响应、零HR/GPS但有有效详情、解析失败、重放后状态、失败退避和重启续传；普通同步也要尊重独立任务的终态，避免重复请求。
- [ ] 补齐独立明细任务CLI命令。当前仅有长历史sync和set-type/hide/restore/undo，**尚无明细任务CLI入口**。
- [ ] 补设备上下文：当前类型15从单条报文的deviceSource/型号名解析；报文缺少这些字段时，还没有关联本地设备档案/用户指认补齐上下文。不要声称报告者旧记录已经自动修复。
- [ ] 验证批量事务整体回滚、跨页选择、撤销冲突、隐藏恢复、保留期/备份/重放及FIT替换兼容；避免嵌套事务或重放丢本地状态。
- [ ] UI验证：列表、详情、归档任务；核对新增记录行包装对列表样式的影响；新详情说明、模板字段及路由路径需经类型检查。
- [ ] 计划说明目前在computed内调用useMessages，接手可移到setup中的共享computed；核查原有variant相关文案是否仍暗示手表一定支持Trail。
- [ ] 完成 `翻译.md` 全语言复核、缺失语言、pending清单、字体及窄窗口验证。已有草稿不能直接勾为完成。
- [ ] #143退出崩溃根因尚未修；#60完整可访问性验收未开展；#115/#137脱敏诊断文档尚未补齐。
- [ ] #133 Linux性能、Mac钥匙串/升级、手表计划的实机验收继续保持未完成。
- [ ] 功能验收后再同步用户指南和CLI/MCP正式契约文档；当前实现还在开发中，本轮没有提前宣称这些功能已经发布。
- [ ] 本地通过门禁后交付下一份3.0.9 beta。推送、标签、发版、issue回复关闭须遵守仓库授权规则。

## 复用与保护

使用已装工具和固定缓存；Rust target 为 `G:\build_cache\cargo-target-v3`，避免重复安装运行时。测试写临时库或真实库副本。指定的历史经验文档路径不存在；已检索Documents/Codex同名文件无结果，继续按当前AGENTS.md执行。

用户本轮最终指令是收尾并停止，因此本文件列出下一次接手事项；本轮不继续运行上述检查。
