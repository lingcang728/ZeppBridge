<script setup lang="ts">
/**
 * 年轮（/rings，批次 7）：年度回顾。照搬 Lumina 的 3D 粒子：飞入星海 → 年份数字 → 年轮切片
 * （一年一圈，选中的那年发金光，那一年的每次运动是一颗会闪的星）→ 空格绽放成标题。
 *
 * 只用本机的真实数据（后端 `annual_rings`），缺了就留白；「存成图片」截舞台的一帧、在本机拼上字、
 * 存到图片文件夹，原始数据不离开这台电脑。12 月 15 日起默认看今年，之前默认看去年。
 */
import { computed, onActivated, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import RingsStage from '../components/rings/RingsStage.vue';
import CountUp from '../components/rings/CountUp.vue';
import { useRingsText } from '../components/rings/rings.i18n';
import { useJournalText } from '../components/journal/journal.i18n';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { drawShare, SNAPSHOT_SIZE } from '../lib/rings/draw';
import { NONE, yearFacts } from '../lib/rings/facts';
import { workoutLabel } from '../lib/labels';
import { fontsReady } from '../lib/fontsReady';
import type { AnnualRings } from '../types/rings';

defineOptions({ name: 'Rings' });
const t = useRingsText();
const j = useJournalText();
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

/** 12 月 15 日起默认今年，之前默认去年（有的话）。 */
const defaultYear = (data: AnnualRings): number | null => {
  const years = data.years.map(y => y.year);
  if (!years.length) return null;
  const [y, m, d] = data.today.split('-').map(Number);
  const late = m === 12 && d >= 15;
  return late || !years.includes(y - 1) ? years[years.length - 1] : y - 1;
};
const selected = computed<number | null>(() => {
  const data = rings.value;
  if (!data) return null;
  const asked = Number(route.query.year);
  return data.years.some(y => y.year === asked) ? asked : defaultYear(data);
});
const pick = (year: number) => { void router.replace({ query: { ...route.query, year: String(year) } }); };
const year = computed(() => rings.value?.years.find(y => y.year === selected.value) ?? null);
const yearItems = computed(() => [...(rings.value?.years ?? [])].reverse().map(y => ({ value: y.year, label: String(y.year), title: t.value.yearAria(y.year) })));

const facts = computed(() => (year.value
  ? yearFacts(year.value, t.value, key => j.value.distances[key], workoutLabel)
  : []));
const openWorkout = (id?: string) => { if (id) void router.push({ name: 'WorkoutDetail', params: { workoutId: id } }); };

const stage = ref<InstanceType<typeof RingsStage> | null>(null);

/* 下方的数据：等舞台从飞入落到第一幕、或者用户先滚到这里，才出场。 */
const factsBox = ref<HTMLElement | null>(null);
const factsShown = ref(false);
watch(() => stage.value?.stage, value => { if (value && value !== 'idle') factsShown.value = true; });
let factsObserver: IntersectionObserver | null = null;
watch(factsBox, box => {
  factsObserver?.disconnect();
  if (!box || factsShown.value) return;
  factsObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { factsShown.value = true; factsObserver?.disconnect(); }
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
        <span v-if="savedPath" class="saved">{{ t.saved }}</span>
        <button v-if="savedPath" type="button" class="pill-button quiet" @click="reveal">{{ t.openFolder }}</button>
        <button v-else type="button" class="pill-button" :disabled="saving" @click="share">{{ saving ? t.drawing : t.share }}</button>
      </div>
    </PageHeader>
    <p v-if="error || saveError" class="rings-error" role="alert">{{ error || saveError }}</p>
    <p v-if="rings && !rings.years.length" class="rings-empty">{{ t.empty }}</p>
    <template v-if="year && rings">
      <SegmentTrack v-if="yearItems.length > 1" class="rings-years" compact :items="yearItems" :model-value="year.year" :aria-label="t.years" @update:model-value="pick" />
      <RingsStage ref="stage" class="rings-stage-box" :years="rings.years" :selected="year.year" :finale-text="t.shareTitle(year.year)" @open-workout="openWorkout" />
      <!-- 不再「闪现」：舞台第一次落到年份数字上（或者先滚到这里）才出场，各行错峰升起、数字从 0 滚上来；
           换年份时整块按年份重挂，再落一次（和舞台的拳击同拍）。 -->
      <section ref="factsBox" :class="['rings-facts', 'metric-panel', { shown: factsShown }]" :aria-label="t.yearAria(year.year)">
        <p :key="`c${year.year}`" class="coverage">{{ t.coverage(year.data_days, year.in_progress) }}</p>
        <dl :key="year.year">
          <div v-for="(fact, i) in facts" :key="fact.key" :class="['fact', { link: fact.workoutId }]" :style="{ '--i': i }" @click="openWorkout(fact.workoutId)">
            <dt>{{ fact.label }}</dt>
            <dd><CountUp v-if="fact.count" :text="fact.value" :run="factsShown" :delay="160 + i * 45" /><template v-else>{{ fact.value }}</template><small v-if="fact.detail">{{ fact.detail }}</small></dd>
          </div>
        </dl>
      </section>
    </template>
  </section>
</template>

<style scoped>
.rings-page.page { display: grid; gap: var(--space-4); align-content: start; }
.rings-actions { display: flex; align-items: center; gap: 10px; }
.saved { color: var(--kintsugi); font-size: var(--fs-sm); }
.rings-error { margin: 0; color: var(--heart); font-size: var(--fs-sm); }
.rings-empty { margin: 0; color: var(--muted); }
.rings-years { justify-self: start; max-width: 100%; }
.rings-stage-box { height: clamp(460px, 72vh, 860px); box-shadow: var(--mat-rim), var(--mat-shadow); }
.rings-facts { display: grid; gap: 10px; padding: 20px 24px; border-radius: var(--radius-lg); transition: opacity .5s ease, translate .6s cubic-bezier(.2, .9, .25, 1); }
/* 还没出场：占着位置（下面不跳），看不见。 */
.rings-facts:not(.shown) { visibility: hidden; opacity: 0; translate: 0 16px; }
.coverage { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
/* 出场 / 换年份：每行错峰升起，落定时轻轻过冲一下（和舞台的拳击是一套手感）。 */
.shown .coverage { animation: fact-in 520ms cubic-bezier(.2, .9, .25, 1) both; }
.shown .fact { animation: fact-in 560ms cubic-bezier(.2, .9, .25, 1) both; animation-delay: calc(120ms + var(--i) * 45ms); }
@keyframes fact-in {
  0% { opacity: 0; transform: translateY(12px) scale(.96); }
  55% { opacity: 1; transform: translateY(-2px) scale(1.02); }
  100% { opacity: 1; transform: none; }
}
.rings-facts dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 28px; margin: 0; }
.fact { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--line); }
.fact dt { flex: none; color: var(--muted); font-size: var(--fs-sm); }
.fact dd { margin: 0; min-width: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.fact dd small { display: block; margin-top: 2px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 400; }
.fact.link { cursor: pointer; }
.fact.link:hover dd { color: var(--kintsugi); }
</style>
