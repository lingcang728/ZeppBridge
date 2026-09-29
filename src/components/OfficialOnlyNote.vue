<script setup lang="ts">
/* 只连了 Zepp 官方授权时，如实说一句哪些指标官方没有（v3-plan 批次 ③ 3e）。两边都连、或者只连旧通道时不出现。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from './Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { useMessages } from '../i18n';
import { officialOnlyNoteMessages as messages } from './OfficialOnlyNote.i18n';

const t = useMessages(messages);
const { appStatus } = useSyncController();
const visible = computed(() => appStatus.value?.data_source === 'official');
</script>

<template>
  <p v-if="visible" class="official-note" role="note">
    <Icon name="info" :size="15" />
    <span>{{ t.text }}</span>
    <RouterLink class="pill-button" to="/settings/account">{{ t.action }}</RouterLink>
  </p>
</template>

<style scoped>
.official-note { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 14px; border-radius: var(--radius-md); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; }
.official-note span { flex: 1; min-width: 0; }
.official-note .pill-button { flex: none; }
</style>
