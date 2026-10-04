/**
 * 交给 AI 的 `.md` 末尾那段「如果要给我训练计划，请按这个格式」。
 *
 * 写在读法之后。AI 只有在我明确要求时才出计划；出的话回复里附一个 json 代码块，
 * ZeppBridge 的「粘贴 AI 的回复」读它、让人逐日确认之后才发到手表。
 *
 * 写法只用解析器真认的那一套（`training_plan/parse.rs`、`mod.rs`）：运动与步骤类型是英文标识，
 * 时长 `20min` / `90s` / `1h`（鼓励写时间，按距离的步骤还没在手表上核实），目标 `hr 135-150`。
 * 数字上限和后端校验对齐：最远 56 天后、一条训练最多 40 步、重复最多 50 次、不能套重复。
 */
import { defineMessages, messagesOf } from '../../i18n';

const isoDay = (date: Date, plus: number): string => {
  const moved = new Date(date.getFullYear(), date.getMonth(), date.getDate() + plus);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
};

/** 示例里的日期按今天往后排，AI 照着写出来的就是将来的日子，不会撞上「已经过去」的校验。 */
const exampleFor = (now: Date): string => JSON.stringify({
  format: "zeppbridge-plan/2",
  summary: "One quality session, easy running and recovery",
  rest: [{ date: isoDay(now, 1), bedtime: "22:30", sleepTarget: "8h30m", note: "Recover before the quality session" }],
  from: isoDay(now, 1),
  to: isoDay(now, 3),
  workouts: [{
    date: isoDay(now, 2),
    sport: 'running',
    name: '3 x 3 min intervals',
    steps: [
      { kind: 'warmup', duration: '12min', target: 'hr 110-130' },
      { repeat: 3, steps: [{ kind: 'interval', duration: '3min', target: 'hr 160-172' }, { kind: 'recovery', duration: '2min', target: 'hr 120-140' }] },
      { kind: 'cooldown', duration: '8min', target: 'hr 100-125' },
    ],
  }],
});

const messages = defineMessages(
  {
    guide: (example: string) => [
      '先跟我商量，允许多轮修改。只有我明确说「定稿」「发计划」时，才输出最终训练计划 JSON：',
      '请在回复里附一个 ```json 代码块，用下面的格式；ZeppBridge 会读它，让我看过确认后发到手表。',
      '- date 写 YYYY-MM-DD，只排今天及以后，最远 56 天后。from / to 是这份计划管的日期范围：范围内你没写训练的日子会被当作休息日，原有的计划会被清掉；不写就取训练日期的最早到最晚。',
      '- sport 只能是 running、cycling、pool_swim、open_water_swim。',
      '- 每一步的 kind 是 warmup、active、interval、recovery、rest、cooldown 之一；duration 写成 20min、90s、1h（尽量写时间，不要用距离）；target 写成 hr 135-150（心率，次/分钟）。',
      '- 重复组写成 {"repeat": 次数, "steps": [...]}，次数 1 到 50，里面不能再套重复；一条训练最多 40 步，最长 8 小时。',
      '- 可选 format 写 zeppbridge-plan/2；summary 写一句安排理由；rest 是休息/睡眠建议数组，每项含 date、bedtime（HH:MM）、sleepTarget（8h30m）、note。rest 仅留在本机，不发到手表；可以跟当天训练并存。旧格式同样可读。',
      '示例：',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  {
    guide: (example: string) => [
      'Discuss the plan with me first, across multiple rounds if needed. Only output final plan JSON when I explicitly say “finalize” or “send the plan”:',
      'Add a ```json code block to your reply in the format below. ZeppBridge reads it, I review it, and then it is sent to my watch.',
      '- date is YYYY-MM-DD, today or later, at most 56 days ahead. from / to is the range this plan covers: days in that range with no workout are treated as rest days and any existing plan on them is cleared. If omitted, it spans the earliest to the latest workout date.',
      '- sport must be one of running, cycling, pool_swim, open_water_swim.',
      '- Each step\'s kind is one of warmup, active, interval, recovery, rest, cooldown; duration is written as 20min, 90s or 1h (prefer time over distance); target is written as hr 135-150 (heart rate, bpm).',
      '- A repeat group is {"repeat": count, "steps": [...]}, count 1 to 50, and it cannot contain another repeat. A workout has at most 40 steps and lasts at most 8 hours.',
      '- Optional format is zeppbridge-plan/2; summary is one sentence; rest is an array of local rest/sleep advice with date, bedtime (HH:MM), sleepTarget (8h30m) and note. Rest advice stays local and is never sent to the watch; it may coexist with workouts. Old plans remain readable.',
      'Example:',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  {
    guide: (example: string) => [
      'Hablemos primero del plan y revisémoslo juntos. Solo entrega el JSON final cuando diga «versión final» o «envía el plan»:',
      'Añade a tu respuesta un bloque de código ```json con el formato siguiente. ZeppBridge lo lee, yo lo reviso y luego se envía a mi reloj.',
      '- date es AAAA-MM-DD, de hoy en adelante y como máximo a 56 días. from / to es el rango que cubre este plan: los días de ese rango sin entrenamiento se tratan como descanso y se borra el plan que tuvieran. Si se omite, abarca de la primera a la última fecha de entrenamiento.',
      '- sport debe ser running, cycling, pool_swim u open_water_swim.',
      '- El kind de cada paso es warmup, active, interval, recovery, rest o cooldown; duration se escribe como 20min, 90s o 1h (mejor tiempo que distancia); target se escribe como hr 135-150 (frecuencia cardíaca, ppm).',
      '- Un grupo de repetición es {"repeat": veces, "steps": [...]}, de 1 a 50 veces, y no puede contener otra repetición. Un entrenamiento tiene como máximo 40 pasos y dura como máximo 8 horas.',
      '- format opcional: zeppbridge-plan/2; summary: una frase; rest: consejos locales con date, bedtime (HH:MM), sleepTarget (8h30m) y note. Estos consejos no se envían al reloj y pueden coincidir con entrenamiento. Los planes antiguos siguen siendo compatibles.',
      'Ejemplo:',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  'lib/aiTask/planGuide',
);

export const planGuide = (now: Date = new Date()): string => messagesOf(messages).guide(exampleFor(now));
