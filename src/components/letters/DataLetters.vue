<script setup lang="ts">
/**
 * 信匣「你的信」（批次 7；2026-10-29 照用户定的形式重做：以前一张张纸片硬贴在页面上，不像信）：
 *
 *   那年今天——一排明信片（Postcard），点一下原地翻到背面看那天的数；
 *   每周来信——一排信封（正面、贴邮票，面值是那周周一），点开和作者来信同一套：翻面、拆火漆、抽信纸；
 *   时间胶囊——第一只是没封口的空信封「写给将来的自己」，点开自己抽出一张空信纸来写、盖开封日期的邮戳、封上；
 *   后面是封着火漆的胶囊（背面朝上），到日子了点开拆，没到日子点了只晃一下；拆过的火漆是裂的，可以再读。
 *
 * 全是本机的事实，不生成评语、不和别人比。每周来信和胶囊是写下那一刻的快照（后端存在 data_letters 里），
 * 离线也能重读；胶囊没到日子，后端连原文都不给界面。
 */
import './paper.css';
import './letterRail.css';
import { computed, nextTick, onMounted, ref } from 'vue';
import WaxSeal from './WaxSeal.vue';
import EnvelopeTile from './EnvelopeTile.vue';
import Postcard from './Postcard.vue';
import LetterEnvelope from './LetterEnvelope.vue';
import DataLetterSheet from './DataLetterSheet.vue';
import CapsuleCompose from './CapsuleCompose.vue';
import { useDataLetterFormat } from './useDataLetterFormat';
import { useLetterText } from './letters.i18n';
import { backend } from '../../lib/bridge';
import { lessMotion } from '../../lib/motion/lessMotion';
import type { CustomLetter } from '../../composables/useLetterEnvelope';
import type { DataLetter, DataLettersView, OnThisDayYear } from '../../types/letters';

const f = useDataLetterFormat();
const t = f.t;
const lt = useLetterText();

const view = ref<DataLettersView | null>(null);
const failed = ref(false);
const load = async () => {
  try {
    view.value = await backend.dataLettersState();
    failed.value = false;
  } catch {
    failed.value = true;
  }
};
onMounted(load);

/* 新写的排在最前（紧挨着空信封），封好时看得见它落进这一排。 */
const capsules = computed(() => (view.value?.letters ?? []).filter((letter) => letter.kind === 'capsule')
  .sort((a, b) => b.written_at.localeCompare(a.written_at)));
const weeklies = computed(() => (view.value?.letters ?? []).filter((letter) => letter.kind === 'weekly' && letter.weekly));
const tilt = (i: number) => (i % 3 - 1) * 0.8;
const postcardStats = (year: OnThisDayYear) => year.values.filter((value) => value.value !== null)
  .map((value) => ({ metric: value.metric, label: f.valueLabel(value), value: f.valueText(value) }));
const postcardWorkouts = (year: OnThisDayYear) => year.workouts.map((workout) => f.workoutText(workout));
const year = (day: string | null) => (day ?? '').slice(0, 4);
const capsuleCaption = (letter: DataLetter) => (!letter.sealed && letter.opened_at ? t.value.openedOn(f.longDate(letter.opened_at))
  : f.isDue(letter) ? t.value.due : t.value.sealedUntil(f.longDate(letter.open_on ?? '')));

/* ── 打开一封：同一只信封弹窗，纸上画什么按 letter 定 ── */
type Reading = { custom: CustomLetter; letter: DataLetter | null; origin: HTMLElement };
const reading = ref<Reading | null>(null);
const actionError = ref('');

const openWeekly = (letter: DataLetter, event: MouseEvent) => {
  const range = t.value.weekRange(f.shortDate(letter.weekly!.recent_start), f.shortDate(letter.weekly!.recent_end));
  reading.value = {
    custom: { title: range, to: lt.value.to, stamp: f.stampDay(letter.weekly!.recent_start), sheets: [{ id: String(letter.id), label: t.value.weekly }] },
    letter,
    origin: event.currentTarget as HTMLElement,
  };
};

/* 没到日子：信封在原地晃一下（封着呢）。 */
const shake = (el: HTMLElement) => {
  if (lessMotion()) return;
  el.animate([{ rotate: '0deg' }, { rotate: '-3deg' }, { rotate: '2.5deg' }, { rotate: '-1.5deg' }, { rotate: '0deg' }],
    { duration: 460, easing: 'ease-in-out', composite: 'add' });
};
const openingId = ref<number | null>(null);
const openCapsule = async (letter: DataLetter, event: MouseEvent) => {
  const origin = event.currentTarget as HTMLElement;
  if (letter.sealed && !f.isDue(letter)) { shake(origin); return; }
  let shown = letter;
  actionError.value = '';
  if (letter.sealed) {
    /* 到日子了：先让后端开封（封着的胶囊后端连原文都不给），再从信封正面开始拆。 */
    if (openingId.value !== null) return;
    openingId.value = letter.id;
    try {
      await backend.dataLettersOpenCapsule(letter.id);
      await load();
      shown = capsules.value.find((item) => item.id === letter.id) ?? letter;
    } catch {
      actionError.value = t.value.openFailed;
      return;
    } finally {
      openingId.value = null;
    }
  }
  await nextTick();
  reading.value = {
    custom: { title: t.value.capsules, to: t.value.toFuture, stamp: year(shown.open_on), sheets: [{ id: String(shown.id), label: t.value.capsules }] },
    letter: shown,
    origin: document.querySelector<HTMLElement>(`[data-capsule="${shown.id}"]`) ?? origin,
  };
};

