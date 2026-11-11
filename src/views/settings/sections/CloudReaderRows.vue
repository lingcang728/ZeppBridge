<script setup lang="ts">
/* 「推给云端」的只读密钥：每个云端 AI 一把（发 / 复制 / 作废），互不影响。
 * 密钥由云端组件自己放进剪贴板、存在凭据管理器里——ZeppBridge 只知道名字和发的日期，读不到密钥本身。
 * 作废不能撤销，所以要点两下：第一下把按钮换成「确认作废」。 */
import { computed, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useCloudCompanion } from '../../../composables/useCloudCompanion';
import { useMessages } from '../../../i18n';
import { formatDate } from '../../../lib/format';
import { cloudMessages } from './cloud.i18n';

const t = useMessages(cloudMessages);
const { state, busy, outcome, setup } = useCloudCompanion();

const readers = computed(() => state.value?.readers ?? []);
const feedback = computed(() => (outcome.value?.area === 'readers' ? outcome.value : null));

const fresh = ref('');
/* 和后端同一条规则：字母或数字开头，只含字母、数字、-、_，最多 32 个。 */
const freshValid = computed(() => /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(fresh.value.trim()));
const add = async () => {
  const label = fresh.value.trim();
  if (!freshValid.value) return;
  if (await setup('add', 'add-reader', label, t.value.copied(label))) fresh.value = '';
};
const copy = (label: string) => setup(`copy:${label}`, 'copy-reader', label, t.value.copied(label));

const confirming = ref<string | null>(null);
let confirmTimer = 0;
const revoke = async (label: string) => {
  window.clearTimeout(confirmTimer);
  if (confirming.value !== label) {
    confirming.value = label;
    // 没点第二下就自己退回去：别让一枚「确认作废」一直挂在那里等着被误点。
    confirmTimer = window.setTimeout(() => { confirming.value = null; }, 4000);
    return;
  }
  confirming.value = null;
  await setup(`revoke:${label}`, 'revoke-reader', label, t.value.revoked(label));
};
const init = () => setup('init', 'init', undefined, t.value.initDone);
</script>

<template>
  <div class="s-row is-block">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.readers }}</span>
      <span class="s-row-sub">{{ t.readersLead }}</span>
    </div>
    <ul v-if="readers.length" class="reader-list">
      <li v-for="reader in readers" :key="reader.label">
        <code class="reader-name">{{ reader.label }}</code>
        <span v-if="reader.created_at" class="reader-date">{{ t.createdAt(formatDate(reader.created_at)) }}</span>
        <span class="reader-actions">
          <button class="button secondary" type="button" :disabled="!!busy" @click="copy(reader.label)">
            <Icon name="copy" :size="13" />{{ t.copy }}
          </button>
          <button :class="['button secondary', { 'danger-button': confirming === reader.label }]" type="button" :disabled="!!busy"
            @click="revoke(reader.label)" @blur="confirming === reader.label && (confirming = null)">
            {{ confirming === reader.label ? t.revokeConfirm : t.revoke }}
          </button>
        </span>
      </li>
    </ul>
    <template v-else>
      <p class="s-row-sub">{{ t.readersNone }}</p>
      <div class="reader-init">
        <button class="button secondary" type="button" data-setting="cloud-init" :disabled="!!busy" @click="init">{{ busy === 'init' ? t.working : t.init }}</button>
        <span class="s-row-sub">{{ t.initSub }}</span>
      </div>
    </template>
    <form class="reader-add" @submit.prevent="add">
      <input v-model="fresh" class="mat-field reader-input" type="text" spellcheck="false" autocomplete="off" maxlength="32" data-setting="cloud-reader-name"
        :placeholder="t.addLabel" :aria-label="t.addLabel" :disabled="!!busy" />
      <button class="button secondary" type="submit" :disabled="!!busy || !freshValid">{{ busy === 'add' ? t.working : t.add }}</button>
      <span v-if="feedback" :class="feedback.ok ? 'hint-line ok' : 'api-error'" :role="feedback.ok ? 'status' : 'alert'">{{ feedback.text }}</span>
    </form>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.reader-list { display: grid; margin: 10px 0 0; padding: 0; list-style: none; }
.reader-list > li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 8px 0; }
.reader-list > li + li { border-top: 1px solid var(--mat-line); }
.reader-name { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); }
.reader-date { color: var(--subtle); font-size: var(--fs-xs); }
.reader-actions { display: flex; gap: 8px; margin-left: auto; }
.reader-actions .button { min-height: 30px; padding: 4px 10px; font-size: var(--fs-xs); }
.reader-init { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 8px; }
.reader-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.reader-input { flex: 0 1 14em; width: auto; font-family: var(--font-mono); }
</style>
