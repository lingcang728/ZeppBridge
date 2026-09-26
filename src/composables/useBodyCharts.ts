import { computed, ref, type Ref } from 'vue';
import { chartPalette } from '../lib/echartsSetup';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { isFiniteNumber } from '../lib/format';
import { useMessages } from '../i18n';
import { bodyStatusMessages } from '../views/BodyStatus.i18n';
import type { MetricSeries, StressPoint } from '../types';

/* 身体状态页的两张特殊图：饮食的三大营养素环形图、最近 24 小时的压力曲线（从 BodyStatus.vue 搬出来）。 */
export const useBodyCharts = (series: Ref<Record<string, MetricSeries>>) => {
  const t = useMessages(bodyStatusMessages);
  /**
   * 三大营养素各自贡献了多少热量。
   *
   * Zepp App 的「Food Trend Report」第一张卡就是这个环形图（碳水 / 蛋白质 /
   * 脂肪的百分比），所以这里跟着画。但那边的百分比是华米自己算的，这里的是
   * **我们**用 4/9/4（阿特沃特系数）从克数换算的——两边可能差一两个点，这不是
   * 谁错了，是两套算法。卡片上如实写明是推算。
   *
   * 三项克数缺任何一项就不画：拿两项算百分比会得到一个看着像真的、其实没有
   * 意义的数。
   */
  const ENERGY_PER_GRAM = { protein: 4, fat: 9, carbs: 4 } as const;

  const macroSplit = computed(() => {
    const average = (metric: string): number | null => {
      const value = series.value[metric]?.average;
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    };
    const protein = average('intake_protein_g');
    const fat = average('intake_fat_g');
    const carbs = average('intake_carbs_g');
    if (protein === null || fat === null || carbs === null) return null;
    const energy = {
      carbs: carbs * ENERGY_PER_GRAM.carbs,
      protein: protein * ENERGY_PER_GRAM.protein,
      fat: fat * ENERGY_PER_GRAM.fat,
    };
    const total = energy.carbs + energy.protein + energy.fat;
    if (!(total > 0)) return null;
    return {
      total,
      slices: [
        { key: 'carbs', label: t.value.carbsLabel, value: energy.carbs, grams: carbs, color: zeppSemanticColors.pace },
        { key: 'protein', label: t.value.proteinLabel, value: energy.protein, grams: protein, color: zeppSemanticColors.stride },
        { key: 'fat', label: t.value.fatIntakeLabel, value: energy.fat, grams: fat, color: zeppSemanticColors.altitude },
      ].map((slice) => ({ ...slice, percent: Math.round((slice.value / total) * 100) })),
    };
  });

  const macroChartOption = computed(() => {
    const split = macroSplit.value;
    if (!split) return null;
    return {
      animationDuration: 600,
      tooltip: {
        trigger: 'item',
        formatter: (params: { name: string; percent: number; data: { grams: number } }) =>
          `${params.name}<br><b>${params.percent}%</b>　${t.value.gramsPerDay(Math.round(params.data.grams))}`,
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '82%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          data: split.slices.map((slice) => ({
            name: slice.label,
            value: slice.value,
            grams: slice.grams,
            itemStyle: { color: slice.color },
          })),
        },
      ],
    };
  });


  /*
   * 全天压力曲线。
   *
   * `all_day_stress` 每天都带着一条五分钟一个点的曲线，以前整条被丢掉，界面上
   * 只剩一天一个平均值——有用户因此报「压力不是 24/7」。这里画的就是那条曲线。
   */
  const stressPoints = ref<StressPoint[]>([]);

  const curve = computed(() => stressPoints.value
    .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
    .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

  const curveLatest = computed(() => curve.value[curve.value.length - 1]?.value ?? null);
  const curveLowest = computed(() => (curve.value.length
    ? Math.min(...curve.value.map((point) => point.value))
    : null));
  const curveHighest = computed(() => (curve.value.length
    ? Math.max(...curve.value.map((point) => point.value))
    : null));
  const curveAverage = computed(() => (curve.value.length
    ? Math.round(curve.value.reduce((total, point) => total + point.value, 0) / curve.value.length)
    : null));

  const clock = (value: number) => displayDateTimeFormatter({
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));

  /*
   * 曲线断开的阈值。
   *
   * 手表每五分钟测一次。没戴、关了全天监测、或者补拉没覆盖到的那几个小时，
   * 序列里就是没有点 —— 直接把缺口两端连起来，会画出一条从来没测过的直线。
   * 卡片脚注写的是「没采样的时段留空」，那就得真的留空：超过三个采样间隔就
   * 插一个 null，`connectNulls: false` 会让线在那里断开。
   *
   * 三个间隔而不是一个：五分钟一次只是标称值，实测相邻两点差 5–8 分钟很常见，
   * 卡到一个间隔会把正常曲线打成虚线。
   */
  const CURVE_GAP_MS = 15 * 60 * 1000;

  const curveChartOption = computed(() => {
    const data: Array<[number, number | null]> = [];
    curve.value.forEach((point, index) => {
      const previous = curve.value[index - 1];
      if (previous && point.ts - previous.ts > CURVE_GAP_MS) {
        data.push([previous.ts + 1, null]);
      }
      data.push([point.ts, point.value]);
    });
    return {
      animationDuration: 700,
      grid: { left: 40, right: 18, top: 16, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: chartPalette.value.tooltipBg,
        borderColor: chartPalette.value.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: chartPalette.value.tooltipText, fontSize: 15.5 },
        extraCssText: 'border-radius:8px;box-shadow:none;',
        formatter: (params: Array<{ value: [number, number | null] }>) => {
          const point = Array.isArray(params) ? params[0] : params;
          // 断点上没有读数，就不要报一个数出来。
          if (!point || !isFiniteNumber(point.value?.[1])) return '';
          return t.value.stressTooltip(clock(point.value[0]), Math.round(point.value[1]));
        },
      },
      xAxis: {
        type: 'time',
        min: curve.value[0]?.ts,
        max: curve.value[curve.value.length - 1]?.ts,
        axisLabel: { formatter: clock, hideOverlap: true, color: chartPalette.value.axis, fontSize: 14.5 },
        axisLine: { lineStyle: { color: chartPalette.value.grid } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      // 量程钉死在 0–100。压力分数只有放在整条刻度上才有意义：自动缩放会
      // 把一个安稳的下午画成剧烈起伏的锯齿。
      yAxis: {
        type: 'value', min: 0, max: 100, splitNumber: 4,
        axisLabel: { color: chartPalette.value.axis, fontSize: 14.5 },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: chartPalette.value.gridSoft, type: 'dashed' } },
      },
      series: [{
        type: 'line',
        data,
        smooth: 0.18,
        showSymbol: false,
        lineStyle: { width: 1.6, color: zeppSemanticColors.calories },
        areaStyle: { color: `${chartPalette.value.series.calories}1F` },
        connectNulls: false,
      }],
    };
  });


  return {
    macroSplit, macroChartOption, stressPoints, curve, curveLatest, curveLowest, curveHighest, curveAverage, curveChartOption,
  };
};
