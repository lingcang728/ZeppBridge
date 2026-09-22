<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLifeEvents } from '../composables/useLifeEvents';
import { lifeEventMessages, overlapsEvent } from '../lib/lifeEvents';
import { localDateString } from '../lib/format';
import { useMessages } from '../i18n';
const props = defineProps<{ start?: string; end?: string; days?: number }>();
const t = useMessages(lifeEventMessages);
const { events, open, reload } = useLifeEvents();
const router = useRouter();
const today = () => localDateString(new Date());
const rangeStart = () => { const date = new Date(); date.setDate(date.getDate() - Math.max(0, (props.days ?? 1) - 1)); return props.start || localDateString(date); };
const related = computed(() => events.value.filter(e => overlapsEvent(e, rangeStart(), props.end || today())));
async function manage() { await router.push('/'); requestAnimationFrame(() => document.getElementById('life-events')?.scrollIntoView({ behavior:'smooth' })); }
onMounted(reload);
</script>
<template>
  <div class="event-shortcut">
    <button type="button" @click="open(undefined, end || today())">+ {{ t.add }}</button>
    <button v-for="event in related.slice(0, 3)" :key="event.id" class="event-chip" :title="event.title" @click="open(event)"><span aria-hidden="true">●</span> {{ event.title }}</button>
    <button v-if="related.length > 3" @click="manage">{{ t.related }} ({{ related.length }})</button>
    <button class="manage" @click="manage">{{ t.manage }}</button>
  </div>
</template>
<style scoped>
.event-shortcut { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:12px; font-size:var(--fs-xs); }.event-shortcut button { background:transparent; border:0; color:var(--muted); font:inherit; padding:4px 0; cursor:pointer; text-align:left; }.event-shortcut button:hover { color:var(--accent); }.event-chip { max-width:180px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.event-chip span { color:var(--accent); }.manage { margin-left:auto; }
</style>
