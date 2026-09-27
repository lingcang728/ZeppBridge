<script setup lang="ts">
/**
 * 概览页头上的「取餐胶囊」。
 *
 * 打开应用时要从云端拉八步。概览是让人等的时候先逛逛的地方——这枚胶囊就是
 * 取餐号：同步在跑时它说「正在取回你的数据 · 3/8」，转一圈进度；用户在等的
 * 那次同步一落地，它变成发光的「数据已备好 · 交给 AI」。点它去交给 AI，
 * 或者点 × 说先不用。后台每十五分钟的自动同步不会让它出现（见 lib/dataReady.ts）。
 *
 * 胶囊在页头行里本来就空着的右半边，出现和消失都不推动下面的内容。
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import { useSyncController } from '../../composables/useSyncController';
import { formatClock } from '../../composables/sync/notice';
import { formatMetric } from '../../lib/format';
import { syncStreamLabel } from '../../lib/syncStreams';
import { defineMessages, useMessages } from '../../i18n';

const t = useMessages(defineMessages(
  {
    waitingEyebrow: '正在从云端取回你的数据',
    waitingHint: '好了会在这里叫你，先随便看看',
    step: (current: number, total: number) => `${current}/${total}`,
    readyTitle: '数据已备好',
    readyNew: (records: string, clock: string) => `新增 ${records} 条 · 截至 ${clock}`,
    readyFresh: (clock: string) => `本机已是最新 · 截至 ${clock}`,
    readyPartial: (streams: string, clock: string) => `${streams}没取到，其余已更新 · 截至 ${clock}`,
    cta: '交给 AI',
    dismiss: '先不用',
    streamSeparator: '、',
  },
  {
    waitingEyebrow: 'Fetching your data from the cloud',
    waitingHint: 'you will get a shout here — look around meanwhile',
    step: (current: number, total: number) => `${current}/${total}`,
    readyTitle: 'Your data is ready',
    readyNew: (records: string, clock: string) => `${records} new records · as of ${clock}`,
    readyFresh: (clock: string) => `Already up to date · as of ${clock}`,
    readyPartial: (streams: string, clock: string) => `${streams} did not come through, the rest is updated · as of ${clock}`,
    cta: 'Hand to AI',
    dismiss: 'Not now',
    streamSeparator: ', ',
  },
  {
    waitingEyebrow: 'Recuperando tus datos de la nube',
    waitingHint: 'te avisaremos aquí; mientras, echa un vistazo',
    readyTitle: 'Tus datos están listos',
    readyNew: (records: string, clock: string) => `${records} registros nuevos · a las ${clock}`,
    readyFresh: (clock: string) => `Ya estaba al día · a las ${clock}`,
    readyPartial: (streams: string, clock: string) => `Faltó ${streams}; el resto está actualizado · a las ${clock}`,
    cta: 'Pasar a la IA',
    dismiss: 'Ahora no',
  },
  'components/overview/DataReadyCapsule',
));

const { dataReady, isSyncing, syncProgress, syncMessage, pickUpReady } = useSyncController();

const phase = computed(() => dataReady.value.phase);
/** 进度环：知道第几步就画弧，不知道（刚开始、让路重试中）就转一段不定长的弧。 */
const progress = computed(() => {
  const p = syncProgress.value;
  return p && p.total > 0 ? Math.min(1, Math.max(0, p.current / p.total)) : null;
});
const RING = 2 * Math.PI * 15;

const readyLine = computed(() => {
  const ready = dataReady.value;
  if (ready.phase !== 'ready') return '';
  const clock = formatClock(ready.finishedAt) ?? '—';
  if (ready.outcome === 'partial' && ready.failedStreams.length) {
    return t.value.readyPartial(ready.failedStreams.map((stream) => syncStreamLabel(stream)).join(t.value.streamSeparator), clock);
  }
  return ready.records > 0 ? t.value.readyNew(formatMetric(ready.records), clock) : t.value.readyFresh(clock);
});
const partial = computed(() => dataReady.value.phase === 'ready' && dataReady.value.outcome === 'partial');
</script>

