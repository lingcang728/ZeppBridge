import { defineMessages } from './i18n';

/* 桌面外壳（AppShell.vue）的文案。文件名跟着原来的 App.vue 走，moduleId 仍是 'App'，
   语言包里的 'App' 一节不用搬家。 */
export const messages = defineMessages(
  {
    skipToContent: '跳到主要内容',
    mainNav: '主导航',
    bottomNav: '移动主导航',
    navOverview: '概览',
    navHandoff: '交给 AI',
    navSettings: '设置',
    preparingData: '正在打开本地数据库，升级后的第一次启动可能要十几秒…',
    compacting: (pending: number) =>
      `正在压缩历史报文（${pending} 条），压完会自动消失。这期间同步会稍等一下。`,
    compacted: (saved: string) => `历史报文已压缩，省下约 ${saved} 磁盘空间。`,
    trayHint: '关闭窗口后 ZeppBridge 仍在托盘运行，可继续自动同步。',
    browserPreview: '请使用桌面应用。浏览器预览不会读取账户数据。',
    routeNotFound: '页面不存在，已返回概览。',
    quickReturn: (page: string) => `返回${page}`,
    previousPage: '上一页',
  },
  {
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    bottomNav: 'Mobile main navigation',
    navOverview: 'Overview',
    navHandoff: 'Hand to AI',
    navSettings: 'Settings',
    preparingData: 'Opening your local database — the first launch after an update can take a few seconds…',
    compacting: (pending: number) =>
      `Compacting stored payloads (${pending} to go). This clears itself; syncing waits its turn.`,
    compacted: (saved: string) => `Stored payloads compacted, about ${saved} of disk reclaimed.`,
    trayHint: 'Closing the window keeps ZeppBridge in the tray, so auto-sync carries on.',
    browserPreview: 'Use the desktop app. This browser preview reads no account data.',
    routeNotFound: 'That page does not exist, so you are back on the overview.',
    quickReturn: (page: string) => `Back to ${page}`,
    previousPage: 'the previous page',
  },
  {
    skipToContent: 'Saltar al contenido principal',
    mainNav: 'Navegación principal',
    bottomNav: 'Navegación principal móvil',
    navOverview: 'Resumen',
    navHandoff: 'Pasar a la IA',
    navSettings: 'Configuración',
    preparingData: 'Abriendo tu base de datos local; el primer arranque tras una actualización puede tardar unos segundos…',
    compacting: (pending: number) =>
      `Compactando registros guardados (faltan ${pending}). Esto desaparece solo; la sincronización espera su turno.`,
    compacted: (saved: string) => `Registros guardados compactados: se liberaron unos ${saved} de disco.`,
    trayHint: 'Si cierras la ventana, ZeppBridge sigue en la barra de menú y continúa sincronizando automáticamente.',
    browserPreview: 'Usa la app de escritorio. Esta vista previa en el navegador no lee datos de la cuenta.',
    routeNotFound: 'Esa página no existe, así que volviste al resumen.',
    quickReturn: (page: string) => `Volver a ${page}`,
    previousPage: 'la página anterior',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'App',
);
