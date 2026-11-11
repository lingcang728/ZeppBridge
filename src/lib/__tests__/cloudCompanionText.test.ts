import { describe, expect, it } from 'vitest';
import { cloudStatus, type CloudStatusText } from '../cloudCompanionText';
import type { CloudCompanionState } from '../bridge/types';

const t: CloudStatusText = {
  checking: 'checking',
  unsupported: 'unsupported',
  notInstalled: 'not installed',
  configBroken: 'config broken',
  notConfigured: 'not configured',
  running: 'running',
  neverRan: 'never ran',
  result: { ok: 'uploaded', skipped_unchanged: 'unchanged', failed: 'failed' },
  resultUnknown: 'unknown result',
  statusAt: (text, when) => `${text} @ ${when}`,
};

const base: CloudCompanionState = {
  supported: true,
  configured: true,
  config_unreadable: false,
  state_dir: 'C:\\state',
  uploader_dir: 'C:\\uploader',
  config: null,
  site_url: 'https://health.example.com',
  last_run: null,
  readers: [],
  task_follow: false,
  task_upload: false,
  running: false,
  default_bin_dir: null,
};
const run = (result: string, log_line = '') => ({ at: '2026-11-10T23:41:46Z', mode: 'follow', result, exit_code: 0, log_line });
const when = () => 'today 07:41';

describe('cloudStatus', () => {
  it('says what is missing before it says anything about uploads', () => {
    expect(cloudStatus(null, t, when).text).toBe('checking');
    expect(cloudStatus({ ...base, supported: false }, t, when).text).toBe('unsupported');
    expect(cloudStatus({ ...base, config_unreadable: true }, t, when)).toMatchObject({ tone: 'warn', text: 'config broken' });
    expect(cloudStatus({ ...base, configured: false, uploader_dir: null }, t, when)).toMatchObject({ tone: 'idle', text: 'not installed' });
    expect(cloudStatus({ ...base, configured: false }, t, when)).toMatchObject({ tone: 'warn', text: 'not configured' });
    expect(cloudStatus(base, t, when)).toMatchObject({ tone: 'idle', text: 'never ran' });
  });

  it('speaks by result code and never shows the component’s own log line', () => {
    const ok = cloudStatus({ ...base, last_run: run('ok', 'RAW-LOG uploaded 12 files') }, t, when);
    expect(ok).toEqual({ tone: 'ok', text: 'uploaded', line: 'uploaded @ today 07:41' });
    const failed = cloudStatus({ ...base, last_run: run('failed', 'RAW-LOG HTTP 500') }, t, when);
    expect(failed).toMatchObject({ tone: 'warn', text: 'failed' });
    expect(failed.line).not.toContain('RAW-LOG');
  });

  it('does not pass off an unknown code as success, or as a prototype property', () => {
    for (const code of ['brand_new_code', 'toString', 'constructor']) {
      expect(cloudStatus({ ...base, last_run: run(code) }, t, when)).toMatchObject({ tone: 'warn', text: 'unknown result' });
    }
  });

  it('an upload in flight wins over the previous result', () => {
    expect(cloudStatus({ ...base, running: true, last_run: run('failed') }, t, when)).toMatchObject({ tone: 'ok', text: 'running' });
  });
});
