<script setup lang="ts">
import { onMounted } from 'vue';
import { useUnknownCodes } from '../../../composables/settings/useUnknownCodes';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  unknownCodes,
  codeDrafts,
  codeBusy,
  codeError,
  codeMessage,
  unnamedCodeCount,
  codeNameSuggestions,
  loadCorrections,
  saveCodeLabel,
} = useUnknownCodes();

// 没有未识别编号时这一块整个不出现，但组件始终挂着——编号是它自己加载的。
onMounted(() => { void loadCorrections(); });
</script>

<template>
  <section v-if="unknownCodes.length" class="settings-card" aria-labelledby="codes-title">
    <div class="section-heading-row">
      <h2 id="codes-title">{{ t.codesTitle }}</h2>
      <span v-if="unnamedCodeCount" class="capability-checked">{{ t.codesUnnamed(unnamedCodeCount) }}</span>
    </div>
    <p class="section-description">{{ t.codesIntro }}</p>
    <div class="code-list">
      <div v-for="entry in unknownCodes" :key="entry.zeppType" class="code-row">
        <div class="code-head">
          <span class="code-badge" aria-hidden="true">{{ entry.zeppType }}</span>
          <div class="code-meta">
            <strong>{{ t.codeNumber(entry.zeppType) }}</strong>
            <span>{{ t.codeRecords(entry.records) }}</span>
          </div>
          <span v-if="entry.label" class="code-preview">{{ t.codeShownAs(entry.label) }}</span>
          <span v-else class="code-preview muted">{{ t.codeShownAsUnknown(entry.zeppType) }}</span>
        </div>
        <div class="code-input-row">
          <input
            v-model="codeDrafts[entry.zeppType]"
            type="text"
            maxlength="24"
            :aria-label="t.codeInputAria(entry.zeppType)"
            :placeholder="t.codeInputPlaceholder"
            :disabled="codeBusy === entry.zeppType"
            @keyup.enter="saveCodeLabel(entry.zeppType)"
          />
          <button
            class="button primary"
            type="button"
            :disabled="codeBusy === entry.zeppType"
            @click="saveCodeLabel(entry.zeppType)"
          >{{ codeBusy === entry.zeppType ? t.codeSaving : t.codeSave }}</button>
        </div>
        <div class="code-suggestions">
          <button
            v-for="name in codeNameSuggestions"
            :key="name"
            type="button"
            class="filter-chip"
            :disabled="codeBusy === entry.zeppType"
            @click="codeDrafts[entry.zeppType] = name"
          >{{ name }}</button>
        </div>
      </div>
    </div>
    <p v-if="codeError" class="api-error" role="alert">{{ codeError }}</p>
    <p v-else-if="codeMessage" class="hint-line ok">{{ codeMessage }}</p>
    <p class="retain-note">{{ t.codeFootnote }}</p>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.code-list { display: grid; gap: 10px; margin-top: 12px; }
.code-row { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.code-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.code-badge { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-family: var(--font-mono); font-size: var(--fs-xs); }
.code-meta { display: grid; gap: 2px; }
.code-meta strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.code-meta span { color: var(--subtle); font-size: var(--fs-xs); }
.code-preview { color: var(--accent); font-size: var(--fs-xs); text-align: right; }
.code-preview.muted { color: var(--muted); }
.code-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.code-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.code-suggestions .filter-chip { padding: 3px 10px; border: 1px solid var(--line-control); border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.code-suggestions .filter-chip:hover { border-color: var(--accent); color: var(--accent); }
</style>
