import { defineMessages } from '../../../i18n';

/* 设置「隐私与安全」卡（2A 极简重写）。 */
export const privacyCardMessages = defineMessages(
  {
    lead: '默认只在这台电脑上，不统计；只会推到你自己设的站点',
    learnMore: '了解更多',
    apiOn: (url: string) => `已开启 · ${url}`,
    apiOff: '已关闭',
    apiOpen: '去设置',
  },
  {
    lead: 'Stays on this computer by default, no usage statistics; it only ever goes to a site you set up yourself',
    learnMore: 'Learn more',
    apiOn: (url: string) => `On · ${url}`,
    apiOff: 'Off',
    apiOpen: 'Settings',
  },
  {
    lead: 'Por defecto se queda en este equipo, sin estadísticas; solo sale hacia un sitio que configures tú',
    learnMore: 'Más información',
    apiOn: (url: string) => `Activada · ${url}`,
    apiOff: 'Desactivada',
    apiOpen: 'Configurar',
  },
  'views/settings/sections/privacy',
);
