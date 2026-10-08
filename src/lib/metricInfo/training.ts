import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·训练域（D6）：vo2max / training_load / pai_total /
 * lactate_threshold / training_balance。
 *
 * 来源事实（v3-plan §4、storage/metrics.rs）：VO₂max、日度训练负荷、乳酸阈只有
 * 「高级数据」；PAI 官方授权也会同步（/users/-/openData/PaiSummary）；负荷平衡
 * 的急慢比是 ZeppBridge 本机算的（7 天之和 ÷ 28 天之和 ÷ 4，窗口不足不给）。
 */

const messages = defineMessages(
  {
    vo2maxWhat: '最大摄氧量（VO₂max）：单位体重每分钟能利用的氧气量（ml/kg/min）。',
    vo2maxChart: '只在户外跑步后更新，一年更新不了几次；单看一两次不如看长期趋势，6 个月范围才看得出形状。',
    vo2maxHow: '手表在户外跑步后估算，经「高级数据」同步——官方接口没有 VO₂max。',
    training_loadWhat: '训练负荷：每天的运动负荷得分，无量纲。',
    training_loadChart: '每天一个点；最新读数旁边的档位（偏低 / 中等 / 较高 / 很高）按 600 的参考刻度划分，只是粗读，不是手表给的分级。',
    training_loadHow: '手表按天给出，经「高级数据」同步——官方接口没有日度训练负荷。档位由 ZeppBridge 按参考刻度划出。',
    pai_totalWhat: 'PAI 活力指数：滚动 7 天的个人体力活动积分。',
    pai_totalChart: '每天一个点，是当天往前 7 天滚动的总分；这里不画当天新挣的分。',
    pai_totalHow: '官方授权与「高级数据」都会提供 PAI，按 Zepp 的口径逐周滚动累计。',
    lactate_thresholdWhat: '乳酸阈值：强度再往上、疲劳快速堆积的临界，对应一个心率和一个配速。',
    lactate_thresholdChart: '心率与配速两条线（配速轴倒置，越快越高）；只在一段时间的高强度跑步后更新。',
    lactate_thresholdHow: '手表在高强度跑步后估算，经「高级数据」同步——官方接口没有乳酸阈值。',
    training_balanceWhat: '运动负荷平衡：近 7 天负荷相对近 28 天周均的对比，即急性／慢性负荷比。',
    training_balanceChart: '三条线：7 天负荷、28 天周均、急慢比；比值断开的地方是窗口数据不足、没算，不是 0。',
    training_balanceHow: 'ZeppBridge 本机计算：急慢比 = 7 天负荷之和 ÷（28 天负荷之和 ÷ 4）；28 天窗口不足 21 天有数据时不给比值。每日负荷本身来自「高级数据」。',
  },
  {
    vo2maxWhat: 'VO₂max: the oxygen your body can use per minute per kilogram of body weight (ml/kg/min).',
    vo2maxChart: 'It only updates after an outdoor run, a handful of times a year; a single reading says less than the long-term shape, which needs the 6-month range.',
    vo2maxHow: 'Estimated by the watch after outdoor runs, synced via advanced data — the official API has no VO₂max.',
    training_loadWhat: 'Training load: a dimensionless daily score of how much training you did.',
    training_loadChart: 'One point per day; the tier next to the latest reading (low / moderate / high / very high) follows a 600-point reference scale — a rough reading, not a watch-given grade.',
    training_loadHow: 'Given by the watch per day, synced via advanced data — the official API has no daily training load. The tier is drawn here against the reference scale.',
    pai_totalWhat: 'PAI: a Personal Activity Intelligence score over a rolling 7 days.',
    pai_totalChart: 'One point per day — the rolling 7-day total as of that day; the points newly earned that day are not what is drawn here.',
    pai_totalHow: 'Both the official authorization and advanced data provide PAI; Zepp keeps the rolling tally.',
    lactate_thresholdWhat: 'Lactate threshold: the point past which fatigue piles up quickly, marked by a heart rate and a pace.',
    lactate_thresholdChart: 'Two lines, heart rate and pace (the pace axis is inverted so faster points up); it only updates after a sustained hard run.',
    lactate_thresholdHow: 'Estimated by the watch after hard runs, synced via advanced data — the official API has no lactate threshold.',
    training_balanceWhat: 'Training load balance: the last 7 days of load against the 28-day weekly average — the acute-to-chronic ratio.',
    training_balanceChart: 'Three lines: 7-day load, 28-day weekly average, and the ratio; where the ratio line breaks, the window was too thin to compute one — uncomputed, not zero.',
    training_balanceHow: 'Computed here: acute:chronic = 7-day load sum ÷ (28-day load sum ÷ 4); with fewer than 21 days of data in the 28-day window, no ratio is given. The daily loads themselves come via advanced data.',
  },
  {
    vo2maxWhat: 'VO₂máx: el oxígeno que tu cuerpo puede usar por minuto y por kilo de peso (ml/kg/min).',
    vo2maxChart: 'Solo se actualiza tras una carrera al aire libre, pocas veces al año; una lectura aislada dice menos que la forma a largo plazo, que necesita el rango de 6 meses.',
    vo2maxHow: 'La estima el reloj después de carreras al aire libre, por los datos avanzados; la API oficial no tiene VO₂máx.',
    training_loadWhat: 'Carga de entrenamiento: una puntuación diaria sin unidades de cuánto entrenaste.',
    training_loadChart: 'Un punto por día; el nivel junto a la última lectura (baja / moderada / alta / muy alta) sigue una escala de referencia de 600: una lectura aproximada, no una clasificación del reloj.',
    training_loadHow: 'La da el reloj por día, por los datos avanzados; la API oficial no tiene carga diaria. El nivel se traza aquí con la escala de referencia.',
    pai_totalWhat: 'PAI: la puntuación de actividad personal en 7 días móviles.',
    pai_totalChart: 'Un punto por día: el total móvil de 7 días a esa fecha; aquí no se dibujan los puntos recién ganados ese día.',
    pai_totalHow: 'La autorización oficial y los datos avanzados dan PAI; Zepp lleva la cuenta móvil.',
    lactate_thresholdWhat: 'Umbral de lactato: el punto a partir del cual la fatiga se acumula rápido, marcado por una frecuencia cardíaca y un ritmo.',
    lactate_thresholdChart: 'Dos líneas, frecuencia cardíaca y ritmo (el eje de ritmo está invertido para que más rápido apunte arriba); solo se actualiza tras una carrera intensa sostenida.',
    lactate_thresholdHow: 'Lo estima el reloj tras carreras intensas, por los datos avanzados; la API oficial no tiene umbral de lactato.',
    training_balanceWhat: 'Equilibrio de la carga: la carga de los últimos 7 días frente al promedio semanal de 28 días, es decir, la relación aguda:crónica.',
    training_balanceChart: 'Tres líneas: carga de 7 días, promedio semanal de 28 y la relación; donde se corta la relación, la ventana era demasiado corta para calcularla: no calculada, no cero.',
    training_balanceHow: 'Se calcula aquí: aguda:crónica = suma de 7 días ÷ (suma de 28 días ÷ 4); con menos de 21 días de datos en la ventana de 28, no hay relación. La carga diaria en sí llega por los datos avanzados.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/metricInfo/training',
);

export const TRAINING_METRICS = [
  'vo2max',
  'training_load',
  'pai_total',
  'lactate_threshold',
  'training_balance',
] as const;

/** 按指标 id 取三段文案；认不出的 id 返回 null。 */
export const trainingInfo = (metric: string): { what: string; chart: string; how: string } | null => {
  if (!(TRAINING_METRICS as readonly string[]).includes(metric)) return null;
  const t = messagesOf(messages) as Record<string, string>;
  return {
    what: t[`${metric}What`],
    chart: t[`${metric}Chart`],
    how: t[`${metric}How`],
  };
};
