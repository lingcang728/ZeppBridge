import { defineMessages, useMessages } from '../../i18n';

/* 另外 9 种语言在 src/i18n/locales/*.ts 的 'components/shell/UpdateNotice' 下。 */
const messages = defineMessages({
  title: (version: string) => `已更新到 v${version}`,
  since: (version: string) => `从 v${version} 升级`,
  acknowledge: '知道了',
  star: '给 GitHub 点个 Star',
  next: '继续看更新内容',
  empty: '此版本没有附带更新说明。',
  added: '新增', improved: '改进', fixed: '修复', note: '更新',
}, {
  title: (version: string) => `Updated to v${version}`,
  since: (version: string) => `Previously v${version}`,
  acknowledge: 'Got it',
  star: 'Star on GitHub',
  next: 'See what’s new',
  empty: 'No release notes were included with this version.',
  added: 'New', improved: 'Improved', fixed: 'Fixed', note: 'Update',
}, {
  title: (version: string) => `Actualizado a v${version}`,
  since: (version: string) => `Antes: v${version}`,
  acknowledge: 'Entendido',
  star: 'Dar una estrella en GitHub',
  next: 'Ver las novedades',
  empty: 'Esta versión no incluye notas de la versión.',
  added: 'Nuevo', improved: 'Mejorado', fixed: 'Corregido', note: 'Novedad',
}, 'components/shell/UpdateNotice');

export const useUpdateNoticeText = () => useMessages(messages);
