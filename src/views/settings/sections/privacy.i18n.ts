import { defineMessages } from '../../../i18n';

/* 设置「隐私与安全」卡（2A 极简重写）。 */
export const privacyCardMessages = defineMessages(
  {
    lead: '数据只在这台电脑上，不上传、不统计',
    learnMore: '了解更多',
    apiOn: (url: string) => `已开启 · ${url}`,
    apiOff: '已关闭',
    apiOpen: '去设置',
  },
  {
    lead: 'Your data stays on this computer: no uploads, no usage statistics',
    learnMore: 'Learn more',
    apiOn: (url: string) => `On · ${url}`,
    apiOff: 'Off',
    apiOpen: 'Settings',
  },
  {
    lead: 'Tus datos se quedan en este equipo: no se suben ni se recogen estadísticas',
    learnMore: 'Más información',
    apiOn: (url: string) => `Activada · ${url}`,
    apiOff: 'Desactivada',
    apiOpen: 'Configurar',
  },
  'views/settings/sections/privacy',
);
