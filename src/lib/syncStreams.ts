import { defineMessages, messagesOf } from '../i18n';

/**
 * 同步数据流的名字。
 *
 * 后端也带了一份中文 `label`，但那一份是给 CLI / MCP 的：它们的输出不跟界面
 * 语言走。界面拿到的是稳定的 `stream` 键（`heart_rate`、`workout_detail`…），
 * 按键自己查名字——后端因此完全不必知道界面是什么语言。
 *
 * 三个地方用同一份：数据健康页、历史补拉账本、顶部同步进度。各写一份的话，
 * 同一条流会在三处叫三个名字。
 */
const messages = defineMessages(
  {
    heart_rate: '心率',
    daily_summary: '每日概览',
    sleep: '睡眠',
    hrv: '心率变异性',
    wellness: '压力 / 血氧等可选指标',
    workouts: '运动记录',
    workout_detail: '运动明细与轨迹',

    // 偶发指标：数据健康页把它们单列，键来自 daily_metrics / metric_samples。
    vo2max: '最大摄氧量（VO₂max）',
    lactate_threshold_hr: '乳酸阈值心率',
    lactate_threshold_pace: '乳酸阈值配速',
    resting_heart_rate: '静息心率',
    training_load: '训练负荷',
    blood_oxygen: '血氧',
    breathing_rate: '呼吸率',
    skin_temperature: '皮温',
  },
  {
    heart_rate: 'Heart rate',
    daily_summary: 'Daily summaries',
    sleep: 'Sleep',
    hrv: 'Heart rate variability',
    wellness: 'Stress, SpO2 and other optional metrics',
    workouts: 'Workouts',
    workout_detail: 'Workout detail and tracks',

    vo2max: 'VO₂max',
    lactate_threshold_hr: 'Lactate threshold heart rate',
    lactate_threshold_pace: 'Lactate threshold pace',
    resting_heart_rate: 'Resting heart rate',
    training_load: 'Training load',
    blood_oxygen: 'Blood oxygen',
    breathing_rate: 'Respiratory rate',
    skin_temperature: 'Skin temperature',
  },
);

/**
 * 这条流在界面上的名字。不认识的键原样返回——新加的流在翻译跟上之前，
 * 显示一个键总比显示空白强。
 */
export const syncStreamLabel = (stream: string, fallback?: string): string =>
  (messagesOf(messages) as Record<string, string | undefined>)[stream]
  ?? fallback
  ?? stream;