/* 写胶囊：空信封打开，抽出一张空信纸。封好后先把新胶囊放进这一排，再让写好的那页折起来飞回空信封。 */
const compose = (event: MouseEvent) => {
  reading.value = {
    custom: { title: t.value.writeFuture, to: t.value.toFuture, stamp: '', sheets: [{ id: 'compose', label: t.value.capsules, fixed: true }], compose: true },
    letter: null,
    origin: event.currentTarget as HTMLElement,
  };
};
const sealing = ref(false);
const sealError = ref('');
const composer = ref<InstanceType<typeof CapsuleCompose> | null>(null);
const seal = async (note: string, openOn: string, close: () => Promise<void>) => {
  if (sealing.value) return;
  sealing.value = true;
  sealError.value = '';
  try {
    await backend.dataLettersSealCapsule(note, openOn);
  } catch {
    sealError.value = t.value.sealFailed;
    sealing.value = false;
    return;
  }
  await composer.value?.fold();
  await load();
  sealing.value = false;
  await close();
};
const closeReading = () => { reading.value = null; sealError.value = ''; };
</script>

<template>
  <div class="data-letters">
    <p v-if="failed" class="box-empty" role="alert">{{ t.loadFailed }}</p>

    <template v-if="view?.on_this_day.length">
      <h2 class="box-heading">{{ t.onThisDay }}</h2>
      <ul class="letter-rail">
        <li v-for="(day, i) in view.on_this_day" :key="day.date" class="letter-rail-item">
          <Postcard :date="day.date" :label="`${t.yearsAgo(day.years_ago)} · ${f.longDate(day.date)}`" :stats="postcardStats(day)" :workouts="postcardWorkouts(day)" :tilt="tilt(i + 1)" />
          <p class="letter-rail-caption">{{ t.yearsAgo(day.years_ago) }}</p>
        </li>
      </ul>
    </template>

    <template v-if="weeklies.length">
      <h2 class="box-heading">{{ t.weekly }}</h2>
      <ul class="letter-rail">
        <li v-for="(letter, i) in weeklies" :key="letter.id" class="letter-rail-item">
          <EnvelopeTile :label="t.weekRange(f.shortDate(letter.weekly!.recent_start), f.shortDate(letter.weekly!.recent_end))"
            :to="lt.to" :stamp-label="f.stampDay(letter.weekly!.recent_start)" :tilt="tilt(i)" @open="openWeekly(letter, $event)" />
          <p class="letter-rail-caption">{{ t.weekRange(f.shortDate(letter.weekly!.recent_start), f.shortDate(letter.weekly!.recent_end)) }}</p>
        </li>
      </ul>
    </template>

    <h2 class="box-heading">{{ t.capsules }}</h2>
    <TransitionGroup tag="ul" name="rail-drop" class="letter-rail">
      <li key="compose" class="letter-rail-item">
        <EnvelopeTile :label="t.writeFuture" face="back" :tilt="-0.8" @open="compose" />
        <p class="letter-rail-caption">{{ t.writeFuture }}</p>
      </li>
      <li v-for="(letter, i) in capsules" :key="letter.id" class="letter-rail-item">
        <EnvelopeTile :data-capsule="letter.id" :label="capsuleCaption(letter)" face="back" :tilt="tilt(i + 2)" @open="openCapsule(letter, $event)">
          <template #seal><WaxSeal :size="96" still :cracked="!letter.sealed" /></template>
        </EnvelopeTile>
        <p :class="['letter-rail-caption', { 'is-muted': letter.sealed && !f.isDue(letter) }]">{{ capsuleCaption(letter) }}</p>
      </li>
    </TransitionGroup>
    <p v-if="actionError" class="box-empty" role="alert">{{ actionError }}</p>

    <LetterEnvelope v-if="reading" :versions="[]" current="" :custom="reading.custom" :origin="reading.origin" @done="closeReading">
      <template #sheet="{ close }">
        <CapsuleCompose v-if="reading.custom.compose" ref="composer" :busy="sealing" :error="sealError"
          @seal="(note, openOn) => seal(note, openOn, close)" />
        <DataLetterSheet v-else-if="reading.letter" :letter="reading.letter" />
      </template>
    </LetterEnvelope>
  </div>
</template>

<style scoped>
.data-letters { display: grid; gap: 4px; }
.box-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.box-heading { margin: 10px 0 0; color: var(--muted); font-size: var(--fs-2xs); font-weight: 400; letter-spacing: .06em; }
</style>
