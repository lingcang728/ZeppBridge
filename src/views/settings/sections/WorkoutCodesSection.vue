<script setup lang="ts">
import { onMounted } from 'vue';
import { useUnknownCodes } from '../../../composables/settings/useUnknownCodes';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
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
  <section v-if="unknownCodes.length" id="codes" class="s-section" aria-labelledby="codes-title">
    <div class="s-section-head">
      <h3 id="codes-title">{{ d.secCodes }}</h3>
      <span v-if="unnamedCodeCount" class="s-meta">{{ t.codesUnnamed(unnamedCodeCount) }}</span>
    </div>
    <p class="s-note">{{ t.codesIntro }}</p>
    <div class="s-list">
      <div v-for="entry in unknownCodes" :key="entry.zeppType" class="s-row is-block code-row">
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
            class="mat-field"
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
    <p class="s-note">{{ t.codeFootnote }}</p>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.code-row { gap: 10px; }
.code-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.code-badge { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--muted); font-family: var(--font-mono); font-size: var(--fs-xs); }
.code-meta { display: grid; gap: 2px; }
.code-meta strong { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.code-meta span { color: var(--subtle); font-size: var(--fs-xs); }
.code-preview { color: var(--accent); font-size: var(--fs-xs); text-align: right; }
.code-preview.muted { color: var(--muted); }
.code-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.code-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.code-suggestions .filter-chip { padding: 3px 10px; border: 1px solid var(--line-control); border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.code-suggestions .filter-chip:hover { color: var(--accent); }
</style>
