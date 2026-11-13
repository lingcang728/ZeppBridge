/**
 * 这条运动该不该有轨迹（2026-11-13 用户：健身本身没有 GPS，就别提「没有轨迹」）。
 *
 * 和 useWorkoutPresentation 的距离判断同一个思路：看这条记录**有没有距离**，不按类型白名单——
 * 力量训练、瑜伽、HIIT 没有距离，本来就不会有路线；只有带距离的（户外跑、骑行、徒步……）缺了轨迹才值得说一句。
 * 室内跑步机、室内骑行、泳池有距离但也不会有 GPS，按类型名里的 indoor / treadmill / pool 排掉。
 */
const NO_GPS = /indoor|treadmill|pool|elliptical|rowing_machine|spinning|stair/;

export function expectsRoute(type: string | null | undefined, distanceMeters: number | null | undefined): boolean {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return false;
  return !NO_GPS.test((type ?? '').toLowerCase());
}
