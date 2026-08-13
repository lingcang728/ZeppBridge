export const workoutLabel = (value: string): string => {
  const labels: Record<string, string> = {
    run: '户外跑步',
    running: '跑步',
    walking: '步行',
    walk: '步行',
    ride: '骑行',
    cycling: '骑行',
    swimming: '游泳',
    treadmill: '室内跑步',
    indoor_run: '室内跑步',
    trail: '越野跑',
    hiking: '徒步',
    strength: '力量训练',
    elliptical: '椭圆机',
    rowing: '划船',
    yoga: '瑜伽',
    climb: '攀爬',
  };
  return labels[value.trim().toLowerCase()] || value || '运动';
};

export const sourceLabel = (scope?: string): string => {
  if (scope === 'user_fused') return 'Zepp 汇总';
  if (scope === 'device') return '单设备';
  if (scope === 'mixed') return '多来源';
  return '来源未确认';
};
