use super::*;

#[test]
fn food_day_buckets_sum_meal_samples_on_their_local_days() {
    // Shape and field names come from zepp-food-extractor's captured Food
    // response. Values here are synthetic. Berlin changes to UTC+2 on
    // 2026-03-29, so the second meal falls on the next local day.
    let early = DateTime::parse_from_rfc3339("2026-03-29T21:30:00Z")
        .unwrap()
        .timestamp_millis();
    let late = DateTime::parse_from_rfc3339("2026-03-29T22:30:00Z")
        .unwrap()
        .timestamp_millis();
    let raw = json!({"code": 0, "items": [{
        "timestamp": 1774742400000_i64,
        "value": {
            "timeZone": "1,Europe/Berlin",
            "energy": 9999,
            "samples": [
                {"mealtime": early, "energy": 95, "carbohydrates": 25,
                 "protein": 1, "fatTotal": 2, "foodLogId": "one"},
                {"mealtime": late, "energy": "50", "carbohydrates": 10,
                 "protein": 3, "fatTotal": 4, "foodLogId": "two"}
            ]
        }
    }]});
    let batch = Normalizer::normalize_wellness("wellness:food:v2_events", &raw);
    let rows: BTreeMap<_, _> = batch
        .daily_metrics
        .iter()
        .map(|row| ((row.date.as_str(), row.metric.as_str()), row.value))
        .collect();
    assert_eq!(rows.len(), 8);
    assert_eq!(rows[&("2026-03-29", "intake_calories")], 95.0);
    assert_eq!(rows[&("2026-03-30", "intake_calories")], 50.0);
    assert_eq!(rows[&("2026-03-29", "intake_carbs_g")], 25.0);
    assert_eq!(rows[&("2026-03-30", "intake_fat_g")], 4.0);
    assert!(batch.metric_samples.is_empty());
}

#[test]
fn food_accepts_probe_envelopes_and_nested_dates_without_inventing_macros() {
    // Synthetic fixtures: the reporter has not supplied a Food response.
    let items = json!([
        {"date": "2026-09-18", "calories": 500, "protein": 20},
        {"value": {"date": "2026-09-18", "calories": "300", "fat": 0}},
        {"date": "2026-09-19", "value": {"carbs": 40}},
        {"date": "2026-09-19", "unknownNutrient": 123},
        {"date": "2026-09-19", "calories": -1, "protein": 99999}
    ]);
    for raw in [
        json!({"items": items}),
        json!({"data": items}),
        json!({"code": 200, "data": {"items": items}}),
    ] {
        let batch = Normalizer::normalize_wellness("wellness:food:v2_events", &raw);
        let rows: BTreeMap<_, _> = batch
            .daily_metrics
            .iter()
            .map(|row| {
                (
                    (row.date.as_str(), row.metric.as_str()),
                    (row.value, row.unit.as_str()),
                )
            })
            .collect();
        assert_eq!(
            rows,
            BTreeMap::from([
                (("2026-09-18", "intake_calories"), (800.0, "kcal")),
                (("2026-09-18", "intake_protein_g"), (20.0, "g")),
                (("2026-09-18", "intake_fat_g"), (0.0, "g")),
                (("2026-09-19", "intake_carbs_g"), (40.0, "g")),
            ])
        );
        assert!(batch.metric_samples.is_empty());
    }
}

#[test]
fn food_epoch_strings_respect_local_day_and_explicit_dates() {
    let epoch = DateTime::parse_from_rfc3339("2026-09-18T23:30:00Z").unwrap();
    for time in [
        json!(epoch.timestamp()),
        json!(epoch.timestamp().to_string()),
        json!(epoch.timestamp_millis()),
        json!(epoch.timestamp_millis().to_string()),
    ] {
        let batch = Normalizer::normalize_wellness(
            "wellness:food:v2_events",
            &json!({
                "items": [{"value": {"time": time, "timeZone": "+02:00", "calories": 100}}]
            }),
        );
        assert_eq!(batch.daily_metrics.len(), 1);
        assert_eq!(batch.daily_metrics[0].date, "2026-09-19");
    }
    assert_eq!(
        parse_date(&json!("20260918")).as_deref(),
        Some("2026-09-18")
    );
    assert_eq!(parse_date(&json!("not-a-date")), None);
    let batch = Normalizer::normalize_wellness(
        "wellness:food:v2_events",
        &json!({
            "items": [{"date": "2026-09-17", "time": epoch.timestamp_millis(),
                       "timeZone": "+02:00", "calories": 100}]
        }),
    );
    assert_eq!(batch.daily_metrics[0].date, "2026-09-17");
}

