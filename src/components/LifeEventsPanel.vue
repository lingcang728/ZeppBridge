<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { lifeEventMessages } from '../lib/lifeEvents';
import { useMessages } from '../i18n';
import { displayDateTimeFormatter } from '../lib/dateTime';
const t = useMessages(lifeEventMessages);
const { events, loading, failed, reload, open } = useLifeEvents();
const search = ref('');
const active = ref(false);
const page = ref(0);
const filtered = computed(() => events.value.filter(e => (!active.value || e.endDate === null)
  && `${e.title} ${e.notes}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const rows = computed(() => filtered.value.slice(page.value * 6, (page.value + 1) * 6));
const date = (s: string) => displayDateTimeFormatter({ year:'numeric', month:'short', day:'numeric' }).format(new Date(`${s}T00:00:00`));
watch([search, active, events], () => { page.value = 0; });
onMounted(reload); onActivated(reload);
</script>
<template>
  <section id="life-events" class="life-events" aria-labelledby="life-events-title">
    <header><div><h2 id="life-events-title">{{ t.title }}</h2><p>{{ t.intro }}</p></div><button class="button button-secondary" @click="open()">+ {{ t.add }}</button></header>
    <div v-if="events.length" class="filters"><input v-model="search" type="search" :placeholder="t.search" :aria-label="t.search"><label><input v-model="active" type="checkbox">{{ t.active }}</label></div>
    <p v-if="failed" role="alert">{{ t.failed }} <button class="button button-ghost" @click="reload">{{ t.retry }}</button></p>
    <p v-else-if="loading && !events.length" role="status">{{ t.loading }}</p>
    <p v-else-if="!rows.length" class="empty">{{ events.length ? t.noMatch : t.empty }}</p>
    <ul v-if="rows.length"><li v-for="event in rows" :key="event.id"><button class="event-row" @click="open(event)"><span class="event-category">{{ t.categories[event.category] }}</span><strong>{{ event.title }}</strong><span class="event-date">{{ date(event.startDate) }}<template v-if="event.endDate !== event.startDate"> — {{ event.endDate ? date(event.endDate) : t.active }}</template></span><span v-if="event.notes" class="event-notes">{{ event.notes }}</span></button></li></ul>
    <footer><small>{{ t.local }}</small><div v-if="filtered.length > 6"><button class="button button-ghost" :disabled="page === 0" @click="page--">{{ t.previous }}</button><button class="button button-ghost" :disabled="(page + 1) * 6 >= filtered.length" @click="page++">{{ t.next }}</button></div></footer>
  </section>
</template>
<style scoped>
.life-events { padding:24px; border:1px solid var(--line); border-radius:var(--radius-md); background:var(--surface); scroll-margin-top:24px; }
header { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; }h2 { margin:0; font-size:var(--fs-lg); }p { color:var(--subtle); line-height:1.6; }header p { margin:6px 0 0; }
.filters { display:flex; flex-wrap:wrap; gap:16px; margin-top:20px; align-items:center; }.filters>input { flex:1; min-width:160px; border:1px solid var(--line-control); border-radius:8px; padding:9px 12px; background:var(--surface-raised); color:var(--ink); }.filters label { display:flex; gap:8px; color:var(--muted); font-size:var(--fs-sm); }
ul { list-style:none; padding:0; margin:18px 0; display:grid; gap:8px; }.event-row { display:grid; grid-template-columns:1fr auto; gap:7px 14px; text-align:left; padding:14px; width:100%; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--ink); cursor:pointer; }.event-row:hover { background:var(--surface-hover); border-color:var(--line-control); }.event-category { color:var(--accent); font-size:var(--fs-xs); grid-column:1/-1; }.event-row strong { overflow-wrap:anywhere; }.event-date { color:var(--muted); font-size:var(--fs-xs); }.event-notes { grid-column:1/-1; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--subtle); font-size:var(--fs-sm); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
footer { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }footer small { color:var(--subtle); line-height:1.6; max-width:65ch; }.empty { padding:12px 0; }
@media(max-width:650px) { .life-events { padding:16px; }.event-row { grid-template-columns:1fr; } }
</style>
