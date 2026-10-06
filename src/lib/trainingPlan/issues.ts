/**
 * `ui.training_plan.issue.*` 文案表。
 *
 * 后端的校验只给稳定码和填空用的参数（`message_code` + `params`），句子按界面语言在这里取；
 * 后端自带的中文 `message` 只给 CLI / MCP / 日志用。取不到码（后端新增了而这里还不认识）才回落
 * 到后端原文，并过 `backendText` 闸门——英文界面下不会冒出中文。
 *
 * 严重程度（`severity`）决定能不能发：`error` 和 `unverified` 挡住发送，`warning` 只是提醒
 * （比如名字太长、手表列表里会被截断），可以发。
 */
import { backendText } from '../../i18n/backendText';
import { errorTextFor } from '../../i18n/errors';
import { defineMessages, messagesOf } from '../../i18n';
import { displayDateTimeFormatter, parseDisplayDate } from '../dateTime';
import type { PlanIssue } from '../../types/trainingPlan';

type Params = Record<string, unknown>;
type Text = (params: Params) => string;

const str = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const day = (value: unknown): string => {
  const text = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(text));
};

/** 发不到手表的活动叫什么（问题文案里要叫出名字）。显式标类型：它在下面的表里被引用，又读那张表。 */
const activity: (value: unknown) => string = (value) =>
  (messagesOf(messages).activity as Record<string, string>)[str(value)] ?? str(value);