#[test]
fn food_unknown_or_encoded_payloads_remain_unparsed() {
    for raw in [
        json!({"data": "encoded"}),
        json!({"items": []}),
        json!({"items": [{"date": "2026-09-18", "unknownNutrient": 123}]}),
        json!({"items": [{"value": "encoded"}]}),
        json!({"items": [{"calories": 100}]}),
    ] {
        let batch = Normalizer::normalize_wellness("wellness:food:v2_events", &raw);
        assert!(batch.daily_metrics.is_empty());
        assert!(batch.metric_samples.is_empty());
    }
}

/// 一条真实响应的形状（2026-09-04 从线上账号取回后脱敏，读数换成了别的数）。
///
/// 三条记录刻意各不相同：`summary` 的键集合在真实账号上就是变的，而
/// `timeZone` 在同一个账号的三条记录上分别是 IANA 名、`GMT+08:00` 和一串
/// 毫秒偏移。解析要靠 `generatedTime`，不能去碰这锅时区汤。
fn weight_payload() -> Value {
    serde_json::json!({
        "items": [
            {
                "generatedTime": 1764743530_i64,
                "createTime": 1764743529_i64,
                "weightType": 1,
                "memberId": "-1",
                "deviceSource": -1,
                "appName": "com.xiaomi.hm.health",
                "userId": "1",
                "summary": {
                    "weight": 68.2, "bmi": 22.1, "height": 175.0,
                    "age": 30, "bodyStyle": 0, "dataSourceType": 1,
                    "deviceSn": "", "deviceType": 1, "source": 1,
                    "syncHealthConnect": false, "timeZone": "Asia/Shanghai"
                }
            },
            {
                "generatedTime": 1738465258_i64,
                "createTime": 1738465258_i64,
                "weightType": 1,
                "memberId": "-1",
                "summary": {
                    "weight": 69.0, "bmi": 22.5, "height": 175.0,
                    "bodyBalanceScore": 55, "oneFootMeasureTime": 55.0,
                    "encryptImpedance": "x", "deviceType": 1, "source": 1,
                    "syncHealth": 1, "syncHealthConnect": false
                }
            },
            {
                "generatedTime": 1722772344_i64,
                "createTime": 1722772344_i64,
                "weightType": 0,
                "memberId": "-1",
                "summary": {
                    "weight": 70.4, "bmi": 23.0, "height": 175.0,
                    "timeZone": "28800000", "source": -1, "deviceType": 1
                }
            }
        ]
    })
}

fn samples_named<'a>(batch: &'a WellnessNormalizedData, metric: &str) -> Vec<&'a MetricSample> {
    batch
        .metric_samples
        .iter()
        .filter(|sample| sample.metric == metric)
        .collect()
}

/// 这一条是整个功能的理由：以前它一条记录都取不到，因为问的是另一个面。
#[test]
fn a_weigh_in_becomes_timestamped_samples_not_daily_rows() {
    let batch = Normalizer::normalize_weight(&weight_payload());

    let weights = samples_named(&batch, "weight");
    assert_eq!(weights.len(), 3, "三条记录就该出三条体重样本");
    // 一天可能称好几次，所以是 metric_samples 而不是 daily_metrics。
    assert!(batch.daily_metrics.is_empty(), "体重不该被压成一天一个数字");
    assert_eq!(weights[0].unit, "kg");

    // generatedTime 是 Unix 秒。当成毫秒读会落在五万年后，而那种错法在图上
    // 只表现为「一条数据都没有」——正是这次要修的症状的另一种形态。
    assert_eq!(
        weights[0].timestamp.format("%Y-%m-%d").to_string(),
        "2025-12-03",
        "时间戳按秒解读"
    );
    assert!(
        weights.iter().all(|sample| {
            let year: i32 = sample.timestamp.format("%Y").to_string().parse().unwrap();
            (2024..=2026).contains(&year)
        }),
        "没有一条落在离谱的年份上"
    );
}

