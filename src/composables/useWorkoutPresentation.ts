import { computed, type Ref } from 'vue';
import type { DesignIconName } from '../components/DesignIcon.vue';
import type { GlyphTone } from '../lib/glyphs';
import { useSyncController } from './useSyncController';
import { chartPalette } from '../lib/echartsSetup';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { formatDistance, formatNumber, isFiniteNumber } from '../lib/format';
import { formatPaceSeconds } from '../lib/metricSeries';
import { elevationUnitLabel, paceAxisLabel, paceMinutesPerBigUnit, paceUnitLabel, toElevation } from '../lib/units';
import { deviceImageFor } from '../lib/deviceCatalog';
import { workoutTiming } from '../lib/workoutTiming';
import { buildRouteCanvas } from '../lib/workoutRoute';
import { lineOption, sampleSeries, type ChartPoint } from '../lib/workoutCharts';
import { useMessages } from '../i18n';
import { workoutDetailMessages } from '../views/WorkoutDetail.i18n';
import type { DeviceProfile, WorkoutSeries } from '../types';
import type { WorkoutMetrics } from './useWorkoutDetail';

export interface HeroMetric { label: string; value: string; unit?: string; tone: GlyphTone; icon: DesignIconName }
export interface ChartStat { label: string; value: string }

/**
 * 运动详情页上所有「怎么显示」的计算：格式化、指标卡、轨迹图、四张折线图、心率区间、
 * 解析明细。全部从数据推出来，没有副作用。
 */
