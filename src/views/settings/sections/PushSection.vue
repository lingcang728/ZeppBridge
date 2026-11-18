<script setup lang="ts">
/* 设置 › 数据 ›「推送到你自己的站点」（2026-11-18）：PA 推送的配置入口，写给第一次接触的人。
 *
 * 没设过：一段小演示（数据怎么走）+ 三条路，按「最省事」排——
 *   1. 这台电脑装过 ZeppBridge Cloud：一键接过来（站点和密钥都从组件那里读，不删组件的东西）；
 *   2. 已经有站点：填地址、贴一行连接码；
 *   3. 还没有站点：复制一段话给本地 AI，让它带着搭，最后交回地址和连接码。
 * 设过了：一行状态（上次推送的结果）+ 开关 + 立即推送；换站点 / 连接码、移除收在下面。
 * 不跳文档、不开浏览器；密钥只写不读，界面只知道「有没有」。 */
import { computed, onActivated, onMounted, ref } from 'vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import Icon from '../../../components/Icon.vue';
import { useServerPush } from '../../../composables/useServerPush';
import { useMessages } from '../../../i18n';
import { errorTextFor } from '../../../i18n/errors';
import { formatWhen } from '../../../lib/format';
import PushFlow from './PushFlow.vue';
import { pushMessages } from './push.i18n';

const t = useMessages(pushMessages);
const { state, busy, outcome, refresh, save, importCompanion, setEnabled, run, remove } = useServerPush();
onMounted(() => { void refresh(); });
onActivated(() => { void refresh(); });

const configured = computed(() => !!state.value?.configured);
/** 表单开着：没设过时点了「我已经有站点」，或设过后点了「换站点或连接码」。 */
const formOpen = ref(false);
const site = ref('');
const code = ref('');
const openForm = () => {
  site.value = state.value?.site ?? '';
  code.value = '';
  formOpen.value = true;
};
const submit = async () => {
  copyNote.value = null;
  const ok = await save({ site: site.value.trim(), connection_code: code.value.trim() || null, enabled: state.value?.configured ? state.value.enabled : true });
  if (ok) { formOpen.value = false; code.value = ''; }
};

const status = computed(() => {
  const now = state.value;
  if (!now) return { tone: 'idle', line: '' };
  if (now.config_error_code) return { tone: 'warn', line: t.value.statusBroken };
  if (!now.has_secrets) return { tone: 'warn', line: t.value.statusNoKey };
  return now.enabled ? { tone: 'ok', line: t.value.statusOn } : { tone: 'idle', line: t.value.statusOff };
});
const lastLine = computed(() => {
  const last = state.value?.last;
  if (!last) return t.value.never;
  const when = formatWhen(last.at) ?? last.at;
  if (last.result === 'ok') return t.value.lastOk(when, last.stats.objects + last.stats.deleted);
  if (last.result === 'unchanged') return t.value.lastUnchanged(when);
  if (last.result === 'skipped_locked') return t.value.lastLocked(when);
  return t.value.lastFailed(when);
});
const lastError = computed(() => {
  const last = state.value?.last;
  return last?.result === 'failed' && last.error_code ? errorTextFor(last.error_code) ?? last.error_code : null;
});
const pushing = computed(() => busy.value === 'run' || !!state.value?.running);

/* 给 AI 的话：按界面语言给，AI 用同一种语言回答。 */
const prompt = computed(() => t.value.aiPrompt(t.value.promptLanguage));
const showPrompt = ref(false);
const copyNote = ref<{ ok: boolean; text: string } | null>(null);
const copy = async (text: string, done: string) => {
  try { await navigator.clipboard.writeText(text); copyNote.value = { ok: true, text: done }; }
  catch { copyNote.value = { ok: false, text: t.value.copyFailed }; showPrompt.value = true; }
};
/** 最近一句提示：操作结果优先，其次是复制结果。表单开着时显示在按钮旁边。 */
const note = computed(() => outcome.value ?? copyNote.value);
const TASKS_COMMAND = "Unregister-ScheduledTask -TaskName 'ZeppBridge Cloud Follow','ZeppBridge Cloud Upload' -Confirm:$false";

const removing = ref(false);
const askRemove = async () => {
  if (!removing.value) { removing.value = true; window.setTimeout(() => { removing.value = false; }, 4000); return; }
  removing.value = false;
  formOpen.value = false;
  await remove(t.value.removed);
};
</script>

