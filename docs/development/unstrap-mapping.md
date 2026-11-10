# unstrap 备份 → 本机库的映射

Beta 实验室「从 unstrap 导入」读的是 unstrap（Helio Strap 的开源伴侣应用）的备份 zip：一张表一个 CSV，按**列名**读，表头之外的列顺序不重要，缺列就是没有。本页是逐表的口径，改导入代码之前先改这里。

代码：运动在 `src-tauri/crates/core/src/import/unstrap.rs`，健康样本在 `import/unstrap_health.rs`，落库在 `storage/imports.rs` 和 `storage/import_health.rs`。

## 总规矩

- **只补空档，Zepp 为准。** 同一分钟本机已经有这个指标的样本（不管哪台设备）、同一天已经有这个日指标、时间上和本机已有的睡眠 / 运动重叠——都不收，算「本机已有」。所以导入永远不会改掉一条从 Zepp 同步来的数据，重复导入同一份备份也不会多出东西。
- **来源标记**：设备号写 `unstrap`，`source_scope` 是 `device`；运动另在 `workout_imports` 里记来源。
- **一次导入一批**（`import_batches`，来源 `unstrap`）。健康样本行带 `import_batch_id`（迁移 v51），运动页「导入记录」里撤销这一批时，运动和健康样本一起删。
- **保留期清理不删导入的数据**（和导入的运动一样：那是用户自己带进来的）。重放只按 `raw_record_id` 删，导入的行没有报文，重放不碰。
- **导入的不算「云端拉到哪了」**：各流的「最新样本」（`stream_freshness`）跳过 `import_batch_id` 非空的行。同步前的探测拿本机最新心率去问云端有没有更新的；备份里比 Zepp 新的心率要是算进去，同步会被误判成「云端没有新数据」。
- **时间**：CSV 里的 `epoch` 是 UTC 秒；按天的表用它自己的 `date` 列（unstrap 记下的本地日），**没有 `date` 列的老备份那张表整张跳过**，不拿时区去猜是哪一天。
- **不编数据**：空格子是没有；超出生理范围的值丢掉（心率 25–250 bpm、血氧 50–100%）；读不懂的行照实计入「读不出」。
- **三条禁令照守**：官方 / 第三方的 HRV 分不清统计量就不进 SDNN / RMSSD 列；Charge / 准备度这类分数不拿别的东西顶；不从稀疏血氧反算 ODI。unstrap 自己算的分数一律不导入，不顶替 Zepp 的。

## 收的表

| 表 | 用到的列 | 进哪里 | 口径 |
|---|---|---|---|
| `workout.csv` + `workout_hr.csv` | `start_epoch` `end_epoch` `sport_type` `exercise_seconds` `calories` `avg_hr` `max_hr`；心率 `epoch` `bpm` | `workouts` + 逐点心率 | 心率带自己记的运动。`workout_deleted.csv` 里的（用户在 unstrap 里删的）不导。训练效果、训练负荷、VO₂max 是带子 / unstrap 的算法结果，不收。 |
| `app_workout.csv` + `app_workout_hr.csv` + `app_workout_route.csv` | 起止、`sport_type`、`pauses`（`起-止` 秒对，逗号分隔）、`avg_hr` `max_hr`、`distance_m` + `distance_from_steps`、`total_kcal`；轨迹 `epoch` `lat` `lon` `altitude_m` | `workouts` + 逐点心率 / 轨迹 / 暂停 | 手机上开始的运动。和带子那条起点两分钟内的并成一条，以手机为准、缺的从带子补。按步数估出来的距离（`distance_from_steps = true`）不要。 |
| `heart_rate.csv` | `epoch` `bpm` `source` | `metric_samples`：`heart_rate`，bpm | 只收 `source = 0`（带子存的历史，一分钟一条）；`1` 是运动时手机实时收到的，运动导入已经带了。 |
| `spo2.csv` | `epoch` `percent` | `metric_samples`：`spo2`，% | 带子测的单点血氧。夜间连续血氧 `sleep_spo2.csv` 不收（见下）。 |
| `resting_hr.csv` | `date` `bpm` | `daily_metrics`：`resting_hr`，bpm | 按 `date` 列落本地日。 |
| `sleep_session.csv` + `sleep_stage.csv` + `sleep_edit.csv` | 起止、`nap`、`deep_min` `light_min` `rem_min` `awake_min` `wake_count`；阶段 `session_start_epoch` `start` `end` `stage`（0 清醒 1 浅 2 深 3 REM） | `sleep_sessions` + `sleep_stages`，id `unstrap:<起点秒>` | 小睡（`nap = true`）不收：本机小睡另有一套，一期不接。`score` 不收（不顶替 Zepp 的睡眠分）。用户在 unstrap 里删掉的（`sleep_edit.deleted`）不收，改过起止的用改过的。分钟数照表里的，空就是没有；阶段条按表里的顺序，不按总量拼。 |

## 不收的表（及原因）

| 表 | 原因 |
|---|---|
| `hrv.csv` | 只写了「毫秒」，没说是 RMSSD 还是别的统计量 → 禁令：不进 SDNN / RMSSD 列。 |
| `hrv_sdnn.csv` | 是 SDNN，但本机没有 SDNN 列；塞进 `hrv` 会和 Zepp 的 HRV 混成一条线。 |
| `stress.csv` | 本机的全天压力是按天的最小 / 平均 / 最大，逐条压力没有对应的列；从逐条值算日均是派生，不做。 |
| `breath_rate.csv` | 本机呼吸率是按晚的一个值，逐条均值是派生。 |
| `skin_temperature.csv` | 本机没有皮温样本指标。 |
| `activity_minute.csv` / `activity_extended.csv` | 逐分钟步数 / 热量；本机的日步数、日热量以 Zepp 为准，按分钟加总是派生。 |
| `pai.csv` | 分数，不顶替 Zepp 的 PAI。 |
| `sleep_spo2.csv` / `osa_result.csv` / `osa_event.csv` | 禁令：不从稀疏血氧反算 ODI；OSA 结果是 unstrap / 带子的算法分数。 |
| `strap_readiness.csv` / `night_metrics.csv` / `habit_age_week.csv` / `daily_energy.csv` / `sport_effect.csv` / `recovery_hr.csv` | unstrap 自己算的。 |
| `daily_max_hr.csv` / `health_alert.csv` / `wear_event.csv` | 本机没有对应的表。 |
| `check_in.csv` / `day_tag.csv` / `badge.csv` / `week_result.csv` / `personal_best.csv` / `saved_workout.csv` / `exercise.csv` / `app_workout_set.csv` / `app_workout_round.csv` / `app_workout_dismissed.csv` / `settings.json` | unstrap 应用自己的记录和设置。 |

## 导出给 unstrap

反方向（`export_unstrap/`）只写 `workout.csv` 和 `workout_hr.csv`：起止、运动类型（按 unstrap 的编号，认不出写通用「活动」223）、运动时长、热量、平均 / 最大 / 最低心率、步数、逐秒心率。没有的格子留空；Zepp 的训练负荷、VO₂max、训练效果不写——那几列在 unstrap 里是带子自己的算法结果。

## 还没用真实备份核对的

这份映射按 unstrap 源码（`CsvTables.kt` / `CsvImporter.kt`）定的，测试用的是合成数据。拿到一份真实的 `unstrap-backup-*.zip` 后要核对：`heart_rate.csv` 的 `source` 取值分布、`resting_hr.csv` 是否总有 `date` 列、睡眠阶段的边界是否和会话起止对齐。
