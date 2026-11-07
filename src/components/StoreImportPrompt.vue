<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, ref } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { useMessages, defineMessages } from '../i18n';

type StoreImportStatus = { required: boolean; sources: string[] };

const copy = useMessages(defineMessages(
  {
    title: '要导入 GitHub 版数据吗？',
    summary: '微软商店版和 GitHub 版使用独立的数据目录。导入会复制本机数据库和可迁移的设置，原目录保持不变。',
    credential: '登录凭据和本机 API 密钥按版本隔离，不会从 GitHub 版复制。导入后，请在商店版重新登录，并为使用本机 API 的客户端重新配置密钥。',
    found: '检测到的数据目录',
    noSource: '请选择包含 zepp.db 的 data 文件夹。',
    browseTitle: '选择 ZeppBridge 数据文件夹',
    choose: '选择数据文件夹',
    import: '复制并导入',
    empty: '暂不导入，使用空库',
    busy: '正在安全复制数据…',
    error: '导入失败。请确认所选目录包含 zepp.db、目标磁盘空间充足，然后重试。',
  },
  {
    title: 'Import GitHub version data?',
    summary: 'The Microsoft Store and GitHub versions use separate data folders. Importing copies the local database and migratable settings; the original folder stays unchanged.',
    credential: "Sign-in credentials and local API keys are kept separate by version and aren't copied from the GitHub version. After importing, sign in again in the Store version and reconfigure keys for clients that use local APIs.",
    found: 'Detected data folder',
    noSource: 'Select a data folder that contains zepp.db.',
    browseTitle: 'Select a ZeppBridge data folder',
    choose: 'Choose data folder',
    import: 'Copy and import',
    empty: 'Skip for now and use an empty database',
    busy: 'Copying data securely…',
    error: 'Import failed. Make sure the selected folder contains zepp.db and there is enough free disk space, then try again.',
  },
  {
    title: '¿Importar los datos de la versión de GitHub?',
    summary: 'La versión de Microsoft Store y la versión de GitHub usan directorios de datos independientes. La importación copiará la base de datos local y los ajustes que se puedan migrar; el directorio original no se modificará.',
    credential: 'Las credenciales de inicio de sesión y las claves de API locales se mantienen separadas por versión; no se copian desde la versión de GitHub. Tras la importación, inicia sesión de nuevo en la versión de Microsoft Store y vuelve a configurar las claves en los clientes que usen la API local.',
    found: 'Directorio de datos detectado',
    noSource: 'Puedes seleccionar una carpeta data que contenga zepp.db.',
    browseTitle: 'Selecciona la carpeta de datos de ZeppBridge',
    choose: 'Seleccionar carpeta de datos',
    import: 'Copiar e importar',
    empty: 'No importar por ahora y usar una base de datos vacía',
    busy: 'Copiando los datos de forma segura…',
    error: 'No se pudo completar la importación. Comprueba que la carpeta seleccionada contenga zepp.db y que haya suficiente espacio en el disco de destino; después, inténtalo de nuevo.',
  },
  'components/StoreImportPrompt',
));

const visible = ref(false);
const sources = ref<string[]>([]);
const selected = ref('');
const busy = ref(false);
const failed = ref(false);
const errorDetail = ref('');
const sourceReady = computed(() => selected.value.trim().length > 0);

const errorMessage = (error: unknown) => typeof error === 'string'
  ? error
  : error instanceof Error
    ? error.message
    : '';

onMounted(async () => {
  try {
    const status = await invoke<StoreImportStatus>('store_import_status');
    if (!status.required) return;
    sources.value = status.sources;
    selected.value = status.sources[0] ?? '';
    visible.value = true;
  } catch {
    // Non-Store builds compile this component out. Keep the app usable if an
    // older packaged build does not expose the Store-only command.
  }
});

const browse = async () => {
  failed.value = false;
  errorDetail.value = '';
  try {
    const result = await open({
      directory: true,
      multiple: false,
      title: copy.value.browseTitle,
    });
    if (typeof result === 'string') selected.value = result;
  } catch (error: unknown) {
    failed.value = true;
    errorDetail.value = errorMessage(error);
  }
};

const decide = async (source: string | null) => {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  errorDetail.value = '';
  try {
    await invoke('store_import_decide', { source });
    visible.value = false;
  } catch (error: unknown) {
    failed.value = true;
    errorDetail.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <ModalDialog v-if="visible" labelledby="store-import-title" :max-width="620" @close="undefined">
    <div class="store-import-prompt">
      <header>
        <span class="eyebrow">ZeppBridge · Microsoft Store</span>
        <h2 id="store-import-title">{{ copy.title }}</h2>
        <p>{{ copy.summary }}</p>
      </header>

      <label v-if="sources.length" class="store-import-source">
        <span>{{ copy.found }}</span>
        <select v-model="selected" :disabled="busy">
          <option v-for="source in sources" :key="source" :value="source">{{ source }}</option>
        </select>
      </label>
      <p v-else class="store-import-help">{{ copy.noSource }}</p>

      <p class="store-import-help">{{ copy.credential }}</p>
      <p v-if="busy" class="store-import-status" role="status" aria-live="polite">{{ copy.busy }}</p>
      <p v-if="failed" class="store-import-error" role="alert">
        <span>{{ copy.error }}</span>
        <code v-if="errorDetail">{{ errorDetail }}</code>
      </p>

      <div class="store-import-actions">
        <button class="button secondary" type="button" :disabled="busy" @click="browse">{{ copy.choose }}</button>
        <button class="button primary" type="button" :disabled="busy || !sourceReady" @click="decide(selected)">{{ copy.import }}</button>
      </div>
      <button class="store-import-empty" type="button" :disabled="busy" @click="decide(null)">{{ copy.empty }}</button>
    </div>
  </ModalDialog>
</template>

<style scoped>
.store-import-prompt { display: grid; gap: 16px; }
.store-import-prompt header { display: grid; gap: 8px; }
.store-import-prompt h2 { margin: 0; font-size: 1.35rem; }
.store-import-prompt p { margin: 0; color: var(--ink-muted); line-height: 1.55; }
.eyebrow { color: var(--accent); font-size: .76rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.store-import-source { display: grid; gap: 7px; color: var(--ink-muted); font-size: .88rem; }
.store-import-source select { min-width: 0; width: 100%; padding: 10px 12px; border: 1px solid var(--mat-glass-line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.store-import-help { font-size: .86rem; }
.store-import-status { color: var(--accent) !important; }
.store-import-error { color: var(--danger) !important; }
.store-import-error code { display: block; margin-top: 6px; color: inherit; font-size: .8em; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-wrap; }
.store-import-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.store-import-empty { justify-self: end; border: 0; padding: 4px 0; background: transparent; color: var(--ink-muted); cursor: pointer; font: inherit; font-size: .86rem; }
.store-import-empty:disabled { opacity: .55; cursor: wait; }
</style>