<template>
  <Transition name="capsule" mode="out-in">
    <div v-if="phase === 'waiting'" key="waiting" class="capsule glass-control is-waiting" role="status" aria-live="polite">
      <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="ring-track" cx="18" cy="18" r="15" />
        <circle
          :class="['ring-arc', { indeterminate: progress === null || !isSyncing }]"
          cx="18" cy="18" r="15"
          :stroke-dasharray="progress === null || !isSyncing ? `${RING * 0.28} ${RING}` : `${RING * progress} ${RING}`"
        />
      </svg>
      <!-- 两行，和「已备好」那一版一样高：状态切换时页头不跳。 -->
      <span class="copy">
        <strong>{{ t.waitingEyebrow }}<template v-if="syncProgress && isSyncing"> · {{ t.step(syncProgress.current, syncProgress.total) }}</template></strong>
        <span class="hint">{{ syncMessage }} · {{ t.waitingHint }}</span>
      </span>
    </div>

    <div v-else-if="phase === 'ready'" key="ready" :class="['capsule', 'glass-control', 'ready-glow', 'is-ready', { partial }]" role="status" aria-live="polite">
      <span class="ready-mark" aria-hidden="true"><Icon name="circle-check" :size="20" /></span>
      <span class="copy">
        <strong>{{ t.readyTitle }}</strong>
        <span class="hint">{{ readyLine }}</span>
      </span>
      <RouterLink to="/ai" class="go">{{ t.cta }}<Icon name="arrow-right" :size="15" /></RouterLink>
      <button type="button" class="dismiss" :aria-label="t.dismiss" :title="t.dismiss" @click="pickUpReady('dismiss')">
        <Icon name="x" :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.capsule {
  display: flex;
  min-width: min(400px, 100%);
  max-width: 100%;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 12px;
  border-radius: 999px;
}
.copy { display: grid; flex: 1; min-width: 0; line-height: 1.3; }
.copy strong { overflow: hidden; color: var(--ink); font-size: var(--fs-md); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.hint { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.is-waiting { padding-right: 20px; }

.ring { width: 38px; height: 38px; flex: 0 0 38px; rotate: -90deg; }
.ring-track { fill: none; stroke: color-mix(in srgb, var(--ink) 12%, transparent); stroke-width: 3; }
.ring-arc {
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-width: 3;
  transition: stroke-dasharray .5s var(--ease-out);
}
.ring-arc.indeterminate { transform-origin: 18px 18px; animation: ring-spin 1.1s linear infinite; }
@keyframes ring-spin { to { transform: rotate(360deg); } }

.ready-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 45%, transparent);
}
.partial .ready-mark { background: color-mix(in srgb, var(--warning) 20%, transparent); color: var(--warning); box-shadow: none; }

/* 去取的按钮：和交给 AI 页上那枚主按钮同一种液态玻璃绿。 */
.go {
  display: inline-flex;
  min-height: 40px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .34) 0%, rgba(255, 255, 255, 0) 55%),
    linear-gradient(180deg, var(--accent-hover), var(--accent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45), inset 0 -2px 6px rgba(0, 0, 0, .16),
    0 8px 22px -8px color-mix(in srgb, var(--accent) 75%, transparent);
  color: var(--accent-ink);
  font-size: var(--fs-md);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  transition: scale var(--dur-fast) var(--ease-out), filter var(--dur-base) ease;
}
.go:hover { filter: brightness(1.06); }
.go:active { scale: .96; }
.go:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.dismiss {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.dismiss:hover { background: var(--glass-press); color: var(--ink); }

.capsule-enter-active { transition: opacity .38s ease, filter .38s ease, scale .5s var(--ease-spring); }
.capsule-leave-active { transition: opacity .22s ease, filter .22s ease, scale .22s ease; }
.capsule-enter-from { opacity: 0; filter: blur(10px); scale: .92; }
.capsule-leave-to { opacity: 0; filter: blur(8px); scale: .97; }

@media (max-width: 760px) {
  .capsule { min-width: 0; width: 100%; }
  .hint { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .ring-arc.indeterminate { animation: none; }
}
</style>
