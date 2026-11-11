import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·心率页的两张非趋势卡（D6）：最近 24 小时曲线卡与每日最高卡。
 * 静息心率 / HRV 趋势卡共用 vitals 域那三段。
 */

const messages = defineMessages(
  {
    heart_rate_24hWhat: '最近 24 小时、48 小时或 7 天的逐条心率读数。',
    heart_rate_24hChart: '大数字是最新一次读数；没戴表的时间段曲线断开，不补 0。右上角可在 24 小时、48 小时与 7 天之间切换。',
    heart_rate_24hHow: '样本来自官方授权或「高级数据」；这一卡的最新 / 平均 / 最低 / 最高由 ZeppBridge 按当前所选时间窗的读数现算。',
    daily_max_hrWhat: '每天的最高、平均与最低心率，按本机库里的原始样本统计。',
    daily_max_hrChart: '三条线：当天的最高、平均与最低；样本太少（少于 60 个）的那几天最高与最低画成空心点——它们只是那几个点里的极值。',
    daily_max_hrHow: 'ZeppBridge 按天统计本机样本，不做 Zepp App 那样的过滤，两边数字不一样是正常的。官方授权与「高级数据」的样本都算在内。',
  },
  {
    heart_rate_24hWhat: 'Heart rate, reading by reading, over the last 24 hours, 48 hours, or 7 days.',
    heart_rate_24hChart: 'The big number is the latest reading; stretches without the watch on break the line rather than filling in 0. Switch between 24h, 48h, and 7d in the card header.',
    heart_rate_24hHow: 'Samples come from the official authorization or advanced data; the latest / average / lowest / highest figures in this card are computed here from the selected window.',
    daily_max_hrWhat: 'The day’s peak, average, and minimum heart rate, counted from the raw samples stored on this machine.',
    daily_max_hrChart: 'Three lines: the day’s peak, average, and min; days with very few samples (under 60) use hollow markers on peak and min — they are only the extremes of those few points.',
    daily_max_hrHow: 'Counted here from local samples without the filtering the Zepp app applies, so the two numbers differing is expected. Samples from both the official authorization and advanced data are included.',
  },
  {
    heart_rate_24hWhat: 'Frecuencia cardíaca, lectura a lectura, de las últimas 24 horas, 48 horas o 7 días.',
    heart_rate_24hChart: 'El número grande es la última lectura; los tramos sin reloj cortan la línea en vez de rellenar 0. Arriba puedes cambiar entre 24 h, 48 h y 7 d.',
    heart_rate_24hHow: 'Las muestras vienen de la autorización oficial o de los datos avanzados; última / promedio / mínima / máxima de esta tarjeta se calculan aquí según la ventana elegida.',
    daily_max_hrWhat: 'La frecuencia cardíaca máxima, promedio y mínima del día, contada con las muestras originales guardadas en este equipo.',
    daily_max_hrChart: 'Tres líneas: el máximo, el promedio y el mínimo del día; los días con muy pocas muestras (menos de 60) usan puntos huecos en máximo y mínimo: son solo los extremos de esos pocos puntos.',
    daily_max_hrHow: 'Se cuenta aquí con las muestras locales, sin el filtro que aplica la app Zepp, así que es normal que los dos números difieran. Las muestras de la autorización oficial y de los datos avanzados se cuentan igual.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/metricInfo/heart',
);

export const HEART_METRICS = ['heart_rate_24h', 'daily_max_hr'] as const;

/** 按指标 id 取三段文案；认不出的 id 返回 null。 */
export const heartInfo = (metric: string): { what: string; chart: string; how: string } | null => {
  if (!(HEART_METRICS as readonly string[]).includes(metric)) return null;
  const t = messagesOf(messages) as Record<string, string>;
  return {
    what: t[`${metric}What`],
    chart: t[`${metric}Chart`],
    how: t[`${metric}How`],
  };
};
