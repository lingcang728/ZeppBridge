<script setup lang="ts">
/* 一个睡前标签的双色小图标（journalCodes.ts）。 */
import { computed } from 'vue';
import { TAG_BY_CODE, tagSvg } from './journalCodes';
import type { BedtimeCode } from '../../types/sleepJournal';

const props = withDefaults(defineProps<{ code: BedtimeCode; size?: number }>(), { size: 24 });
const inner = computed(() => {
  const tag = TAG_BY_CODE.get(props.code);
  return tag ? tagSvg(tag) : '';
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- 图标是本文件里写死的路径，不含外来内容 -->
  <svg class="bedtime-icon" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" v-html="inner" />
</template>

<style scoped>
.bedtime-icon { display: block; flex: none; }
</style>
