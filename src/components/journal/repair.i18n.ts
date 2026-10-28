import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages({
  timelineEmpty: '点轴上任意一天，记一件事',
  timelineToday: '今天',
  pbCard: (distance: string, rank: number, total: number, time: string) => `${distance}，第 ${rank} 快，共 ${total} 次：${time}`,
  noRaces: '还没有比赛', noInjuries: '还没有伤病记录',
  untilNow: '至今', more: '更多', distance: '总里程', recorded: '记录',
}, {
  timelineEmpty: 'Pick a day on the timeline to log an event',
  timelineToday: 'Today',
  pbCard: (distance: string, rank: number, total: number, time: string) => `${distance}, #${rank} fastest of ${total}: ${time}`,
  noRaces: 'No races yet', noInjuries: 'No injuries logged',
  untilNow: 'Present', more: 'More', distance: 'Total distance', recorded: 'Recorded',
}, {
  timelineEmpty: 'Elige un día en la cronología para registrar un evento',
  timelineToday: 'Hoy',
  pbCard: (distance: string, rank: number, total: number, time: string) => `${distance}, ${rank}.º más rápido de ${total}: ${time}`,
  noRaces: 'Aún no hay carreras', noInjuries: 'No hay lesiones registradas',
  untilNow: 'Actualidad', more: 'Más', distance: 'Distancia total', recorded: 'Registrado',
}, 'components/journal/repair');
export const useRepairText = () => useMessages(messages);
