/**
 * 训练计划里的运动 / 强度 / 时长 / 目标 怎么写成当前界面语言的一句话。
 * 一个地方出文案：周列表、详情、步骤清单都用它，不各写一份。
 */
import { useMessages } from '../../i18n';
import { planMessages } from './plan.i18n';
import type { PlanIntensity, PlanSport, PlanStep } from '../../types/trainingPlan';

const pad = (value: number) => String(value).padStart(2, '0');
/** 秒 / 公里 → `5:30`。 */
export const paceText = (secondsPerKm: number): string => `${Math.floor(secondsPerKm / 60)}:${pad(Math.round(secondsPerKm % 60))}`;

export const usePlanText = () => {
  const t = useMessages(planMessages);

  const sport = (value: PlanSport): string => ({
    running: t.value.sportRunning,
    cycling: t.value.sportCycling,
    pool_swim: t.value.sportPoolSwim,
    open_water_swim: t.value.sportOpenWaterSwim,
  })[value];

  const intensity = (value: PlanIntensity): string => ({
    warmup: t.value.warmup,
    active: t.value.active,
    interval: t.value.interval,
    recovery: t.value.recovery,
    rest: t.value.restStep,
    cooldown: t.value.cooldown,
  })[value];

  /** 总分钟 → 「45 分钟」「1 小时 28 分钟」。 */
  const minutes = (value: number): string => {
    if (value >= 60) return t.value.hoursMinutes(Math.floor(value / 60), value % 60);
    return t.value.minutes(value);
  };

  const length = (value: PlanStep['length']): string => {
    if (value.type === 'time') {
      if (value.seconds < 60) return t.value.seconds(value.seconds);
      const whole = value.seconds / 60;
      return minutes(Number.isInteger(whole) ? whole : Math.round(whole * 10) / 10);
    }
    if (value.meters >= 1000) return t.value.kilometers(String(Math.round(value.meters / 10) / 100));
    return t.value.meters(value.meters);
  };

  const target = (value: PlanStep['target']): string => {
    switch (value.type) {
      case 'heart_rate': return t.value.targetHr(value.low, value.high);
      case 'pace': return t.value.targetPace(paceText(value.fast), paceText(value.slow));
      case 'power': return t.value.targetPower(value.low, value.high);
      default: return t.value.targetOpen;
    }
  };

  return { t, sport, intensity, minutes, length, target };
};
