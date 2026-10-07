/**
 * 演示运行时：在页面加载最早期装一层假的 Tauri `__TAURI_INTERNALS__`，让**同一份**应用代码
 * 在浏览器里跑起来，数据全是合成的（见 dataset.ts）。
 *
 * 为什么是这一层、不是另写一个后端：应用里所有「命令」都经 `invoke`，页面不知道也不该知道
 * 自己是否跑在桌面里。在 `invoke` 这一层换掉实现，应用代码一行不分叉——落地页上看到的
 * 就是真应用，不是长得像的仿制品，交互、动效、转场都是本体的。
 *
 * 只有这个文件和它引用的 demo/ 下的模块会被打进演示用的 chunk；普通访问（落地页、桌面应用）
 * 一个字节都不下载。
 *
 * 安全边界：演示里不碰真实文件、不开网站、不写剪贴板；「交给 ChatGPT」只通知外层页面，
 * 由落地页演一遍动画。
 */
import { buildDemoData, sleepStageSlices, metricSeries, type DemoData } from './dataset';
import { demoPrepare, demoPreview, demoTaskList, demoTemplates } from './ai';
import { createDemoPlan } from './plan';
import { demoDayStrip } from './bridge';
import { demoCapabilities, demoDevices, demoLedger, demoLocalApi, demoOverview, demoPrefs, demoStatus, demoWeeklyReport } from './facts';
import { at, dayKey } from './rng';
import { hostPost } from './host';
import { demoText } from './texts';
import { FALLBACK_APP_VERSION } from '../lib/appVersion';
import type { AiTask } from '../lib/bridge/types';
import type { PlanPublishAction } from '../types/trainingPlan';

type Handler = (args: Record<string, unknown>) => unknown;
type Callback = (event: { event: string; id: number; payload: unknown }) => void;

const STREAMS = ['heart_rate', 'daily_summary', 'sleep', 'hrv', 'wellness', 'workouts', 'workout_detail', 'weight'];
const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

