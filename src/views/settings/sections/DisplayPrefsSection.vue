<script setup lang="ts">
/* 显示与语言：语言、主题、距离单位，加一行「我关注」。
   时间格式、日期顺序、界面缩放不常改，挪到高级卡「更多偏好」（DisplayMoreRows.vue）。 */
import { computed, ref } from 'vue';
import CapsuleWheel from '../../../components/CapsuleWheel.vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { useTheme, type ThemeMode } from '../../../composables/useTheme';
import {
  DISTANCE_UNITS,
  distanceUnit,
  distanceUnitOptionLabel,
  setDistanceUnit,
  type DistanceUnit,
} from '../../../lib/units';
import { LOCALES, LOCALE_LABELS, useMessages, type Locale } from '../../../i18n';
import { shownLocale } from '../../../lib/motion/localeTarget';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';
import FocusAreasRow from './FocusAreasRow.vue';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { themeMode, resolvedTheme, pickTheme } = useTheme();

const localeOptions = computed(() =>
  LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] })));
const distanceUnitOptions = computed(() =>
  DISTANCE_UNITS.map((value) => ({ value, label: distanceUnitOptionLabel(value) })));
/* 主题三格：深色 / 浅色 / 跟随系统，点哪格就是哪条规则（见 useTheme.pickTheme）；
   新主题从被点的那枚图标处扩散开。顶栏只放月亮 / 太阳两枚，回到跟随系统在这里。 */
const themeOptions = computed(() => [
  { value: 'dark' as ThemeMode, label: d.value.themeDark, icon: 'moon' as const },
  { value: 'light' as ThemeMode, label: d.value.themeLight, icon: 'sun' as const },
  { value: 'system' as ThemeMode, label: d.value.themeSystem, icon: 'monitor' as const },
]);
const themeTrack = ref<{ $el: HTMLElement } | null>(null);
/* 换语言的涟漪从这只语言轮处扩散开（和主题从被点的图标处扩散同理）。 */
const localeWheel = ref<{ $el: HTMLElement } | null>(null);
const chooseLocale = (value: string | number) => {
  const rect = localeWheel.value?.$el.getBoundingClientRect();
  const origin = rect?.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
  void import('../../../lib/motion/ashSwitch').then(({ switchLocaleWithAsh }) => switchLocaleWithAsh(String(value) as Locale, origin));
};
const chooseDistanceUnit = (value: string | number) => setDistanceUnit(String(value) as DistanceUnit);
const chooseTheme = (value: string | number) => {
  const index = themeOptions.value.findIndex((option) => option.value === value);
  const rect = themeTrack.value?.$el.querySelectorAll<HTMLElement>('.segment-item')[index]?.getBoundingClientRect();
  pickTheme(String(value) as ThemeMode, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
};
</script>

<template>
  <section class="s-section">
    <div class="s-list">
      <!-- 语言开关标签是双语的，而且不跟着界面语言变：一个看不懂中文的人
           必须能在中文界面上找到它，反过来也一样。 -->
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">语言 · Language</span></div>
        <div class="s-row-control">
          <CapsuleWheel loop :span="236" :items="localeOptions" :model-value="shownLocale" aria-label="语言 · Language" @update:model-value="chooseLocale" ref="localeWheel" />
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ d.themeLabel }}</span>
          <span class="s-row-sub">{{ resolvedTheme === 'dark' ? d.themeDark : d.themeLight }}<template v-if="themeMode === 'system'"> · {{ d.themeSystem }}</template></span>
        </div>
        <div class="s-row-control">
          <SegmentTrack ref="themeTrack" compact icon-only :items="themeOptions" :model-value="themeMode" :aria-label="d.themeLabel" @update:model-value="chooseTheme" />
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ t.distanceUnitLabel }}</span></div>
        <div class="s-row-control">
          <SegmentTrack compact :items="distanceUnitOptions" :model-value="distanceUnit" :aria-label="t.distanceUnitLabel" @update:model-value="chooseDistanceUnit" />
        </div>
      </div>
      <FocusAreasRow />
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
