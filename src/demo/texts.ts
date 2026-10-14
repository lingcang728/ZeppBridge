/**
 * 演示数据里会被访客直接看见的文字：随界面语言走（zh / en / es，其余语言先给英文）。
 *
 * 数据本身是合成的，但出现在英文界面里的生活事件、训练名、任务名不能是中文——
 * 访客换了语言，这些也要跟着换。所以取文案一律在「被问到的那一刻」，不在装运行时的时候定死。
 */
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  {
    nickname: '示例用户',
    lifeEvent: '开始备赛半程马拉松',
    taskTitle: (month: number, day: number) => `最近 14 天 · ${month}月${day}日`,
    taskFile: '最近 14 天',
    easyRun: '轻松跑',
    recoveryRide: '恢复骑行',
    tempoRun: '节奏跑',
    intervals: '间歇 5×3 分钟',
    longRun: '长距离慢跑',
  },
  {
    nickname: 'Demo user',
    lifeEvent: 'Started half-marathon training',
    taskTitle: (month: number, day: number) => `Last 14 days · ${month}/${day}`,
    taskFile: 'last 14 days',
    easyRun: 'Easy run',
    recoveryRide: 'Recovery ride',
    tempoRun: 'Tempo run',
    intervals: 'Intervals 5×3 min',
    longRun: 'Long slow run',
  },
  {
    nickname: 'Usuario de ejemplo',
    lifeEvent: 'Empecé a preparar una media maratón',
    taskTitle: (month: number, day: number) => `Últimos 14 días · ${day}/${month}`,
    taskFile: 'últimos 14 días',
    easyRun: 'Carrera suave',
    recoveryRide: 'Ciclismo de recuperación',
    tempoRun: 'Carrera de ritmo',
    intervals: 'Intervalos 5×3 min',
    longRun: 'Carrera larga y lenta',
  },
  'demo/texts',
);

export const demoText = () => messagesOf(messages);