export const useWorkoutPresentation = (
  workout: Ref<WorkoutMetrics | null>,
  series: Ref<WorkoutSeries | null>,
  device: Ref<DeviceProfile>,
  displayType: Ref<string>,
) => {
  const t = useMessages(workoutDetailMessages);
  const { appStatus } = useSyncController();

  const durationMinutes = computed(() => {
    const item = workout.value;
    if (!item) return null;
    if (isFiniteNumber(item.duration_minutes) && item.duration_minutes >= 0) return item.duration_minutes;
    const start = new Date(item.start_time).getTime();
    const end = new Date(item.end_time).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
  });

  const formatClock = (minutes?: number | null): string => {
    if (!isFiniteNumber(minutes) || minutes < 0) return t.value.notProvided;
    const totalSeconds = Math.round(minutes * 60);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  };

  /** 入参是每公里分钟；显示时跟随当前距离单位。 */
  const paceClock = (minutesPerKm?: number | null): string => {
    if (!isFiniteNumber(minutesPerKm) || minutesPerKm <= 0) return t.value.notProvided;
    const totalSeconds = Math.round(paceMinutesPerBigUnit(minutesPerKm) * 60);
    return `${Math.floor(totalSeconds / 60)}'${String(totalSeconds % 60).padStart(2, '0')}"`;
  };
  const paceText = (minutes?: number | null): string => {
    const clock = paceClock(minutes);
    return clock === t.value.notProvided ? clock : `${clock} ${paceUnitLabel()}`;
  };
  const numberValue = (value: unknown, digits = 0): string => isFiniteNumber(value)
    ? formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : t.value.notProvided;

  const paceLabel = computed(() => {
    const raw = workout.value?.pace;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (isFiniteNumber(raw)) return paceText(raw);
    return t.value.notProvided;
  });

  /* 只看 key，不看显示名——名字跟着界面语言变，图标不该跟着变。 */
  const workoutArt = computed<DesignIconName>(() =>
    (/cycl|ride|bike|bmx|spinning/.test(displayType.value.toLowerCase()) ? 'outdoor-cycling' : 'outdoor-run'));
  const deviceName = computed(() => device.value.canonical_name || device.value.name || t.value.deviceNameMissing);
  /* 这张图必须跟着这条记录**实际**是哪台表走。以前硬写死了一张 T-Rex 3。 */
  const deviceImage = computed(() => deviceImageFor(device.value.kind, device.value.image_key));
  const deviceKind = computed(() => device.value.kind || 'unknown');

  /* 判断依据是这条记录**有没有距离**，不是运动类型白名单：室内跑有距离，
     而户外的力量训练没有，按类型列名单迟早会两头都判错。 */
  const hasDistance = computed(() => isFiniteNumber(workout.value?.distance_meters) && (workout.value?.distance_meters ?? 0) > 0);
  const timing = computed(() => workout.value && (series.value || workout.value.moving_seconds != null)
    ? workoutTiming(workout.value.start_time, workout.value.end_time, workout.value.distance_meters, series.value?.pauses ?? [], workout.value.moving_seconds)
    : null);

  const heroMetrics = computed<HeroMetric[]>(() => {
    const item = workout.value;
    if (!item) return [];
    const summary = series.value?.summary;
    const resolvedPace = paceLabel.value !== t.value.notProvided ? paceLabel.value : paceText(summary?.average_pace);
    const hasPauses = Boolean(timing.value && timing.value.pausedMinutes > 0);
    const timingMetrics: HeroMetric[] = hasPauses ? [
      { label: t.value.metricMovingTime, value: formatClock(timing.value!.movingMinutes), tone: 'training', icon: 'auto-sync' },
      { label: t.value.metricPausedTime, value: formatClock(timing.value!.pausedMinutes), tone: 'training', icon: 'auto-sync' },
    ] : [];
    /* 强度那一组：Zepp 云端不提供组数、次数和重量，这里显示的是它确实给了的负荷指标。 */
    const loadMetrics: HeroMetric[] = [
      { label: t.value.metricTrainingEffect, value: numberValue(item.training_effect, 1), tone: 'training', icon: 'training-load' },
      { label: t.value.metricAnaerobicEffect, value: numberValue(item.anaerobic_training_effect, 1), tone: 'sleep', icon: 'vo2-max' },
      { label: t.value.metricRpe, value: numberValue(item.rpe), tone: 'heart', icon: 'body-activity' },
    ];
    const hr = (label: string, value: unknown): HeroMetric => ({ label, value: numberValue(value), unit: isFiniteNumber(value) ? 'bpm' : undefined, tone: 'heart', icon: 'heart-rate' });
    if (!hasDistance.value) {
      return [
        { label: t.value.metricDuration, value: formatClock(durationMinutes.value), tone: 'training', icon: 'auto-sync' },
        ...timingMetrics,
        hr(t.value.metricAvgHr, item.avg_hr),
        hr(t.value.metricMaxHr, item.max_hr),
        { label: t.value.metricCalories, value: numberValue(item.calories), unit: isFiniteNumber(item.calories) ? t.value.unitKcal : undefined, tone: 'calories', icon: 'body-activity' },
        { label: t.value.metricTrainingLoad, value: numberValue(item.training_load), tone: 'training', icon: 'training-load' },
        ...loadMetrics,
      ];
    }
    return [
      { label: t.value.metricDistance, value: formatDistance(item.distance_meters, t.value.notProvided), tone: 'activity', icon: 'outdoor-run' },
      { label: t.value.metricDuration, value: formatClock(durationMinutes.value), tone: 'training', icon: 'auto-sync' },
      ...timingMetrics,
      hr(t.value.metricAvgHr, item.avg_hr),
      { label: hasPauses ? t.value.metricMovingPace : t.value.metricAvgPace, value: hasPauses ? paceText(timing.value!.movingPace) : resolvedPace, tone: 'pace', icon: 'body-activity' },
      ...(hasPauses ? [{ label: t.value.metricElapsedPace, value: paceText(timing.value!.elapsedPace), tone: 'pace', icon: 'body-activity' } as HeroMetric] : []),
      { label: t.value.metricAscent, value: isFiniteNumber(summary?.elevation_gain_m) ? numberValue(toElevation(summary.elevation_gain_m)) : t.value.notProvided, unit: isFiniteNumber(summary?.elevation_gain_m) ? elevationUnitLabel() : undefined, tone: 'altitude', icon: 'health-watch' },
      { label: 'VO₂ Max', value: numberValue(item.vo2max), tone: 'sleep', icon: 'vo2-max' },
      { label: t.value.metricTrainingLoad, value: numberValue(item.training_load), tone: 'training', icon: 'training-load' },
      ...loadMetrics,
    ];
  });

  const routeCanvas = computed(() => buildRouteCanvas(series.value));

  const statSummary = (points: ChartPoint[], mode: 'pace' | 'normal' = 'normal'): ChartStat[] | null => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.v);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (mode === 'pace') return [
      { label: t.value.statFastest, value: paceClock(min) },
      { label: t.value.statAverage, value: paceClock(avg) },
      { label: t.value.statSlowest, value: paceClock(max) },
    ];
    return [
      { label: t.value.statMin, value: numberValue(min, 0) },
      { label: t.value.statAverage, value: numberValue(avg, 0) },
      { label: t.value.statMax, value: numberValue(max, 0) },
    ];
  };

  /* 图上画的两条要跟着单位换算，采样本身不动：配速的三个统计值走 paceClock，
     它自己会换算——两边都换就成了一次英里、再一次英里。 */
  const chartCards = computed(() => {
    const samples = series.value?.samples;
    const palette = chartPalette.value;
    const heart = sampleSeries(samples, 'heart_rate');
    const pace = sampleSeries(samples, 'pace');
    const altitude = sampleSeries(samples, 'altitude_m').map((point) => ({ t: point.t, v: toElevation(point.v) }));
    const cadence = sampleSeries(samples, 'cadence');
    const paceChart = pace.map((point) => ({ t: point.t, v: paceMinutesPerBigUnit(point.v) }));
    return [
      { key: 'heart', title: t.value.chartHeart, unit: 'bpm', option: lineOption(heart, palette.series.heart, 'bpm', palette), stats: statSummary(heart), icon: 'heart-rate' as DesignIconName, tone: 'heart' as GlyphTone },
      { key: 'pace', title: t.value.chartPace, unit: paceAxisLabel(), option: lineOption(paceChart, palette.series.pace, paceAxisLabel(), palette), stats: statSummary(pace, 'pace'), icon: 'body-activity' as DesignIconName, tone: 'pace' as GlyphTone },
      { key: 'altitude', title: t.value.chartAltitude, unit: elevationUnitLabel(), option: lineOption(altitude, palette.series.altitude, elevationUnitLabel(), palette), stats: statSummary(altitude), icon: 'health-watch' as DesignIconName, tone: 'altitude' as GlyphTone },
      { key: 'cadence', title: t.value.chartCadence, unit: 'spm', option: lineOption(cadence, palette.series.cadence, 'spm', palette), stats: statSummary(cadence), icon: 'steps' as DesignIconName, tone: 'activity' as GlyphTone },
    ].filter((card): card is typeof card & { option: NonNullable<typeof card.option> } => card.option !== null);
  });

  /* 手表自己划的心率区间分布：边界是云端随这条运动一起下发的（heart_range），不是我们切的。 */
  const hrZones = computed(() => {
    const zones = [...(workout.value?.hr_zones ?? [])].sort((a, b) => a.index - b.index);
    const total = zones.reduce((sum, zone) => sum + zone.seconds, 0);
    if (!zones.length || total <= 0) return null;
    return {
      totalLabel: formatClock(total / 60),
      rows: zones.map((zone, position) => {
        const low = position === 0 ? null : zones[position - 1].upper_bound_bpm;
        const percent = (zone.seconds / total) * 100;
        return {
          index: zone.index,
          range: low === null ? t.value.hrZoneBelow(zone.upper_bound_bpm) : t.value.hrZoneBetween(low, zone.upper_bound_bpm),
          duration: formatClock(zone.seconds / 60),
          percent,
          percentLabel: t.value.hrZoneShare(percent.toFixed(1)),
        };
      }),
    };
  });

  const decodedMetrics = computed(() => {
    const item = workout.value;
    const detail = series.value;
    if (!item || !detail) return [];
    const s = detail.summary;
    const none = t.value.notProvided;
    const withUnit = (value: unknown, unit: string) => (isFiniteNumber(value) ? `${numberValue(value)} ${unit}` : none);
    return [
      { label: t.value.decodedRoutePoints, value: detail.route.length ? numberValue(detail.route.length) : none, icon: 'outdoor-run' as DesignIconName },
      { label: t.value.decodedSamples, value: detail.samples.length ? numberValue(detail.samples.length) : none, icon: 'structured-data' as DesignIconName },
      { label: t.value.decodedPauses, value: detail.pauses.length ? numberValue(detail.pauses.length) : none, icon: 'auto-sync' as DesignIconName },
      { label: t.value.decodedAvgCadence, value: withUnit(s.average_cadence, 'spm'), icon: 'steps' as DesignIconName },
      { label: t.value.decodedMaxCadence, value: withUnit(s.max_cadence, 'spm'), icon: 'training-load' as DesignIconName },
      { label: t.value.decodedAvgStride, value: withUnit(s.average_stride_cm, 'cm'), icon: 'body-activity' as DesignIconName },
      { label: t.value.decodedDescent, value: isFiniteNumber(s.elevation_loss_m) ? `${numberValue(toElevation(s.elevation_loss_m))} ${elevationUnitLabel()}` : none, icon: 'health-watch' as DesignIconName },
      { label: t.value.decodedMaxHr, value: withUnit(item.max_hr, 'bpm'), icon: 'resting-heart-rate' as DesignIconName },
      // 跑步功率和跑姿只有测得出来的表、只在跑步时才有；没有就写「未提供」，不写 0。
      { label: t.value.decodedAvgPower, value: withUnit(s.average_power_watts, 'W'), icon: 'training-load' as DesignIconName },
      { label: t.value.decodedMaxPower, value: withUnit(s.max_power_watts, 'W'), icon: 'training-load' as DesignIconName },
      { label: t.value.decodedGroundContact, value: withUnit(s.average_ground_contact_ms, 'ms'), icon: 'body-activity' as DesignIconName },
      { label: t.value.decodedVerticalOscillation, value: isFiniteNumber(s.average_vertical_oscillation_mm) ? `${(s.average_vertical_oscillation_mm / 10).toFixed(1)} cm` : none, icon: 'body-activity' as DesignIconName },
      { label: t.value.decodedVerticalRatio, value: isFiniteNumber(s.average_vertical_ratio_pct) ? `${s.average_vertical_ratio_pct.toFixed(1)} %` : none, icon: 'body-activity' as DesignIconName },
      { label: t.value.decodedBestEquivalentPace, value: isFiniteNumber(s.best_equivalent_pace_s_per_km) ? `${formatPaceSeconds(s.best_equivalent_pace_s_per_km)} ${paceUnitLabel()}` : none, icon: 'outdoor-run' as DesignIconName },
    ];
  });

  const syncBadge = computed(() => {
    const raw = appStatus.value?.last_cloud_sync_at;
    if (!raw) return t.value.notFetchedYet;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? t.value.timeUnknown : displayDateTimeFormatter({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\//g, '-');
  });

  return {
    durationMinutes, formatClock, workoutArt, deviceName, deviceImage, deviceKind,
    heroMetrics, routeCanvas, chartCards, hrZones, decodedMetrics, syncBadge,
  };
};