const messages = defineMessages(
  {
    'ui.training_plan.issue.bad_date': (p: Params) => `日期要写成 年-月-日（例如 2026-10-07），现在是「${str(p.value)}」`,
    'ui.training_plan.issue.range_reversed': (p: Params) => `开始日期（${day(p.from)}）晚于结束日期（${day(p.to)}）`,
    'ui.training_plan.issue.empty': () => '计划里没有训练。要清空某几天，请写明开始和结束日期',
    'ui.training_plan.issue.outside_range': (p: Params) => `${day(p.date)} 这条训练不在计划写明的日期范围内`,
    'ui.training_plan.issue.same_day_unverified': (p: Params) => `${day(p.date)} 有两条训练，同一天两条在手表上怎么显示还没核实过`,
    'ui.training_plan.issue.past_date': (p: Params) => `${day(p.date)} 已经过去，不能给过去的日子排训练`,
    'ui.training_plan.issue.too_far': (p: Params) => `${day(p.date)} 太远了，计划最远排到 ${str(p.days)} 天后`,
    'ui.training_plan.issue.unknown_sport': (p: Params) => `不认识的运动类型「${str(p.value)}」（可以写：running、cycling、pool_swim、open_water_swim）`,
    'ui.training_plan.issue.bad_name': (p: Params) => `训练要有名字，且不超过 ${str(p.max)} 个字`,
    'ui.training_plan.issue.description_too_long': (p: Params) => `训练说明不超过 ${str(p.max)} 个字`,
    'ui.training_plan.issue.too_many_steps': (p: Params) => `一条训练最多 ${str(p.max)} 步`,
    'ui.training_plan.issue.workout_too_long': (p: Params) => `一条训练最长 ${str(p.hours)} 小时`,
    'ui.training_plan.issue.no_steps': () => '训练里至少要有一步',
    'ui.training_plan.issue.bad_repeat': (p: Params) => `重复次数要在 1 到 ${str(p.max)} 之间`,
    'ui.training_plan.issue.nested_repeat': () => '重复组里不能再套重复组',
    'ui.training_plan.issue.unknown_kind': (p: Params) => `不认识的步骤类型「${str(p.value)}」（可以写：warmup、active、interval、recovery、rest、cooldown）`,
    'ui.training_plan.issue.bad_duration': (p: Params) => `看不懂这个时长「${str(p.value)}」，请写成 20min、90s、1h、400m 或 5km`,
    'ui.training_plan.issue.duration_out_of_range': () => '每一步的时长要在 10 秒到 6 小时之间',
    'ui.training_plan.issue.distance_out_of_range': () => '每一步的距离要在 50 米到 100 公里之间',
    'ui.training_plan.issue.distance_unverified': () => '按距离计的步骤还没在你的手表上核实过，先改成时间更稳',
    'ui.training_plan.issue.bad_target': (p: Params) => `看不懂这个目标「${str(p.value)}」，请写成 hr 135-150、pace 5:30-5:50 或 power 200-220`,
    'ui.training_plan.issue.open_target_unverified': () => '不设目标的步骤还没在你的手表上核实过，先给一个心率区间',
    'ui.training_plan.issue.hr_out_of_range': (p: Params) => `心率区间要在 ${str(p.low)}–${str(p.high)} 的合理范围内，上限不超过 ${str(p.max)}，且两端不相等`,
    'ui.training_plan.issue.pace_out_of_range': () => '配速要在每公里 2:00 到 20:00 之间，且两端不相等',
    'ui.training_plan.issue.pace_unverified': () => '配速目标的单位还没在你的手表上核实过，先给一个心率区间',
    'ui.training_plan.issue.power_out_of_range': (p: Params) => `功率要在合理范围内（${str(p.low)}–${str(p.high)} 瓦），且两端不相等`,
    'ui.training_plan.issue.note_too_long': (p: Params) => `步骤备注不超过 ${str(p.max)} 个字`,
    'ui.training_plan.issue.sport_not_deliverable': (p: Params) => `手表只收跑步、骑行、泳池游泳和开放水域游泳，「${activity(p.activity)}」发不到手表。删掉这天，或改成能发的类型`,
    'ui.training_plan.issue.bad_variant': (p: Params) => `「${str(p.value)}」不是这个运动的子类型（跑步：outdoor、treadmill、track；骑行：outdoor、indoor）`,
    'ui.training_plan.issue.missing_focus': () => '要写训练目的（例如「强化耐力」），它会显示在手表描述的第一行',
    'ui.training_plan.issue.focus_too_long': (p: Params) => `训练目的写一个短词，不超过 ${str(p.max)} 个字、不换行`,
    'ui.training_plan.issue.missing_description': () => '要写训练要点，手表上会显示在描述里',
    'ui.training_plan.issue.name_truncated': (p: Params) => `名字超过 ${str(p.max)} 个字，手表列表里会被截断（点开详情仍是全名）`,
    fallback: () => '这条计划有一处无法识别的问题',
    activity: { walking: '步行', hiking: '徒步', strength: '力量训练', yoga: '瑜伽 / 拉伸', rowing: '划船', elliptical: '椭圆机' },
  },
  {
    'ui.training_plan.issue.bad_date': (p: Params) => `Write dates as year-month-day (for example 2026-10-07); this one is “${str(p.value)}”`,
    'ui.training_plan.issue.range_reversed': (p: Params) => `The start date (${day(p.from)}) is after the end date (${day(p.to)})`,
    'ui.training_plan.issue.empty': () => 'The plan has no workouts. To clear some days, give a start and an end date',
    'ui.training_plan.issue.outside_range': (p: Params) => `The workout on ${day(p.date)} is outside the dates the plan declares`,
    'ui.training_plan.issue.same_day_unverified': (p: Params) => `There are two workouts on ${day(p.date)}; how two on one day show on the watch has not been verified`,
    'ui.training_plan.issue.past_date': (p: Params) => `${day(p.date)} has already passed; you cannot plan a workout in the past`,
    'ui.training_plan.issue.too_far': (p: Params) => `${day(p.date)} is too far ahead; plans reach at most ${str(p.days)} days out`,
    'ui.training_plan.issue.unknown_sport': (p: Params) => `Unknown sport “${str(p.value)}” (use running, cycling, pool_swim or open_water_swim)`,
    'ui.training_plan.issue.bad_name': (p: Params) => `A workout needs a name of at most ${str(p.max)} characters`,
    'ui.training_plan.issue.description_too_long': (p: Params) => `A workout description can be at most ${str(p.max)} characters`,
    'ui.training_plan.issue.too_many_steps': (p: Params) => `A workout can have at most ${str(p.max)} steps`,
    'ui.training_plan.issue.workout_too_long': (p: Params) => `A workout can last at most ${str(p.hours)} hours`,
    'ui.training_plan.issue.no_steps': () => 'A workout needs at least one step',
    'ui.training_plan.issue.bad_repeat': (p: Params) => `A repeat must run between 1 and ${str(p.max)} times`,
    'ui.training_plan.issue.nested_repeat': () => 'A repeat cannot contain another repeat',
    'ui.training_plan.issue.unknown_kind': (p: Params) => `Unknown step type “${str(p.value)}” (use warmup, active, interval, recovery, rest or cooldown)`,
    'ui.training_plan.issue.bad_duration': (p: Params) => `Cannot read the duration “${str(p.value)}”; write it as 20min, 90s, 1h, 400m or 5km`,
    'ui.training_plan.issue.duration_out_of_range': () => 'Each step must last between 10 seconds and 6 hours',
    'ui.training_plan.issue.distance_out_of_range': () => 'Each step must cover between 50 m and 100 km',
    'ui.training_plan.issue.distance_unverified': () => 'Steps measured by distance have not been verified on your watch yet; writing them as time is safer',
    'ui.training_plan.issue.bad_target': (p: Params) => `Cannot read the target “${str(p.value)}”; write it as hr 135-150, pace 5:30-5:50 or power 200-220`,
    'ui.training_plan.issue.open_target_unverified': () => 'Steps with no target have not been verified on your watch yet; give a heart-rate range instead',
    'ui.training_plan.issue.hr_out_of_range': (p: Params) => `The heart-rate range ${str(p.low)}–${str(p.high)} is not usable: stay below ${str(p.max)} and keep the two ends different`,
    'ui.training_plan.issue.pace_out_of_range': () => 'Pace must be between 2:00 and 20:00 per km, with the two ends different',
    'ui.training_plan.issue.pace_unverified': () => 'The unit of pace targets has not been verified on your watch yet; give a heart-rate range instead',
    'ui.training_plan.issue.power_out_of_range': (p: Params) => `The power range ${str(p.low)}–${str(p.high)} W is not usable; keep it in a sensible range with the two ends different`,
    'ui.training_plan.issue.note_too_long': (p: Params) => `A step note can be at most ${str(p.max)} characters`,
    'ui.training_plan.issue.sport_not_deliverable': (p: Params) => `The watch only accepts running, cycling, pool and open-water swimming, so ${activity(p.activity)} cannot be sent. Remove the day or change it to a type that can be sent`,
    'ui.training_plan.issue.bad_variant': (p: Params) => `“${str(p.value)}” is not a sub type of this sport (running: outdoor, treadmill, track; cycling: outdoor, indoor)`,
    'ui.training_plan.issue.missing_focus': () => 'Add a purpose (for example “Build endurance”); it becomes the first line of the description on the watch',
    'ui.training_plan.issue.focus_too_long': (p: Params) => `Keep the purpose to a short phrase of at most ${str(p.max)} characters on one line`,
    'ui.training_plan.issue.missing_description': () => 'Add the key points; the watch shows them in the description',
    'ui.training_plan.issue.name_truncated': (p: Params) => `The name is longer than ${str(p.max)} characters and will be cut off in the watch list (the detail view still shows it in full)`,
    fallback: () => 'Something in this plan could not be recognised',
    activity: { walking: 'walking', hiking: 'hiking', strength: 'strength training', yoga: 'yoga / stretching', rowing: 'rowing', elliptical: 'elliptical' },
  },
  {
    'ui.training_plan.issue.bad_date': (p: Params) => `Escribe las fechas como año-mes-día (por ejemplo 2026-10-07); esta es «${str(p.value)}»`,
    'ui.training_plan.issue.range_reversed': (p: Params) => `La fecha de inicio (${day(p.from)}) es posterior a la de fin (${day(p.to)})`,
    'ui.training_plan.issue.empty': () => 'El plan no tiene entrenamientos. Para vaciar algunos días, indica fecha de inicio y de fin',
    'ui.training_plan.issue.outside_range': (p: Params) => `El entrenamiento del ${day(p.date)} queda fuera de las fechas que declara el plan`,
    'ui.training_plan.issue.same_day_unverified': (p: Params) => `Hay dos entrenamientos el ${day(p.date)}; no se ha verificado cómo se muestran dos en un día en el reloj`,
    'ui.training_plan.issue.past_date': (p: Params) => `El ${day(p.date)} ya pasó; no se puede planificar en el pasado`,
    'ui.training_plan.issue.too_far': (p: Params) => `El ${day(p.date)} queda demasiado lejos; el plan llega como máximo a ${str(p.days)} días`,
    'ui.training_plan.issue.unknown_sport': (p: Params) => `Deporte desconocido «${str(p.value)}» (usa running, cycling, pool_swim u open_water_swim)`,
    'ui.training_plan.issue.bad_name': (p: Params) => `Cada entrenamiento necesita un nombre de máximo ${str(p.max)} caracteres`,
    'ui.training_plan.issue.description_too_long': (p: Params) => `La descripción puede tener como máximo ${str(p.max)} caracteres`,
    'ui.training_plan.issue.too_many_steps': (p: Params) => `Un entrenamiento puede tener como máximo ${str(p.max)} pasos`,
    'ui.training_plan.issue.workout_too_long': (p: Params) => `Un entrenamiento puede durar como máximo ${str(p.hours)} horas`,
    'ui.training_plan.issue.no_steps': () => 'Un entrenamiento necesita al menos un paso',
    'ui.training_plan.issue.bad_repeat': (p: Params) => `Las repeticiones deben ser entre 1 y ${str(p.max)}`,
    'ui.training_plan.issue.nested_repeat': () => 'Una repetición no puede contener otra repetición',
    'ui.training_plan.issue.unknown_kind': (p: Params) => `Tipo de paso desconocido «${str(p.value)}» (usa warmup, active, interval, recovery, rest o cooldown)`,
    'ui.training_plan.issue.bad_duration': (p: Params) => `No se entiende la duración «${str(p.value)}»; escríbela como 20min, 90s, 1h, 400m o 5km`,
    'ui.training_plan.issue.duration_out_of_range': () => 'Cada paso debe durar entre 10 segundos y 6 horas',
    'ui.training_plan.issue.distance_out_of_range': () => 'Cada paso debe cubrir entre 50 m y 100 km',
    'ui.training_plan.issue.distance_unverified': () => 'Los pasos por distancia aún no se han verificado en tu reloj; es más seguro escribirlos como tiempo',
    'ui.training_plan.issue.bad_target': (p: Params) => `No se entiende el objetivo «${str(p.value)}»; escríbelo como hr 135-150, pace 5:30-5:50 o power 200-220`,
    'ui.training_plan.issue.open_target_unverified': () => 'Los pasos sin objetivo aún no se han verificado en tu reloj; indica un rango de frecuencia cardíaca',
    'ui.training_plan.issue.hr_out_of_range': (p: Params) => `El rango de frecuencia ${str(p.low)}–${str(p.high)} no es válido: no superes ${str(p.max)} y que los dos extremos sean distintos`,
    'ui.training_plan.issue.pace_out_of_range': () => 'El ritmo debe estar entre 2:00 y 20:00 por km, con los dos extremos distintos',
    'ui.training_plan.issue.pace_unverified': () => 'La unidad de los objetivos de ritmo aún no se ha verificado en tu reloj; indica un rango de frecuencia cardíaca',
    'ui.training_plan.issue.power_out_of_range': (p: Params) => `El rango de potencia ${str(p.low)}–${str(p.high)} W no es válido; mantenlo en un rango razonable con los extremos distintos`,
    'ui.training_plan.issue.note_too_long': (p: Params) => `La nota de un paso puede tener como máximo ${str(p.max)} caracteres`,
    'ui.training_plan.issue.sport_not_deliverable': (p: Params) => `El reloj solo acepta carrera, ciclismo, natación en piscina y en aguas abiertas; ${activity(p.activity)} no se puede enviar. Elimina el día o cámbialo a un tipo que sí se envíe`,
    'ui.training_plan.issue.bad_variant': (p: Params) => `«${str(p.value)}» no es un subtipo de este deporte (carrera: outdoor, treadmill, track; ciclismo: outdoor, indoor)`,
    'ui.training_plan.issue.missing_focus': () => 'Añade el objetivo (por ejemplo «Mejorar resistencia»); será la primera línea de la descripción en el reloj',
    'ui.training_plan.issue.focus_too_long': (p: Params) => `El objetivo debe ser una frase corta de máximo ${str(p.max)} caracteres en una sola línea`,
    'ui.training_plan.issue.missing_description': () => 'Añade los puntos clave; el reloj los muestra en la descripción',
    'ui.training_plan.issue.name_truncated': (p: Params) => `El nombre supera ${str(p.max)} caracteres y se cortará en la lista del reloj (el detalle lo muestra completo)`,
    fallback: () => 'No se pudo reconocer algo de este plan',
    activity: { walking: 'caminata', hiking: 'senderismo', strength: 'fuerza', yoga: 'yoga / estiramientos', rowing: 'remo', elliptical: 'elíptica' },
  },
  'lib/trainingPlan/issues',
);

const copy = () => messagesOf(messages) as unknown as Record<string, Text>;

/** 一条校验问题的界面文案：先按码取，取不到才回落到后端原文（过 backendText 闸门）。 */
export const planIssueText = (issue: PlanIssue): string => {
  const table = copy();
  const render = table[issue.message_code];
  if (typeof render === 'function') return render(issue.params ?? {});
  const error = errorTextFor(issue.message_code);
  if (error) return error;
  const { message: backendFallback } = issue;
  return backendText(backendFallback, table.fallback({}));
};
