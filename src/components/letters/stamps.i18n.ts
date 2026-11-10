import { defineMessages } from '../../i18n';

/**
 * 写给作者的信纸上，「附上脱敏诊断报告」后面那排问题类型章：章上只写类别名（一两个词），四枚章一排放得下
 * （2026-11-10 普查：波兰语用设置里的全称，四枚章折成三排；英文「Numbers don't match」也要两排）。
 * 全称和说明进悬停提示。某个语言还没翻章名时，章上照旧写全称（`ownShort` 不拿英文顶）。
 */
export const stampMessages = defineMessages(
  { kind: { device: '设备没认出', workout: '运动没认出', data: '数据对不上', other: '其它问题' } },
  { kind: { device: 'Device', workout: 'Workout type', data: 'Numbers', other: 'Other' } },
  { kind: { device: 'Dispositivo', workout: 'Tipo de entreno', data: 'Números', other: 'Otro' } },
  'components/letters/stamps',
);
