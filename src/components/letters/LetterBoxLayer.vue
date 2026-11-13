<script setup lang="ts">
/**
 * 信匣浮层（全局一份，挂在 AppShell；开关在 composables/useLetterBoxSheet.ts）：
 * 从顶栏的信件圆钮长出来，关上时原路缩回它；圆钮在浮层开着时藏着（dialogFlight 的 hideSource），不叠两份。
 * 内容和 /letters 那一页是同一份（LetterBoxPanel.vue）。换页（信匣里点了别处的链接）时浮层先收起。
 */
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import ModalDialog from '../ModalDialog.vue';
import LetterBoxPanel from './LetterBoxPanel.vue';
import { closeLetterBoxSheet, useLetterBoxSheet } from '../../composables/useLetterBoxSheet';

const { box } = useLetterBoxSheet();
const route = useRoute();
watch(() => route.fullPath, () => closeLetterBoxSheet());
</script>

<template>
  <ModalDialog v-if="box" labelledby="letter-box-sheet-title" :origin="box.origin" :max-width="1080" @close="closeLetterBoxSheet">
    <div class="letter-box letter-box-sheet">
      <LetterBoxPanel :tab="box.tab" title-id="letter-box-sheet-title" />
    </div>
  </ModalDialog>
</template>

<style scoped>
/* 浮层里照旧是「页」的版式，只是不要整页那么高的留白；宽一点，信封一排能放下三四只。 */
.letter-box-sheet { width: min(1040px, calc(100vw - 80px)); min-height: min(560px, calc(100vh - 120px)); padding: 6px 6px 10px; }
</style>
