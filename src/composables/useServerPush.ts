/**
 * 「推送到你自己的站点」（Beta 实验室 › Personal Agent 选项，2026-11-18）的状态：实验室卡、卡头小标读写同一份。
 * 推送本身在后端（同步完成后后台推一轮）；这里只看状态、改设置、叫它马上推一次。
 */
import { ref } from 'vue';
import { tauriApi, toUserMessage } from './useTauriApi';
import { messagesOf } from '../i18n';
import type { PushSaveInput, PushState } from '../lib/bridge/types';
import { pushMessages } from '../views/settings/sections/push.i18n';

const state = ref<PushState | null>(null);
/** 正在做的那件事：'save' / 'import' / 'run' / 'toggle' / 'remove'。 */
const busy = ref<string | null>(null);
/** 最近一件事的结果。 */
const outcome = ref<{ ok: boolean; text: string } | null>(null);

let inflight: Promise<void> | null = null;
const refresh = (): Promise<void> => {
  inflight ??= tauriApi.pushState()
    .then((next) => { state.value = next; })
    .catch(() => { /* 浏览器预览、后端还没起来：保持原样。 */ })
    .finally(() => { inflight = null; });
  return inflight;
};

const act = async (name: string, run: () => Promise<PushState>, done?: string): Promise<boolean> => {
  if (busy.value) return false;
  busy.value = name; outcome.value = null;
  try {
    state.value = await run();
    if (done) outcome.value = { ok: true, text: done };
    return true;
  } catch (cause) {
    outcome.value = { ok: false, text: toUserMessage(cause, messagesOf(pushMessages).failed) };
    void refresh();
    return false;
  } finally {
    busy.value = null;
  }
};

/** 推一轮；结果在 state.last 里（失败也是结果，不是错误）。 */
const run = () => act('run', () => tauriApi.pushRun());

/** 存好以后马上推第一轮，让人立刻看到通没通。 */
const save = async (input: PushSaveInput) => {
  const ok = await act('save', () => tauriApi.pushSave(input));
  if (ok && state.value?.enabled) await run();
  return ok;
};
const importCompanion = async () => {
  const ok = await act('import', () => tauriApi.pushImportCompanion());
  if (ok) await run();
  return ok;
};
const setEnabled = (enabled: boolean) => act('toggle', () => tauriApi.pushSetEnabled(enabled));
const remove = (done: string) => act('remove', () => tauriApi.pushRemove(), done);

export const useServerPush = () => ({ state, busy, outcome, refresh, save, importCompanion, setEnabled, run, remove });
