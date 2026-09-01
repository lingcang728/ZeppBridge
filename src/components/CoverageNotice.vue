<script setup lang="ts">
/**
 * 「你选的范围比本机有的多」这句话，说一次。
 *
 * 为什么需要它：界面上每一个「最近 N 天」——训练状态、身体状态、导出——读的
 * 都是**本机库**，不是云端。库里只有 30 天时选 6 个月，图只会把坐标轴拉长，
 * 前五个月空着。在此之前没有任何一处说明这件事，于是它被当成 bug 报了上来：
 * 「我选了 6 个月，却只看到最近 30 天」。那不是 bug，是我们没说。
 *
 * 说法要诚实：空白的意思是**本机没有**，不是「那几个月你没动」。这两句话对
 * 一个看着自己训练曲线的人来说，是完全相反的两件事。
 *
 * 同一个理由带出第二种情况：**已经同步过了，库还是空的**。这时候再说一句
 * 「先同步一次」是在让人重做刚做过的事。真正的原因通常是登录时没能确认账号
 * 所在的 Zepp 区域——区域猜错了，同步会一路跑通、一条记录不带回来，界面上和
 * 「这段时间你确实没数据」长得一模一样。所以这里要把两者分开说。
 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { emptyLibraryNotice } from '../lib/emptyLibraryNotice';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const props = withDefaults(defineProps<{
  /**
   * 用户当前选的范围（天）。
   *
   * 省略（或 0）表示调用方没在挑范围，只想知道库是不是空的——概览页就是这样。
   * 这种时候「你选的比本机有的多」无从谈起，那条提示不出。
   */
  requestedDays?: number;
}>(), { requestedDays: 0 });

const { appStatus, isSyncing, runSync } = useSyncController();

const messages = defineMessages(
  {
    empty: '本机还没有任何数据。先同步一次，图表才有东西可画。',
    emptyAfterSync:
      '同步跑通了，但一条记录也没取到。可能是这个账号在 Zepp 里本来就没有这段时间的数据，也可能是手表还没把数据上传到 Zepp App。先在手机上打开 Zepp 确认那边有数据，再回来同步一次。',
    emptyUnconfirmedRegion:
      '同步跑通了，但一条记录也没取到。登录时没能确认你的账号属于哪个 Zepp 区域，现在用的是猜出来的那个——打向错误区域的同步就是这样：一路成功，什么都没有。请重新连接账号试试。',
    reconnect: '去重新连接',
    short: (covered: number, earliest: string) =>
      `本机只有 ${covered} 天的数据（最早 ${earliest}）。更早的部分是空白，因为还没从云端取回来——不是那段时间你没有记录。`,
    backfill: '补拉更多历史',
    backfilling: '正在补拉…',
    syncNow: '立即同步',
  },
  {
    empty: 'Nothing on this machine yet. Sync once and the charts will have something to draw.',
    emptyAfterSync:
      'The sync completed but brought nothing back. Either this account has no data for this period in Zepp, or the watch has not uploaded to the Zepp app yet. Check the Zepp app on your phone first, then sync again here.',
    emptyUnconfirmedRegion:
      'The sync completed but brought nothing back. Signing in could not confirm which Zepp region your account belongs to, so ZeppBridge is using its best guess — and a sync aimed at the wrong region behaves exactly like this: it succeeds and returns nothing. Try connecting your account again.',
    reconnect: 'Reconnect account',
    short: (covered: number, earliest: string) =>
      `This machine holds ${covered} days (earliest ${earliest}). Everything before that is blank because it has not been fetched from the cloud yet — not because you recorded nothing then.`,
    backfill: 'Backfill more history',
    backfilling: 'Backfilling…',
    syncNow: 'Sync now',
  },
);
const t = useMessages(messages);

const coverage = computed(() => appStatus.value?.coverage ?? null);

/** 库是空的时候该说哪一句。判断在 `emptyLibraryNotice` 里，那里有测试。 */
const notice = computed(() => emptyLibraryNotice(appStatus.value));

/** 还没同步过：这时候该说的是「去同步」，不是「你选多了」。 */
const isEmpty = computed(() => notice.value === 'never_synced');

/** 同步跑通了，库还是空的。「先同步一次」这句话在这里是错的。 */
const isEmptyAfterSync = computed(
  () => notice.value === 'synced_empty'
    || notice.value === 'synced_empty_unconfirmed_region',
);

/** 区域是猜出来的——它是「同步成功却什么都没有」最可能的原因。 */
const regionUnconfirmed = computed(
  () => notice.value === 'synced_empty_unconfirmed_region',
);

/**
 * 差一天不值得打断人。只有当选的范围明显超出本机覆盖时才出声——
 * 阈值定在一周，是因为同步本来就有一两天的滞后，那不是缺口。
 */
const isShort = computed(() => {
  const value = coverage.value;
  if (!value?.earliest_day) return false;
  if (props.requestedDays <= 0) return false;
  return props.requestedDays - value.covered_days > 7;
});

const earliestText = computed(() => {
  const day = coverage.value?.earliest_day;
  if (!day) return '';
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium' }).format(parsed);
});

/* 补拉到用户当前选的那个范围，而不是某个固定值：他刚刚已经说了想看多远。 */
const backfill = () => { void runSync('history', props.requestedDays); };
const syncNow = () => { void runSync('incremental'); };
</script>

<template>
  <p v-if="isEmptyAfterSync" class="coverage-notice" role="status">
    <Icon name="warning" :size="14" />
    <span>{{ regionUnconfirmed ? t.emptyUnconfirmedRegion : t.emptyAfterSync }}</span>
    <RouterLink v-if="regionUnconfirmed" class="button button-secondary" to="/settings">
      {{ t.reconnect }}
    </RouterLink>
    <button v-else class="button button-secondary" type="button" :disabled="isSyncing" @click="syncNow">
      {{ isSyncing ? t.backfilling : t.syncNow }}
    </button>
  </p>
  <p v-else-if="isEmpty" class="coverage-notice" role="status">
    <Icon name="clock" :size="14" />
    <span>{{ t.empty }}</span>
    <button class="button button-secondary" type="button" :disabled="isSyncing" @click="syncNow">
      {{ isSyncing ? t.backfilling : t.syncNow }}
    </button>
  </p>
  <p v-else-if="isShort" class="coverage-notice" role="status">
    <Icon name="clock" :size="14" />
    <span>{{ t.short(coverage!.covered_days, earliestText) }}</span>
    <button class="button button-secondary" type="button" :disabled="isSyncing" @click="backfill">
      {{ isSyncing ? t.backfilling : t.backfill }}
    </button>
  </p>
</template>

<style scoped>
.coverage-notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.coverage-notice span { flex: 1 1 240px; min-width: 0; }
.coverage-notice .button { flex: 0 0 auto; }
</style>
