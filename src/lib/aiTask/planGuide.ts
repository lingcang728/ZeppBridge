/**
 * 交给 AI 的 `.md` 末尾那段「如果要给我训练计划，请按这个格式」。
 *
 * 写在读法之后。AI 只有在我明确要求时才出计划；出的话回复里附一个 json 代码块，
 * ZeppBridge 的「粘贴 AI 的回复」读它、让人逐日确认之后才发到手表。
 *
 * 写法只用解析器真认、而且 2026-10-06 已在手表上实测过的那一套（`training_plan/parse.rs`、
 * `mod.rs` 的 `VERIFIED`）：
 *   - 手表只收 4 个大类，其余运动（走路、徒步……）会被 Zepp 静默丢掉——所以要 AI 在讨论阶段
 *     就说清「这条发不到手表」，绝不能藏进 rest.note；
 *   - 手表上第三方计划只到大类，子类型（户外 / 跑步机……）写进 variant，我们拼进描述第一行；
 *   - focus 和 description 必填；名字 14 个字以内（手表列表会截断）；
 *   - 按距离写步骤、配速目标、不设目标、同一天多条，都已核实可用。
 * 数字上限和后端校验对齐：最远 56 天后、一条训练最多 40 步、重复最多 50 次、不能套重复。
 */
import { defineMessages, messagesOf } from '../../i18n';

const isoDay = (date: Date, plus: number): string => {
  const moved = new Date(date.getFullYear(), date.getMonth(), date.getDate() + plus);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
};

/** 示例里的日期按今天往后排，AI 照着写出来的就是将来的日子，不会撞上「已经过去」的校验。 */
const exampleFor = (now: Date, text: ExampleText): string => JSON.stringify({
  format: 'zeppbridge-plan/3',
  summary: text.summary,
  rest: [{ date: isoDay(now, 1), bedtime: '22:30', sleepTarget: '8h30m', note: text.restNote }],
  from: isoDay(now, 1),
  to: isoDay(now, 4),
  workouts: [
    {
      date: isoDay(now, 2),
      sport: 'running',
      variant: 'track',
      name: text.intervalName,
      focus: text.intervalFocus,
      description: text.intervalDescription,
      steps: [
        { kind: 'warmup', duration: '12min', target: 'hr 110-130' },
        { repeat: 3, steps: [{ kind: 'interval', duration: '1km', target: 'pace 4:10-4:20' }, { kind: 'recovery', duration: '2min' }] },
        { kind: 'cooldown', duration: '8min', target: 'hr 100-125' },
      ],
    },
    {
      date: isoDay(now, 4),
      sport: 'cycling',
      variant: 'outdoor',
      name: text.rideName,
      focus: text.rideFocus,
      description: text.rideDescription,
      steps: [{ kind: 'active', duration: '90min', target: 'hr 120-140' }],
    },
  ],
});

type ExampleText = {
  summary: string;
  restNote: string;
  intervalName: string;
  intervalFocus: string;
  intervalDescription: string;
  rideName: string;
  rideFocus: string;
  rideDescription: string;
};

