import { defineMessages, useMessages } from '../../i18n';

/**
 * 指标卡上的「问 AI」和「比平时高 / 低」（精修批次 6）。问题按这一项属于哪一类配；第一句跟着标记走
 * （比平时高 / 低 / 没有明显变化各一句）。只是帮你开个头，问出去以后还能在总页的输入框里改。
 */
const messages = defineMessages(
  {
    ask: '问 AI',
    askTitle: (label: string) => `问 AI · ${label}`,
    askHint: '选一个问题开个头：会新开一个任务，只带这一项近期的数据，问题已经填好，交出去之前还能改。',
    firstAbove: (label: string) => `${label}最近比平时高，可能代表什么？`,
    firstBelow: (label: string) => `${label}最近比平时低，可能代表什么？`,
    firstUsual: (label: string) => `${label}最近的变化正常吗？`,
    withTraining: (label: string) => `${label}和最近的训练量对得上吗？`,
    withSleep: '顺便看看睡眠',
    sleepWithTraining: '结合训练一起看看睡眠',
    trainingNext: '照这个状态，下周该加量还是减量？',
    bodyFood: (label: string) => `${label}的变化和饮食、训练对得上吗？`,
    above: (delta: string) => `比平时高 ${delta}`,
    below: (delta: string) => `比平时低 ${delta}`,
    baselineHint: (median: string, days: number) => `和你自己比：前 ${days} 天的中位数是 ${median}。不是诊断。`,
  },
  {
    ask: 'Ask AI',
    askTitle: (label: string) => `Ask AI · ${label}`,
    askHint: 'Pick a question to start with: it opens a new task with just this metric’s recent data and the question filled in. You can still edit it before sending.',
    firstAbove: (label: string) => `${label} has been higher than usual lately. What might it mean?`,
    firstBelow: (label: string) => `${label} has been lower than usual lately. What might it mean?`,
    firstUsual: (label: string) => `Is the recent change in ${label} normal?`,
    withTraining: (label: string) => `Does ${label} line up with my recent training load?`,
    withSleep: 'Look at my sleep too',
    sleepWithTraining: 'Look at my sleep together with training',
    trainingNext: 'In this state, should next week go up or down?',
    bodyFood: (label: string) => `Does the change in ${label} match my food and training?`,
    above: (delta: string) => `Above usual by ${delta}`,
    below: (delta: string) => `Below usual by ${delta}`,
    baselineHint: (median: string, days: number) => `Compared with you: the median of the previous ${days} days is ${median}. Not a diagnosis.`,
  },
  {
    ask: 'Preguntar a la IA',
    askTitle: (label: string) => `Preguntar a la IA · ${label}`,
    askHint: 'Elige una pregunta para empezar: abre una tarea nueva solo con los datos recientes de esta métrica y la pregunta escrita. Puedes cambiarla antes de enviar.',
    firstAbove: (label: string) => `${label} está más alto de lo habitual. ¿Qué puede significar?`,
    firstBelow: (label: string) => `${label} está más bajo de lo habitual. ¿Qué puede significar?`,
    firstUsual: (label: string) => `¿Es normal el cambio reciente de ${label}?`,
    withTraining: (label: string) => `¿Encaja ${label} con mi carga de entrenamiento reciente?`,
    withSleep: 'Mirar también mi sueño',
    sleepWithTraining: 'Mirar mi sueño junto con el entrenamiento',
    trainingNext: 'En este estado, ¿la próxima semana debería subir o bajar?',
    bodyFood: (label: string) => `¿El cambio de ${label} encaja con mi alimentación y entrenamiento?`,
    above: (delta: string) => `Por encima de lo habitual: ${delta}`,
    below: (delta: string) => `Por debajo de lo habitual: ${delta}`,
    baselineHint: (median: string, days: number) => `Comparado contigo: la mediana de los ${days} días anteriores es ${median}. No es un diagnóstico.`,
  },
  'components/ask/ask',
);

export const useAskText = () => useMessages(messages);
