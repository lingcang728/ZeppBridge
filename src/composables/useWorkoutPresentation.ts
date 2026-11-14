import { computed, type Ref } from 'vue';
import type { DesignIconName } from '../components/DesignIcon.vue';
import type { GlyphTone } from '../lib/glyphs';
import { useSyncController } from './useSyncController';
import { chartPalette } from '../lib/echartsSetup';
import { resolvedTheme } from './useTheme';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { formatDistance, formatNumber, isFiniteNumber } from '../lib/format';
import { formatPaceSeconds } from '../lib/metricSeries';
import { elevationUnitLabel, paceAxisLabel, paceMinutesPerBigUnit, paceUnitLabel, toElevation } from '../lib/units';
import { deviceImageFor } from '../lib/deviceCatalog';
import { workoutTiming } from '../lib/workoutTiming';
import { buildRouteCanvas } from '../lib/workoutRoute';
import { lineOption, paceSeconds, sampleSeries, type ChartBand, type ChartDetail, type ChartPoint } from '../lib/workoutCharts';
import { elevationAxis, paceAxis } from '../lib/chartAxis';
import { consistentAverage, paceProfile } from '../lib/paceProfile';
import { slopeShare } from '../lib/elevationProfile';
import type { ShareSegment } from '../components/workout/ShareBar.vue';
import { useMessages } from '../i18n';
import { workoutDetailMessages } from '../views/WorkoutDetail.i18n';
import type { DeviceProfile, WorkoutSeries } from '../types';
import type { WorkoutMetrics } from './useWorkoutDetail';
import { WORKOUT_GLYPH, type WorkoutGlyph } from '../lib/workoutGlyphs';

export interface HeroMetric { label: string; value: string; unit?: string; tone: GlyphTone; icon: DesignIconName; role?: WorkoutGlyph['role'] }