/// `summary` 的键集合逐条不同，缺字段是常态，不是错误。
#[test]
fn a_summary_missing_fields_yields_fewer_samples_not_an_error() {
    let batch = Normalizer::normalize_weight(&weight_payload());
    assert_eq!(samples_named(&batch, "bmi").len(), 3);
    assert_eq!(samples_named(&batch, "height").len(), 3);
    // 只有第二条带 bodyBalanceScore。
    assert_eq!(samples_named(&batch, "body_balance_score").len(), 1);
    // 这个账号没有秤，所以体成分字段一个都不该被凭空造出来。
    for metric in ["body_fat_rate", "muscle_mass", "bone_mass", "bmr"] {
        assert!(
            samples_named(&batch, metric).is_empty(),
            "{metric} 在没有这个字段时不该出现"
        );
    }
}

/// 名字对上了，数字对不上，就不能当成那个指标。
///
/// 体成分那几个字段名来自生态而不是我们见过的响应。名字撞上、含义不同的
/// 那一刻，把它画进体脂率曲线比什么都不显示更糟——用户会当真。
#[test]
fn a_reading_outside_the_plausible_range_is_dropped_and_reported() {
    let payload = serde_json::json!({
        "items": [{
            "generatedTime": 1764743530_i64,
            "summary": { "weight": 68.2, "fatRate": 1980.0 }
        }]
    });
    let batch = Normalizer::normalize_weight(&payload);
    assert_eq!(samples_named(&batch, "weight").len(), 1, "体重照常收下");
    assert!(
        samples_named(&batch, "body_fat_rate").is_empty(),
        "1980 不可能是体脂率"
    );
    assert!(
        batch
            .diagnostics
            .iter()
            .any(|line| line.contains("body_fat_rate")),
        "丢掉了就要说出来，否则没人知道这个名字其实是别的意思：{:?}",
        batch.diagnostics
    );
}

/// 有秤的用户一旦同步，他们的真实字段名就会出现在诊断里。
///
/// 这是我们在没有秤的情况下唯一诚实的补全路径：不猜名字，让数据自己报上来。
#[test]
fn unrecognised_summary_fields_are_reported_so_they_can_be_named_later() {
    let payload = serde_json::json!({
        "items": [{
            "generatedTime": 1764743530_i64,
            "summary": { "weight": 68.2, "someUnknownScaleField": 12.5 }
        }]
    });
    let batch = Normalizer::normalize_weight(&payload);
    let joined = batch.diagnostics.join(" ");
    assert!(
        joined.contains("someUnknownScaleField"),
        "没见过的字段要报出来：{joined}"
    );
    // 已经认识的上下文字段不该混进这条诊断里，否则真正的新名字会被淹没。
    assert!(!joined.contains("timeZone"));
}

/// 空响应是事实，不是故障：没有秤、也没手填过体重的账号就是这样。
#[test]
fn an_empty_page_is_not_an_error() {
    let batch = Normalizer::normalize_weight(&serde_json::json!({ "items": [] }));
    assert!(batch.metric_samples.is_empty());
    assert!(batch.diagnostics.is_empty(), "空不是需要解释的事");
}

/// 导出按类型选，库里按指标名存，两边的名单必须对得上。
#[test]
fn every_body_metric_is_exportable() {
    for spec in &BODY_METRICS {
        assert!(
            crate::storage::BODY_COMPOSITION_METRICS.contains(&spec.metric),
            "{} 写得进库却导不出去",
            spec.metric
        );
    }
    assert_eq!(
        BODY_METRICS.len(),
        crate::storage::BODY_COMPOSITION_METRICS.len()
    );
}

#[test]
fn a_weight_far_in_the_future_is_skipped() {
    let millis_as_seconds = serde_json::json!({
        "items": [{
            "generatedTime": 1_764_743_530_000i64,
            "summary": { "weight": 68.2 }
        }]
    });
    let batch = Normalizer::normalize_weight(&millis_as_seconds);
    assert!(
        samples_named(&batch, "weight").is_empty(),
        "毫秒当成秒会落到五万年后，必须丢掉"
    );
    assert!(
        batch.diagnostics.iter().any(|line| line.contains("时间戳")),
        "丢掉了要说出来：{:?}",
        batch.diagnostics
    );

    let two_days_out = (Utc::now() + Duration::days(2)).timestamp();
    let near_future = serde_json::json!({
        "items": [{
            "generatedTime": two_days_out,
            "summary": { "weight": 68.2 }
        }]
    });
    let batch = Normalizer::normalize_weight(&near_future);
    assert!(samples_named(&batch, "weight").is_empty());
}
