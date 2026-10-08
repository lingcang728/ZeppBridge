import { vitalsInfo, VITALS_METRICS } from './vitals';
import { bodyInfo, BODY_METRICS } from './body';
import { activityInfo, ACTIVITY_METRICS } from './activity';
import { heartInfo, HEART_METRICS } from './heart';
import { trainingInfo, TRAINING_METRICS } from './training';
import { sleepInfo, SLEEP_METRICS } from './sleep';

/*
 * 「?」浮层的指标注册表（D6）：指标 id → 三段固定文案（这是什么 / 这张图展示什么 /
 * 怎么算的与来源）。文案按域拆在旁边几个文件里；这里只是把各域并成一张表。
 *
 * 指标 id 就用序列的 metric 名（spo2_odi、pai_total、sleep_score…），页面把卡上的
 * `series.metric`（或睡眠详情的固定 id）原样传给 `MetricInfoButton`。注册表里认不出
 * 的 id 按钮不渲染——`metricInfo.test.ts` 守着「页面上用到的 id 必须三段俱全」。
 */

export interface MetricInfo {
  /** 这是什么：一句话的定义。 */
  what: string;
  /** 这张图展示什么：怎么读这张卡（点、阴影、断线、档位）。 */
  chart: string;
  /** 怎么算的与来源：手表算 / 云端给 / 本机算，官方授权还是「高级数据」。 */
  how: string;
}

const LOOKUPS: ((metric: string) => MetricInfo | null)[] = [
  vitalsInfo,
  bodyInfo,
  activityInfo,
  heartInfo,
  trainingInfo,
  sleepInfo,
];

/** 按指标 id 取三段文案；认不出的 id 返回 null（按钮不渲染）。 */
export const metricInfo = (metric: string): MetricInfo | null => {
  for (const lookup of LOOKUPS) {
    const info = lookup(metric);
    if (info) return info;
  }
  return null;
};

/** 注册表里全部指标 id（测试用：页面上用到的 id 必须都在这里）。 */
export const METRIC_INFO_IDS: string[] = [
  ...VITALS_METRICS,
  ...BODY_METRICS,
  ...ACTIVITY_METRICS,
  ...HEART_METRICS,
  ...TRAINING_METRICS,
  ...SLEEP_METRICS,
];
