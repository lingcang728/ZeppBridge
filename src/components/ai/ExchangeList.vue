<script setup lang="ts">
/**
 * 往返记录的列表。每一条往返点开是它自己的二级页（/ai/exchanges/:id，从这一行长出来）。
 *
 * 10-13 重做（用户：「太乱了，要能自定义、能删」）：
 * - 按天分组（今天 / 昨天 / 几月几日），一条一张圆角小卡，不再是一张贴满整宽、日期 / AI / 问题 / 状态挤成一排的表；
 * - 卡上两行：大字是名字（自己起的名字，没起就是当时的问题），小字是时间 · 交给谁 · 现在到哪一步；
 * - 悬停出现「改名」「删除」：改名就地改（回车存、Esc 放弃、清空 = 回到当时的问题），删除要再点一次确认。
 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import type { AiExchange } from '../../types/timeBridge';
import { useBridgeText } from './bridge/bridge.i18n';
import { AI_PROVIDERS } from '../../lib/aiProviders';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { addDays } from '../../lib/aiTask/bridgeScale';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ items: AiExchange[] }>();
const emit = defineEmits<{ rename: [id: string, title: string]; remove: [id: string] }>();
const t = useBridgeText();
const m = useMessages(defineMessages(
  {
    today: '今天', yesterday: '昨天', rename: '改名', remove: '删除', confirmRemove: '确定删除', cancel: '取消',
    renameHint: '回车保存，清空就用当时的问题', planDays: (n: number) => `计划 ${n} 天`,
  },
  {
    today: 'Today', yesterday: 'Yesterday', rename: 'Rename', remove: 'Delete', confirmRemove: 'Delete it', cancel: 'Cancel',
    renameHint: 'Enter to save; leave empty to use the original question', planDays: (n: number) => `${n}-day plan`,
  },
  {
    today: 'Hoy', yesterday: 'Ayer', rename: 'Renombrar', remove: 'Eliminar', confirmRemove: 'Sí, eliminar', cancel: 'Cancelar',
    renameHint: 'Intro para guardar; vacío para usar la pregunta original', planDays: (n: number) => `Plan de ${n} días`,
  },
  'components/ai/ExchangeList',
));

/* 右边那一小条：接回来的计划头 7 天，有训练的一格实心、休息的一格空心。 */
const weekOf = (item: AiExchange) => {
  const plan = item.plan;
  if (!plan?.workouts.length) return [];
  const start = plan.from ?? plan.workouts.map((w) => w.date).sort()[0]!;
  const days = new Set(plan.workouts.map((w) => w.date));
  return Array.from({ length: 7 }, (_, i) => days.has(addDays(start, i)));
};
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const stateOf = (item: AiExchange): { text: string; tone: 'good' | 'warn' | 'muted' | 'accent' } => {
  if (item.undone) return { text: t.value.undone, tone: 'muted' };
  if (item.publish_state === 'sent') return { text: t.value.delivered, tone: 'good' };
  if (item.publish_state === 'rejected') return { text: t.value.rejected, tone: 'warn' };
  if (item.publish_state) return { text: t.value.unknown, tone: 'warn' };
  if (item.document) return { text: t.value.planBack, tone: 'accent' };
  return { text: t.value.noPlan, tone: 'muted' };
};

const groups = computed(() => {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const out: Array<{ key: string; label: string; rows: Array<{ item: AiExchange; name: string; renamed: boolean; time: string; provider: string; icon?: string; state: ReturnType<typeof stateOf>; week: boolean[] }> }> = [];
  for (const item of props.items) {
    const at = new Date(item.sent_at);
    const key = dayKey(at);
    let group = out[out.length - 1];
    if (!group || group.key !== key) {
      const label = key === today ? m.value.today : key === yesterday ? m.value.yesterday
        : displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'short' }).format(at);
      group = { key, label, rows: [] };
      out.push(group);
    }
    const provider = AI_PROVIDERS.find((p) => p.id === item.provider);
    const fallback = item.provider === 'mcp' ? t.value.mcp : t.value.exported;
    group.rows.push({
      item,
      name: item.title || item.question || fallback,
      renamed: !!item.title,
      time: displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit' }).format(at),
      provider: item.provider === 'mcp' ? 'MCP' : provider?.label ?? item.provider,
      icon: provider?.localIcon,
      state: stateOf(item),
      week: weekOf(item),
    });
  }
  return out;
});

