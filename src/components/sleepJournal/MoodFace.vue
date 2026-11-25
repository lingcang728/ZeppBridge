<script setup lang="ts">
/* 醒来心情的小圆脸（journalCodes.ts）。 */
import { computed } from 'vue';
import { faceSvg } from './journalCodes';
import type { WakeMood } from '../../types/sleepJournal';

const props = withDefaults(defineProps<{ code: WakeMood; size?: number }>(), { size: 32 });
const inner = computed(() => faceSvg(props.code));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- 脸是本文件里写死的路径，不含外来内容 -->
  <svg class="mood-face" :width="size" :height="size" viewBox="0 0 48 48" aria-hidden="true" v-html="inner" />
</template>

<style scoped>
.mood-face { display: block; flex: none; }
</style>
