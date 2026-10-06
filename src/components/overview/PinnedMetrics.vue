<script setup lang="ts">
/* 概览最上面的「我的指标」：用户固定的 3–4 个指标，每个一块磁贴——最新值、测于哪天、
 * 迷你曲线和覆盖天数。没有记录就写「—」和「近 N 天无记录」，不补 0。
 *
 * 磁贴和点进去的那张趋势卡是**同一个东西**：同名（PinnedMetrics.i18n.ts 的 names）、同色（lib/metricTone.ts）、
 * 同一段范围（详情页顶上的 7 天 / 1 个月 / 6 个月，useTrendRange），数值和曲线形状也就一样。
 * 一个都没固定时是一张引导卡，点开挑选面板（PinPicker）。
 *
 * 动效：挑完回来，新加的磁贴由下往上漫出类别色再显出内容；留下的原地不动（缓存页回场不重放）。 */
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import Sparkline from '../Sparkline.vue';
import BaselineTag from '../ask/BaselineTag.vue';
import { backend, isDesktop } from '../../lib/bridge';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { useTrendRange } from '../../composables/useTrendRange';
import { distanceUnit } from '../../lib/units';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { metricColor } from '../../lib/metricTone';
import { coverageLabel, indexSeries, SERIES_FETCH_DAYS, sliceIndexed } from '../../lib/metricSeries';
import { today as currentToday } from '../../lib/currentDay';
import {
  pinHref, pinLatestDate, pinMassUnit, pinNumberText, pinnableMetric, pinSparkValues, pinValueText, readPins, writePins, type PinnableMetric,
} from '../../lib/pinnedMetrics';
import type { MetricSeries } from '../../types';
import { useMessages } from '../../i18n';
import { pinnedMetricsMessages } from './PinnedMetrics.i18n';

defineOptions({ name: 'OverviewPinnedMetrics' });

const t = useMessages(pinnedMetricsMessages);
/* 挑选面板只在点「调整」时才用：不放进概览首屏那一块（首屏 CSS 预算）。本机读 chunk 是同一帧的事。 */
const PinPicker = defineAsyncComponent(() => import('./PinPicker.vue'));
const range = useTrendRange();

const pins = ref<string[]>(readPins());
/** 一次取最长那档（和详情页一样），按页面范围在本地切：切范围不查库，切法也和详情页同一个。 */
const fullSeries = ref<Record<string, MetricSeries>>({});
const series = computed(() => sliceIndexed(fullSeries.value, range.value));
const pickerOpen = ref(false);
/** 刚从挑选面板回来：这一次让磁贴依次浮上来。 */
const justPinned = ref(false);

const label = (id: string) => (t.value.names as Record<string, string>)[id] ?? id;
const unitText = (metric: PinnableMetric) => {
  void distanceUnit.value; // kg / lb 跟着单位制切换重算（和身体页一样显式依赖一次）
  return ({
    bpm: t.value.unitBpm, score: t.value.unitScore, steps: t.value.unitSteps, kcal: t.value.unitKcal, min: t.value.unitMin,
    pai: t.value.unitPai, ms: 'ms', percent: '%', mass: pinMassUnit(), vo2: 'ml/kg/min', '': '',
  } as Record<string, string>)[metric.unit] ?? '';
};

const dayText = (date: string | null): string | null => {
  if (!date) return null;
  const day = parseDisplayDate(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime())) return null;
  const today = currentToday();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(today) - start(day)) / 86_400_000);
  if (diff === 0) return t.value.today;
  if (diff === 1) return t.value.yesterday;
  return t.value.measuredOn(displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(day));
};

const tiles = computed(() => pins.value.flatMap((id) => {
  const metric = pinnableMetric(id);
  if (!metric) return [];
  const data = series.value[id];
  return [{
    id,
    metric,
    label: label(id),
    value: pinValueText(metric, data),
    unit: unitText(metric),
    when: dayText(pinLatestDate(data)),
    spark: pinSparkValues(data),
    // 读失败和「真的没有记录」是两回事：前者不能写成「近 30 天无记录」。
    coverage: !data && loadFailed.value ? t.value.loadFailed : coverageLabel(data),
    tone: metricColor(id),
  }];
}));

