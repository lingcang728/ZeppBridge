<script setup lang="ts">
/**
 * 概览上的「AI 想记住」小卡（批次 7，AI 记忆收件箱）：收件箱里最新的一条，「记住 / 不要」两个按钮。
 *
 * 和跑后打分同一种中性小板；收件箱空了整张不画。还有别的就给一个「还有 N 条」的入口去 /ai/memory，
 * 那里能改了再记、能删、能导出。MCP 那边提议不会推数据版本，所以回到概览、窗口回到前台时也重读。
 */
import { computed, onActivated, onBeforeUnmount, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useCoachNotes } from '../../composables/useCoachNotes';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { useCoachNotesText } from './coachNotes.i18n';

const t = useCoachNotesText();
const store = useCoachNotes();
const { notes, busy, error } = store;

const reload = () => { void store.load(); };
const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
onMounted(() => { reload(); document.addEventListener('visibilitychange', onVisible); });
onActivated(reload);
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));
useRevisionReload(reload);

const head = computed(() => notes.value?.proposed[0] ?? null);
const others = computed(() => Math.max(0, (notes.value?.proposed.length ?? 0) - 1));
</script>

<template>
  <section v-if="head" class="coach-inbox" role="group" :aria-label="t.wants">
    <header class="ci-head">
      <small>{{ head.source_name ? t.wantsFrom(head.source_name) : t.wants }}</small>
      <RouterLink v-if="others" class="ci-more" to="/ai/memory">{{ t.more(others) }}</RouterLink>
    </header>
    <p class="ci-text">{{ head.text }}</p>
    <footer class="ci-actions">
      <span v-if="error" class="ci-error" role="status">{{ error }}</span>
      <button type="button" class="pill-button quiet" :disabled="busy" @click="store.decide(head.id, false)">{{ t.reject }}</button>
      <button type="button" class="pill-button" :disabled="busy" @click="store.decide(head.id, true)">{{ t.remember }}</button>
    </footer>
  </section>
</template>

<style scoped>
/* 和跑后打分那块同一种中性小板。 */
.coach-inbox { display: grid; gap: 8px; padding: 14px 16px; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 0 0 1px var(--mat-line); }
.ci-head { display: flex; align-items: baseline; gap: 10px; }
.ci-head small { flex: 1; min-width: 0; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; overflow-wrap: anywhere; }
.ci-more { color: var(--accent); font-size: var(--fs-xs); text-decoration: none; }
.ci-more:hover { text-decoration: underline; }
.ci-text { margin: 0; color: var(--ink); font-size: var(--fs-md); line-height: 1.55; overflow-wrap: anywhere; }
.ci-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.ci-error { flex: 1; color: var(--warning); font-size: var(--fs-xs); }
</style>
