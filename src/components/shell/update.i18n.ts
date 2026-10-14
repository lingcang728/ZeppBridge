import { defineMessages, useMessages } from '../../i18n';

/** 静默更新：左上角标志的浮层、设置页那一行共用（同一句话只写一份）。 */
const messages = defineMessages(
  {
    newVersion: (version: string) => `新版本 ${version}`,
    ready: (version: string) => `新版本 ${version} 已下载好`,
    downloading: (percent: number | null) => (percent === null ? '正在下载新版本' : `正在下载新版本 ${percent}%`),
    update: '更新',
    waitingSync: '等同步结束…',
    applying: '正在更新…',
  },
  {
    newVersion: (version: string) => `Version ${version}`,
    ready: (version: string) => `Version ${version} is ready`,
    downloading: (percent: number | null) => (percent === null ? 'Downloading the new version' : `Downloading the new version ${percent}%`),
    update: 'Update',
    waitingSync: 'Waiting for the sync to finish…',
    applying: 'Updating…',
  },
  {
    newVersion: (version: string) => `Versión ${version}`,
    ready: (version: string) => `La versión ${version} está lista`,
    downloading: (percent: number | null) => (percent === null ? 'Descargando la nueva versión' : `Descargando la nueva versión ${percent}%`),
    update: 'Actualizar',
    waitingSync: 'Esperando a que termine la sincronización…',
    applying: 'Actualizando…',
  },
  'components/shell/update',
);

export const useUpdateText = () => useMessages(messages);
