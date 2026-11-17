/*
 * 运动详情里「指着图表的哪一刻」：心率 / 配速 / 海拔 / 步频图悬停时写进来，轨迹卡（本地画布和地图）
 * 读它在路线上标出那一刻在哪——配速、步频一下掉下去，看得出是不是过马路。
 *
 * 同一时刻只开着一页运动详情，所以全局一份就够；轨迹卡卸载时清掉，换一条运动不会带着旧的点。
 */
import { readonly, ref } from 'vue';

const cursor = ref<number | null>(null);

/** 悬停的时刻（毫秒时间戳）；没在指图表时为 null。 */
export const routeCursor = readonly(cursor);

export const setRouteCursor = (time: number | null): void => {
  const next = time !== null && Number.isFinite(time) ? time : null;
  if (cursor.value !== next) cursor.value = next;
};

/** ECharts `updateAxisPointer` 事件里横轴（时间轴）那一项的值；指针收起时 axesInfo 是空的。 */
export const axisPointerTime = (event: { axesInfo?: Array<{ axisDim?: string; value?: unknown }> } | null | undefined): number | null => {
  const info = event?.axesInfo?.find((item) => item.axisDim === 'x');
  return typeof info?.value === 'number' ? info.value : null;
};
