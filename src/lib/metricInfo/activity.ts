import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·日常活动域（D6）：steps / distance / active_calories / active_minutes。
 *
 * 来源事实（v3-plan §3、normalizer/tests/official.rs）：官方授权与「高级数据」都会给
 * 每日步数、距离、活动热量；活动分钟只有「高级数据」（官方每日汇总不带它）。
 */

const messages = defineMessages(
  {
    stepsWhat: '步数：手表按天汇总的走路步数。',
    stepsChart: '每天一个点；没记录的日期曲线断开，不补 0。每小时怎么分布见上面的每小时卡。',
    stepsHow: '官方授权与「高级数据」都会提供每日步数；分布图以旧通道的逐分钟记录为主，官方的按小时汇总补缺。',
    distanceWhat: '距离：当天累计的移动距离。',
    distanceChart: '每天一个点；没记录的日期曲线断开，不补 0。',
    distanceHow: '官方授权与「高级数据」都会提供，随每日活动汇总一起同步。',
    active_caloriesWhat: '活动热量：当天活动消耗的热量，不含基础代谢。',
    active_caloriesChart: '每天一个点；没记录的日期曲线断开，不补 0。',
    active_caloriesHow: '官方授权与「高级数据」都会提供这一项，与全天的总热量分开记。',
    active_minutesWhat: '活动时长：手表判定为「在活动」的分钟数。',
    active_minutesChart: '每天一个点；没记录的日期曲线断开，不补 0。',
    active_minutesHow: '来自「高级数据」——官方的每日汇总暂不提供活动分钟。',
  },
  {
    stepsWhat: 'Steps: the day’s step total as the watch sums it up.',
    stepsChart: 'One point per day; days without a record break the line rather than filling in 0. The hour-by-hour shape is in the hourly card above.',
    stepsHow: 'Both the official authorization and advanced data provide daily steps; the hourly card leans on the legacy channel’s per-minute records first and fills gaps with the official hourly summary.',
    distanceWhat: 'Distance: how far you moved that day in total.',
    distanceChart: 'One point per day; days without a record break the line rather than filling in 0.',
    distanceHow: 'Both the official authorization and advanced data provide it, synced with the daily activity summary.',
    active_caloriesWhat: 'Active burn: the day’s activity-only burn, basal metabolism excluded.',
    active_caloriesChart: 'One point per day; days without a record break the line rather than filling in 0.',
    active_caloriesHow: 'Both the official authorization and advanced data provide it, kept separate from the day’s total burn.',
    active_minutesWhat: 'Active minutes: the minutes the watch counted as activity.',
    active_minutesChart: 'One point per day; days without a record break the line rather than filling in 0.',
    active_minutesHow: 'Via advanced data — the official daily summary does not carry active minutes yet.',
  },
  {
    stepsWhat: 'Pasos: el total del día según lo resume el reloj.',
    stepsChart: 'Un punto por día; los días sin registro cortan la línea en vez de rellenar 0. La forma por horas está en la tarjeta horaria de arriba.',
    stepsHow: 'La autorización oficial y los datos avanzados dan los pasos diarios; la tarjeta por horas se apoya primero en los registros por minuto del canal antiguo y rellena huecos con el resumen horario oficial.',
    distanceWhat: 'Distancia: cuánto te moviste ese día en total.',
    distanceChart: 'Un punto por día; los días sin registro cortan la línea en vez de rellenar 0.',
    distanceHow: 'La autorización oficial y los datos avanzados la dan, con el resumen diario de actividad.',
    active_caloriesWhat: 'Calorías activas: lo quemado solo por actividad, sin el metabolismo basal.',
    active_caloriesChart: 'Un punto por día; los días sin registro cortan la línea en vez de rellenar 0.',
    active_caloriesHow: 'La autorización oficial y los datos avanzados la dan, separada del gasto total del día.',
    active_minutesWhat: 'Minutos activos: los minutos que el reloj contó como actividad.',
    active_minutesChart: 'Un punto por día; los días sin registro cortan la línea en vez de rellenar 0.',
    active_minutesHow: 'Por los datos avanzados; el resumen diario oficial todavía no trae minutos activos.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/metricInfo/activity',
);

export const ACTIVITY_METRICS = [
  'steps',
  'distance',
  'active_calories',
  'active_minutes',
] as const;

/** 按指标 id 取三段文案；认不出的 id 返回 null。 */
export const activityInfo = (metric: string): { what: string; chart: string; how: string } | null => {
  if (!(ACTIVITY_METRICS as readonly string[]).includes(metric)) return null;
  const t = messagesOf(messages) as Record<string, string>;
  return {
    what: t[`${metric}What`],
    chart: t[`${metric}Chart`],
    how: t[`${metric}How`],
  };
};
