import { computed, ref, watch } from 'vue';
import { useSyncController } from '../useSyncController';
import { backend, toUserMessage } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { backendText } from '../../i18n/backendText';
import { settingsMessages } from '../../views/Settings.i18n';
import type { CapabilityItem, CapabilityOverview, CapabilityProbe } from '../../types';

const lookup = (table: unknown, key: string): string | undefined =>
  (table as Record<string, string | undefined>)[key];

const surfaceLabels: Record<string, string> = {
  v2_events: '/v2/users/me/events',
  user_events: '/users/{id}/events',
  user_events_day: '/users/{id}/events/dateString',
  file_info_events: '/users/me/fileInfo/events',
};

/* ── 设备能力总览 ─────────────────────────
 * 能力是关于这个账号的事实，和心率一样应该顺带拿到，而不是让用户按一下按钮才知道。
 * 十五项由库里已有的数据直接判定（零请求）；只有血压、体重、情绪三项在本地
 * 没有任何痕迹，需要真实请求，那部分在同步时静默完成、每周一次。 */
export const useCapabilityBoard = () => {
  const t = useMessages(settingsMessages);
  const { syncState } = useSyncController();
  const capabilityOverview = ref<CapabilityOverview | null>(null);
  const capabilityError = ref<string | null>(null);
  const probeBusy = ref(false);
  const probeResults = ref<CapabilityProbe[] | null>(null);

  /* 数据流名在 Settings.i18n.ts。特别注意 spo2 那一项：它数的是 daily_metrics
     里 spo2_* 那几项（ODI、夜间评分、实测时长），全部来自夜间测量；身体状态页
     画的是 metric_samples 里的逐条读数，两者是不同的东西。都叫「血氧」会让人
     以为「有数据」却看不到曲线，所以这里叫「夜间血氧指标」。 */
  const streamLabel = (stream: string): string => lookup(t.value.stream, stream) ?? stream;

  /* 单位和说明都按后端发来的码渲染，不用后端那份中文。
     后端仍然带着中文 recordsUnit / note，那是 CLI、MCP 和本机 API 的输出，
     不跟界面语言走。 */
  const unitLabel = (item: CapabilityItem): string =>
    (item.recordsUnitCode === 'days' ? t.value.unitDays : t.value.unitRecords);

  const capabilityNote = (item: CapabilityItem): string => {
    const windowDays = item.windowDays ?? 0;
    if (item.status === 'available' && item.ingested === false) {
      return item.stream === 'food' ? t.value.capabilityFoodHistoryHint : t.value.capabilityNotIngested;
    }
    if (item.status === 'unsupported') return t.value.capabilityUnsupported;
    if (item.status === 'unknown') return t.value.capabilityNotProbed;
    if (item.status === 'no_records') {
      return item.source === 'probed'
        ? t.value.capabilityNoneProbed(windowDays)
        : t.value.capabilityNoRecords(windowDays);
    }
    // 后端加了新的状态而界面还不认识：英文界面下不吐中文原文。
    return backendText(item.note, '');
  };

  const capabilityRow = (item: CapabilityItem) => ({
    key: item.stream,
    label: streamLabel(item.stream),
    detail:
      item.status === 'available' && item.ingested !== false
        ? t.value.capabilityLocal(item.records, unitLabel(item), item.latestDate ?? '')
        : item.status === 'available'
          // 数量前面必须写清是云端的，否则读起来就像本机已经有了。
          ? t.value.capabilityCloud(item.records, unitLabel(item), item.latestDate ?? '')
          : capabilityNote(item),
    note: item.ingested === false ? capabilityNote(item) : null,
  });

  /* 三分，不是两分。
   *
   * 「云端有」和「本机有」是两件事：血压和体重目前只做探测，不做归一化——
   * 缺少可核对的报文样本，贸然解析只会产出没人能验证的数字。把它们和真正
   * 收录了的数据流并排放在「可提供给 AI」里，会让人以为 ZeppBridge 已经
   * 存着他的血压，那是这个产品最不该给出的错觉。 */
  const capabilityAvailable = computed(() =>
    (capabilityOverview.value?.items ?? [])
      .filter((item) => item.status === 'available' && item.ingested !== false)
      .map(capabilityRow),
  );

  const capabilityNotIngested = computed(() =>
    (capabilityOverview.value?.items ?? [])
      .filter((item) => item.status === 'available' && item.ingested === false)
      .map(capabilityRow),
  );

  const capabilityMissing = computed(() =>
    (capabilityOverview.value?.items ?? [])
      .filter((item) => item.status !== 'available')
      .map(capabilityRow),
  );

  /* 一块板子上的所有数据流，按「已获取 → 云端有但本机没收 → 还没拿到」排。
     状态分三档而不是两档：「云端有、本机未收录」既不是拿到了，也不是没有，
     压成任何一档都会骗人。 */
  const capabilityBoard = computed(() => [
    ...capabilityAvailable.value.map((row) => ({ ...row, state: 'on', lamp: 'on', note: undefined as string | undefined })),
    ...capabilityNotIngested.value.map((row) => ({ ...row, state: 'pending', lamp: 'pending' })),
    ...capabilityMissing.value.map((row) => ({ ...row, state: 'off', lamp: 'off', note: undefined as string | undefined })),
  ]);

  const capabilityCheckedAt = computed(() => {
    const raw = capabilityOverview.value?.probedAt;
    if (!raw) return null;
    const then = new Date(raw).getTime();
    if (!Number.isFinite(then)) return null;
    const days = Math.floor((Date.now() - then) / 86400000);
    return days <= 0 ? t.value.probedToday : t.value.probedDaysAgo(days);
  });

  const loadCapabilityOverview = async () => {
    capabilityError.value = null;
    try {
      capabilityOverview.value = await backend.getCapabilityOverview();
    } catch (error) {
      capabilityError.value = toUserMessage(error);
    }
  };

  watch(syncState, (current, previous) => {
    if (previous === 'syncing' && current !== 'syncing') void loadCapabilityOverview();
  });

  /** One line per probed endpoint — for diagnosing, not for reading. */
  const probeDiagnostics = computed(() => {
    if (!probeResults.value) return [];
    return probeResults.value.map((probe) => {
      const name = `${probe.eventType}${probe.subType ? '/' + probe.subType : ''}`;
      const surface = surfaceLabels[probe.surface] ?? probe.surface;
      const result =
        probe.status === 'available'
          ? t.value.probeRecords(probe.records, probe.latestDate ?? '')
          : probe.status === 'empty'
            ? t.value.probeEmpty
            : probe.status === 'unavailable'
              ? t.value.probeRefused
              : t.value.probeFailed;
      return `${name} @ ${surface} — ${result}`;
    });
  });

  const runCapabilityProbe = async () => {
    probeBusy.value = true;
    capabilityError.value = null;
    try {
      probeResults.value = await backend.probeDataCapabilities();
      await loadCapabilityOverview();
    } catch (error) {
      capabilityError.value = toUserMessage(error);
    } finally {
      probeBusy.value = false;
    }
  };

  return {
    capabilityOverview,
    capabilityError,
    probeBusy,
    capabilityAvailable,
    capabilityNotIngested,
    capabilityMissing,
    capabilityBoard,
    capabilityCheckedAt,
    probeDiagnostics,
    loadCapabilityOverview,
    runCapabilityProbe,
  };
};
