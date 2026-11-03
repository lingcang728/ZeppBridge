<script setup lang="ts">
/* 官方授权和高级数据「不是同一个账号」时，两边各是哪个账号并排列出来，再给一条只用高级数据的路。
 *
 * 光说「不是同一个账号」用户看不出错在哪边：官方授权那一步直接用浏览器里已经登录的 Zepp 账号，
 * 授权页上也不写是谁（tupac7，2026-10-26）。编号只露后四位；昵称只有官方那边有。 */
import type { AccountPair } from '../../types';
import { useAccountConflictText } from './accountConflict.i18n';

const props = defineProps<{
  pair: AccountPair;
  /** 被拒的是哪一边：官方授权被拒时高级数据还连着；高级数据被拒时官方授权还连着。 */
  rejected: 'official' | 'advanced';
  busy?: boolean;
}>();
defineEmits<{ disconnectOfficial: [] }>();
const t = useAccountConflictText();
</script>

<template>
  <div class="conflict">
    <dl class="pair">
      <div class="side">
        <dt>{{ t.official }}</dt>
        <dd><span class="name">{{ props.pair.official.nickname?.trim() || t.noNickname }}</span><span class="id">{{ props.pair.official.user_id_masked }}</span></dd>
      </div>
      <div class="side">
        <dt>{{ t.advanced }}</dt>
        <dd><span class="id">{{ props.pair.advanced.user_id_masked }}</span></dd>
      </div>
    </dl>
    <p class="path">
      <strong>{{ t.advancedOnlyTitle }}</strong>
      {{ props.rejected === 'official' ? t.advancedKept : t.advancedAfterDisconnect }}
    </p>
    <button v-if="props.rejected === 'advanced'" type="button" class="disconnect" :disabled="props.busy" @click="$emit('disconnectOfficial')">{{ t.disconnectOfficial }}</button>
  </div>
</template>

<style scoped>
.conflict { display: grid; gap: 8px; margin-top: 4px; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 0; }
.side {
  display: grid; gap: 2px; padding: 8px 10px; border-radius: 10px;
  background: var(--mat-inset); border: 1px solid var(--mat-line);
}
.side dt { font-size: var(--fs-xs); color: var(--muted); }
.side dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 0; color: var(--ink); }
.name { font-weight: 600; overflow-wrap: anywhere; }
.id { font-variant-numeric: tabular-nums; letter-spacing: -0.04em; color: var(--muted); }
.path { margin: 0; color: var(--muted); }
.path strong { color: var(--ink); font-weight: 600; margin-right: 4px; }
.disconnect {
  justify-self: start; padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 600;
  text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
}
.disconnect:disabled { opacity: 0.5; cursor: default; }
</style>
