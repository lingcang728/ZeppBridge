export const workoutLabel = (value: string): string => {
  const labels: Record<string, string> = {
    run: '户外跑步',
    running: '跑步',
    walking: '健走',
    walk: '步行',
    ride: '户外骑行',
    cycling: '户外骑行',
    indoor_cycling: '室内骑行',
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
    badminton: '羽毛球',
    activity: '活动',
    unknown: '运动',
  };
  return labels[value.trim().toLowerCase()] || value || '运动';
};

export const sourceLabel = (scope?: string): string => dataScopeLabel(scope);

/** 数据提供方。ZeppBridge 只从 Zepp 云端拉取，不用范围冒充来源。 */
export const dataProviderLabel = (): string => 'Zepp 云端';

/** 数据作用范围 / 融合范围，不是数据提供方。 */
export const dataScopeLabel = (scope?: string): string => {
  if (scope === 'user_fused') return '用户融合';
  if (scope === 'device') return '单设备';
  if (scope === 'mixed') return '多来源';
  return '范围未确认';
};
