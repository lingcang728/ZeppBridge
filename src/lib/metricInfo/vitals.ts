import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·生命体征域（D6）：readiness / stress / spo2 / spo2_odi / hrv /
 * hrv_rmssd / respiratory_rate / resting_hr。身体状态页与心率页共用同一份。
 *
 * 第三段只说核对过的事实（v3-plan §4 与 OfficialOnlyNote）：官方授权有睡眠、心率、
 * 步数、运动、PAI、体重；HRV、血氧、压力、准备度、呼吸率只有「高级数据」。
 * 官方 HRV 数值算法未定义，不许写进 SDNN / RMSSD 列，文案也不冒充。
 */

const messages = defineMessages(
  {
    readinessWhat: '手表综合前一晚的睡眠、HRV 与静息心率给出的准备度分数。',
    readinessChart: '每天一个点连成趋势，看的是你自己的起落，不和别人比。',
    readinessHow: '分数在手表端算好，经「高级数据」同步——官方接口没有准备度这一项。',
    stressWhat: '全天压力水平：手表大约每五分钟测一次，按天汇总。',
    stressChart: '这张卡是按天的平均值，后面的阴影是当天的实测区间；最近 24 小时的逐条读数在上面的曲线卡里。',
    stressHow: '来自「高级数据」——官方接口没有全天压力。没采样的时间不画线，也不补 0。',
    spo2What: '血氧饱和度（SpO₂）：血液里血红蛋白携带氧气的比例，单位 %。',
    spo2Chart: '逐条读数按天平均成一个点，阴影是当天的实测区间。',
    spo2How: '每条读数是手表当时测的一次，来自「高级数据」——官方接口没有逐条血氧。',
    spo2_odiWhat: '夜间血氧 ODI：平均每小时血氧下降的次数，越低越好。',
    spo2_odiChart: '每天一个点，来自当夜的监测；没监测的夜晚没有点，不补 0。',
    spo2_odiHow: '手表夜间血氧监测自带的口径，经「高级数据」同步——官方接口没有这一项，也不从稀疏的血氧读数反推。',
    hrvWhat: '心率变异性（SDNN 口径）：心跳间隔波动的程度，单位 ms。',
    hrvChart: '逐次测量按天平均成一个点，阴影是当天的实测区间。',
    hrvHow: '来自「高级数据」。官方接口另有一个 HRV 数值，但算法与单位未公开，不冒充 SDNN，这里不收录。',
    hrv_rmssdWhat: '心率变异性的另一种口径（RMSSD），和 SDNN 不是同一个数。',
    hrv_rmssdChart: '夜间测量按天平均成一个点，阴影是当天的实测区间。',
    hrv_rmssdHow: '来自「高级数据」；官方的 HRV 数值同样不冒充 RMSSD。',
    respiratory_rateWhat: '呼吸率：睡眠期间每分钟的呼吸次数。',
    respiratory_rateChart: '按天平均成一个点，阴影是当天的实测区间。',
    respiratory_rateHow: '手表在睡眠期间测得，来自「高级数据」——官方接口没有呼吸率。',
    resting_hrWhat: '静息心率：安静状态下的每分钟心跳数。',
    resting_hrChart: '手表每天给出一个值，连成趋势；和最近 24 小时的即时心率分开表达。',
    resting_hrHow: '手表在每日汇总里自报，经「高级数据」同步；不在这里另算。',
  },
  {
    readinessWhat: 'A readiness score the watch works out from last night’s sleep, HRV and resting heart rate.',
    readinessChart: 'One point per day; the trend is your own ups and downs, never a comparison with anyone else.',
    readinessHow: 'The score is computed on the watch and arrives via advanced data — the official API has no readiness.',
    stressWhat: 'All-day stress: the watch measures about every five minutes and sums it up per day.',
    stressChart: 'This card shows the daily average, with the shaded band marking that day’s measured range; the last 24 hours, reading by reading, are in the curve card above.',
    stressHow: 'Via advanced data — the official API has no all-day stress. Time without readings stays blank rather than being filled with 0.',
    spo2What: 'Blood oxygen (SpO₂): how fully the haemoglobin in your blood is carrying oxygen, in %.',
    spo2Chart: 'Individual readings averaged into one point per day; the shaded band is that day’s measured range.',
    spo2How: 'Each reading is one measurement by the watch, via advanced data — the official API has no individual SpO₂.',
    spo2_odiWhat: 'Nighttime SpO₂ ODI: desaturations per hour on average; lower is better.',
    spo2_odiChart: 'One point per day from that night’s monitoring; nights without monitoring get no point and are never zero-filled.',
    spo2_odiHow: 'The watch’s own measure from nighttime SpO₂ monitoring, via advanced data — the official API has none of it, and it is never re-derived from sparse readings.',
    hrvWhat: 'Heart rate variability (the SDNN measure): how much the spacing between heartbeats varies, in ms.',
    hrvChart: 'Individual measurements averaged into one point per day; the shaded band is that day’s measured range.',
    hrvHow: 'Via advanced data. The official API also reports an HRV number, but its algorithm and unit are unpublished — it does not stand in for SDNN, so it is not collected here.',
    hrv_rmssdWhat: 'A different heart-rate-variability measure (RMSSD) — not the same number as SDNN.',
    hrv_rmssdChart: 'Nighttime measurements averaged into one point per day; the shaded band is that day’s measured range.',
    hrv_rmssdHow: 'Via advanced data; the official HRV number does not stand in for RMSSD either.',
    respiratory_rateWhat: 'Respiratory rate: breaths per minute while you sleep.',
    respiratory_rateChart: 'Averaged into one point per day; the shaded band is that day’s measured range.',
    respiratory_rateHow: 'Measured by the watch during sleep, via advanced data — the official API has no respiratory rate.',
    resting_hrWhat: 'Resting heart rate: beats per minute while at rest.',
    resting_hrChart: 'One value from the watch per day, joined into a trend; kept separate from the moment-to-moment heart rate of the last 24 hours.',
    resting_hrHow: 'Reported by the watch in its daily summary, synced via advanced data — not recomputed here.',
  },
  {
    readinessWhat: 'Una puntuación de recuperación que el reloj calcula con el sueño, la VFC y la frecuencia cardíaca en reposo de la última noche.',
    readinessChart: 'Un punto por día; la tendencia son tus propios altibajos, nunca una comparación con nadie.',
    readinessHow: 'La puntuación se calcula en el reloj y llega por los datos avanzados; la API oficial no tiene recuperación.',
    stressWhat: 'Estrés de todo el día: el reloj mide cada cinco minutos aprox. y lo resume por día.',
    stressChart: 'Esta tarjeta muestra el promedio diario; la banda sombreada es el rango medido ese día. Las últimas 24 horas, lectura a lectura, están en la tarjeta de curva de arriba.',
    stressHow: 'Por los datos avanzados; la API oficial no tiene estrés de todo el día. El tiempo sin lecturas queda en blanco, nunca se rellena con 0.',
    spo2What: 'Oxígeno en sangre (SpO₂): cuánto oxígeno transporta la hemoglobina, en %.',
    spo2Chart: 'Las lecturas individuales se promedian en un punto por día; la banda es el rango medido ese día.',
    spo2How: 'Cada lectura es una medición del reloj, por los datos avanzados; la API oficial no tiene SpO₂ individual.',
    spo2_odiWhat: 'ODI de SpO₂ nocturno: desaturaciones por hora de promedio; cuanto más bajo, mejor.',
    spo2_odiChart: 'Un punto por día según el monitoreo de esa noche; las noches sin monitoreo no tienen punto y nunca se rellenan con 0.',
    spo2_odiHow: 'La medida propia del reloj en el monitoreo nocturno de SpO₂, por los datos avanzados; la API oficial no la tiene y jamás se recalcula a partir de lecturas dispersas.',
    hrvWhat: 'Variabilidad de la frecuencia cardíaca (la medida SDNN): cuánto varía el intervalo entre latidos, en ms.',
    hrvChart: 'Las mediciones individuales se promedian en un punto por día; la banda es el rango medido ese día.',
    hrvHow: 'Por los datos avanzados. La API oficial también da un valor de VFC, pero su algoritmo y unidad no están publicados: no hace de SDNN y no se recoge aquí.',
    hrv_rmssdWhat: 'Otra medida de variabilidad cardíaca (RMSSD); no es el mismo número que SDNN.',
    hrv_rmssdChart: 'Las mediciones nocturnas se promedian en un punto por día; la banda es el rango medido ese día.',
    hrv_rmssdHow: 'Por los datos avanzados; el valor de VFC de la API oficial tampoco hace de RMSSD.',
    respiratory_rateWhat: 'Frecuencia respiratoria: respiraciones por minuto mientras duermes.',
    respiratory_rateChart: 'Se promedia en un punto por día; la banda es el rango medido ese día.',
    respiratory_rateHow: 'La mide el reloj mientras duermes, por los datos avanzados; la API oficial no tiene frecuencia respiratoria.',
    resting_hrWhat: 'Frecuencia cardíaca en reposo: latidos por minuto en reposo.',
    resting_hrChart: 'Un valor del reloj por día, unidos en tendencia; separada de la frecuencia cardíaca minuto a minuto de las últimas 24 horas.',
    resting_hrHow: 'La informa el reloj en su resumen diario, por los datos avanzados; no se recalcula aquí.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/metricInfo/vitals',
);

export const VITALS_METRICS = [
  'readiness',
  'stress',
  'spo2',
  'spo2_odi',
  'hrv',
  'hrv_rmssd',
  'respiratory_rate',
  'resting_hr',
] as const;

/** 按指标 id 取三段文案；认不出的 id 返回 null。 */
export const vitalsInfo = (metric: string): { what: string; chart: string; how: string } | null => {
  if (!(VITALS_METRICS as readonly string[]).includes(metric)) return null;
  const t = messagesOf(messages) as Record<string, string>;
  return {
    what: t[`${metric}What`],
    chart: t[`${metric}Chart`],
    how: t[`${metric}How`],
  };
};
