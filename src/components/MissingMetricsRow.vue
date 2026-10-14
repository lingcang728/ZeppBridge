<script setup lang="ts">
/* 近 6 个月一条读数都没有的指标，收成一行（U09）。
 *
 * 以前每项缺失都占一整张和有数据的卡一样大的空卡，把真正有内容的图推出首屏。缺失仍然
 * 要明确、可追溯：这一行点开能看到每项为什么没有，不补 0、不画空轴。 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { defineMessages, useMessages } from '../i18n';

export interface MissingMetric {
  /** 指标名：从概览点进来要定位到这一项时，按它找到这一行（lib/motion/focusTarget.ts）。 */
  key: string;
  label: string;
  /** 为什么没有（页面给的专门说明，没有就用这项的一句话简介）。 */
  detail?: string;
}

const props = defineProps<{ items: MissingMetric[] }>();

const messages = defineMessages(
  {
    summary: (list: string) => `近 6 个月没有读数：${list}`,
    separator: '、',
  },
  {
    summary: (list: string) => `No readings in the last 6 months: ${list}`,
    separator: ', ',
  },
  {
    summary: (list: string) => `Sin lecturas en los últimos 6 meses: ${list}`,
    separator: ', ',
  },
  'components/MissingMetricsRow',
);
const t = useMessages(messages);

const focusKeys = computed(() => props.items.map((item) => item.key).join(' '));
const summary = computed(() => t.value.summary(props.items.map((item) => item.label).join(t.value.separator)));
</script>

<template>
  <details v-if="items.length" class="missing-row" :data-focus-keys="focusKeys">
    <summary>
      <Icon name="info" :size="14" />
      <span>{{ summary }}</span>
      <Icon class="missing-chevron" name="chevron-down" :size="14" />
    </summary>
    <dl>
      <div v-for="item in items" :key="item.key">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.detail }}</dd>
      </div>
    </dl>
  </details>
</template>

<style scoped>
.missing-row {
  border-radius: var(--radius-lg);
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
  color: var(--muted);
  font-size: var(--fs-sm);
}
.missing-row summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 40px;
  padding: 9px 13px;
  cursor: pointer;
  list-style: none;
}
.missing-row summary::-webkit-details-marker { display: none; }
.missing-row summary span { flex: 1; min-width: 0; }
.missing-row summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-lg); }
.missing-chevron { flex: none; transition: transform var(--dur-fast) ease; }
.missing-row[open] .missing-chevron { transform: rotate(180deg); }
.missing-row dl { display: grid; gap: 8px; margin: 0; padding: 0 13px 12px 35px; }
.missing-row dl div { display: grid; gap: 1px; }
.missing-row dt { color: var(--ink); font-weight: 600; }
.missing-row dd { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
</style>
