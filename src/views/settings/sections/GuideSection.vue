<script setup lang="ts">
/* 设置里的「新手引导」卡：从头看一遍、只看某一章（都在示例沙盒里跑，见 lib/tour/sandbox.ts），
   以及让「第一次碰到」的就地提示再出现一次。 */
import { ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import { launchSandbox } from '../../../composables/useTour';
import { FULL_TOUR, INLINE_CHAPTERS, type TourChapterId } from '../../../lib/tour/chapters';
import { forgetSeen, seenChapters } from '../../../lib/tour/sandbox';
import { useTourText } from '../../../components/tour/tour.i18n';

const t = useTourText();
const seen = ref(seenChapters());
const rows: TourChapterId[] = ['whatsnew', ...FULL_TOUR];
const resetDone = ref(false);

/* 看完回到这张卡。 */
const look = (chapters: TourChapterId[], welcome = false) => launchSandbox(chapters, { welcome, ret: '/settings/guide' });
const resetTips = () => {
  forgetSeen([...INLINE_CHAPTERS]);
  seen.value = seenChapters();
  resetDone.value = true;
};
</script>

<template>
  <section class="s-section">
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ t.fullTour }}</span></div>
        <div class="s-row-control">
          <button type="button" class="button primary" @click="look([...FULL_TOUR], true)">{{ t.start }}</button>
        </div>
      </div>
      <div v-for="id in rows" :key="id" class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.chapter[id] }}</span>
          <span v-if="seen.has(id)" class="s-row-sub guide-seen"><Icon name="circle-check" :size="13" />{{ t.seenMark }}</span>
        </div>
        <div class="s-row-control">
          <button type="button" class="button secondary" @click="look([id])">{{ t.look }}</button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.resetTips }}</span>
          <span v-if="resetDone" class="s-row-sub" role="status">{{ t.resetDone }}</span>
        </div>
        <div class="s-row-control">
          <button type="button" class="button secondary" :disabled="resetDone" :aria-label="t.resetTips" :title="t.resetTips" @click="resetTips"><Icon name="refresh" :size="14" /></button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.guide-seen { display: inline-flex; align-items: center; gap: 4px; }
</style>
