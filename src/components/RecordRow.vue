<script setup lang="ts">
import { RouterLink } from 'vue-router';
import CategoryMark from './CategoryMark.vue';
import DesignIcon, { type DesignIconName } from './DesignIcon.vue';
import Icon from './Icon.vue';
import type { HealthCategory } from '../lib/format';

withDefaults(defineProps<{
  to: object | string;
  category: HealthCategory;
  icon: 'heart' | 'moon' | 'steps' | 'run';
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
  compact?: boolean;
  /** 可选：直接指定图标背景色，传入后覆盖 category 默认色 */
  iconBg?: string;
  designIcon?: DesignIconName;
}>(), { compact: false });
</script>

<template>
  <RouterLink :class="['record-row', `tone-${category}`, { compact }]" :to="to">
    <span v-if="compact" class="record-dot" aria-hidden="true"></span>
    <span v-if="!compact && designIcon" :class="['record-art', `tone-${category}`]" aria-hidden="true">
      <DesignIcon :name="designIcon" :size="48" />
    </span>
    <CategoryMark v-else-if="!compact" :category="category" :icon="icon" :size="16" :bg="iconBg" />
    <span class="record-copy">
      <small v-if="!compact">{{ kicker }}</small>
      <strong :class="{ date: compact }">{{ compact ? kicker : title }}</strong>
    </span>
    <span v-if="compact" class="record-mid">{{ title }}</span>
    <span class="record-fact">
      <strong>{{ fact }}</strong>
      <small v-if="!compact && factLabel">{{ factLabel }}</small>
    </span>
    <Icon v-if="!compact" name="arrow-right" :size="15" />
  </RouterLink>
</template>

<style scoped>
.record-row {
  display: grid;
  min-width: 0;
  min-height: 64px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  color: inherit;
  text-decoration: none;
}
.record-row:last-child { border-bottom: 0; }
.record-row:hover { background: var(--surface-raised); }
.record-art {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, currentColor 10%, var(--surface-raised));
}
.record-art .design-icon { transform: scale(1.18); }
.record-art.tone-sleep { color: var(--sleep); }
.record-art.tone-activity { color: var(--activity); }
.record-art.tone-heart { color: var(--heart); }
.record-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.tone-sleep .record-dot { color: var(--sleep); }
.tone-activity .record-dot { color: var(--activity); }
.tone-heart .record-dot { color: var(--heart); }
.record-copy, .record-fact {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.record-copy small, .record-fact small {
  color: var(--muted);
  font-size: 12px;
}
.record-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-mid {
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-fact {
  min-width: 72px;
  align-items: flex-end;
}
.record-fact strong {
  font-family: 'Inter', var(--font-sans);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.record-row > svg { color: var(--subtle); }
.record-row.compact {
  min-height: 44px;
  grid-template-columns: auto minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px 14px;
}
.record-row.compact .record-copy strong {
  font-size: 13px;
  font-weight: 400;
}
.record-row.compact.tone-sleep .record-fact strong {
  min-width: 36px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--sleep);
  font-size: 12px;
  text-align: center;
}
.record-row.compact.tone-activity .record-fact strong {
  color: var(--activity);
  font-size: 13px;
}
@media (max-width: 520px) {
  .record-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .record-row:not(.compact) .record-fact { display: none; }
  .record-row.compact {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .record-row.compact .record-mid { display: none; }
}
</style>
