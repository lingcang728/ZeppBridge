import { defineMessages } from '../../i18n';

/* 运动 / 睡眠列表相册视图的文案（胶囊、月 / 年卡、方块、日历热图）。 */
export const albumMessages = defineMessages(
  {
    open: '按年、月、日浏览',
    close: '回到列表',
    levels: '浏览层级',
    year: '年',
    month: '月',
    day: '日',
    workouts: (count: number) => `${count} 次运动`,
    nights: (count: number) => `${count} 晚`,
    distance: '距离',
    duration: '时长',
    avgOnset: '平均入睡',
    hrZones: '心率区间',
    openPeriod: (period: string) => `打开 ${period}`,
  },
  {
    open: 'Browse by year, month, day',
    close: 'Back to the list',
    levels: 'Browse level',
    year: 'Years',
    month: 'Months',
    day: 'Days',
    workouts: (count: number) => (count === 1 ? '1 workout' : `${count} workouts`),
    nights: (count: number) => (count === 1 ? '1 night' : `${count} nights`),
    distance: 'Distance',
    duration: 'Time',
    avgOnset: 'Avg bedtime',
    hrZones: 'Heart rate zones',
    openPeriod: (period: string) => `Open ${period}`,
  },
  {},
  'components/album/album',
);
