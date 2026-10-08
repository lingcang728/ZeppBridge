<script setup lang="ts">
/**
 * 一张牌（精修批次 7.2，第三轮 A2 重排）：日牌或一叠（周 / 月）。只管长相，点、长按、键盘都在牌桌里处理。
 *
 * - 正面：左上「周四 ◆」；右下只留花色点 + 日期数字（数字倒放像真扑克，汉字不倒放——第二轮「周四」整串倒转 180°）。
 *   正中是日期和读数：数字大、单位小一号、整串不折行，放不下按估出来的宽度一起缩字号（lib/cards/faceValue.ts）。
 * - 一叠：标题只占一行，平均值独占一行，「7 天里几天有记录」画成一排小点；一天都没记录的叠整张压暗、缩小一点，
 *   正中一枚「没有记录」小胶囊（第二轮整块大「—」）。后面垫两张歪着的牌，看上去是一摞。
 * - `state`：`confirm` = 翻到背面「交给 AI ✓」等确认（牌抬起来）；`boxed` = 牌已经在收集箱里，牌位只剩虚线轮廓。
 * - 长按：边框描一圈（450ms，CSS 动画），按住时牌往下沉一点。进度环按牌的真实像素和圆角画（1A·A7，以前
 *   `viewBox 0 0 50 70` 拉伸、rx=5，圆角对不上牌）：矩形的位置、大小、rx 都是 CSS 几何属性，跟着 --w 走。`pcard-glow` 是一圈只淡入淡出的光，牌桌用它闪一下。
 * 没有记录的日子照样是一张牌，读数写「—」，整张压暗、不能挑。
 */
import { computed } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import { useCardsText } from './cards.i18n';
import { faceFit, splitFaceValue, textFit } from '../../lib/cards/faceValue';

const props = withDefaults(defineProps<{
  kind: 'day' | 'group';
  top: string;
  title: string;
  value?: string | null;
  unit?: string | null;
  /** 右下角的数字（日牌是几号）。 */
  corner?: string | null;
  /** 一叠里每天：没记录 false / 有记录 true / 已挑进收集箱 'picked'（画成小点，已挑的点亮，1A·A5）。 */
  dots?: Array<boolean | 'picked'> | null;
  state?: 'front' | 'confirm' | 'boxed';
  badge?: string | null;
  disabled?: boolean;
  /** 一叠一天记录都没有。 */
  empty?: boolean;
  holding?: boolean;
  focused?: boolean;
  tint?: string;
  /** 图标（运动牌）。 */
  icon?: IconName | null;
  /** 双读数牌（乳酸阈值）：第二行读数、单位、颜色。牌面左上 tint、右下 tint2 对角斜切。 */
  value2?: string | null;
  unit2?: string | null;
  tint2?: string | null;
}>(), { value2: null, unit2: null, tint2: null, value: null, unit: null, corner: null, dots: null, state: 'front', badge: null, disabled: false, empty: false, holding: false, focused: false, tint: 'var(--accent)', icon: null });
const t = useCardsText();
const parts = computed(() => splitFaceValue(props.value, props.unit));
const parts2 = computed(() => (props.tint2 ? splitFaceValue(props.value2, props.unit2) : []));
const fit = computed(() => ({ '--fit': String(Math.max(faceFit(parts.value), parts2.value.length ? faceFit(parts2.value) : 0)), '--tfit': String(textFit(props.title)), ...(props.tint2 ? { '--tint2': props.tint2 } : {}) }));
</script>

<template>
  <button type="button" :class="['pcard', kind, state, { disabled, holding, focused, empty, duo: !!tint2 }]" :style="{ '--tint': tint, ...fit }" :aria-disabled="disabled || undefined">
    <span v-if="state === 'boxed'" class="pcard-face outline">
      <Icon name="box" :size="20" />
      <small>{{ t.inBox }}</small>
      <b>{{ title }}</b>
    </span>
    <span v-else-if="state === 'confirm'" class="pcard-face back">
      <span class="back-send">
        <span class="back-mark"><Icon name="check" :size="30" /></span>
        <strong>{{ t.picked }}</strong>
        <small class="back-title">{{ title }}</small>
      </span>
      <span class="back-cancel">{{ t.putBack }}</span>
    </span>
    <span v-else class="pcard-face">
      <span class="corner tl" aria-hidden="true"><small>{{ top }}</small><i></i></span>
      <span class="pcard-main">
        <Icon v-if="icon" class="pcard-icon" :name="icon" :size="22" />
        <strong class="pcard-title">{{ title }}</strong>
        <span v-if="kind === 'group' && empty" class="pcard-none-pill">{{ t.noRecord }}</span>
        <template v-else-if="tint2 && kind === 'day'">
          <span :class="['pcard-value', { none: !parts.length }]"><template v-if="parts.length"><template v-for="(part, i) in parts" :key="i"><b v-if="part.n">{{ part.n }}</b><small v-else>{{ part.u }}</small></template></template><template v-else>—</template></span>
          <span :class="['pcard-value', 'second', { none: !parts2.length }]"><template v-if="parts2.length"><template v-for="(part, i) in parts2" :key="i"><b v-if="part.n">{{ part.n }}</b><small v-else>{{ part.u }}</small></template></template><template v-else>—</template></span>
        </template>
        <span v-else-if="parts.length" class="pcard-value"><template v-for="(part, i) in parts" :key="i"><b v-if="part.n">{{ part.n }}</b><small v-else>{{ part.u }}</small></template></span>
        <span v-else class="pcard-value none">—</span>
        <span v-if="dots && dots.length" :class="['pcard-dots', { 'has-picked': dots.includes('picked') }]" aria-hidden="true" :style="{ '--cols': Math.min(7, dots.length) }"><i v-for="(on, i) in dots" :key="i" :class="{ on: on === true, picked: on === 'picked' }"></i></span>
      </span>
      <span class="corner br" aria-hidden="true"><i></i><b v-if="corner">{{ corner }}</b></span>
      <em v-if="badge" class="pcard-badge">{{ badge }}</em>
    </span>
    <span class="pcard-glow" aria-hidden="true"></span>
    <svg class="pcard-ring" aria-hidden="true"><rect pathLength="100" /></svg>
  </button>
</template>

<style scoped src="./PlayingCard.css"></style>
