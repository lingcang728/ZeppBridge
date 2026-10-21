<script setup lang="ts">
/**
 * 设置「同步」卡里的版本那一行。静默更新（2026-10-14）以后这里只是旁证：后台下载、左上角标志的进度环和
 * 绿环才是主角（components/shell/BrandUpdate.vue）。这一行写版本号和当前状态，下好了给「更新」，
 * 失败时说原因（左上角失败是安静的，只有这里会说），平时给「检查更新」；右边一个「自动更新」开关（2026-10-21 用户）。
 * 最底下一行「给 GitHub 点个 Star」：从更新弹窗挪过来（用户：以后写新功能，不能让人在更新页里点 Star），星星一直轻轻地动。
 */
import { computed, onMounted } from 'vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import Icon from '../../../components/Icon.vue';
import GlassSwitch from '../../../components/GlassSwitch.vue';
import {
  applyDesktopUpdate, autoUpdate, downloadRatio, refreshDesktopUpdate, setAutoUpdate, startDesktopUpdate, updateState,
} from '../../../services/updateService';
import { toUserMessage } from '../../../lib/bridge';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { useUpdateText } from '../../../components/shell/update.i18n';
import { useUpdateNoticeText } from '../../../components/shell/UpdateNotice.i18n';
import { useLetterText } from '../../../components/letters/letters.i18n';
import { letterVersions } from '../../../services/letters';
import { letterBox, loadLetterBox } from '../../../services/letterBox';

const t = useMessages(settingsMessages);
const u = useUpdateText();
const l = useLetterText();
const n = useUpdateNoticeText();
const letterCount = letterVersions().length;
onMounted(() => { void refreshDesktopUpdate(); void loadLetterBox(); });

const ready = computed(() => updateState.phase === 'ready' || updateState.phase === 'applying');
const busy = computed(() => updateState.phase === 'checking' || updateState.phase === 'downloading');
const status = computed(() => {
  switch (updateState.phase) {
    case 'checking': return t.value.updateStatusChecking;
    case 'downloading': {
      const ratio = downloadRatio(updateState);
      return u.value.downloading(ratio === null ? null : Math.round(ratio * 100));
    }
    case 'ready': return u.value.ready(updateState.version ?? '');
    case 'applying': return updateState.waiting_for_sync ? u.value.waitingSync : u.value.applying;
    case 'up_to_date': return t.value.updateStatusUpToDate;
    case 'unsupported': return t.value.updateStatusUnmanaged;
    case 'failed': return updateState.error_code
      ? toUserMessage({ code: updateState.error_code, message: '' }, t.value.updateStatusFailed)
      : t.value.updateStatusFailed;
    default: return '';
  }
});

