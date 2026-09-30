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
    preparingData: '正在打开本地数据库，升级后首次启动可能要十几秒…',
    compacting: (pending: number) =>
      `正在压缩历史报文（${pending} 条），压完自动消失；这期间同步会稍等。`,
    compacted: (saved: string) => `历史报文已压缩，省下约 ${saved} 磁盘空间。`,
    trayHint: '关闭窗口后 ZeppBridge 留在托盘，继续自动同步。',
    browserPreview: '浏览器预览不读账户数据，用桌面应用打开。',
    routeNotFound: '页面不存在，已返回概览。',
    quickReturn: (page: string) => `返回${page}`,
    previousPage: '上一页',
  },
  {
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    bottomNav: 'Mobile main navigation',
    navOverview: 'Overview',
    navHandoff: 'Send to AI',
    navSettings: 'Settings',
    preparingData: 'Opening your local database — the first launch after an update can take ten seconds or so…',
    compacting: (pending: number) =>
      `Compacting stored payloads (${pending} left) — clears itself when done; sync waits meanwhile.`,
    compacted: (saved: string) => `Stored payloads compacted — freed about ${saved} of disk.`,
    trayHint: 'Closing the window keeps ZeppBridge in the tray — auto-sync continues.',
    browserPreview: 'Use the desktop app. This browser preview reads no account data.',
    routeNotFound: 'Page not found — back to Overview.',
    quickReturn: (page: string) => `Back to ${page}`,
    previousPage: 'the previous page',
  },
  {
    skipToContent: 'Saltar al contenido principal',
    mainNav: 'Navegación principal',
    bottomNav: 'Navegación móvil',
    navOverview: 'Resumen',
    navHandoff: 'Pasar a la IA',
    navSettings: 'Configuración',
    preparingData: 'Abriendo la base de datos local; el primer inicio tras actualizar puede tardar algo más de diez segundos…',
    compacting: (pending: number) =>
      `Compactando registros históricos (${pending} pendientes); el aviso desaparece al terminar y la sincronización espera.`,
    compacted: (saved: string) => `Registros compactados: se liberaron unos ${saved} de disco.`,
    trayHint: 'Al cerrar la ventana, ZeppBridge permanece en la bandeja y sigue sincronizando.',
    browserPreview: 'Usa la app de escritorio: la vista previa web no lee datos de la cuenta.',
    routeNotFound: 'Página no encontrada; volviste a Resumen.',
    quickReturn: (page: string) => `Volver a «${page}»`,
    previousPage: 'la página anterior',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'App',
);
