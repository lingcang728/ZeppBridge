<script setup lang="ts">
/**
 * 年轮（/rings，批次 7）：年度回顾。照搬 Lumina 的 3D 粒子：飞入星海 → 年份数字 → 年轮切片
 * （一年一圈，选中的那年发金光，那一年的每次运动是一颗会闪的星）→ 空格绽放成标题。
 *
 * 只用本机的真实数据（后端 `annual_rings`），缺了就留白；「存成图片」截舞台的一帧、在本机拼上字、
 * 存到图片文件夹，原始数据不离开这台电脑。12 月 15 日起默认看今年，之前默认看去年。
 */
import { computed, onActivated, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import RingsStage from '../components/rings/RingsStage.vue';
import { useRepairText } from '../components/journal/repair.i18n';
import { defaultRingYear } from '../lib/rings/selection';
import { useRingsText } from '../components/rings/rings.i18n';
import { useJournalText } from '../components/journal/journal.i18n';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { drawShare, SNAPSHOT_SIZE } from '../lib/rings/draw';
import { NONE, yearFacts } from '../lib/rings/facts';
import { workoutLabel } from '../lib/labels';
import { fontsReady } from '../lib/fontsReady';
import { diveOut } from '../lib/rings/cosmosDive';
import AskAiButton from '../components/ask/AskAiButton.vue';
import { useYearView } from '../components/journal/year/useYearView';
import { STAGE_NEBULA_RATIO } from '../lib/rings/nebula';
import type { AnnualRings } from '../types/rings';

defineOptions({ name: 'Rings' });
const t = useRingsText();
const j = useJournalText();
const repair = useRepairText();
const route = useRoute();
const router = useRouter();

const rings = shallowRef<AnnualRings | null>(null);
const error = ref<string | null>(null);
const load = async () => {
  try {
    const next = await backend.annualRings();
    // 内容没变就不换引用，免得舞台重建年轮造型。
    if (JSON.stringify(next) !== JSON.stringify(rings.value)) rings.value = next;
    error.value = null;
  } catch (e) { error.value = toUserMessage(e, ''); }
};
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
// 按钮上就是年份本身，不再挂一个「2026 年」的悬停提示（和按钮字重复）。
const yearItems = computed(() => [...(rings.value?.years ?? [])].reverse().map(y => ({ value: y.year, label: String(y.year) })));

const facts = computed(() => (year.value
  ? yearFacts(year.value, t.value, key => j.value.distances[key], workoutLabel)
  : []));
const primaryKeys = ['workouts', 'hours', 'running', 'activeDays', 'longestRun'];
const displayedYear = shallowRef<typeof year.value>(null);
const displayedFacts = computed(() => displayedYear.value ? yearFacts(displayedYear.value, t.value, key => j.value.distances[key], workoutLabel) : []);
const primaryFacts = computed(() => primaryKeys.flatMap(key => displayedFacts.value.filter(f => f.key === key)));
const secondaryFacts = computed(() => displayedFacts.value.filter(f => !primaryKeys.includes(f.key)));

const stage = ref<InstanceType<typeof RingsStage> | null>(null);
/* 交给 AI：和履历页年轮区块同一份「我看到的这一年」，再加上右栏这些（步数、睡眠、PB、比赛……）。 */
const yearView = useYearView(rings, selected);
const experience = ref<HTMLElement | null>(null);
const askAi = () => yearView.askAi(experience.value, facts.value.map(f => `${f.label}: ${f.value}${f.detail ? ` · ${f.detail}` : ''}`));
/* 回履历：星云从舞台缩回卡上那一格（进来时的反放）。 */
onBeforeRouteLeave((to) => {
  const box = (stage.value?.$el as HTMLElement | undefined)?.getBoundingClientRect();
  if (to.name === 'Journal' && box?.width) diveOut({ cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius: box.height * STAGE_NEBULA_RATIO });
});

/* 下方的数据：等舞台从飞入落到第一幕、或者用户先滚到这里，才出场。 */
const factsBox = ref<HTMLElement | null>(null);
const factsShown = ref(false);
/* 换年份时右栏不清空（以前先整栏消失、等一秒多新数字才出来）：旧数字压暗留着，新的年份落定时再换上、亮回来。 */
const swapping = ref(false);
watch(selected, () => { if (factsShown.value) swapping.value = true; });
function landed(phase: string) { if (phase === 'year') { displayedYear.value = year.value; factsShown.value = true; swapping.value = false; } }
let factsObserver: IntersectionObserver | null = null;
watch([factsBox, selected], ([box]) => {
  factsObserver?.disconnect();
  if (!box || factsShown.value) return;
  factsObserver = new IntersectionObserver(entries => {
    // A narrow layout may be scrolled to the facts before the canvas is visible.
    if (entries.some(entry => entry.isIntersecting) && window.innerWidth < 1280) { displayedYear.value = year.value; factsShown.value = true; factsObserver?.disconnect(); }
  }, { threshold: 0.25 });
  factsObserver.observe(box);
});
onBeforeUnmount(() => factsObserver?.disconnect());

/* 存成图片：截舞台一帧 → 拼字 → PNG 字节 → 后端写到「图片\ZeppBridge」。 */
const saving = ref(false);
const savedPath = ref<string | null>(null);
const saveError = ref<string | null>(null);
watch(selected, () => { savedPath.value = null; saveError.value = null; });
const share = async () => {
  if (!year.value || saving.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await Promise.all([fontsReady(), stage.value?.settle()]);
    const y = year.value;
    const canvas = document.createElement('canvas');
    drawShare(canvas, {
      snapshot: stage.value?.capture(SNAPSHOT_SIZE, SNAPSHOT_SIZE) ?? null,
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
    <template v-if="year && rings">
      <SegmentTrack v-if="yearItems.length > 1" class="rings-years" compact :items="yearItems" :model-value="year.year" :aria-label="t.years" @update:model-value="pick" />
      <div ref="experience" class="rings-experience">
        <RingsStage ref="stage" class="rings-stage-box" :years="rings.years" :selected="year.year" :finale-text="t.shareTitle(year.year)" @land="landed" />
        <section ref="factsBox" :class="['rings-facts', { shown: factsShown, swapping }]" :aria-label="t.yearAria(year.year)">
          <div v-if="displayedYear" class="facts-content" :inert="!factsShown || undefined" :aria-hidden="!factsShown">
            <p class="coverage">{{ t.coverage(displayedYear.data_days, displayedYear.in_progress) }}</p>
            <div class="primary-facts">
              <component :is="fact.workoutId ? RouterLink : 'div'" v-for="fact in primaryFacts" :key="fact.key" class="fact" data-morph-card
                :to="fact.workoutId ? { name: 'WorkoutDetail', params: { workoutId: fact.workoutId } } : undefined">
                <span class="fact-label">{{ fact.label }}</span><strong>{{ fact.value }}</strong><small v-if="fact.detail">{{ fact.detail }}</small>
              </component>
            </div>
            <details class="more-facts"><summary>{{ repair.more }}</summary>
              <component :is="fact.workoutId ? RouterLink : 'div'" v-for="fact in secondaryFacts" :key="fact.key" class="fact secondary" data-morph-card
                :to="fact.workoutId ? { name: 'WorkoutDetail', params: { workoutId: fact.workoutId } } : undefined">
                <span class="fact-label">{{ fact.label }}</span><strong>{{ fact.value }}</strong><small v-if="fact.detail">{{ fact.detail }}</small>
              </component>
            </details>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.rings-page.page { display: grid; gap: var(--space-4); align-content: start; }
.rings-actions { display: flex; align-items: center; gap: 10px; }
.saved { color: var(--kintsugi); font-size: var(--fs-sm); }
.rings-error { margin: 0; color: var(--heart); font-size: var(--fs-sm); }
.rings-empty { margin: 0; color: var(--muted); }
/* 年份就是普通的数字，选中也不加粗（用户 2026-10-27：2024、2025、2026 字太重）。 */
.rings-years { justify-self: start; max-width: 100%; }
.rings-years :deep(.segment-ink) { font-weight: 500; }
.rings-experience { display: grid; grid-template-columns: minmax(0, 2.125fr) minmax(300px, 1fr); background: #050510; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--mat-rim), var(--mat-shadow); }
.rings-stage-box { min-height: 640px; height: min(76vh, 860px); }
.rings-facts { position: relative; padding: 32px; min-width: 0; color: #f5efdf; }
.rings-facts::before { content: ''; position: absolute; left: 0; top: 5%; bottom: 5%; width: 1px; background: linear-gradient(transparent, #d8bc7950, transparent); }
.facts-content { opacity: 0; transform: translateY(4px); transition: opacity 120ms ease, transform 120ms ease; }
.shown .facts-content { opacity: 1; transform: none; transition-duration: 420ms; }
.shown.swapping .facts-content { opacity: .3; transition-duration: 240ms; }
.coverage { margin: 0 0 16px; font-size: 16px; color: #c5bdaf; line-height: 1.6; }
.primary-facts { display: grid; }
.fact { display: grid; gap: 4px; padding: 12px 0; color: inherit; text-decoration: none; border-top: 1px solid #ffffff12; }
.fact-label { color: #bcb4aa; font-size: 14px; }
.fact strong { font-size: 28px; line-height: 1.3; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.fact small { color: #c5bdaf; font-size: 14px; }
a.fact:hover strong { color: var(--kintsugi); }
.more-facts { margin-top: 12px; }
.more-facts summary { color: #dec78e; font-size: 16px; cursor: pointer; }
.secondary strong { font-size: 20px; }
@media (max-width: 1279px) {
  .rings-experience { grid-template-columns: minmax(0, 1fr); }
  .rings-stage-box { height: clamp(460px, 68vh, 760px); min-height: 460px; }
  .rings-facts::before { top: 0; bottom: auto; left: 5%; right: 5%; height: 1px; width: auto; background: linear-gradient(90deg, transparent, #d8bc7950, transparent); }
  .primary-facts { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 24px; }
}
@media (max-width: 600px) { .rings-facts { padding: 24px; } .primary-facts { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .facts-content { transition: none; transform: none; } }
</style>
