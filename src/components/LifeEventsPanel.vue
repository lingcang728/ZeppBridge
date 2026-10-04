<script setup lang="ts">
/**
 * 概览底部的生活事件：一条竖着的时间线。
 *
 * 每件事是线上的一个节点（分类色 + 图标）和旁边一枚胶囊：标题、起止日期、备注。
 * 仍在持续的事节点会呼吸。上面一排是筛选胶囊（全部 / 持续中）和搜索框，
 * 右上角「+ 添加事件」。以前是一张带输入框和勾选框的表格式列表，加上「上一页 / 下一页」；
 * 现在往下拉「再看 6 件」。
 */
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import SegmentTrack from './SegmentTrack.vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { eventIcon, eventTone, lifeEventMessages } from '../lib/lifeEvents';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { useMessages } from '../i18n';

const t = useMessages(lifeEventMessages);
const { events, loading, loaded, failed, reload, open } = useLifeEvents();
const search = ref('');
const scope = ref<'all' | 'ongoing'>('all');
const STEP = 6;
const visible = ref(STEP);
const scopeItems = computed(() => [
  { value: 'all' as const, label: t.value.all },
  { value: 'ongoing' as const, label: t.value.active },
]);
const filtered = computed(() => events.value.filter((e) => (scope.value === 'all' || e.endDate === null)
  && `${e.title} ${e.notes}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const rows = computed(() => filtered.value.slice(0, visible.value));
/* 还一件都没有：整块收成一行（标题、一句引导、添加按钮），不再是一张大卡里孤零零一行字。 */
/* 只有第一次读之前才看 loading：以前每回到概览、每存一条都会重读，读的那一瞬 empty 翻成 false，
   图标卸掉又挂回、整行布局跳一下——用户看到的「生活事件图标重绘」。 */
const empty = computed(() => !events.value.length && !failed.value && (loaded.value || !loading.value));
const date = (s: string) => displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${s}T00:00:00`));
watch([search, scope, events], () => { visible.value = STEP; });
onMounted(reload);
onActivated(reload);
</script>

<template>
  <section id="life-events" :class="['life-events', { 'is-empty': empty }]" aria-labelledby="life-events-title">
    <header class="le-head">
      <span v-if="empty" class="le-empty-mark" aria-hidden="true"><Icon name="pin" :size="18" /></span>
      <div>
        <h2 id="life-events-title">{{ t.title }}</h2>
        <p>{{ empty ? t.empty : t.intro }}</p>
      </div>
      <button type="button" class="pill-button is-glass" @click="open()"><Icon name="plus" :size="14" />{{ t.add }}</button>
    </header>

    <div v-if="events.length" class="le-filters">
      <SegmentTrack v-model="scope" compact :items="scopeItems" :aria-label="t.title" />
      <label class="le-search">
        <Icon name="search" :size="15" />
        <input v-model="search" type="search" :placeholder="t.search" :aria-label="t.search" />
      </label>
    </div>

    <p v-if="failed" class="le-note" role="alert">{{ t.failed }} <button type="button" class="pill-button quiet" @click="reload">{{ t.retry }}</button></p>
    <p v-else-if="loading && !events.length" class="le-note" role="status">{{ t.loading }}</p>
    <p v-else-if="!rows.length && !empty" class="le-note">{{ events.length ? t.noMatch : t.empty }}</p>

    <ol v-if="rows.length" class="le-timeline">
      <li v-for="event in rows" :key="event.id" :style="{ '--event-tone': eventTone(event.category) }">
        <span :class="['le-node', { ongoing: event.endDate === null }]" aria-hidden="true"><Icon :name="eventIcon(event.category)" :size="14" /></span>
        <button type="button" class="le-card" @click="open(event)">
          <span class="le-top">
            <strong>{{ event.title }}</strong>
            <span class="le-when">
              {{ date(event.startDate) }}<template v-if="event.endDate !== event.startDate"> — {{ event.endDate ? date(event.endDate) : t.active }}</template>
            </span>
          </span>
          <span class="le-kind">{{ t.categories[event.category] }}</span>
          <span v-if="event.notes" class="le-notes">{{ event.notes }}</span>
        </button>
      </li>
    </ol>
    <div v-if="filtered.length > STEP" class="le-more">
      <button v-if="visible < filtered.length" type="button" class="pill-button" @click="visible += STEP">
        <Icon name="chevron-down" :size="14" />{{ t.showMore(Math.min(STEP, filtered.length - visible)) }}
      </button>
      <button v-if="visible > STEP" type="button" class="pill-button quiet" @click="visible = STEP">{{ t.showLess }}</button>
    </div>
  </section>
