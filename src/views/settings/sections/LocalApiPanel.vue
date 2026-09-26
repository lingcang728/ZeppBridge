<script setup lang="ts">
import { onMounted } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useLocalApi } from '../../../composables/settings/useLocalApi';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  localApiStatus,
  localApiBusy,
  localApiToken,
  localApiTokenVisible,
  localApiMessage,
  localApiError,
  maskedToken,
  loadLocalApiStatus,
  toggleLocalApi,
  toggleTokenVisibility,
  copyLocalApiToken,
  regenerateLocalApiToken,
  copyLocalApiExample,
} = useLocalApi();

onMounted(() => { void loadLocalApiStatus(); });
</script>

<template>
  <section class="settings-card api-card" aria-labelledby="api-title">
    <div class="api-head">
      <span class="api-icon"><Icon name="braces" :size="20" /></span>
      <div>
        <h2 id="api-title">{{ t.apiTitle }}</h2>
        <p>{{ t.apiSub }}</p>
      </div>
      <span :class="['api-state', { on: localApiStatus?.running }]">
        <i aria-hidden="true"></i>{{ localApiStatus?.running ? t.apiListening : (localApiStatus?.enabled ? t.apiEnabledNotListening : t.apiOff) }}
      </span>
    </div>

    <div class="toggle-row api-toggle">
      <div class="toggle-copy">
        <strong>{{ t.apiToggleTitle }}</strong>
        <span>{{ t.apiToggleSub(localApiStatus?.address || '127.0.0.1:43921') }}</span>
      </div>
      <button
        class="switch"
        type="button"
        role="switch"
        :aria-label="t.apiToggleAria"
        :aria-checked="Boolean(localApiStatus?.enabled)"
        :disabled="localApiBusy"
        @click="toggleLocalApi"
      ><span></span></button>
    </div>

    <template v-if="localApiStatus?.enabled">
      <div class="api-endpoint">
        <code>{{ localApiStatus?.base_url || 'http://127.0.0.1:43921' }}/workouts/{id}/series</code>
        <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiExample">
          <Icon name="copy" :size="14" />{{ t.apiCopyExample }}
        </button>
      </div>

      <div class="api-token">
        <span class="kv-label">{{ t.apiTokenLabel }}</span>
        <code>{{ localApiTokenVisible && localApiToken ? localApiToken : maskedToken }}</code>
        <div class="inline-actions">
          <button class="button secondary" type="button" :disabled="localApiBusy" @click="toggleTokenVisibility">
            {{ localApiTokenVisible ? t.apiHide : t.apiShow }}
          </button>
          <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiToken">
            <Icon name="copy" :size="14" />{{ t.apiCopy }}
          </button>
          <button class="button secondary" type="button" :disabled="localApiBusy" @click="regenerateLocalApiToken">
            {{ t.apiRegenerate }}
          </button>
        </div>
      </div>
      <p class="api-note">{{ t.apiAuthNoteA }}<code>Authorization: Bearer &lt;token&gt;</code>{{ t.apiAuthNoteB }}</p>
    </template>

    <p v-if="localApiError" class="api-error" role="alert">{{ localApiError }}</p>
    <p v-else-if="localApiMessage" class="hint-line ok">{{ localApiMessage }}</p>
    <p class="api-note">{{ t.apiBindNote }}</p>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.api-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.api-head h2 { margin-bottom: 4px; }
.api-head p, .api-note { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.api-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.api-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-sm); white-space: nowrap; }
.api-state.on { color: var(--accent); }
.api-state i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.api-endpoint { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-endpoint code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.api-note { margin-top: 9px; }
.api-note code { padding: 1px 5px; border-radius: 4px; background: var(--surface-raised); font-family: var(--font-mono); font-size: var(--fs-2xs); }
/* 拆分前 `.toggle-row` 排在这条后面、把 border-bottom 又加了回来；这里保持那个结果，只设上边距。 */
.api-toggle { margin-top: 12px; }
.api-token { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px 12px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-token code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.api-token .inline-actions { grid-column: 1 / -1; }
</style>
