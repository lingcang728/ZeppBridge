<script setup lang="ts">
/* 语言：一只玻璃滚轮（审计 A4，2026-10-07），和应用顶栏的语言轮同一个组件——左右拖、滚轮、方向键、点两边露出的那一项。
 * 以前是一颗地球按钮点开一列下拉菜单；全应用规范不用下拉框。地球钉在镜片左边说明这是语言。 */
import { computed } from 'vue';
import CapsuleWheel from '../../components/CapsuleWheel.vue';
import LandingIcon from './LandingIcon.vue';
import { LANDING_LOCALES, LOCALE_LABELS, type LandingLocale } from '../../composables/useLandingLocale';

defineProps<{ modelValue: LandingLocale; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: LandingLocale] }>();
const items = computed(() => LANDING_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] })));
</script>

<template>
  <div class="lp-locale">
    <LandingIcon name="globe" :size="17" class="lp-locale-globe" />
    <CapsuleWheel variant="bare" loop :span="170" :fit-peek="14" :items="items" :model-value="modelValue" :aria-label="label"
      @update:model-value="emit('update:modelValue', $event as LandingLocale)" />
  </div>
</template>

<style scoped>
.lp-locale { display: inline-flex; align-items: center; gap: 4px; padding-left: 8px; border-radius: 999px; color: var(--lp-muted); }
.lp-locale-globe { flex: none; }
@media (max-width: 520px) { .lp-locale-globe { display: none; } }
</style>
