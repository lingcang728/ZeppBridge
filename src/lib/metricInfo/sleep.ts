import { defineMessages, messagesOf } from '../../i18n';

/*
 * 「?」浮层三段文案·睡眠详情域（D6）：时长、评分、近 7 天结构三张主卡与阶段卡。
 * 阶段说明（深睡 / 浅睡 / REM / 清醒）也走同一个「?」浮层（sleep_stages），和时长、评分一个结构。
 * 页脚那句「只展示云端给的阶段汇总」是整页的口径，留在页脚，不进浮层重复。
 */

const messages = defineMessages(
  {
    sleep_durationWhat: '睡眠时长：这一晚睡着的时间，不含床上清醒的片段。',
    sleep_durationChart: '大数字是这一晚的合计；入睡、醒来与在床的时刻写在下面一行。',
    sleep_durationHow: '来自云端的睡眠记录——官方授权与「高级数据」都会提供；云端没给睡着时长时按起止与各阶段时长推算。',
    sleep_scoreWhat: '睡眠评分：设备对这一晚的综合打分，满分 100。',
    sleep_scoreChart: '只作展示，不在这里解读，也不做诊断。',
    sleep_scoreHow: '设备随这一晚的睡眠记录直接给出（官方授权与「高级数据」都会提供），不是 ZeppBridge 算的。',
    sleep_weeklyWhat: '近 7 天睡眠结构：每晚各睡眠阶段的时长。',
    sleep_weeklyChart: '每晚一根柱，按深睡 / 浅睡 / REM / 清醒堆叠；当前这一晚高亮；未提供的阶段如实标「未提供」。',
    sleep_weeklyHow: '阶段时长随睡眠记录一起同步——官方授权与「高级数据」都会提供。',
    sleep_stagesWhat: '深睡：恢复体力的深度睡眠。浅睡：占比较高的过渡阶段。REM：快速眼动期，多与记忆和梦境有关。清醒：夜间醒来或清醒片段。',
    sleep_stagesChart: '一条时间轴从入睡排到醒来，每一段按所处的阶段上色；悬停可看那一段的起止与时长。',
    sleep_stagesHow: '阶段切分由设备给出，随睡眠记录同步；这里只说明各阶段的含义，不是健康诊断。',
  },
  {
    sleep_durationWhat: 'Time asleep: the night’s total time asleep, excluding stretches awake in bed.',
    sleep_durationChart: 'The big number is this night’s total; when you fell asleep, woke and the time in bed are on the line below.',
    sleep_durationHow: 'From the cloud’s sleep record — both the official authorization and advanced data provide it; when the cloud sends no time-asleep figure, it is worked out from the start, end and stage durations.',
    sleep_scoreWhat: 'Sleep score: the device’s own overall mark for the night, out of 100.',
    sleep_scoreChart: 'Shown as recorded — no reading into it here, and no diagnosis.',
    sleep_scoreHow: 'Given by the device with the night’s sleep record (both the official authorization and advanced data provide it) — not computed by ZeppBridge.',
    sleep_weeklyWhat: 'Sleep structure, last 7 nights: how long each stage took each night.',
    sleep_weeklyChart: 'One bar per night, stacked into deep / light / REM / awake; this record’s night is highlighted; a stage the cloud left out is labelled “Not provided”.',
    sleep_weeklyHow: 'Stage durations come with each sleep record — both the official authorization and advanced data provide them.',
    sleep_stagesWhat: 'Deep: the restorative stretch. Light: the transitional stage that takes up most of the night. REM: rapid eye movement, tied to memory and dreaming. Awake: waking up or lying awake in the night.',
    sleep_stagesChart: 'One timeline from falling asleep to waking, each stretch coloured by its stage; hover to see when it started, ended and how long it lasted.',
    sleep_stagesHow: 'The device splits the night into stages and they sync with the sleep record. These are definitions, not a health diagnosis.',
  },
  {
    sleep_durationWhat: 'Tiempo dormido: el total de esa noche, sin contar los ratos despierto en la cama.',
    sleep_durationChart: 'El número grande es el total de la noche; cuándo te dormiste, despertaste y el tiempo en cama van en la línea de abajo.',
    sleep_durationHow: 'Del registro de sueño de la nube — la autorización oficial y los datos avanzados lo dan; cuando la nube no envía el tiempo dormido, se calcula con el inicio, el fin y la duración de las fases.',
    sleep_scoreWhat: 'Puntuación de sueño: la nota global que da el dispositivo a la noche, sobre 100.',
    sleep_scoreChart: 'Se muestra tal cual: aquí no se interpreta ni se diagnostica.',
    sleep_scoreHow: 'La da el dispositivo con el registro de esa noche (autorización oficial y datos avanzados); no la calcula ZeppBridge.',
    sleep_weeklyWhat: 'Estructura del sueño, últimas 7 noches: cuánto duró cada fase cada noche.',
    sleep_weeklyChart: 'Una barra por noche, apilada en profundo / ligero / REM / despierto; la noche de este registro queda resaltada; una fase que la nube no dio se marca «Sin datos».',
    sleep_weeklyHow: 'La duración de las fases llega con cada registro de sueño — la autorización oficial y los datos avanzados la dan.',
    sleep_stagesWhat: 'Profundo: el tramo reparador. Ligero: la fase de transición que ocupa la mayor parte de la noche. REM: movimiento ocular rápido, asociado a la memoria y los sueños. Despierto: despertares o ratos despierto durante la noche.',
    sleep_stagesChart: 'Una línea de tiempo desde que te dormiste hasta que despertaste, con cada tramo coloreado según su fase; pasa el cursor para ver su inicio, fin y duración.',
    sleep_stagesHow: 'El dispositivo divide la noche en fases, que se sincronizan con el registro de sueño. Son definiciones, no un diagnóstico de salud.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'lib/metricInfo/sleep',
);

export const SLEEP_METRICS = ['sleep_duration', 'sleep_score', 'sleep_weekly', 'sleep_stages'] as const;

/** 按指标 id 取三段文案；认不出的 id 返回 null。 */
export const sleepInfo = (metric: string): { what: string; chart: string; how: string } | null => {
  if (!(SLEEP_METRICS as readonly string[]).includes(metric)) return null;
  const t = messagesOf(messages) as Record<string, string>;
  return {
    what: t[`${metric}What`],
    chart: t[`${metric}Chart`],
    how: t[`${metric}How`],
  };
};
