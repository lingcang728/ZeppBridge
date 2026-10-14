import { defineMessages, useMessages } from '../../i18n';

/** 早上恢复差：把今天的间歇换成轻松的（概览周报卡、交给 AI 的周视图）。 */
const messages = defineMessages(
  {
    readiness: (today: number, usual: number) => `准备度 ${today}，平时 ${usual}`,
    swapRun: '换成轻松跑',
    swapRide: '换成轻松骑',
    swapSwim: '换成轻松游',
    notToday: '今天不用',
    /* 下面这些会写进计划、发到手表上，按换的那一刻的界面语言写。 */
    nameRun: '轻松跑',
    nameRide: '轻松骑',
    nameSwim: '轻松游',
    focus: '恢复',
    description: (original: string) => `准备度偏低，原计划「${original}」改成轻松练`,
  },
  {
    readiness: (today: number, usual: number) => `Readiness ${today}, usually ${usual}`,
    swapRun: 'Make it an easy run',
    swapRide: 'Make it an easy ride',
    swapSwim: 'Make it an easy swim',
    notToday: 'Not today',
    nameRun: 'Easy run',
    nameRide: 'Easy ride',
    nameSwim: 'Easy swim',
    focus: 'Recovery',
    description: (original: string) => `Readiness was low, so “${original}” became an easy session`,
  },
  {
    readiness: (today: number, usual: number) => `Recuperación ${today}, normalmente ${usual}`,
    swapRun: 'Cambiar a rodaje suave',
    swapRide: 'Cambiar a pedaleo suave',
    swapSwim: 'Cambiar a nado suave',
    notToday: 'Hoy no',
    nameRun: 'Rodaje suave',
    nameRide: 'Pedaleo suave',
    nameSwim: 'Nado suave',
    focus: 'Recuperación',
    description: (original: string) => `Recuperación baja: «${original}» pasó a una sesión suave`,
  },
  'components/plan/easySwap',
);

export const useEasySwapText = () => useMessages(messages);