const messages = defineMessages(
  {
    example: {
      summary: '一次强度课，其余以有氧和恢复为主',
      restNote: '强度课前一晚早点睡',
      intervalName: '3×1公里间歇',
      intervalFocus: '提升速度耐力',
      intervalDescription: '每组跑匀，最后一组别冲\n恢复时慢跑或走',
      rideName: '长距离有氧骑',
      rideFocus: '强化耐力',
      rideDescription: '踏频 85–95，爬坡不要顶心率',
    },
    guide: (example: string) => [
      '先跟我商量，允许多轮修改。只有我明确说「定稿」「发计划」时，才输出最终训练计划 JSON：',
      '请在回复里附一个 ```json 代码块，用下面的格式；ZeppBridge 会读它，让我看过确认后发到手表。',
      '- date 写 YYYY-MM-DD，只排今天及以后，最远 56 天后。from / to 是这份计划管的日期范围：范围内你没写训练的日子会被当作休息日，原有的计划会被清掉；不写就取训练日期的最早到最晚。',
      '- 手表只收这 4 种 sport：running（variant 写 outdoor 户外 / treadmill 跑步机 / track 操场）、cycling（variant 写 outdoor 户外 / indoor 室内）、pool_swim、open_water_swim（游泳不写 variant）。手表上会让我再选一次子类型，所以 variant 一定要写对。',
      '- 走路、徒步、力量、瑜伽这类活动发不到手表（Zepp 会直接丢掉）。讨论时就明确告诉我「这条发不到手表」，由我决定换成上面能发的类型还是不排；不要把它藏进 rest 的 note 里。',
      '- 每条训练都要写 focus（训练目的，一个短词，例如「强化耐力」「提升乳酸阈」）和 description（要点，一两句，可以用 \\n 换行）；它们会显示在手表上，第一行是「目的 · 子类型」。',
      '- name 控制在 14 个字以内，太长手表列表会截断。',
      '- 每一步的 kind 是 warmup、active、interval、recovery、rest、cooldown 之一；duration 可以写时间 20min、90s、1h，也可以写距离 400m、5km；target 可以写心率 hr 135-150、配速 pace 5:00-5:30（每公里）、功率 power 200-220，或者不写（不设目标）。',
      '- 重复组写成 {"repeat": 次数, "steps": [...]}，次数 1 到 50，里面不能再套重复；一条训练最多 40 步，最长 8 小时。同一天可以排多条训练。',
      '- format 写 zeppbridge-plan/3；summary 写一句安排理由；rest 是休息/睡眠建议数组，每项含 date、bedtime（HH:MM）、sleepTarget（8h30m）、note。rest 仅留在本机，不发到手表；可以跟当天训练并存。',
      '示例：',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  {
    example: {
      summary: 'One quality session; the rest is aerobic work and recovery',
      restNote: 'Early night before the quality session',
      intervalName: '3×1 km intervals',
      intervalFocus: 'Speed endurance',
      intervalDescription: 'Run every rep evenly, do not sprint the last one\nJog or walk the recoveries',
      rideName: 'Long aerobic ride',
      rideFocus: 'Build endurance',
      rideDescription: 'Cadence 85–95; do not chase heart rate on climbs',
    },
    guide: (example: string) => [
      'Discuss the plan with me first, across multiple rounds if needed. Only output final plan JSON when I explicitly say “finalize” or “send the plan”:',
      'Add a ```json code block to your reply in the format below. ZeppBridge reads it, I review it, and then it is sent to my watch.',
      '- date is YYYY-MM-DD, today or later, at most 56 days ahead. from / to is the range this plan covers: days in that range with no workout are treated as rest days and any existing plan on them is cleared. If omitted, it spans the earliest to the latest workout date.',
      '- The watch only accepts these 4 sports: running (variant: outdoor / treadmill / track), cycling (variant: outdoor / indoor), pool_swim and open_water_swim (no variant for swimming). The watch asks me to pick the sub type again, so get variant right.',
      '- Walking, hiking, strength, yoga and similar activities cannot be sent to the watch (Zepp silently drops them). Tell me during the discussion that such a session “cannot go to the watch” and let me decide whether to swap it for a sport above or leave it out. Never hide it in a rest note.',
      '- Every workout needs focus (its purpose, a short phrase such as “Build endurance” or “Threshold”) and description (the key points in a sentence or two; \\n for a new line). Both appear on the watch, with “purpose · sub type” as the first line.',
      '- Keep name within about 14 characters; longer names get cut off in the watch list.',
      '- Each step\'s kind is one of warmup, active, interval, recovery, rest, cooldown; duration is time (20min, 90s, 1h) or distance (400m, 5km); target is heart rate hr 135-150, pace pace 5:00-5:30 (per km), power power 200-220, or omitted (no target).',
      '- A repeat group is {"repeat": count, "steps": [...]}, count 1 to 50, and it cannot contain another repeat. A workout has at most 40 steps and lasts at most 8 hours. Several workouts on one day are fine.',
      '- format is zeppbridge-plan/3; summary is one sentence; rest is an array of local rest/sleep advice with date, bedtime (HH:MM), sleepTarget (8h30m) and note. Rest advice stays local and is never sent to the watch; it may coexist with workouts.',
      'Example:',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  {
    example: {
      summary: 'Una sesión de calidad; el resto, trabajo aeróbico y recuperación',
      restNote: 'Acostarse pronto antes de la sesión de calidad',
      intervalName: '3×1 km series',
      intervalFocus: 'Resistencia a la velocidad',
      intervalDescription: 'Corre cada serie a ritmo constante, sin esprintar la última\nTrota o camina en las recuperaciones',
      rideName: 'Rodaje largo aeróbico',
      rideFocus: 'Mejorar resistencia',
      rideDescription: 'Cadencia 85–95; no persigas el pulso en las subidas',
    },
    guide: (example: string) => [
      'Hablemos primero del plan y revisémoslo juntos. Solo entrega el JSON final cuando diga «versión final» o «envía el plan»:',
      'Añade a tu respuesta un bloque de código ```json con el formato siguiente. ZeppBridge lo lee, yo lo reviso y luego se envía a mi reloj.',
      '- date es AAAA-MM-DD, de hoy en adelante y como máximo a 56 días. from / to es el rango que cubre este plan: los días de ese rango sin entrenamiento se tratan como descanso y se borra el plan que tuvieran. Si se omite, abarca de la primera a la última fecha de entrenamiento.',
      '- El reloj solo acepta estos 4 deportes: running (variant: outdoor / treadmill / track), cycling (variant: outdoor / indoor), pool_swim y open_water_swim (la natación no lleva variant). El reloj me pide elegir el subtipo otra vez, así que acierta con variant.',
      '- Caminar, senderismo, fuerza, yoga y actividades parecidas no llegan al reloj (Zepp las descarta sin avisar). Dímelo durante la conversación («esta sesión no llega al reloj») y déjame decidir si la cambio por un deporte de arriba o la quito. Nunca la escondas en una nota de rest.',
      '- Cada entrenamiento necesita focus (su objetivo, una frase corta como «Mejorar resistencia» o «Umbral») y description (los puntos clave en una o dos frases; \\n para un salto de línea). Ambos se ven en el reloj, con «objetivo · subtipo» en la primera línea.',
      '- Mantén name en unos 14 caracteres; los nombres largos se cortan en la lista del reloj.',
      '- El kind de cada paso es warmup, active, interval, recovery, rest o cooldown; duration es tiempo (20min, 90s, 1h) o distancia (400m, 5km); target es frecuencia hr 135-150, ritmo pace 5:00-5:30 (por km), potencia power 200-220, u omitido (sin objetivo).',
      '- Un grupo de repetición es {"repeat": veces, "steps": [...]}, de 1 a 50 veces, y no puede contener otra repetición. Un entrenamiento tiene como máximo 40 pasos y dura como máximo 8 horas. Puede haber varios entrenamientos el mismo día.',
      '- format es zeppbridge-plan/3; summary: una frase; rest: consejos locales con date, bedtime (HH:MM), sleepTarget (8h30m) y note. Estos consejos no se envían al reloj y pueden coincidir con entrenamiento.',
      'Ejemplo:',
      '```json',
      example,
      '```',
    ].join('\n'),
  },
  'lib/aiTask/planGuide',
);

export const planGuide = (now: Date = new Date()): string => {
  const text = messagesOf(messages);
  return text.guide(exampleFor(now, text.example));
};
