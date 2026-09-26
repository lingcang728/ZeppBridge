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
  <div class="s-list api-card">
    <div class="s-row">
      <span class="api-icon"><Icon name="braces" :size="18" /></span>
      <div class="s-row-main">
        <span id="api-title" class="s-row-title">{{ t.apiToggleTitle }}</span>
        <span class="s-row-sub">{{ t.apiToggleSub(localApiStatus?.address || '127.0.0.1:43921') }}</span>
      </div>
      <div class="s-row-control">
        <span :class="['state-dot', { on: localApiStatus?.running }]">
          {{ localApiStatus?.running ? t.apiListening : (localApiStatus?.enabled ? t.apiEnabledNotListening : t.apiOff) }}
        </span>
        <button
          class="mat-switch"
          type="button"
          role="switch"
          :aria-label="t.apiToggleAria"
          :aria-checked="Boolean(localApiStatus?.enabled)"
          :disabled="localApiBusy"
          @click="toggleLocalApi"
        ></button>
      </div>
    </div>

    <template v-if="localApiStatus?.enabled">
      <div class="s-row">
        <code class="api-code">{{ localApiStatus?.base_url || 'http://127.0.0.1:43921' }}/workouts/{id}/series</code>
        <div class="s-row-control">
          <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiExample">
            <Icon name="copy" :size="14" />{{ t.apiCopyExample }}
          </button>
        </div>
      </div>
      <div class="s-row is-block">
        <div class="token-line">
          <span class="s-row-title">{{ t.apiTokenLabel }}</span>
          <code class="api-code">{{ localApiTokenVisible && localApiToken ? localApiToken : maskedToken }}</code>
        </div>
        <div class="s-actions">
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
        <p class="s-row-sub">{{ t.apiAuthNoteA }}<code>Authorization: Bearer &lt;token&gt;</code>{{ t.apiAuthNoteB }}</p>
      </div>
    </template>

    <div class="s-row is-block">
      <p v-if="localApiError" class="api-error" role="alert">{{ localApiError }}</p>
      <p v-else-if="localApiMessage" class="hint-line ok">{{ localApiMessage }}</p>
      <p class="s-row-sub">{{ t.apiBindNote }}</p>
    </div>
  </div>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.api-icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.api-code { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--ink); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.token-line { display: flex; align-items: center; gap: 12px; min-width: 0; }
.is-block { gap: 10px; }
.is-block p { margin: 0; }
.s-row-sub code { padding: 1px 5px; border-radius: 4px; background: var(--mat-inset); font-size: var(--fs-2xs); }
</style>