const glyphFields = (glyph: WorkoutGlyph): Pick<HeroMetric, 'tone' | 'icon' | 'role'> => ({
  tone: glyph.tone,
  icon: glyph.icon,
  role: glyph.role,
});
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
      { label: t.value.metricMovingTime, value: formatClock(timing.value!.movingMinutes), ...glyphFields(WORKOUT_GLYPH.time) },
      { label: t.value.metricPausedTime, value: formatClock(timing.value!.pausedMinutes), ...glyphFields(WORKOUT_GLYPH.time) },
    ] : [];
    /* 强度那一组：Zepp 云端不提供组数、次数和重量，这里显示的是它确实给了的负荷指标。 */
    const loadMetrics: HeroMetric[] = [
      { label: t.value.metricTrainingEffect, value: numberValue(item.training_effect, 1), tone: 'training', icon: 'training-load' },
      { label: t.value.metricAnaerobicEffect, value: numberValue(item.anaerobic_training_effect, 1), tone: 'sleep', icon: 'vo2-max' },
      { label: t.value.metricRpe, value: numberValue(item.rpe), tone: 'heart', icon: 'body-activity' },
    ];
    const hr = (label: string, value: unknown, glyph: WorkoutGlyph): HeroMetric => ({
      label, value: numberValue(value), unit: isFiniteNumber(value) ? 'bpm' : undefined, ...glyphFields(glyph),
    });
    if (!hasDistance.value) {
      return [
        { label: t.value.metricDuration, value: formatClock(durationMinutes.value), ...glyphFields(WORKOUT_GLYPH.time) },
        ...timingMetrics,
        hr(t.value.metricAvgHr, item.avg_hr, WORKOUT_GLYPH.hr),
        hr(t.value.metricMaxHr, item.max_hr, WORKOUT_GLYPH.hrMax),
        { label: t.value.metricCalories, value: numberValue(item.calories), unit: isFiniteNumber(item.calories) ? t.value.unitKcal : undefined, tone: 'calories', icon: 'body-activity' },
        { label: t.value.metricTrainingLoad, value: numberValue(item.training_load), tone: 'training', icon: 'training-load' },
        ...loadMetrics,
      ];
    }
    return [
      { label: t.value.metricDistance, value: formatDistance(item.distance_meters, t.value.notProvided), ...glyphFields(WORKOUT_GLYPH.distance) },
      { label: t.value.metricDuration, value: formatClock(durationMinutes.value), ...glyphFields(WORKOUT_GLYPH.time) },
      ...timingMetrics,
      hr(t.value.metricAvgHr, item.avg_hr, WORKOUT_GLYPH.hr),
      { label: hasPauses ? t.value.metricMovingPace : t.value.metricAvgPace, value: hasPauses ? paceText(timing.value!.movingPace) : resolvedPace, ...glyphFields(WORKOUT_GLYPH.pace) },
      ...(hasPauses ? [{ label: t.value.metricElapsedPace, value: paceText(timing.value!.elapsedPace), ...glyphFields(WORKOUT_GLYPH.pace) } as HeroMetric] : []),
      { label: t.value.metricAscent, value: isFiniteNumber(summary?.elevation_gain_m) ? numberValue(toElevation(summary.elevation_gain_m)) : t.value.notProvided, unit: isFiniteNumber(summary?.elevation_gain_m) ? elevationUnitLabel() : undefined, ...glyphFields(WORKOUT_GLYPH.ascent) },
      { label: 'VO₂ Max', value: numberValue(item.vo2max), tone: 'sleep', icon: 'vo2-max' },
      { label: t.value.metricTrainingLoad, value: numberValue(item.training_load), tone: 'training', icon: 'training-load' },
      ...loadMetrics,
    ];
  });

  const routeCanvas = computed(() => buildRouteCanvas(series.value));

  /** 最小 / 平均 / 最大；心率和海拔叫「最低 / 最高」（和 Zepp、概要卡的说法一致）。 */
  const statSummary = (points: ChartPoint[], highLow = false): ChartStat[] | null => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.v);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [
      { label: highLow ? t.value.statLow : t.value.statMin, value: numberValue(min, 0) },
      { label: t.value.statAverage, value: numberValue(avg, 0) },
      { label: highLow ? t.value.statHigh : t.value.statMax, value: numberValue(max, 0) },
    ];
  };

  /** 坡度分布（爬升卡和大档海拔卡共用）。 */
  const slope = computed(() => slopeShare(series.value?.samples));

  /* 图上画的两条要跟着单位换算，采样本身不动：配速的三个统计值走 paceClock，
     它自己会换算——两边都换就成了一次英里、再一次英里。 */
  /** 海拔图纵轴至少撑开 20 米：平路就画成平的（chartAxis.elevationAxis）。 */
  const ALTITUDE_MIN_SPAN_M = 20;
  /** 区间色：和心率区间卡（WorkoutHrZonesCard 的 .zone-0…5）同一套。 */
  const zoneColorOf = (index: number) => {
    const s = chartPalette.value.series;
    // --route-mint 不在图表色板里（tokens.css 深 #2FA96B / 浅 #22875C），canvas 要真颜色。
    const mint = resolvedTheme.value === 'light' ? '#22875C' : '#2FA96B';
    return [s.pace, mint, s.training, s.altitude, s.calories, s.heart][Math.min(5, Math.max(0, index))]!;
  };
  const chartCards = computed(() => {
    const samples = series.value?.samples;
    const palette = chartPalette.value;
    const heart = sampleSeries(samples, 'heart_rate');
    const pace = sampleSeries(samples, 'pace');
    const altitude = sampleSeries(samples, 'altitude_m').map((point) => ({ t: point.t, v: toElevation(point.v) }));
    const cadence = sampleSeries(samples, 'cadence');
    // 配速图画「每公里 / 每英里秒数」，纵轴倒过来（快的在上），刻度和提示写成 分:秒。
    const toChart = (minutesPerKm: number) => paceMinutesPerBigUnit(minutesPerKm) * 60;
    const paceChart = pace.map((point) => ({ t: point.t, v: toChart(point.v) }));
    // 暂停段：配速统计剔掉它们，中大档的配速 / 心率图把它们铺灰。
    const pauses = (series.value?.pauses ?? [])
      .map((pause) => ({ start: Date.parse(pause.start_time), end: Date.parse(pause.end_time) }))
      .filter((pause) => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start);
    // 配速：剔除暂停与停顿 / 飘点后的最快、最慢和主体范围；平均 = 距离 ÷ 运动时间（和概要卡同一个数）。
    const profile = paceProfile(pace, pauses);
    const item = workout.value;
    const summaryAvg = isFiniteNumber(item?.pace) ? item.pace : (timing.value?.movingPace ?? series.value?.summary?.average_pace ?? null);
    const paceAvg = profile ? consistentAverage(profile, summaryAvg) : summaryAvg;
    const paceStats: ChartStat[] | null = profile ? [
      { label: t.value.statFastest, value: paceClock(profile.fastest.v) },
      { label: t.value.statAverage, value: paceClock(paceAvg) },
      { label: t.value.statSlowest, value: paceClock(profile.slowest.v) },
    ] : null;
    const paceRange = profile ? paceAxis(toChart(profile.lo), toChart(profile.hi)) : null;
    const paceExtremes = profile ? [profile.fastest, profile.slowest].map((p) => ({ t: p.t, v: toChart(p.v) })) : undefined;
    // 心率区间色带（卡拉大才画）：手表随这条运动下发的上界，没有就不画。
    const zones = [...(workout.value?.hr_zones ?? [])].sort((a, b) => a.index - b.index);
    const bands: ChartBand[] = zones.map((zone, i) => ({ index: zone.index, low: i ? zones[i - 1].upper_bound_bpm : null, high: zone.upper_bound_bpm }));
    const s = palette.series;
    // 心率卡大档的「各区间时长」：和心率区间卡同一份秒数、同一套颜色。
    const zoneShare: ShareSegment[] | null = zones.some((zone) => zone.seconds > 0)
      ? zones.map((zone) => ({ key: `z${zone.index}`, label: `Z${zone.index}`, seconds: zone.seconds, color: zoneColorOf(zone.index) }))
      : null;
    // 海拔卡头部：累计爬升 / 累计下降（记录汇总，有才列）放在最低 / 平均 / 最高前面，参照 Zepp 海拔页。
    const summary = series.value?.summary;
    const gain = item?.elevation_gain_m ?? summary?.elevation_gain_m;
    const loss = item?.elevation_loss_m ?? summary?.elevation_loss_m;
    const altitudeBase = statSummary(altitude, true);
    const altitudeStats: ChartStat[] | null = altitudeBase ? [
      ...(isFiniteNumber(gain) ? [{ label: t.value.metricAscent, value: numberValue(toElevation(gain)) }] : []),
      ...(isFiniteNumber(loss) ? [{ label: t.value.decodedDescent, value: numberValue(toElevation(loss)) }] : []),
      ...altitudeBase,
    ] : null;
    return [
      { key: 'heart', title: t.value.chartHeart, unit: 'bpm', option: lineOption(heart, { color: s.heart, unit: 'bpm', palette }), detail: { color: s.heart, palette, bands, zoneColor: zoneColorOf, pauses } as ChartDetail, stats: statSummary(heart, true), zoneShare, icon: 'heart-rate' as DesignIconName, tone: 'heart' as GlyphTone },
      { key: 'pace', title: t.value.chartPace, unit: paceAxisLabel(), option: lineOption(paceChart, { color: s.pace, unit: paceAxisLabel(), palette, inverse: true, format: paceSeconds, axis: paceRange, average: isFiniteNumber(paceAvg) ? toChart(paceAvg) : null }), detail: { color: s.pace, palette, format: paceSeconds, pauses, extremes: paceExtremes } as ChartDetail, stats: paceStats, icon: WORKOUT_GLYPH.pace.icon, tone: WORKOUT_GLYPH.pace.tone },
      { key: 'altitude', title: t.value.chartAltitude, unit: elevationUnitLabel(), option: lineOption(altitude, { color: s.altitude, unit: elevationUnitLabel(), palette, axis: elevationAxis(altitude.map((p) => p.v), toElevation(ALTITUDE_MIN_SPAN_M)) }), detail: { color: s.altitude, palette } as ChartDetail, stats: altitudeStats, slope: slope.value, icon: 'health-watch' as DesignIconName, tone: 'altitude' as GlyphTone },
      { key: 'cadence', title: t.value.chartCadence, unit: 'spm', option: lineOption(cadence, { color: s.cadence, unit: 'spm', palette }), detail: { color: s.cadence, palette } as ChartDetail, stats: statSummary(cadence), icon: 'steps' as DesignIconName, tone: 'activity' as GlyphTone },
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
      { label: t.value.decodedRoutePoints, value: detail.route.length ? numberValue(detail.route.length) : none, ...WORKOUT_GLYPH.route },
      { label: t.value.decodedSamples, value: detail.samples.length ? numberValue(detail.samples.length) : none, ...WORKOUT_GLYPH.samples },
      { label: t.value.decodedPauses, value: detail.pauses.length ? numberValue(detail.pauses.length) : none, ...WORKOUT_GLYPH.pauses },
      { label: t.value.decodedAvgCadence, value: withUnit(s.average_cadence, 'spm'), ...WORKOUT_GLYPH.cadence },
      { label: t.value.decodedMaxCadence, value: withUnit(s.max_cadence, 'spm'), ...WORKOUT_GLYPH.cadenceMax },
      { label: t.value.decodedAvgStride, value: withUnit(s.average_stride_cm, 'cm'), ...WORKOUT_GLYPH.stride },
      { label: t.value.decodedDescent, value: isFiniteNumber(s.elevation_loss_m) ? `${numberValue(toElevation(s.elevation_loss_m))} ${elevationUnitLabel()}` : none, ...WORKOUT_GLYPH.descent },
      { label: t.value.decodedMaxHr, value: withUnit(item.max_hr, 'bpm'), ...WORKOUT_GLYPH.hrMax },
      // 跑步功率和跑姿只有测得出来的表、只在跑步时才有；没有就写「未提供」，不写 0。
      { label: t.value.decodedAvgPower, value: withUnit(s.average_power_watts, 'W'), ...WORKOUT_GLYPH.power },
      { label: t.value.decodedMaxPower, value: withUnit(s.max_power_watts, 'W'), ...WORKOUT_GLYPH.powerMax },
      { label: t.value.decodedGroundContact, value: withUnit(s.average_ground_contact_ms, 'ms'), ...WORKOUT_GLYPH.contact },
      { label: t.value.decodedVerticalOscillation, value: isFiniteNumber(s.average_vertical_oscillation_mm) ? `${(s.average_vertical_oscillation_mm / 10).toFixed(1)} cm` : none, ...WORKOUT_GLYPH.oscillation },
      { label: t.value.decodedVerticalRatio, value: isFiniteNumber(s.average_vertical_ratio_pct) ? `${s.average_vertical_ratio_pct.toFixed(1)} %` : none, ...WORKOUT_GLYPH.ratio },
      { label: t.value.decodedBestEquivalentPace, value: isFiniteNumber(s.best_equivalent_pace_s_per_km) ? `${formatPaceSeconds(s.best_equivalent_pace_s_per_km)} ${paceUnitLabel()}` : none, ...WORKOUT_GLYPH.paceBest },
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
    heroMetrics, routeCanvas, chartCards, hrZones, decodedMetrics, syncBadge, slope,
  };
};