/** 地址写死、并在 capabilities/default.json 里单独放行，别的链接打不开。 */
const REPO = 'https://github.com/lingcang728/ZeppBridge';
const openRepo = () => {
  if ('__TAURI_INTERNALS__' in window) void openUrl(REPO).catch(() => undefined);
  else window.open(REPO, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <div :class="['s-row', 'update-state', `is-${updateState.phase}`]" role="status" aria-live="polite">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.updateVersion(updateState.currentVersion || t.updateVersionLoading) }}</span>
      <span v-if="status" class="s-row-sub">{{ status }}</span>
      <span v-if="updateState.applyError" class="s-row-sub bad" role="alert">{{ updateState.applyError }}</span>
    </div>
    <!-- 更新由包管理器管的渠道上不摆按钮：按下去只能得到一句「这里不管更新」。 -->
    <div v-if="updateState.phase !== 'unsupported'" class="s-row-control">
      <label class="auto-switch">
        <span>{{ t.updateAuto }}</span>
        <GlassSwitch :model-value="autoUpdate" :aria-label="t.updateAuto" @update:model-value="setAutoUpdate" />
      </label>
      <button v-if="ready" class="button primary" type="button" :disabled="updateState.phase === 'applying'" @click="applyDesktopUpdate()">
        {{ u.update }}
      </button>
      <button v-else class="button secondary" type="button" :disabled="busy" @click="startDesktopUpdate()">
        <Icon name="sync" :size="14" :class="{ spinning: busy }" />
        {{ busy ? t.updateChecking : t.updateCheck }}
      </button>
    </div>
  </div>
  <!-- 信匣：作者来信都在这里重读，回信的回执有新动静时亮一个点。 -->
  <div class="s-row letter-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ l.settingsRow }}<i v-if="letterBox.unseen" class="unseen" aria-hidden="true"></i></span>
      <span class="s-row-sub">{{ l.settingsSub(letterCount) }}</span>
    </div>
    <div class="s-row-control">
      <RouterLink class="button secondary" to="/letters">{{ l.open }}</RouterLink>
    </div>
  </div>
  <div class="s-row star-row">
    <div class="s-row-main">
      <span class="s-row-title">
        <span class="star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7L12 3.5Z" /></svg></span>{{ n.star }}
      </span>
    </div>
    <div class="s-row-control">
      <button class="button secondary star-open" type="button" @click="openRepo">GitHub<Icon name="external" :size="13" /></button>
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.update-state:not(.is-idle, .is-unsupported) .s-row-title::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; background: var(--muted); vertical-align: middle; }
.update-state.is-ready .s-row-title::before, .update-state.is-up_to_date .s-row-title::before { background: var(--accent); }
.update-state.is-checking .s-row-title::before, .update-state.is-downloading .s-row-title::before, .update-state.is-applying .s-row-title::before { background: var(--warning); }
.update-state.is-failed .s-row-title::before { background: var(--danger); }
.s-row-sub.bad { color: var(--danger); }
.auto-switch { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; cursor: pointer; }

/*
 * 星星（照 CC Switch：停着也在动）：一直左右轻轻摇、一呼一吸地放大一点，背后一团暖光跟着明暗；
 * 鼠标移到这一行时转一圈、跳一下。只动 transform / opacity；减少动态效果、低特效时静止。
 */
.star-row .s-row-title { display: inline-flex; align-items: center; gap: 10px; }
.star { position: relative; display: inline-grid; place-items: center; width: 22px; height: 22px; flex: none; }
.star::before {
  content: ''; position: absolute; inset: -3px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, color-mix(in srgb, var(--route-amber) 45%, transparent), transparent 68%);
  opacity: .35; animation: star-glow 3.2s ease-in-out infinite;
}
.star svg {
  position: relative; width: 20px; height: 20px; fill: var(--route-amber); stroke: color-mix(in srgb, var(--route-amber) 70%, #7a4a00); stroke-width: 1; stroke-linejoin: round;
  transform-origin: 50% 55%; animation: star-idle 3.2s ease-in-out infinite;
}
.star-row:hover .star svg, .star-row:focus-within .star svg { animation: star-hop 900ms cubic-bezier(.3, .7, .3, 1) both, star-idle 3.2s ease-in-out 900ms infinite; }
.star-open { gap: 6px; }
@keyframes star-idle {
  0%, 100% { transform: rotate(0deg) scale(1); }
  22% { transform: rotate(-9deg) scale(1.07); }
  48% { transform: rotate(2deg) scale(.98); }
  74% { transform: rotate(8deg) scale(1.05); }
}
@keyframes star-glow { 0%, 100% { opacity: .25; } 30% { opacity: .7; } 75% { opacity: .5; } }
@keyframes star-hop {
  0% { transform: translateY(0) rotate(0deg) scale(1); }
  45% { transform: translateY(-5px) rotate(216deg) scale(1.18); }
  70% { transform: translateY(0) rotate(360deg) scale(1); }
  84% { transform: translateY(-2px) rotate(360deg) scale(1); }
  100% { transform: translateY(0) rotate(360deg) scale(1); }
}
:root[data-effects='lite'] .star svg, :root[data-effects='lite'] .star::before { animation: none; }
@media (prefers-reduced-motion: reduce) { .star svg, .star::before { animation: none; } }
.unseen { display: inline-block; width: 7px; height: 7px; margin-left: 8px; border-radius: 50%; background: var(--accent); vertical-align: middle; }
</style>
