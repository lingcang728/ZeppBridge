<script setup lang="ts">
/**
 * 页面顶上的一排生活事件胶囊：「+ 添加事件」、这段时间里的事件（带分类色点，点开编辑）、
 * 「管理」跳到概览的生活事件时间线。以前是一行散落的纯文字链接，每张趋势卡里还各有
 * 一份，和页面上的胶囊、玻璃不是一种东西；现在每页只有这一排。
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { eventTone, lifeEventMessages, overlapsEvent } from '../lib/lifeEvents';
import { localDateString } from '../lib/format';
import { useMessages } from '../i18n';

const props = defineProps<{ start?: string; end?: string; days?: number }>();
const t = useMessages(lifeEventMessages);
const { events, open, reload } = useLifeEvents();
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
    <button v-for="event in related.slice(0, 3)" :key="event.id" type="button" class="event-chip" :title="event.title"
      :style="{ '--event-tone': eventTone(event.category) }" @click="open(event)">
      <i aria-hidden="true"></i><span>{{ event.title }}</span>
    </button>
    <button v-if="related.length > 3" type="button" class="pill-button quiet" @click="manage">{{ t.related }} · {{ related.length }}</button>
    <button type="button" class="pill-button quiet manage" @click="manage">{{ t.manage }}<Icon name="chevron-right" :size="14" /></button>
  </div>
</template>

<style scoped>
.event-shortcut { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.event-chip { display: inline-flex; max-width: 220px; min-height: 30px; align-items: center; gap: 7px; padding: 0 12px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--event-tone) 14%, transparent); color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.event-chip i { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--event-tone); }
.event-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-chip:hover { background: color-mix(in srgb, var(--event-tone) 22%, transparent); }
.manage { margin-left: auto; }
</style>