let loadSeq = 0;
/** 上一次读取失败了。已经显示着的数据保留，没有数据的磁贴说「读不出来」而不是「无记录」。 */
const loadFailed = ref(false);
/** 读失败返回 null：调用方保留上一次的结果，概览其余部分照常。 */
const fetchSeries = async (ids: string[]): Promise<Record<string, MetricSeries> | null> => {
  if (!isDesktop() || !ids.length) return {};
  try {
    return indexSeries(await backend.getMetricSeries([...ids], SERIES_FETCH_DAYS));
  } catch {
    return null;
  }
};
const load = async () => {
  const seq = ++loadSeq;
  const next = await fetchSeries(pins.value);
  if (seq !== loadSeq) return;
  loadFailed.value = next === null;
  if (next) fullSeries.value = next;
};
onMounted(() => void load());
useRevisionReload(() => void load());

/* 挑完回来：先把新指标的数据读好，再一次换上。以前先换磁贴、数据晚一拍到，
   磁贴先是「—」再跳成数字加曲线，加上整排按新 key 重新挂载，就是「退出去闪一下」。
   留下来的磁贴原地不动（按 id 保留），新来的那几块从灰底里由下往上漫出类别色再显出内容。 */
const apply = async (next: string[]) => {
  pickerOpen.value = false;
  if (next.join() === pins.value.join()) return;
  const seq = ++loadSeq;
  const data = await fetchSeries(next);
  if (seq !== loadSeq) return;
  justPinned.value = true;
  loadFailed.value = data === null;
  if (data) fullSeries.value = data;
  pins.value = [...next];
  writePins(next);
  window.setTimeout(() => { justPinned.value = false; }, 1200);
};
</script>

<template>
  <section class="pins" aria-labelledby="pins-title">
    <header class="pins-head">
      <h2 id="pins-title">{{ t.title }}</h2>
      <button v-if="pins.length" type="button" class="pins-edit glass-control" :title="t.edit" @click="pickerOpen = true">
        <Icon name="sliders" :size="14" /><span>{{ t.edit }}</span>
      </button>
    </header>

    <button v-if="!pins.length" type="button" class="pins-empty" @click="pickerOpen = true">
      <span class="pins-plus" aria-hidden="true"><Icon name="plus" :size="18" /></span>
      <span class="pins-empty-copy"><strong>{{ t.emptyCta }}</strong><small>{{ t.emptySub }}</small></span>
    </button>

    <!-- 灌色动画在 ::after 和子元素上，Vue 只看得见磁贴自己的 240ms 过渡，会在 27% 处撤掉
         enter-active 把它截断：时长显式给 900。离场是 display:none，不用等。 -->
    <TransitionGroup v-else tag="div" name="pin" :appear="justPinned" :duration="{ enter: 900, leave: 0 }"
      :class="['pins-grid', { 'just-pinned': justPinned }]" :style="{ '--count': tiles.length }">
      <RouterLink v-for="tile in tiles" :key="tile.id" :to="pinHref(tile.metric)" data-morph-card
        :class="['pin-tile', { 'is-empty': tile.value === '—' }]" :style="{ '--tone': tile.tone }" :aria-label="t.tileAria(tile.label, tile.value)">
        <span class="pin-label"><i class="pin-dot" aria-hidden="true"></i>{{ tile.label }}</span>
        <span class="pin-value"><strong>{{ tile.value }}</strong><small v-if="tile.unit && tile.value !== '—'">{{ tile.unit }}</small></span>
        <span class="pin-when">{{ tile.when ?? tile.coverage }}<BaselineTag class="pin-baseline" :metric="tile.id" :format="(v: number) => pinNumberText(tile.metric, v)" :unit="tile.unit" /></span>
        <Sparkline v-if="tile.spark.length > 1" class="pin-spark" :values="tile.spark" :color="tile.tone" :label="`${tile.label} · ${tile.coverage}`" />
        <!-- 没有记录不画线（不编数据），留一块和曲线同高的浅槽，几块磁贴照样齐平。 -->
        <span v-else class="pin-spark pin-spark-empty" aria-hidden="true"></span>
      </RouterLink>
    </TransitionGroup>

    <PinPicker v-if="pickerOpen" :pins="pins" :label="label" @close="pickerOpen = false" @done="apply" />
  </section>
