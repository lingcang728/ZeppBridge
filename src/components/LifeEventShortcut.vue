<script setup lang="ts">
/**
 * 页面顶上的一排生活事件胶囊：「+ 添加事件」和这段时间里的事件（带分类色点，点开编辑）；
 * 超过三件时多一枚「相关事件 · N」跳到概览的生活事件时间线。以前是一行散落的纯文字
 * 链接，右边还挂着一个「管理生活事件」小标题，每张趋势卡里又各有一份——和页面上的胶囊、
 * 玻璃不是一种东西；现在每页只有这一排。
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { eventSpanLabel, eventTone, lifeEventMessages, overlapsEvent } from '../lib/lifeEvents';
import { localDateString } from '../lib/format';
import { useMessages } from '../i18n';

const props = defineProps<{ start?: string; end?: string; days?: number }>();
const t = useMessages(lifeEventMessages);
const { events, open, reload, chipFocus, chartFocus } = useLifeEvents();
const router = useRouter();
const today = () => localDateString(new Date());
const rangeStart = () => { const date = new Date(); date.setDate(date.getDate() - Math.max(0, (props.days ?? 1) - 1)); return props.start || localDateString(date); };
const related = computed(() => events.value.filter(e => overlapsEvent(e, rangeStart(), props.end || today())));
async function manage() { await router.push('/'); requestAnimationFrame(() => document.getElementById('life-events')?.scrollIntoView({ behavior: 'smooth' })); }
onMounted(reload);
</script>

<template>
  <div class="event-shortcut">
    <button type="button" class="pill-button" @click="open(undefined, end || today())"><Icon name="plus" :size="14" />{{ t.add }}</button>
    <!-- 胶囊带日期（U24），悬停 / 聚焦时图上同一事件的区带加深；悬停图上的区带时这枚胶囊亮起。 -->
    <button v-for="event in related.slice(0, 3)" :key="event.id" type="button" class="event-chip"
      :class="{ 'is-linked': chartFocus === event.id }" :title="event.title"
      :style="{ '--event-tone': eventTone(event.category) }" @click="open(event)"
      @mouseenter="chipFocus = event.id" @mouseleave="chipFocus = null" @focus="chipFocus = event.id" @blur="chipFocus = null">
      <i aria-hidden="true"></i><span>{{ event.title }}</span><small>{{ eventSpanLabel(event) }}</small>
    </button>
    <button v-if="related.length > 3" type="button" class="pill-button quiet" @click="manage">{{ t.related }} · {{ related.length }}</button>
  </div>
</template>

<style scoped>
.event-shortcut { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.event-chip { display: inline-flex; max-width: 280px; min-height: 30px; align-items: center; gap: 7px; padding: 0 12px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--event-tone) 14%, transparent); color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.event-chip i { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--event-tone); }
.event-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-chip small { flex: none; color: var(--muted); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.event-chip:hover, .event-chip.is-linked { background: color-mix(in srgb, var(--event-tone) 26%, transparent); }
</style>
