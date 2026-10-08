import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·心率页的两张非趋势卡（D6）：最近 24 小时曲线卡与每日最高卡。
 * 静息心率 / HRV 趋势卡共用 vitals 域那三段。
 */

const messages = defineMessages(
  {
    heart_rate_24hWhat: '最近 24 小时的逐条心率读数。',
    heart_rate_24hChart: '大数字是最新一次读数；没戴表的时间段曲线断开，不补 0。',
    heart_rate_24hHow: '样本来自官方授权或「高级数据」；这一卡的最新 / 平均 / 最低 / 最高由 ZeppBridge 按这 24 小时的读数现算。',
    daily_max_hrWhat: '每天的最高心率，按本机库里的原始样本统计。',
    daily_max_hrChart: '两条线：当天的最高与平均；样本太少（少于 60 个）的那几天画成空心点——那天的「最高」只是这几个点里的最高。',
    daily_max_hrHow: 'ZeppBridge 按天统计本机样本，不做 Zepp App 那样的过滤，两边数字不一样是正常的。官方授权与「高级数据」的样本都算在内。',
  },
  {
    heart_rate_24hWhat: 'Heart rate, reading by reading, over the last 24 hours.',
    heart_rate_24hChart: 'The big number is the latest reading; stretches without the watch on break the line rather than filling in 0.',
    heart_rate_24hHow: 'Samples come from the official authorization or advanced data; the latest / average / lowest / highest figures in this card are computed here from those 24 hours of readings.',
    daily_max_hrWhat: 'The day’s peak heart rate, counted from the raw samples stored on this machine.',
    daily_max_hrChart: 'Two lines: the day’s peak and average; days with very few samples (under 60) are drawn as hollow markers — their “peak” is only the highest of those points.',
    daily_max_hrHow: 'Counted here from local samples without the filtering the Zepp app applies, so the two numbers differing is expected. Samples from both the official authorization and advanced data are included.',
  },
  {
    heart_rate_24hWhat: 'Frecuencia cardíaca, lectura a lectura, de las últimas 24 horas.',
    heart_rate_24hChart: 'El número grande es la última lectura; los tramos sin reloj cortan la línea en vez de rellenar 0.',
    heart_rate_24hHow: 'Las muestras vienen de la autorización oficial o de los datos avanzados; última / promedio / mínima / máxima de esta tarjeta se calculan aquí con esas 24 horas de lecturas.',
    daily_max_hrWhat: 'La frecuencia cardíaca máxima del día, contada con las muestras originales guardadas en este equipo.',
    daily_max_hrChart: 'Dos líneas: el máximo y el promedio del día; los días con muy pocas muestras (menos de 60) van como puntos huecos: su «máximo» es solo el más alto de esos puntos.',
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