</template>

<style scoped>
.pins { display: grid; gap: 10px; }
.pins-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
.pins-head h2 { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; }
/* 「调整」：和顶栏同一族的小玻璃胶囊，图标 + 字，悬停才亮起来。 */
.pins-edit { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px 0 10px; border: 0; border-radius: 999px;
  color: var(--muted); font: inherit; font-size: var(--fs-xs); font-weight: 600; cursor: pointer;
  transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease; }
.pins-edit:hover { background-color: var(--glass-press); color: var(--ink); }
.pins-edit:active { scale: .96; }
.pins-edit:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pins-edit svg { color: var(--accent); }

.pins-empty {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 18px;
  border: 1.5px dashed color-mix(in srgb, var(--ink) 16%, transparent); border-radius: var(--radius-lg);
  background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer;
  transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
}
.pins-empty:hover { border-color: color-mix(in srgb, var(--ink) 24%, transparent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.pins-empty:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pins-plus { display: grid; flex: 0 0 auto; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.pins-empty-copy { display: grid; gap: 2px; }
.pins-empty-copy strong { color: var(--ink); font-size: var(--fs-md); font-weight: 650; }
.pins-empty-copy small { font-size: var(--fs-xs); }

.pins-grid { position: relative; display: grid; grid-template-columns: repeat(var(--count, 4), minmax(0, 1fr)); gap: 12px; }
/* 类别色只做右上角一点微光（和下面的入口卡一样），不给整块刷颜色。 */
.pin-tile {
  position: relative; display: grid; align-content: start; gap: 4px; min-width: 0; padding: 14px 16px 12px; overflow: hidden;
  border-radius: var(--radius-lg);
  background: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--tone) 16%, transparent), transparent 60%), var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
  color: inherit; text-decoration: none; transition: translate var(--dur-base) var(--ease-out), box-shadow var(--dur-base) ease;
}
.pin-tile:hover { translate: 0 -2px; }
.pin-tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pin-label { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.pin-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--tone); box-shadow: 0 0 8px color-mix(in srgb, var(--tone) 60%, transparent); }
.pin-value { display: flex; align-items: baseline; gap: 5px; }
.pin-value strong { color: var(--ink); font-size: var(--fs-3xl); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.pin-value small { color: var(--muted); font-size: var(--fs-xs); }
.pin-when { color: var(--subtle); font-size: var(--fs-2xs); }
.pin-spark { margin-top: 2px; }
.pin-spark-empty { display: block; height: 52px; border-radius: 10px;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 4%, transparent) 0 6px, transparent 6px 12px); }
.pin-tile.is-empty { background: var(--mat-card); }
.pin-tile.is-empty .pin-value strong { color: var(--subtle); }
.pin-tile.is-empty .pin-dot { box-shadow: none; opacity: .55; }

/* 新来的磁贴：先是一块灰底，类别色从底边往上漫满，再退成微光、内容浮上来。
   只动 transform（scaleY）和 opacity，合成器就能做。留下来的磁贴不重放。 */
.pin-tile::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(0deg, color-mix(in srgb, var(--tone) 34%, transparent), color-mix(in srgb, var(--tone) 12%, transparent));
  transform: scaleY(0); transform-origin: 50% 100%; opacity: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .just-pinned .pin-enter-active::after { animation: pin-flood 900ms cubic-bezier(.3, .7, .2, 1) both; }
  .just-pinned .pin-enter-active > * { animation: pin-content 900ms ease both; }
  .pin-move { transition: transform 420ms cubic-bezier(.2, .8, .2, 1); }
}
/* 去掉的磁贴直接让位（它在挑选面板里已经退过场），剩下的滑到新位置。 */
.pin-leave-active { display: none; }
@keyframes pin-flood {
  0% { transform: scaleY(0); opacity: 1; }
  50% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(1); opacity: 0; }
}
@keyframes pin-content { 0%, 45% { opacity: 0; translate: 0 6px; } 100% { opacity: 1; translate: 0 0; } }

@container (max-width: 760px) {
  .pins-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .pins-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* 「比平时高 / 低」（只和自己比，精修批次 6.2）跟在测量时间后面。 */
.pin-baseline { margin-left: 6px; vertical-align: 1px; }
</style>
