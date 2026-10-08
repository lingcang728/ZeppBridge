import { defineMessages } from '../../i18n';

/*
 * 设置卡叠的文案：卡片标题、卡头上的一句状态、各卡里的小标题和新写的说明。
 * 旧版一长页里的说明文字仍在 Settings.i18n.ts，这里只放卡叠新增的。
 */
export const deckMessages = defineMessages(
  {
    pageIntro: '点开一张卡来调整；展开后按住卡头左右拖，可直接翻到下一张。',
    pageIntroDeck: '左右滑动挑一张，点正中那张打开；想一眼看完就「展开全部」。',
    openCard: '打开',

    cardAccount: '账号与设备',
    cardArchive: '归档与存储',
    cardData: '数据内容',
    cardAi: '交给 AI 工具',
    cardDisplay: '显示与语言',
    cardPrivacy: '隐私与安全',
    cardAdvanced: '高级与维护',

    sumAccount: (state: string, devices: number) => `${state} · ${devices} 台设备`,
    sumAccountOff: '还没有连接 Zepp 账号',
    sumSyncOn: (minutes: number) => `自动同步 · 每 ${minutes} 分钟`,
    sumSyncOff: '自动同步已关闭',
    sumArchiveOn: '长期保留 · 不自动清理',
    sumArchiveOff: (days: number) => `保留最近 ${days} 天 · 更早的自动清理`,
    sumData: (available: number, total: number) => `${available} / ${total} 条数据流已在本机`,
    sumDataLoading: '正在读取数据能力…',
    sumAi: (format: string) => `MCP 只读接入 · 默认导出 ${format}`,
    sumDisplay: (language: string, unit: string, scale: number) => `${language} · ${unit} · ${scale}%`,
    sumPrivacy: '数据只存在本机，不上传',
    sumAdvanced: '备份与恢复 · 本机 API · 数据健康',
    autoSyncToggle: '自动同步',

    secAccount: '账号',
    secDevices: '设备',
    secLogin: '登录方式',
    secLoginSub: '需要换一种方式登录时再展开',
    secCapability: '已获取的数据',
    secCodes: '未识别的运动编号',
    secMcp: 'MCP',
    secExport: '默认导出',
    secFeedback: '反馈问题',

    firstSyncing: (current: number, total: number) => `连接成功 · 正在取最近记录 ${current}/${total}`,
    firstSyncingPlain: "连接成功 · 正在取最近记录",
    firstReady: "第一批数据到了：去概览看看这一周",
    goOverview: "去概览看看",
    deviceOpen: '查看或换型号',


    mcpPreview: '查看将复制的内容',
    exportFormatSub: '「交给 AI」、运动详情导出时默认选中的格式',

    themeLabel: '主题',
    themeSystem: '跟随系统',
    themeDark: '深色',
    themeLight: '浅色',
    scaleSub: '100% 为设计基准，也可以用 Ctrl + / Ctrl -',

  },
  {
    pageIntro: 'Open a card to adjust it; once open, drag its header sideways to flip to the next.',
    pageIntroDeck: 'Swipe sideways to pick a card, click the center one to open — or “Show all” to see everything.',
    openCard: 'Open',

    cardAccount: 'Account and devices',
    cardArchive: 'Archive and storage',
    cardData: 'Your data',
    cardAi: 'AI tools',
    cardDisplay: 'Display and language',
    cardPrivacy: 'Privacy and security',
    cardAdvanced: 'Advanced and maintenance',

    sumAccount: (state: string, devices: number) => `${state} · ${devices} ${devices === 1 ? 'device' : 'devices'}`,
    sumAccountOff: 'No Zepp account connected yet',
    sumSyncOn: (minutes: number) => `Auto sync · every ${minutes} min`,
    sumSyncOff: 'Auto sync is off',
    sumArchiveOn: 'Kept long-term · nothing pruned',
    sumArchiveOff: (days: number) => `Keeping the last ${days} days · older data pruned`,
    sumData: (available: number, total: number) => `${available} of ${total} data streams stored locally`,
    sumDataLoading: 'Checking available data…',
    sumAi: (format: string) => `Read-only MCP access · exports default to ${format}`,
    sumDisplay: (language: string, unit: string, scale: number) => `${language} · ${unit} · ${scale}%`,
    sumPrivacy: 'Your data stays on this computer',
    sumAdvanced: 'Backup and restore · local API · data health',
    autoSyncToggle: 'Auto sync',

    secAccount: 'Account',
    secDevices: 'Devices',
    secLogin: 'Sign-in method',
    secLoginSub: 'Expand only to switch sign-in method',
    secCapability: 'Data you have',
    secCodes: 'Unrecognized workout codes',
    secMcp: 'MCP',
    secExport: 'Default export',
    secFeedback: 'Report a problem',

    firstSyncing: (current: number, total: number) => `Connected · fetching recent records ${current}/${total}`,
    firstSyncingPlain: "Connected · fetching recent records",
    firstReady: "Your first data is in: see this week on the overview",
    goOverview: "Go to overview",
    deviceOpen: 'View or change model',


    mcpPreview: 'Show what will be copied',
    exportFormatSub: 'Preselected when exporting from “Send to AI” or a workout',

    themeLabel: 'Theme',
    themeSystem: 'System',
    themeDark: 'Dark',
    themeLight: 'Light',
    scaleSub: '100% is the design size; Ctrl + / Ctrl - also work',

  },
  {
    pageIntro: 'Abre una tarjeta para ajustarla; ya abierta, arrastra la cabecera a un lado para pasar a la siguiente.',
    pageIntroDeck: 'Desliza para elegir una tarjeta y haz clic en la del centro para abrirla, o pulsa «Ver todas» para verlas juntas.',
    openCard: 'Abrir',

    cardAccount: 'Cuenta y dispositivos',
    cardArchive: 'Archivo y almacenamiento',
    cardData: 'Tus datos',
    cardAi: 'Herramientas de IA',
    cardDisplay: 'Pantalla e idioma',
    cardPrivacy: 'Privacidad y seguridad',
    cardAdvanced: 'Avanzado y mantenimiento',

    sumAccount: (state: string, devices: number) => `${state} · ${devices} ${devices === 1 ? 'dispositivo' : 'dispositivos'}`,
    sumAccountOff: 'Aún no hay una cuenta de Zepp conectada',
    sumSyncOn: (minutes: number) => `Sincronización automática · cada ${minutes} min`,
    sumSyncOff: 'La sincronización automática está desactivada',
    sumArchiveOn: 'Se conserva todo · sin limpieza automática',
    sumArchiveOff: (days: number) => `Se conservan los últimos ${days} días · lo anterior se limpia`,
    sumData: (available: number, total: number) => `${available} de ${total} flujos de datos guardados en este equipo`,
    sumDataLoading: 'Leyendo qué datos hay disponibles…',
    sumAi: (format: string) => `Acceso MCP de solo lectura · exportación predeterminada ${format}`,
    sumDisplay: (language: string, unit: string, scale: number) => `${language} · ${unit} · ${scale}%`,
    sumPrivacy: 'Tus datos se quedan en este equipo',
    sumAdvanced: 'Copia de seguridad y restauración · API local · estado de los datos',
    autoSyncToggle: 'Sincronización automática',

    secAccount: 'Cuenta',
    secDevices: 'Dispositivos',
    secLogin: 'Método de inicio de sesión',
    secLoginSub: 'Ábrelo solo si necesitas iniciar sesión de otra forma',
    secCapability: 'Datos disponibles',
    secCodes: 'Códigos de entrenamiento no reconocidos',
    secMcp: 'MCP',
    secExport: 'Exportación predeterminada',
    secFeedback: 'Informar de un problema',

    firstSyncing: (current: number, total: number) => `Conectado · trayendo los registros recientes ${current}/${total}`,
    firstSyncingPlain: "Conectado · trayendo los registros recientes",
    firstReady: "Ya llegaron tus primeros datos: mira esta semana en el resumen",
    goOverview: "Ir al resumen",
    deviceOpen: 'Ver o cambiar el modelo',


    mcpPreview: 'Ver lo que se va a copiar',
    exportFormatSub: 'Formato preseleccionado al exportar desde «Pasar a la IA» o desde un entrenamiento',

    themeLabel: 'Tema',
    themeSystem: 'Sistema',
    themeDark: 'Oscuro',
    themeLight: 'Claro',
    scaleSub: '100 % es el tamaño de diseño; también funcionan Ctrl + / Ctrl -',

  },
  'views/settings/deck',
);