</template>

<style scoped>
.life-events { padding: 22px 24px; border-radius: var(--radius-lg); background: var(--mat-card); scroll-margin-top: 24px; box-shadow: var(--mat-rim), var(--mat-shadow); }
.le-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
.life-events.is-empty { padding: 14px 18px; }
.life-events.is-empty .le-head { flex-wrap: nowrap; align-items: center; gap: 14px; }
.life-events.is-empty .le-head > div { flex: 1 1 auto; min-width: 0; }
.life-events.is-empty .le-head h2 { font-size: var(--fs-md); }
.life-events.is-empty .le-head p { margin-top: 2px; font-size: var(--fs-xs); line-height: 1.5; }
.le-empty-mark { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.le-head h2 { margin: 0; color: var(--ink); font-size: var(--fs-lg); }
.le-head p { margin: 4px 0 0; color: var(--subtle); font-size: var(--fs-sm); line-height: 1.6; }
.le-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 18px; }
.le-search { display: flex; flex: 1 1 220px; min-height: 36px; align-items: center; gap: 8px; padding: 0 14px; border-radius: 999px;
  background: var(--cap-track); box-shadow: var(--cap-track-shadow); color: var(--subtle); }
.le-search:focus-within { box-shadow: var(--cap-track-shadow), 0 0 0 2px var(--focus); }
.le-search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink); font-size: var(--fs-sm); outline: none; }
.le-note { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; color: var(--subtle); line-height: 1.6; }

/* 竖着的时间线：节点串在一条渐隐的细线上，每件事一枚胶囊。 */
.le-timeline { position: relative; display: grid; gap: 10px; margin: 18px 0 0; padding: 0 0 0 8px; list-style: none; }
.le-timeline::before { content: ''; position: absolute; top: 14px; bottom: 14px; left: 22px; width: 2px; border-radius: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 18%, transparent), transparent); }
.le-timeline li { position: relative; display: flex; align-items: flex-start; gap: 14px; }
.le-node { position: relative; z-index: 1; display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; margin-top: 8px; border-radius: 50%;
  background: color-mix(in srgb, var(--event-tone) 22%, var(--mat-card-solid)); box-shadow: 0 0 0 4px var(--mat-card-solid); color: var(--event-tone); }
.le-node.ongoing::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; box-shadow: 0 0 0 2px var(--event-tone); animation: le-breathe 2.4s ease-in-out 3; }
@keyframes le-breathe { 50% { opacity: .2; scale: 1.15; } }
.le-card { display: grid; flex: 1; min-width: 0; gap: 4px; padding: 12px 16px; border: 0; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 4%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  color: var(--ink); text-align: left; cursor: pointer; transition: background var(--dur-fast) ease, translate var(--dur-base) var(--ease-out); }
.le-card:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); translate: 2px 0; }
.le-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.le-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 14px; }
.le-top strong { font-size: var(--fs-md); overflow-wrap: anywhere; }
.le-when { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.le-kind { color: var(--event-tone); font-size: var(--fs-2xs); font-weight: 600; }
.le-notes { display: -webkit-box; overflow: hidden; color: var(--subtle); font-size: var(--fs-sm); white-space: pre-wrap; overflow-wrap: anywhere; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.le-more { display: flex; justify-content: center; gap: 8px; margin-top: 14px; }
@media (max-width: 650px) { .life-events { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .le-node.ongoing::after { animation: none; } }
</style>