/* ---------- 改名 ---------- */
const editing = ref<string | null>(null);
const input = ref<HTMLInputElement[] | null>(null);
const startRename = async (id: string) => {
  confirming.value = null;
  editing.value = id;
  await nextTick();
  const el = input.value?.[0];
  el?.focus();
  el?.select();
};
const commit = (item: AiExchange, event: Event) => {
  if (editing.value !== item.id) return;
  const value = (event.target as HTMLInputElement).value.trim();
  editing.value = null;
  if (value === (item.title ?? '') || (!item.title && value === item.question)) return;
  emit('rename', item.id, value === item.question ? '' : value);
};

/* ---------- 删除：先确认 ---------- */
const confirming = ref<string | null>(null);
let confirmTimer = 0;
const askRemove = (id: string) => {
  editing.value = null;
  confirming.value = id;
  window.clearTimeout(confirmTimer);
  confirmTimer = window.setTimeout(() => { if (confirming.value === id) confirming.value = null; }, 4000);
};
const remove = (id: string) => {
  confirming.value = null;
  emit('remove', id);
};
</script>

<template>
  <section class="exchange-list" aria-labelledby="bridge-exchanges-title">
    <header><h2 id="bridge-exchanges-title">{{ t.history }}</h2><p>{{ t.historyHint }}</p></header>
    <div v-if="!groups.length" class="history-empty"><Icon name="arrow-right" :size="14" /><span>{{ t.emptyHistory }}</span></div>
    <TransitionGroup tag="div" name="ex" class="ex-groups">
      <section v-for="group in groups" :key="group.key" class="ex-group">
        <h3 class="ex-day">{{ group.label }}</h3>
        <TransitionGroup tag="ul" name="ex" class="ex-rows">
          <li v-for="row in group.rows" :key="row.item.id" :class="['ex-row', { editing: editing === row.item.id, confirming: confirming === row.item.id }]">
            <span class="ex-icon" aria-hidden="true">
              <img v-if="row.icon" :src="row.icon" alt="" />
              <Icon v-else :name="row.item.provider === 'mcp' ? 'terminal' : 'spark'" :size="15" />
            </span>
            <input v-if="editing === row.item.id" ref="input" class="ai-input ex-rename" type="text" maxlength="120" :value="row.item.title || row.item.question"
              :aria-label="m.rename" :title="m.renameHint" @blur="commit(row.item, $event)" @keydown.enter.prevent="commit(row.item, $event)" @keydown.esc.prevent="editing = null" />
            <RouterLink v-else :to="`/ai/exchanges/${encodeURIComponent(row.item.id)}`" class="ex-main">
              <strong :class="{ renamed: row.renamed }">{{ row.name }}</strong>
              <span class="ex-meta">
                <time>{{ row.time }}</time><i aria-hidden="true">·</i><span>{{ row.provider }}</span>
                <span :class="['ex-state', row.state.tone]">{{ row.state.text }}</span>
                <span v-if="row.week.length" class="mini-week" :title="m.planDays(row.week.filter(Boolean).length)" aria-hidden="true"><i v-for="(on, i) in row.week" :key="i" :class="{ on }"></i></span>
              </span>
            </RouterLink>
            <span class="ex-acts">
              <template v-if="confirming === row.item.id">
                <button type="button" class="pill-button quiet" @click="confirming = null">{{ m.cancel }}</button>
                <button type="button" class="pill-button danger" @click="remove(row.item.id)"><Icon name="trash" :size="13" />{{ m.confirmRemove }}</button>
              </template>
              <template v-else-if="editing !== row.item.id">
                <button type="button" class="ex-act" :title="m.rename" :aria-label="m.rename" @click="startRename(row.item.id)"><Icon name="edit" :size="14" /></button>
                <button type="button" class="ex-act danger" :title="m.remove" :aria-label="m.remove" @click="askRemove(row.item.id)"><Icon name="trash" :size="14" /></button>
                <RouterLink :to="`/ai/exchanges/${encodeURIComponent(row.item.id)}`" class="ex-go" tabindex="-1" aria-hidden="true"><Icon name="chevron-right" :size="14" /></RouterLink>
              </template>
            </span>
          </li>
        </TransitionGroup>
      </section>
    </TransitionGroup>
  </section>
</template>

<style scoped src="./ExchangeList.css"></style>
