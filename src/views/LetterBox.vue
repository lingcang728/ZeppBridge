<script setup lang="ts">
/**
 * 信匣这一页（/letters）：内容在 components/letters/LetterBoxPanel.vue，和顶栏长按信件打开的浮层共用。
 * 这里只把路由上的 `?tab=` / `?write=` 交给它，外加新手引导。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import LetterBoxPanel from '../components/letters/LetterBoxPanel.vue';
import { useSectionTour } from '../composables/useTour';

const route = useRoute();
const queryText = (value: unknown) => (typeof value === 'string' ? value : null);
const tab = computed(() => queryText(route.query.tab));
const write = computed(() => queryText(route.query.write));

/* 新手引导：这个板块第一次打开时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('letters');
</script>

<template>
  <section class="page letter-box" aria-labelledby="letter-box-title">
    <LetterBoxPanel :tab="tab" :write="write" title-id="letter-box-title" />
  </section>
</template>