export const installDemoRuntime = (now: Date = new Date()): DemoData => {
  const data = buildDemoData(now);
  const plan = createDemoPlan(now);
  const callbacks = new Map<number, Callback>();
  const listeners = new Map<string, number[]>();
  let nextId = 1;
  let status = demoStatus(data);
  let profileNote = '';
  let demoPicks: unknown[] = [];

  const emit = (event: string, payload: unknown) => {
    for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id: 0, payload });
  };

  /* 同步：逐条流走一遍进度，结束时刷新「上次同步」。慢一点，访客才看得清顶栏那枚胶囊在动。 */
  let syncing = false;
  const simulateSync = async () => {
    if (syncing) return { success: true, outcome: 'no_new_data' };
    syncing = true;
    for (let index = 1; index <= STREAMS.length; index += 1) {
      emit('sync://progress', { stream: STREAMS[index - 1], current: index, total: STREAMS.length, message: '', code: 'syncing', completed: false });
      await sleep(260);
    }
    const stamp = new Date().toISOString();
    status = { ...status, last_sync: stamp, last_cloud_sync_at: stamp };
    syncing = false;
    return { success: true, outcome: 'updated', started_at: stamp, finished_at: stamp, last_cloud_sync_at: stamp, total_records: 312, streams: [] };
  };

  const hoursOf = (hours: number) => {
    const from = data.now.getTime() - hours * 3_600_000;
    return data.heart.filter((point) => new Date(point.timestamp).getTime() >= from);
  };
  const page = <T,>(all: T[], args: Record<string, unknown>) => {
    const offset = Number(args.offset ?? 0);
    const limit = Number(args.limit ?? 200);
    return { items: all.slice(offset, offset + limit), total: all.length };
  };

  const handlers: Record<string, Handler> = {
    app_is_ready: () => true,
    'plugin:app|version': () => FALLBACK_APP_VERSION,
    'plugin:event|listen': (args) => {
      const id = Number(args.handler);
      listeners.set(String(args.event), [...(listeners.get(String(args.event)) ?? []), id]);
      return nextId++;
    },
    'plugin:event|unlisten': () => null,
    'plugin:webview|set_webview_zoom': () => null,
    'plugin:opener|open_url': (args) => { hostPost('open-url', { url: String(args.url ?? '') }); return null; },
    'plugin:opener|reveal_item_in_dir': () => null,
    'plugin:drag|start_drag': () => null,
    set_tray_locale: () => null,
    self_update_supported: () => false,

    get_app_status: () => status,
    verify_auth: () => status,
    get_login_status: () => ({ state: 'connected', message: '', page_url: '' }),
    get_official_status: () => ({ state: 'connected', message_code: null, message: null, user_id_masked: '****0000', nickname: demoText().nickname, connected_at: Math.floor(data.now.getTime() / 1000) - 86_400 * 40, authorize_url: null }),
    get_user_prefs: () => ({ ...demoPrefs(), ai_profile_note: profileNote }),
    get_local_api_status: () => demoLocalApi(),
    get_device_profiles: () => demoDevices(data),
    get_capability_overview: () => demoCapabilities(data),
    get_coverage_ledger: () => demoLedger(data),
    get_storage_estimate: () => null,
    get_unknown_workout_codes: () => [],
    get_workout_type_options: () => [],
    list_backups: () => [],
    get_pending_restore: () => null,

    list_life_events: () => [{
      id: 1, title: demoText().lifeEvent, category: 'training', startDate: dayKey(at(data.now, -24)), endDate: null, notes: '', createdAt: '', updatedAt: '',
    }],
    get_health_overview: () => demoOverview(data),
    get_heart_rate_series: (args) => hoursOf(Number(args.hours ?? 24)),
    get_stress_series: (args) => {
      const from = data.now.getTime() - Number(args.hours ?? 24) * 3_600_000;
      return data.stress.filter((point) => new Date(point.timestamp).getTime() >= from);
    },
    get_metric_series: (args) => metricSeries(data, Number(args.days ?? 7), (args.metrics as string[] | null) ?? null),
    get_metric_baselines: () => [],
    get_daily_heart_rate_extremes: () => [],
    get_hourly_steps: () => [],
    get_training_balance: () => [],
    get_recent_sleep: (args) => data.sleeps.slice(0, Number(args.limit ?? 20)),
    get_sleep_page: (args) => page(data.sleeps, args),
    get_sleep_detail: (args) => {
      const found = data.sleeps.find((item) => item.sleep_id === args.sleepId);
      return found ? { ...found, stages: sleepStageSlices(found) } : null;
    },
    get_recent_workouts: (args) => data.workouts.slice(0, Number(args.limit ?? 20)),
    get_workout_page: (args) => page(data.workouts, args),
    get_weekly_report: () => demoWeeklyReport(data),

    start_incremental_sync: () => simulateSync(),
    start_history_sync: () => simulateSync(),

    ai_task_list: () => demoTaskList(data),
    ai_task_day_strip: (args) => demoDayStrip(data,Number(args.daysBefore ?? 14),String(args.end ?? dayKey(data.now))),
    ai_exchange_list: () => [],
    ai_profile_save: (args) => { profileNote = String(args.note ?? ''); return null; },
    training_plan_adherence: () => [],
    training_plan_update_draft: (args) => plan.updateDraft(args.document as import('../types/trainingPlan').PlanDocument),
    'plugin:clipboard-manager|read_text': () => '',
    ai_template_list: () => demoTemplates(),
    ai_task_save: (args) => ({ ...(args.task as AiTask), id: (args.task as AiTask)?.id || 'demo-task-1', updated_at: new Date().toISOString() }),
    ai_task_delete: () => null,
    ai_task_set_pinned: () => null,
    card_collection_get: () => demoPicks,
    card_collection_set: (args) => { demoPicks = (args.picks as unknown[]) ?? []; return demoPicks; },
    ai_task_preview: (args) => demoPreview(data, args.task as AiTask),
    ai_task_prepare: (args) => {
      hostPost('handoff', { stage: 'prepared' });
      return demoPrepare(data, args.task as AiTask, String(args.coverageNote ?? ''));
    },

    training_plan_state: () => plan.state(),
    training_plan_preview: () => plan.preview(),
    training_plan_save_draft: () => plan.saveDraft(),
    training_plan_discard: () => plan.discard(),
    training_plan_set_ai_publish: () => false,
    training_plan_publish: (args) => plan.publish(args.action as PlanPublishAction, Boolean(args.confirmClear)),
  };

  /* 概览顶部「我的指标」：预置四项，演示里一进来就是满的（访客自己改过的不覆盖）。 */
  try {
    if (!window.localStorage.getItem('zeppbridge-overview-pins')) {
      window.localStorage.setItem('zeppbridge-overview-pins', JSON.stringify(['resting_hr', 'hrv_rmssd', 'sleep_score', 'steps']));
    }
  } catch { /* 存不了就让访客自己固定 */ }

  /* 演示里不往访客的剪贴板写东西，也不让浏览器弹「是否允许访问剪贴板」。 */
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined, readText: async () => '' } });
  } catch { /* 改不了就算了，最多多一次权限提示 */ }

  const internals = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback(callback: Callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id: number) => { callbacks.delete(id); },
    convertFileSrc: (path: string) => path,
    async invoke(command: string, args: Record<string, unknown> = {}) {
      await sleep(18);
      const handler = handlers[command];
      if (handler) return handler(args);
      if (command.startsWith('plugin:')) return null;
      throw new Error(`demo: no data for ${command}`);
    },
  };
  Object.assign(window, { __TAURI_INTERNALS__: internals, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined } });
  return data;
};
