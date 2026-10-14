import { defineMessages } from '../../../i18n';

/* 设置「同步」卡（2A 极简重写）：开关和间隔合成一个分段，上次同步与探云端的结果写在同一行。 */
export const syncCardMessages = defineMessages(
  {
    cardTitle: '同步',
    autoSub: '应用开着时按这个间隔拉新数据',
    off: '关',
    lastSynced: (when: string) => `上次同步 ${when}`,
    neverSynced: '还没同步过',
    newest: (when: string) => `最新一条数据 ${when}`,
    cloudStale: (when: string) => `云端最新只到 ${when} · 先在手机 Zepp 里下拉同步`,
    cloudStaleNoTime: '云端还没有新数据 · 先在手机 Zepp 里下拉同步',
  },
  {
    cardTitle: 'Sync',
    autoSub: 'Fetches new data at this interval while the app is open',
    off: 'Off',
    lastSynced: (when: string) => `Last synced ${when}`,
    neverSynced: 'Not synced yet',
    newest: (when: string) => `Newest record ${when}`,
    cloudStale: (when: string) => `The cloud only has data up to ${when} · pull to refresh in the Zepp phone app first`,
    cloudStaleNoTime: 'No new data in the cloud yet · pull to refresh in the Zepp phone app first',
  },
  {
    cardTitle: 'Sincronización',
    autoSub: 'Trae datos nuevos con este intervalo mientras la app está abierta',
    off: 'No',
    lastSynced: (when: string) => `Última sincronización ${when}`,
    neverSynced: 'Aún sin sincronizar',
    newest: (when: string) => `Dato más reciente ${when}`,
    cloudStale: (when: string) => `La nube solo tiene datos hasta las ${when} · primero desliza para actualizar en la app Zepp del móvil`,
    cloudStaleNoTime: 'Aún no hay datos nuevos en la nube · primero desliza para actualizar en la app Zepp del móvil',
  },
  'views/settings/sections/sync',
);
