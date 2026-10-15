import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages({
  title: (version: string) => `已更新到 v${version}`,
  since: (version: string) => `从 v${version} 升级`,
  acknowledge: '知道了',
  fullNotes: '查看完整更新内容',
  empty: '此版本没有附带更新说明，可查看完整更新内容。',
  added: '新增', improved: '改进', fixed: '修复', note: '更新',
}, {
  title: (version: string) => `Updated to v${version}`,
  since: (version: string) => `Previously v${version}`,
  acknowledge: 'Got it',
  fullNotes: 'View full release notes',
  empty: 'No release notes were included with this version. View the full release for details.',
  added: 'New', improved: 'Improved', fixed: 'Fixed', note: 'Update',
}, undefined, 'components/shell/UpdateNotice');

export const useUpdateNoticeText = () => useMessages(messages);
