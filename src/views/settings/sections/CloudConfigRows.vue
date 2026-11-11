<script setup lang="ts">
/* 「推给云端」的配置表单：改的是云端组件自己的 config.json（里面没有密钥）。
 * 组件认的每一项都放出来——站点、用哪份 ZeppBridge、数据在哪、传之前要不要先同步、云端留多少天、
 * 摘要多少天、运动曲线留不留逐秒版——校验在后端做，不过就不写文件。还没配置过的人这一块默认展开。 */
import { computed, ref, watch } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { useCloudCompanion } from '../../../composables/useCloudCompanion';
import { useMessages } from '../../../i18n';
import type { CloudCompanionState, CloudConfigInput } from '../../../lib/bridge/types';
import { cloudMessages } from './cloud.i18n';

const t = useMessages(cloudMessages);
const { state, busy, outcome, saveConfig } = useCloudCompanion();

const fromState = (now: CloudCompanionState | null): CloudConfigInput => ({
  site: now?.config?.site ?? '',
  bin_dir: now?.config?.bin_dir ?? now?.default_bin_dir ?? '',
  data_dir: now?.config?.data_dir ?? '',
  sync: now?.config?.sync ?? false,
  retention_days: now?.config?.retention_days ?? 90,
  summary_days: now?.config?.summary_days ?? 30,
  full_resolution_workouts: now?.config?.full_resolution_workouts ?? false,
  uploader_dir: now?.uploader_dir ?? '',
});
const same = (a: CloudConfigInput, b: CloudConfigInput) => JSON.stringify(a) === JSON.stringify(b);

const baseline = computed(() => fromState(state.value));
const form = ref<CloudConfigInput>({ ...baseline.value });
/* 状态刷新时，没动过的表单跟着换；正改到一半的不打断。 */
watch(baseline, (next, previous) => { if (same(form.value, previous)) form.value = { ...next }; });
const dirty = computed(() => !same(form.value, baseline.value));
const saving = computed(() => busy.value === 'save');
const feedback = computed(() => (outcome.value?.area === 'config' ? outcome.value : null));
const offerOwnCopy = computed(() => !!state.value?.default_bin_dir && form.value.bin_dir !== state.value.default_bin_dir);

const pick = async (field: 'bin_dir' | 'data_dir' | 'uploader_dir') => {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const chosen = await open({ directory: true, multiple: false }).catch(() => null);
  if (typeof chosen === 'string' && chosen) form.value[field] = chosen;
};
const blank = (value: string | null) => (value && value.trim() ? value.trim() : null);
const save = () => saveConfig({
  ...form.value,
  site: form.value.site.trim(),
  bin_dir: blank(form.value.bin_dir),
  data_dir: blank(form.value.data_dir),
  // 自己从计划任务里认出来的位置不用再写进配置：只有用户改过才传。
  uploader_dir: form.value.uploader_dir === baseline.value.uploader_dir ? null : blank(form.value.uploader_dir),
  retention_days: Math.round(Number(form.value.retention_days) || 0),
  summary_days: Math.round(Number(form.value.summary_days) || 0),
}, t.value.saved);
</script>

<template>
  <details class="s-row is-block cloud-config" :open="!state?.configured">
    <summary>{{ t.config }}</summary>
    <form class="cloud-form" @submit.prevent="save">
      <label class="cloud-field">
        <span>{{ t.siteLabel }}</span>
        <input v-model="form.site" class="mat-field mono" type="text" spellcheck="false" autocomplete="off" data-setting="cloud-site" :placeholder="t.sitePlaceholder" :disabled="saving" />
        <small>{{ t.siteHint }}</small>
      </label>
      <div class="cloud-field">
        <label for="cloud-bin-dir">{{ t.binDir }}</label>
        <div class="cloud-path">
          <input id="cloud-bin-dir" v-model="form.bin_dir" class="mat-field mono" type="text" spellcheck="false" :disabled="saving" />
          <button v-if="offerOwnCopy" class="button secondary" type="button" :disabled="saving" @click="form.bin_dir = state?.default_bin_dir ?? ''">{{ t.useThis }}</button>
          <button class="button secondary" type="button" :disabled="saving" @click="pick('bin_dir')">{{ t.choose }}</button>
        </div>
        <small>{{ t.binDirHint }}</small>
      </div>
      <div class="cloud-field">
        <label for="cloud-data-dir">{{ t.dataDir }}</label>
        <div class="cloud-path">
          <input id="cloud-data-dir" v-model="form.data_dir" class="mat-field mono" type="text" spellcheck="false" :disabled="saving" />
          <button class="button secondary" type="button" :disabled="saving" @click="pick('data_dir')">{{ t.choose }}</button>
        </div>
        <small>{{ t.dataDirHint }}</small>
      </div>
      <div class="cloud-field">
        <label for="cloud-uploader-dir">{{ t.uploaderDir }}</label>
        <div class="cloud-path">
          <input id="cloud-uploader-dir" v-model="form.uploader_dir" class="mat-field mono" type="text" spellcheck="false" :disabled="saving" />
          <button class="button secondary" type="button" :disabled="saving" @click="pick('uploader_dir')">{{ t.choose }}</button>
        </div>
      </div>
      <div class="cloud-days">
        <label class="cloud-field">
          <span>{{ t.retentionDays }}</span>
          <input v-model.number="form.retention_days" class="mat-field" type="number" min="1" max="365" step="1" :disabled="saving" />
        </label>
        <label class="cloud-field">
          <span>{{ t.summaryDays }}</span>
          <input v-model.number="form.summary_days" class="mat-field" type="number" min="1" max="365" step="1" :disabled="saving" />
          <small>{{ t.summaryHint }}</small>
        </label>
      </div>
      <div class="cloud-toggle">
        <div><span>{{ t.sync }}</span><small>{{ t.syncSub }}</small></div>
        <GlassSwitch v-model="form.sync" :aria-label="t.sync" :disabled="saving" />
      </div>
      <div class="cloud-toggle">
        <div><span>{{ t.fullRes }}</span><small>{{ t.fullResSub }}</small></div>
        <GlassSwitch v-model="form.full_resolution_workouts" :aria-label="t.fullRes" :disabled="saving" />
      </div>
      <div class="s-actions">
        <button class="button primary" type="submit" data-setting="cloud-save" :disabled="saving || !!busy || !dirty">{{ saving ? t.saving : t.save }}</button>
        <span v-if="feedback" :class="feedback.ok ? 'hint-line ok' : 'api-error'" :role="feedback.ok ? 'status' : 'alert'">{{ feedback.text }}</span>
      </div>
    </form>
  </details>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.cloud-config > summary { color: var(--ink); font-size: var(--fs-md); font-weight: 500; cursor: pointer; }
.cloud-form { display: grid; gap: 14px; margin-top: 12px; }
.cloud-field { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 4px; }
.cloud-field > span, .cloud-field > label, .cloud-toggle span { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.cloud-field small, .cloud-toggle small { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.cloud-path { display: flex; flex-wrap: wrap; gap: 8px; }
.cloud-path > .mat-field { flex: 1 1 16em; min-width: 0; }
.cloud-days { display: grid; grid-template-columns: repeat(2, minmax(0, 12em)); gap: 14px; align-items: start; }
.cloud-toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.cloud-toggle > div { display: grid; min-width: 0; gap: 2px; }
.mono { font-family: var(--font-mono); }
</style>
