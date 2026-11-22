import { defineMessages, messagesOf } from '../i18n';

/**
 * 时间范围的**唯一**一张梯子。
 *
 * 分开写的代价已经付过一次了：设置页的补拉下拉是 `[7, 30, 90, 365]`，而后端的
 * 补拉默认值是 180——180 不在选项里，`SelectMenu` 匹配不到就显示占位符，于是
 * 全新安装时那个下拉框是空的。同一时期导出页只给 7 天和 30 天，训练页给 7/30/180，
 * 三处各说各的。
 *
 * 所以范围只在这里定义一次，各处按用途取子集。
 */
export const RANGE_LADDER_DAYS = [7, 30, 90, 180, 365] as const;

export type RangeDays = (typeof RANGE_LADDER_DAYS)[number];

const messages = defineMessages(
  {
    d7: '7 天',
    d30: '1 个月',
    d90: '3 个月',
    d180: '6 个月',
    d365: '1 年',
    custom: (days: number) => `${days} 天`,
  },
  {
    d7: '7 days',
    d30: '1 month',
    d90: '3 months',
    d180: '6 months',
    d365: '1 year',
    custom: (days: number) => `${days} days`,
  },
  {
    d7: '7 días',
    d30: '1 mes',
    d90: '3 meses',
    d180: '6 meses',
    d365: '1 año',
    custom: (days: number) => `${days} días`,
  },
  'lib/rangeOptions',
);

const copy = () => messagesOf(messages);

/** 一个天数对应的说法。跟着当前语言走，所以是函数。 */
export const rangeLabel = (days: RangeDays): string => {
  const t = copy();
  const labels: Record<RangeDays, string> = {
    7: t.d7,
    30: t.d30,
    90: t.d90,
    180: t.d180,
    365: t.d365,
  };
  return labels[days];
};

/** 任意天数的说法：预设档用它们的名字，自定义范围的天数写「N 天」。 */
export const rangeText = (days: number): string => {
  const preset = (RANGE_LADDER_DAYS as readonly number[]).includes(days);
  return preset ? rangeLabel(days as RangeDays) : copy().custom(days);
};

/** 取梯子的一段，配好当前语言的文字。 */
export const rangeOptions = (
  days: readonly RangeDays[],
): Array<{ days: RangeDays; label: string }> =>
  days.map((value) => ({ days: value, label: rangeLabel(value) }));

/** 图表和导出的显示范围。四段（含 1 年：VO₂max、体重这类几周才测一次的指标一年才读得出趋势），仍能放进一行按钮。 */
export const DISPLAY_RANGE_DAYS: readonly RangeDays[] = [7, 30, 180, 365];
