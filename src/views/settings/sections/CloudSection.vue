<script setup lang="ts">
/* 「推给云端」（2026-11-11）：给读不到本机文件的云端 AI 用的那条路，在「本地 AI」卡的最上面。
 *
 * 只有在 Beta 实验室里自己打开了开关才挂这个组件（CardBody 按 labFlag('cloud') 决定）；
 * 没开的人看不到任何云端的字样，后端也不会被问一次。
 * 上传是单独安装的组件（ZeppBridge-Cloud）做的：这里读它的状态、叫它现在跑一次、改它的配置。
 * 配置表单在 CloudConfigRows，只读密钥在 CloudReaderRows。
 *
 * 2026-11-12（用户：「默认应该处于折叠状态，避免占这么大空间」）：默认只露一行状态和「立即上传」，
 * 说明、站点 / 日志 / 文件夹、计划任务、配置、只读密钥都收在「更多」里。开关仍只在 Beta 实验室。 */
import { computed, onActivated, onMounted, ref } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useHandoffText } from '../../../components/ai/HandoffDock.i18n';
import { useCloudCompanion } from '../../../composables/useCloudCompanion';
import { useMessages } from '../../../i18n';
import { cloudMessages } from './cloud.i18n';
import { labsMessages } from './labs.i18n';
import CloudConfigRows from './CloudConfigRows.vue';
import CloudReaderRows from './CloudReaderRows.vue';

const t = useMessages(cloudMessages);
const labs = useMessages(labsMessages);
/* 「更多」借「交给 AI」浮条里已经译好的那一个词（十三种语言都有），不另起新文案。 */
const handoff = useHandoffText();
const { state, busy, outcome, status, refresh, upload, copyTaskCommands, open } = useCloudCompanion();

/* 组件是别的进程在跑（计划任务）：每次回到这张卡都重读一次。 */
onMounted(() => { void refresh(); });
onActivated(() => { void refresh(); });

const sub = computed(() => {
  const now = state.value;
  if (!now) return '';
  if (now.config_unreadable) return t.value.configBrokenSub;
  if (!now.configured && !now.uploader_dir) return t.value.notInstalledSub;
  return now.site_url ?? '';
});
const canRun = computed(() => !!state.value?.configured && !!state.value.uploader_dir);
const uploading = computed(() => busy.value === 'upload' || !!state.value?.running);
const diagnostic = computed(() => (status.value.tone === 'warn' ? state.value?.last_run?.log_line ?? '' : ''));
const feedback = computed(() => (outcome.value?.area === 'status' ? outcome.value : null));
/** 「更多」展开着没有。每次进卡都是收着的。 */
const expanded = ref(false);
</script>

<template>
  <section id="cloud" class="s-section" aria-labelledby="cloud-title">
    <div class="s-section-head">
      <h3 id="cloud-title">{{ t.secTitle }}</h3>
      <span class="lab-badge">{{ labs.badge }}</span>
    </div>
    <div class="s-list">
      <div class="s-row">
        <div class="s-row-main">
          <span class="s-row-title cloud-status" role="status">
            <span :class="['cloud-dot', status.tone]" aria-hidden="true"></span>{{ status.line }}
          </span>
          <span v-if="sub" :class="['s-row-sub', { 'cloud-url': state?.configured }]">{{ sub }}</span>
          <details v-if="diagnostic" class="cloud-log">
            <summary>{{ t.logLine }}</summary>
            <code>{{ diagnostic }}</code>
          </details>
          <span v-if="feedback" :class="feedback.ok ? 'hint-line ok' : 'api-error'" :role="feedback.ok ? 'status' : 'alert'">{{ feedback.text }}</span>
        </div>
        <div class="s-row-control">
          <button class="button primary" type="button" data-setting="cloud-upload" :disabled="!canRun || !!busy || uploading" @click="upload">
            <Icon name="cloud" :size="14" />{{ uploading ? t.uploading : t.uploadNow }}
          </button>
        </div>
      </div>
      <div class="s-row cloud-more-row">
        <button class="cloud-more" type="button" data-setting="cloud-more" :aria-expanded="expanded" aria-controls="cloud-more-body"
          @click="expanded = !expanded">
          <Icon name="chevron-right" :size="14" :class="['cloud-more-chevron', { open: expanded }]" />{{ handoff.more }}
        </button>
      </div>
    </div>
    <div v-if="expanded" id="cloud-more-body" class="s-list cloud-more-body">
      <p class="s-note cloud-lead">{{ t.lead }}</p>
      <div v-if="state?.supported" class="s-row">
        <div class="s-actions">
          <button class="button secondary" type="button" :disabled="!state.site_url" @click="open('site')">{{ t.openSite }}</button>
          <button class="button secondary" type="button" :disabled="!state.state_dir" @click="open('logs')">{{ t.openLogs }}</button>
          <button class="button secondary" type="button" :disabled="!state.uploader_dir" @click="open('folder')">{{ t.openFolder }}</button>
        </div>
      </div>
      <div v-if="state?.uploader_dir" class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ t.tasks }}</span>
          <span class="s-row-sub task-line">
            <span :class="{ on: state.task_follow }">{{ t.taskFollow }} · {{ state.task_follow ? t.taskOn : t.taskOff }}</span>
            <span :class="{ on: state.task_upload }">{{ t.taskUpload }} · {{ state.task_upload ? t.taskOn : t.taskOff }}</span>
          </span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="!canRun || !!busy" @click="copyTaskCommands(t.taskCopied, t.copyFailed)">
            <Icon name="copy" :size="14" />{{ t.copyTaskCommands }}
          </button>
        </div>
      </div>
      <template v-if="state?.supported">
        <CloudConfigRows />
        <CloudReaderRows v-if="canRun" />
      </template>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped src="./labs.css"></style>
<style scoped>
.cloud-status { display: inline-flex; align-items: center; gap: 8px; }
.cloud-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--subtle); }
.cloud-dot.ok { background: var(--accent); }
.cloud-dot.warn { background: var(--danger); }
.cloud-url { font-family: var(--font-mono); word-break: break-all; }
.cloud-log > summary { color: var(--subtle); font-size: var(--fs-xs); cursor: pointer; }
.cloud-log > code { display: block; margin-top: 4px; color: var(--muted); font-family: var(--font-mono); font-size: var(--fs-xs); line-height: 1.6; word-break: break-all; }
.task-line { display: flex; flex-wrap: wrap; gap: 2px 14px; }
.task-line .on { color: var(--accent); }
.s-section-head .lab-badge { margin-left: 0; }
.cloud-more-row { padding-block: 6px; }
.cloud-more { display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.cloud-more:hover { color: var(--ink); }
.cloud-more:focus-visible { outline: 2px solid var(--focus-ring, var(--accent)); outline-offset: 2px; border-radius: 6px; }
.cloud-more-chevron { transition: rotate var(--dur-std, .2s) ease; }
.cloud-more-chevron.open { rotate: 90deg; }
.cloud-more-body { margin-top: 10px; }
.cloud-lead { margin: 4px 0 6px; }
</style>
