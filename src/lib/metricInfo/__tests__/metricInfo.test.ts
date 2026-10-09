import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale, type Locale } from '../../../i18n';
import { METRIC_INFO_IDS, metricInfo } from '../index';
import { METRICS as BODY_METRICS } from '../../../views/body/bodyCards';

/*
 * 「?」浮层的守门（D6）：页面上传给 MetricInfoButton / MetricTrendCard 的指标 id
 * 必须在注册表里有完整的三段（这是什么 / 这张图展示什么 / 怎么算的与来源），三种
 * 界面语言都要有——少一段就是一块开着空白的浮层。身体状态页的 id 清单直接从
 * bodyCards 拿（真来源，不是抄一份）；其余页面在模板里写死 id，就在这里列死并注明。
 */

/* 心率页：三张趋势卡（resting_hr / hrv / hrv_rmssd，与身体状态页共用）+ 24 小时卡 + 每日最高卡。 */
const HEART_PAGE_METRICS = ['resting_hr', 'hrv', 'hrv_rmssd', 'heart_rate_24h', 'daily_max_hr'];
/* 训练页：四张趋势卡 + 负荷平衡卡（模板里写死的 id）。 */
const TRAINING_PAGE_METRICS = ['vo2max', 'training_load', 'pai_total', 'lactate_threshold', 'training_balance'];
/* 日常活动页：CARDS 写死的四个 id。 */
const ACTIVITY_PAGE_METRICS = ['steps', 'distance', 'active_calories', 'active_minutes'];
/* 睡眠详情：时长 / 评分两张主卡 + 阶段卡 + 近 7 天结构卡（模板里写死的 id）。 */
const SLEEP_PAGE_METRICS = ['sleep_duration', 'sleep_score', 'sleep_weekly', 'sleep_stages'];

const PAGE_METRICS = [
  ...BODY_METRICS,
  ...HEART_PAGE_METRICS,
  ...TRAINING_PAGE_METRICS,
  ...ACTIVITY_PAGE_METRICS,
  ...SLEEP_PAGE_METRICS,
];

const CHINESE = /[一-鿿]/;
const LOCALES: Locale[] = ['zh', 'en', 'es'];

describe('metric info registry', () => {
  beforeEach(() => setLocale('zh'));

  it('every id used by a card has all three layers in zh / en / es', () => {
    for (const locale of LOCALES) {
      setLocale(locale);
      for (const id of PAGE_METRICS) {
        const info = metricInfo(id);
        expect(info, `${locale}: ${id} not in the registry`).not.toBeNull();
        for (const layer of ['what', 'chart', 'how'] as const) {
          const text = info?.[layer];
          expect(typeof text, `${locale}: ${id}.${layer}`).toBe('string');
          expect((text ?? '').length, `${locale}: ${id}.${layer}`).toBeGreaterThan(0);
          if (locale !== 'zh') {
            expect(text, `${locale}: ${id}.${layer}`).not.toMatch(CHINESE);
          }
        }
      }
    }
  });

  it('every registered id itself has all three layers (no empty entries)', () => {
    for (const locale of LOCALES) {
      setLocale(locale);
      for (const id of METRIC_INFO_IDS) {
        const info = metricInfo(id);
        expect(info, `${locale}: ${id}`).not.toBeNull();
        expect(info?.what.length, `${locale}: ${id}.what`).toBeGreaterThan(0);
        expect(info?.chart.length, `${locale}: ${id}.chart`).toBeGreaterThan(0);
        expect(info?.how.length, `${locale}: ${id}.how`).toBeGreaterThan(0);
      }
    }
  });

  it('an unknown id renders no button at all', () => {
    expect(metricInfo('not_a_metric')).toBeNull();
    expect(metricInfo('')).toBeNull();
  });
});