<template>
  <section id="push" class="s-section" aria-labelledby="push-title">
    <div class="s-section-head"><h3 id="push-title">{{ t.secTitle }}</h3></div>
    <p class="s-note">{{ t.lead }}</p>
    <PushFlow v-if="!configured" class="push-flow" />

    <div class="s-list">
      <!-- 设过了：状态、开关、立即推送 -->
      <template v-if="configured && state">
        <div class="s-row" data-setting="push-status">
          <div class="s-row-main">
            <span class="s-row-title push-status" role="status"><span :class="['push-dot', status.tone]" aria-hidden="true"></span>{{ status.line }} · {{ lastLine }}</span>
            <span class="s-row-sub push-url">{{ state.site_url ?? state.site }}</span>
            <span v-if="lastError" class="api-error" role="alert">{{ lastError }}</span>
          </div>
          <div class="s-row-control">
            <button class="button primary" type="button" data-setting="push-now" :disabled="!!busy || pushing || !state.has_secrets" @click="run">
              <Icon name="send" :size="14" />{{ pushing ? t.pushing : t.pushNow }}
            </button>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ t.enabled }}</span><span class="s-row-sub">{{ t.enabledSub }}</span></div>
          <div class="s-row-control">
            <GlassSwitch :model-value="state.enabled" :aria-label="t.enabled" :disabled="!!busy" @update:model-value="(on: boolean) => setEnabled(on)" />
          </div>
        </div>
      </template>

      <!-- 没设过：本机的组件能接过来就放最前面 -->
      <div v-if="state?.companion_site_url && !formOpen" class="s-row" data-setting="push-companion">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.companionTitle }}</span>
          <span class="s-row-sub push-url">{{ state.companion_site_url }}</span>
        </div>
        <div class="s-row-control">
          <button class="button primary" type="button" :disabled="!!busy" @click="importCompanion">
            <Icon name="download" :size="14" />{{ busy === 'import' ? t.saving : t.companionGo }}
          </button>
        </div>
      </div>

      <!-- 填站点和连接码 -->
      <form v-if="formOpen" class="s-row is-block push-form" data-setting="push-form" @submit.prevent="submit">
        <label class="push-field">
          <span>{{ t.siteLabel }}</span>
          <input v-model="site" class="mat-field mono" type="text" spellcheck="false" autocomplete="off" :placeholder="t.sitePlaceholder" :disabled="!!busy" />
          <small>{{ t.siteHint }}</small>
        </label>
        <label class="push-field">
          <span>{{ t.codeLabel }}</span>
          <textarea v-model="code" class="mat-field mono" rows="3" spellcheck="false" autocomplete="off" :placeholder="t.codePlaceholder" :disabled="!!busy"></textarea>
          <small>{{ state?.has_secrets ? t.codeKeep : t.codeHint }}</small>
        </label>
        <div class="s-actions">
          <button class="button primary" type="submit" :disabled="!!busy || !site.trim() || (!code.trim() && !state?.has_secrets)">{{ busy === 'save' ? t.saving : t.save }}</button>
          <button class="button secondary" type="button" :disabled="!!busy" @click="formOpen = false">{{ t.cancel }}</button>
          <span v-if="note" :class="note.ok ? 'hint-line ok' : 'api-error'" :role="note.ok ? 'status' : 'alert'">{{ note.text }}</span>
        </div>
      </form>

      <!-- 没设过：两条路 -->
      <template v-if="!configured && !formOpen">
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-title">{{ t.haveSite }}</span><span class="s-row-sub">{{ t.codeHint }}</span></div>
          <div class="s-row-control">
            <button class="button secondary" type="button" data-setting="push-have-site" :disabled="!!busy" @click="openForm">
              <Icon name="key" :size="14" />{{ t.fill }}
            </button>
          </div>
        </div>
        <div class="s-row is-block push-ask" data-setting="push-ask-ai">
          <div class="push-ask-head">
            <div class="s-row-main">
              <span class="s-row-title">{{ t.noSite }} · {{ t.askTitle }}</span>
              <span class="s-row-sub">{{ t.askSub }}</span>
              <span class="s-row-sub">{{ t.askNeeds }}</span>
            </div>
            <div class="s-row-control">
              <button class="button primary" type="button" @click="copy(prompt, t.copied)"><Icon name="copy" :size="14" />{{ t.copyPrompt }}</button>
            </div>
          </div>
          <button class="push-more" type="button" :aria-expanded="showPrompt" @click="showPrompt = !showPrompt">
            <Icon name="chevron-right" :size="14" :class="['push-chevron', { open: showPrompt }]" />{{ t.showPrompt }}
          </button>
          <pre v-if="showPrompt" class="push-prompt" tabindex="0">{{ prompt }}</pre>
        </div>
      </template>

      <!-- 设过了：组件的计划任务还在就提醒删 -->
      <div v-if="configured && state?.companion_tasks" class="s-row">
        <div class="s-row-main"><span class="s-row-title">{{ t.tasksTitle }}</span><span class="s-row-sub">{{ t.tasksSub }}</span></div>
        <div class="s-row-control">
          <button class="button secondary" type="button" @click="copy(TASKS_COMMAND, t.tasksCopied)"><Icon name="copy" :size="14" />{{ t.copyTasks }}</button>
        </div>
      </div>

      <!-- 设过了：换、移除 -->
      <div v-if="configured && !formOpen" class="s-row">
        <div class="s-actions">
          <button class="button secondary" type="button" data-setting="push-change" :disabled="!!busy" @click="openForm">{{ t.change }}</button>
          <button :class="['button', 'secondary', { 'danger-button': removing }]" type="button" data-setting="push-remove" :disabled="!!busy" @click="askRemove">{{ removing ? t.removeConfirm : t.remove }}</button>
        </div>
      </div>
    </div>
    <p v-if="note && !formOpen" :class="note.ok ? 'hint-line ok push-note' : 'api-error push-note'" :role="note.ok ? 'status' : 'alert'">{{ note.text }}</p>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped src="./push.css"></style>
