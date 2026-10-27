<script setup lang="ts">
/**
 * 年轮（/rings）：年度回顾，2026-10-27 第五版改成「真·树木年轮」（星系那套整个否了）。一年长一圈，最早那年在最里面；
 * 圈的宽窄是每周练了多少，没数据的地方线是断开的；选中那年铺应用的主色，圈里一次运动一条刻线（components/rings/TreeRings.vue）。
 * 页面上只有一块大大的木头年轮（用户 2026-10-27：「去掉右边那块字，只留大大的年轮」），探索全在 TreeRings.vue 里：
 * 点一圈、‹ ›、← → 换年，悬停看那一周，点细纹看那次运动，滚轮放大、拖动平移。那年的各项数字仍然交给 AI、印在分享图上。
 *
 * 只用本机的真实数据（后端 `annual_rings`），缺了就留白；「存成图片」在本机画年轮、拼上字、
 * 存到图片文件夹，原始数据不离开这台电脑。12 月 15 日起默认看今年，之前默认看去年。
 */
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import TreeRings from '../components/rings/TreeRings.vue';
import { defaultRingYear } from '../lib/rings/selection';
import { useRingsText } from '../components/rings/rings.i18n';
import { useJournalText } from '../components/journal/journal.i18n';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { drawShare, SNAPSHOT_SIZE } from '../lib/rings/draw';
import { snapshotTree } from '../lib/rings/treeSnapshot';
import { NONE, yearFacts } from '../lib/rings/facts';
import { workoutLabel } from '../lib/labels';
import { fontsReady } from '../lib/fontsReady';
import AskAiButton from '../components/ask/AskAiButton.vue';
import { useYearView } from '../components/journal/year/useYearView';
import { useAnnualRings } from '../composables/useAnnualRings';

defineOptions({ name: 'Rings' });
const t = useRingsText();
const j = useJournalText();
const route = useRoute();
const router = useRouter();

/* 和履历页的年轮区块同一份数据（composables/useAnnualRings.ts）：从卡上形变进来时已经读好了，第一帧就画得出年轮。 */
const { data: rings, error, load } = useAnnualRings();
onMounted(load);
onActivated(load);

const selected = computed<number | null>(() => {
  const data = rings.value;
  if (!data) return null;
  const asked = Number(route.query.year);
  return data.years.some(y => y.year === asked) ? asked : defaultRingYear(data);
});
const pick = (year: number) => { void router.replace({ query: { ...route.query, year: String(year) } }); };
const year = computed(() => rings.value?.years.find(y => y.year === selected.value) ?? null);

const facts = computed(() => (year.value
  ? yearFacts(year.value, t.value, key => j.value.distances[key], workoutLabel)
  : []));

/* 交给 AI：和履历页年轮区块同一份「我看到的这一年」，再加上这一年的各项数字（步数、睡眠、PB、比赛……）。 */
const yearView = useYearView(rings, selected);
const experience = ref<HTMLElement | null>(null);
const askAi = () => yearView.askAi(experience.value, facts.value.map(f => `${f.label}: ${f.value}${f.detail ? ` · ${f.detail}` : ''}`));

/* 存成图片：本机画年轮 → 拼字 → PNG 字节 → 后端写到「图片\ZeppBridge」。 */
const saving = ref(false);
const savedPath = ref<string | null>(null);
const saveError = ref<string | null>(null);
watch(selected, () => { savedPath.value = null; saveError.value = null; });
const share = async () => {
  if (!year.value || !rings.value || saving.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await fontsReady();
    const y = year.value;
    const canvas = document.createElement('canvas');
    drawShare(canvas, {
      snapshot: snapshotTree(rings.value.years, y.year, SNAPSHOT_SIZE),
      title: t.value.shareTitle(y.year),
      subtitle: [t.value.coverage(y.data_days, y.in_progress), y.workouts ? `${t.value.workouts} ${t.value.times(y.workouts)}` : ''].filter(Boolean).join(' · '),
      facts: facts.value.filter(f => f.key !== 'workouts' && f.value !== NONE).map(f => ({ label: f.label, value: f.detail ? `${f.value} · ${f.detail}` : f.value })),
      footer: t.value.shareFooter,
    });
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas');
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    savedPath.value = await backend.ringsSaveImage(t.value.fileStem(y.year), bytes);
  } catch (e) {
    saveError.value = toUserMessage(e, '');
  } finally {
    saving.value = false;
  }
};
const reveal = async () => {
  if (!savedPath.value || !isDesktop()) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(savedPath.value).catch(() => undefined);
};
</script>

<template>
  <section class="page rings-page" aria-labelledby="rings-title">
    <PageHeader title-id="rings-title" :title="t.title" :intro="t.intro">
      <div v-if="year" class="rings-actions">
        <AskAiButton direct :label="String(year.year)" @activate="askAi" />
        <span v-if="savedPath" class="saved">{{ t.saved }}</span>
        <button v-if="savedPath" type="button" class="pill-button quiet" @click="reveal">{{ t.openFolder }}</button>
        <button v-else type="button" class="pill-button" :disabled="saving" @click="share">{{ saving ? t.drawing : t.share }}</button>
      </div>
    </PageHeader>
    <p v-if="error || saveError" class="rings-error" role="alert">{{ error || saveError }}</p>
    <p v-if="rings && !rings.years.length" class="rings-empty">{{ t.empty }}</p>
    <div v-if="year && rings" ref="experience" class="rings-experience">
      <TreeRings :years="rings.years" :selected="year.year" @pick="pick" />
    </div>
  </section>
</template>

<style scoped>
.rings-page.page { display: grid; gap: var(--space-4); align-content: start; }
.rings-actions { display: flex; align-items: center; gap: 10px; }
.saved { color: var(--accent); font-size: var(--fs-sm); }
.rings-error { margin: 0; color: var(--heart); font-size: var(--fs-sm); }
.rings-empty { margin: 0; color: var(--muted); }
/* 只有一块年轮，尽量大，整个落在一屏里（大小在 TreeRings.vue 里）。 */
.rings-experience { display: grid; }
</style>
