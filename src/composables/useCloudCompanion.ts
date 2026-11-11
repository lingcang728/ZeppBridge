/**
 * 云端组件配套（2026-11-11）的全局状态：设置里的区块、卡叠总览的小标、「交给 AI」页的胶囊读同一份。
 *
 * 只有在 Beta 实验室里打开了「推给云端」才会去问后端——关着的人，这里什么都不读、界面上什么都没有。
 * 上传是组件（ZeppBridge-Cloud）自己做的，这里只读它的状态、改它的配置、叫它跑自己的脚本。
 */
import { computed, ref, watch } from 'vue';
import { tauriApi, toUserMessage } from './useTauriApi';
import { messagesOf, useMessages } from '../i18n';
import { labFlag } from '../lib/labs';
import { cloudStatus } from '../lib/cloudCompanionText';
import { formatWhen } from '../lib/format';
import type { CloudCompanionState, CloudConfigInput, CloudSetupCommand } from '../lib/bridge/types';
import { cloudMessages } from '../views/settings/sections/cloud.i18n';

/** 结果提示归哪一块显示：状态与动作、配置表单、只读密钥。 */
export type CloudArea = 'status' | 'config' | 'readers';

const enabled = labFlag('cloud');
const state = ref<CloudCompanionState | null>(null);
/** 正在做的那件事：'upload' / 'save' / 'init' / 'tasks' / 'add' / `copy:<名字>` / `revoke:<名字>`。 */
const busy = ref<string | null>(null);
/** 最近一件事的结果（成功提示或错误），以及它属于哪一块。 */
const outcome = ref<{ area: CloudArea; ok: boolean; text: string } | null>(null);

let inflight: Promise<void> | null = null;
const refresh = (): Promise<void> => {
  if (!enabled.value) return Promise.resolve();
  inflight ??= tauriApi.cloudCompanionState()
    .then((next) => { state.value = next; })
    .catch(() => { /* 浏览器预览、后端还没起来：保持「正在看」，不报错。 */ })
    .finally(() => { inflight = null; });
  return inflight;
};

watch(enabled, (on) => {
  if (on) void refresh();
  else { state.value = null; outcome.value = null; }
}, { immediate: true });

const failed = (area: CloudArea, cause: unknown) => {
  outcome.value = { area, ok: false, text: toUserMessage(cause, messagesOf(cloudMessages).failed) };
};

/** 跑一件会改状态的事：同一时间只跑一件，结果要么是一句成功提示，要么是一句错误。 */
const act = async (area: CloudArea, name: string, run: () => Promise<CloudCompanionState>, done?: string): Promise<boolean> => {
  if (busy.value) return false;
  busy.value = name; outcome.value = null;
  try {
    state.value = await run();
    if (done) outcome.value = { area, ok: true, text: done };
    return true;
  } catch (cause) {
    failed(area, cause);
    void refresh();
    return false;
  } finally {
    busy.value = null;
  }
};

const upload = () => act('status', 'upload', () => tauriApi.cloudCompanionUpload());
const saveConfig = (input: CloudConfigInput, done: string) =>
  act('config', 'save', () => tauriApi.cloudCompanionSaveConfig(input), done);
const setup = (name: string, command: CloudSetupCommand, label: string | undefined, done: string) =>
  act('readers', name, async () => (await tauriApi.cloudCompanionSetup(command, label)).state, done);
/** 登记计划任务的两条命令：拿回来放进剪贴板，由用户自己看过再执行。 */
const copyTaskCommands = (done: string, copyFailed: string) => act('status', 'tasks', async () => {
  const result = await tauriApi.cloudCompanionSetup('task-commands');
  try { await navigator.clipboard.writeText(result.output ?? ''); } catch { throw new Error(copyFailed); }
  return result.state;
}, done);
const open = (target: 'site' | 'logs' | 'folder') => {
  outcome.value = null;
  return tauriApi.cloudCompanionOpen(target).catch((cause) => failed('status', cause));
};

export const useCloudCompanion = () => {
  const t = useMessages(cloudMessages);
  const status = computed(() => cloudStatus(state.value, t.value, (at) => formatWhen(at)));
  return { enabled, state, busy, outcome, status, refresh, upload, saveConfig, setup, copyTaskCommands, open };
};
