/**
 * 演示里的「推送到你自己的服务器」（设置 › 数据）：一开始什么都没设；填一个像样的地址和连接码就算设好，
 * 「立即推送」给一轮像真的结果。网址带 `scene=push-companion` 时假装这台电脑装过 ZeppBridge Cloud（验收「一键接过来」用）。
 * 不联网、不存任何东西。
 */
import type { DemoHandler } from './operations';
import type { PushSaveInput, PushState } from '../lib/bridge/types';

const fail = (code: string) => Object.assign(new Error(code), { code });

/** 和后端同一套粗规则：只填域名补成 https://health.<域名>；http、IP、带 ? # @ 都不收。 */
const siteUrl = (input: string): string | null => {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw || /[\s?#@]/.test(raw) || /^http:\/\//i.test(raw)) return null;
  if (/^https:\/\//i.test(raw)) return raw.replace(/\/v1$/, '');
  if (raw.includes('/') || !raw.includes('.') || /^\d+(\.\d+){3}$/.test(raw)) return null;
  return `https://${raw.startsWith('health.') ? raw : `health.${raw}`}`;
};

export const createDemoPush = (): Record<string, DemoHandler> => {
  const companion = typeof window !== 'undefined' && window.__ZB_DEMO__?.scene === 'push-companion';
  let state: PushState = {
    configured: false, enabled: false, site: null, site_url: null, has_secrets: false, credential_store_ok: true,
    last: null, running: false, config_error_code: null,
    companion_site_url: companion ? 'https://health.example.com' : null, companion_tasks: companion,
  };
  const copy = () => structuredClone(state);
  const configure = (site: string, enabled: boolean) => {
    state = { ...state, configured: true, enabled, site, site_url: siteUrl(site), has_secrets: true, companion_site_url: null };
  };
  return {
    push_state: () => copy(),
    push_save: (a) => {
      const input = a.input as PushSaveInput;
      if (!siteUrl(input.site)) throw fail('err.push.site_invalid');
      const code = input.connection_code?.trim() ?? '';
      if (code) {
        if (!/"dk"\s*:/.test(code) || !/"writeKey"\s*:\s*"zbw_/.test(code)) throw fail('err.push.connection_code_invalid');
      } else if (!state.has_secrets) throw fail('err.push.connection_code_invalid');
      configure(input.site, input.enabled);
      return copy();
    },
    push_set_enabled: (a) => {
      if (!state.configured) throw fail('err.push.not_configured');
      state = { ...state, enabled: Boolean(a.enabled) };
      return copy();
    },
    push_import_companion: () => {
      if (!state.companion_site_url) throw fail('err.push.companion_not_found');
      configure(state.companion_site_url, true);
      return copy();
    },
    push_run: () => {
      if (!state.configured) throw fail('err.push.not_configured');
      const first = !state.last;
      state = {
        ...state,
        last: {
          result: first ? 'ok' : 'unchanged', error_code: null, at: new Date().toISOString(),
          stats: first ? { objects: 46, deleted: 0, unchanged: 0, bytes_sent: 612_480 } : { objects: 0, deleted: 0, unchanged: 46, bytes_sent: 0 },
        },
      };
      return copy();
    },
    push_remove: () => {
      state = { ...state, configured: false, enabled: false, site: null, site_url: null, has_secrets: false, last: null };
      return copy();
    },
  };
};
