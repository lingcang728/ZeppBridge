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
import { yearFacts } from '../lib/rings/facts';
import { shareStory } from '../lib/rings/share';
import type { RingYear } from '../types/rings';
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

/* 选中哪年记在页面自己身上，只在停在年轮页时跟着地址走：页面缓存着去了运动详情，全局路由的 query 里就没有 year 了，
   以前选中跟着退回默认那年——外圈 / 内圈点开一次运动，背后的木头跳回中间那圈、开着的卡被清掉，返回时形变找不到卡只剩一个黑框，
   整块木头再重长一遍（用户 2026-10-28 录屏）。 */
const askedYear = ref<number>(Number.NaN);
watch(() => [route.name, route.query.year] as const, ([name, value]) => {
  if (name === 'Rings') askedYear.value = Number(value);
}, { immediate: true });
const selected = computed<number | null>(() => {
  const data = rings.value;
  if (!data) return null;
  const asked = askedYear.value;
  return data.years.some(y => y.year === asked) ? asked : defaultRingYear(data);
});
const pick = (year: number) => { void router.replace({ query: { ...route.query, year: String(year) } }); };
const year = computed(() => rings.value?.years.find(y => y.year === selected.value) ?? null);

const facts = computed(() => (year.value
  ? yearFacts(year.value, t.value, key => j.value.distances[key], workoutLabel)
  : []));

/* 交给 AI：和履历页年轮区块同一份「我看到的这一年」，再加上这一年的各项数字（步数、睡眠、PB、比赛……）。 */
const yearView = useYearView(rings, selected);
/* 「交给 AI」从这枚按钮里长出来、返回缩回它：以前拿整块年轮当来处，整屏长到整屏看上去就是硬切（用户 2026-10-28）。 */
const askButton = ref<InstanceType<typeof AskAiButton> | null>(null);
const askAi = () => yearView.askAi(askButton.value?.button ?? null, facts.value.map(f => `${f.label}: ${f.value}${f.detail ? ` · ${f.detail}` : ''}`), { anySize: true });

/* 存成图片：本机画年轮 → 拼字 → PNG 字节 → 后端写到「图片\ZeppBridge」。 */
/** 分享图上的树只长到这一年：那年就是最外面一圈、撑满画面（以前晒 2021 年，它是正中间一小点，外面还套着之后的几年）。
    只剩一圈时不切（最早那年多半只有半年数据，单独一圈是个扇形，刻线全戳在外面）。 */
const treeUpTo = (years: RingYear[], year: number) => {
  const upTo = years.filter(v => v.year <= year);
  return upTo.length >= 2 ? upTo : years;
};
/** 分享图底部的应用图标（public/ 下那张 512px 的）；读不到就只写字。 */
const loadIcon = () => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = '/zeppbridge-icon.png';
});
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
    const story = shareStory(y, t.value.shareStory, key => j.value.distances[key], workoutLabel);
    const canvas = document.createElement('canvas');
    drawShare(canvas, {
      snapshot: snapshotTree(treeUpTo(rings.value.years, y.year), y.year, SNAPSHOT_SIZE),
      title: t.value.shareTitle(y.year),
      highlight: String(y.year),
      subtitle: [t.value.coverage(y.data_days, y.in_progress), story.perWeek].filter(Boolean).join(' · '),
      story,
      icon: await loadIcon(),
      brand: 'ZeppBridge',
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
        <AskAiButton ref="askButton" direct :label="String(year.year)" @activate="askAi" />
        <span v-if="savedPath" class="saved">{{ t.saved }}</span>
        <button v-if="savedPath" type="button" class="pill-button quiet" @click="reveal">{{ t.openFolder }}</button>
        <button v-else type="button" class="pill-button" :disabled="saving" @click="share">{{ saving ? t.drawing : t.share }}</button>
      </div>
    </PageHeader>
    <p v-if="error || saveError" class="rings-error" role="alert">{{ error || saveError }}</p>
    <p v-if="rings && !rings.years.length" class="rings-empty">{{ t.empty }}</p>
    <div v-if="year && rings" class="rings-experience">
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
