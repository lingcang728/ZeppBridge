/**
 * 云端组件状态的那一句话（2026-11-11）：设置里的「推给云端」区块、卡叠总览上的小标、「交给 AI」页的胶囊
 * 用的是同一份实现——同一句话只许有一份渲染。按组件给的结果码说话，不拿它日志里的原文当正文。
 */
import type { CloudCompanionState } from './bridge/types';

/** ok = 最近一次传上去了或没什么可传；warn = 要人看一眼；idle = 还没装 / 没配 / 没跑过。 */
export type CloudTone = 'ok' | 'warn' | 'idle';

export interface CloudStatusText {
  checking: string;
  unsupported: string;
  notInstalled: string;
  configBroken: string;
  notConfigured: string;
  running: string;
  neverRan: string;
  result: Record<string, string>;
  resultUnknown: string;
  statusAt: (text: string, when: string) => string;
}

export interface CloudStatus {
  tone: CloudTone;
  /** 不带时间的那半句。 */
  text: string;
  /** 带上「什么时候」的整句；没有时间就和 text 一样。 */
  line: string;
}

const QUIET_RESULTS = new Set(['ok', 'skipped_unchanged', 'skipped_busy', 'skipped_locked']);

export const cloudStatus = (
  state: CloudCompanionState | null,
  t: CloudStatusText,
  formatWhen: (at: string) => string | null,
): CloudStatus => {
  const plain = (tone: CloudTone, text: string): CloudStatus => ({ tone, text, line: text });
  if (!state) return plain('idle', t.checking);
  if (!state.supported) return plain('idle', t.unsupported);
  if (state.config_unreadable) return plain('warn', t.configBroken);
  if (!state.configured) return plain(state.uploader_dir ? 'warn' : 'idle', state.uploader_dir ? t.notConfigured : t.notInstalled);
  if (state.running) return plain('ok', t.running);
  const run = state.last_run;
  if (!run) return plain('idle', t.neverRan);
  const text = Object.prototype.hasOwnProperty.call(t.result, run.result) ? t.result[run.result] : t.resultUnknown;
  const when = formatWhen(run.at);
  return {
    tone: QUIET_RESULTS.has(run.result) ? 'ok' : 'warn',
    text,
    line: when ? t.statusAt(text, when) : text,
  };
};
