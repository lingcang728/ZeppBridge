import { defineMessages, useMessages } from '../../i18n';

/*
 * 新手引导的文案（脚本草稿见桌面《计划.md》二·2）。每步一句话，说明小字能省就省。
 * 步骤文案按 `steps.<章>` 下的 s1、s2… 取，顺序和 lib/tour/chapters.ts 的步骤一一对应。
 */
const messages = defineMessages(
  {
    chapter: {
      whatsnew: 'V3 变了什么', basics: '语言与主题', connect: '连接账号', overview: '概览', detail: '二级页',
      pick: '挑日子', handoff: '交给 AI', plan: '训练计划', settings: '设置',
      cards: '牌桌', box: '收集箱', check: '寄出前检查', planFirst: '训练计划',
    },
    steps: {
      whatsnew: {
        s1: '概览只放你挑的几项，比平时高或低会直接标出来。',
        s2: '挑几天数据交给 AI，再把它排的计划接回来。',
        s3: '接回来的计划能直接发到手表。',
        s4: 'Claude Code、Codex 这类工具能通过 MCP 直接读你的数据。',
        s5: '新增官方连接，和原来的连接可以同时开。',
      },
      basics: { s1: '深色、浅色，或者跟着系统。', s2: '随时换语言。' },
      connect: {
        s1: '用 Zepp 账号连接：官方授权为主，旧通道补上官方没有的（HRV、血氧、压力…）。',
        s2: '同步前先在手机 Zepp 里下拉刷新：手表的数据要先到云端，电脑才拉得到。',
      },
      overview: {
        s1: '挑 3–4 项常看的放这里，「调整」能换。',
        s2: '这是和你自己最近的平时比，不和别人比。',
        s3: '按你关注的方向排概览。',
      },
      detail: { s1: '时间范围选一次，各页都记得。' },
      pick: {
        s1: '从这里挑几天交给 AI。',
        s2: '牌桌里点一张牌翻过来再打勾，或直接拖进收集箱；点一叠展开，点空白处收牌。',
      },
      handoff: {
        s1: '左边是你挑好的数据：点一张能改看几天，不想给就把它往外甩掉。', s2: '在右边写下想问的，打包成一个 .md 交给 AI。',
        s3: '按住中间的锁交出去：文件自动放进剪贴板，在 AI 对话框里按 Ctrl+V 就附上了。',
        s3Auto: '连粘贴和发送都想省掉？去设置「交给 AI 工具」卡打开「全自动」。',
      },
      plan: {
        s1: '把 AI 的最终回复粘贴回来，就成了一周计划。',
        s2: '点某一天单独微调。',
        s3: '长按发到手表。手表上开始训练时，还要再选一次运动类型。',
      },
      settings: { s1: '备份和恢复在这里。', s2: 'MCP 让 Claude Code、Codex 这类 AI 工具直接读你本机的数据（只读，不联网）；命令行和插件也在这里。', s3: '想再看引导，回这张卡。' },
      cards: { s1: '点一张牌翻过来再打勾，或直接拖进收集箱；点一叠展开，点空白处收牌。' },
      box: { s1: '往上甩出去或点 × 把牌拿出去；点箭头用这些日子开一个任务。' },
      check: { s1: '寄出前在这里核对：要交出去的每一项都列着，不想给的点掉。' },
      planFirst: { s1: '点某一天单独改，长按「发到手表」送出去。手表上开始训练时还要再选一次运动类型。' },
    },
    next: '下一步', prev: '上一步', done: '完成', skip: '跳过引导', gotIt: '知道了', tryIt: '圈里可以直接上手试',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: '示例数据',
    sampleHint: '引导里看的是示例数据，你的库不受影响',
    welcomePick: '选一种语言', welcomeStart: '开始看看', welcomeSkip: '跳过，直接用',
    inviteLater: '以后再说',
    toolsText: 'AI 工具里连的还是旧版 ZeppBridge，要重新连一次', toolsGo: '去重新连接',
    cardTitle: '新手引导',
    cardSummary: (seen: number, total: number) => `看过 ${seen} / ${total} 章`,
    fullTour: '从头看一遍', start: '开始', look: '看看', seenMark: '看过',
    resetTips: '首次提示再出现一次', resetDone: '好了，下次碰到会再提示',
  },
  {
    chapter: {
      whatsnew: "What's new in V3", basics: 'Language and theme', connect: 'Connecting', overview: 'Overview', detail: 'Detail pages',
      pick: 'Picking days', handoff: 'Hand to AI', plan: 'Training plans', settings: 'Settings',
      cards: 'Card table', box: 'Collection box', check: 'Before sending', planFirst: 'Training plans',
    },
    steps: {
      whatsnew: {
        s1: 'The overview shows only the few metrics you pick, and flags when one is above or below your usual.',
        s2: 'Hand a few days of data to an AI, then bring its plan back.',
        s3: 'A plan you bring back can go straight to your watch.',
        s4: 'Tools like Claude Code and Codex can read your data directly over MCP.',
        s5: 'New official connection, and it can run alongside the original one.',
      },
      basics: { s1: 'Dark, light, or follow the system.', s2: 'Switch language any time.' },
      connect: {
        s1: 'Connect with your Zepp account: official authorization first, the legacy channel fills in what it lacks (HRV, SpO₂, stress…).',
        s2: 'Pull to refresh in the Zepp phone app before syncing: watch data has to reach the cloud before this computer can fetch it.',
      },
      overview: {
        s1: 'Keep the 3–4 metrics you check most here; "Adjust" swaps them.',
        s2: 'This compares with your own recent usual, not with anyone else.',
        s3: 'Order the overview by what you care about.',
      },
      detail: { s1: 'Pick a time range once and every page remembers it.' },
      pick: {
        s1: 'Pick a few days from here to hand to an AI.',
        s2: 'On the card table, tap a card to turn it over and tick it, or drag it straight into the box; tap a pile to spread it, tap empty space to put cards away.',
      },
      handoff: {
        s1: 'Your picked data is on the left: tap a card to change how many days it covers, or flick it away to leave it out.', s2: 'Write your question on the right; it is packed into one .md for the AI.',
        s3: 'Hold the lock in the middle to hand it off: the file lands on your clipboard, so pressing Ctrl+V in the AI chat box attaches it.',
        s3Auto: 'Want the pasting and sending done for you too? Turn on “Hand off to AI automatically” in the AI tools card in Settings.',
      },
      plan: {
        s1: "Paste the AI's final reply back and it becomes a week's plan.",
        s2: 'Tap a day to fine-tune it on its own.',
        s3: 'Hold to send it to your watch. When you start the workout on the watch, you still pick the sport type once more.',
      },
      settings: { s1: 'Backup and restore live here.', s2: 'MCP lets AI tools like Claude Code and Codex read your data on this computer directly (read-only, nothing goes online); the command line and plugins live here too.', s3: 'Come back to this card to see the guide again.' },
      cards: { s1: 'Tap a card to turn it over and tick it, or drag it straight into the box; tap a pile to spread it, tap empty space to put cards away.' },
      box: { s1: 'Flick a card up or tap × to take it out; tap the arrow to start a task with these days.' },
      check: { s1: 'Check here before sending: everything that will go out is listed, untick what you would rather keep.' },
      planFirst: { s1: 'Tap a day to change it on its own; hold "Send to watch" to send. On the watch you still pick the sport type once when you start.' },
    },
    next: 'Next', prev: 'Back', done: 'Done', skip: 'Skip guide', gotIt: 'Got it', tryIt: 'Try it inside the frame',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: 'Sample data',
    sampleHint: 'The guide uses sample data; your library is untouched',
    welcomePick: 'Pick a language', welcomeStart: 'Show me around', welcomeSkip: 'Skip and start',
    inviteLater: 'Later',
    toolsText: 'Your AI tools still use the old ZeppBridge; reconnect them once', toolsGo: 'Reconnect',
    cardTitle: 'Guide',
    cardSummary: (seen: number, total: number) => `${seen} of ${total} chapters seen`,
    fullTour: 'From the start', start: 'Start', look: 'Show', seenMark: 'Seen',
    resetTips: 'Show first-time tips again', resetDone: "Done; they'll show the next time you get there",
  },
  {
    chapter: {
      whatsnew: 'Novedades de V3', basics: 'Idioma y tema', connect: 'Conexión', overview: 'Resumen', detail: 'Páginas de detalle',
      pick: 'Elegir días', handoff: 'Pasar a la IA', plan: 'Planes de entrenamiento', settings: 'Ajustes',
      cards: 'Mesa de cartas', box: 'Caja', check: 'Antes de enviar', planFirst: 'Planes de entrenamiento',
    },
    steps: {
      whatsnew: {
        s1: 'El resumen muestra solo las métricas que elijas y marca cuándo una está por encima o por debajo de lo habitual.',
        s2: 'Pasa unos días de datos a una IA y trae de vuelta su plan.',
        s3: 'El plan que traes de vuelta puede ir directo al reloj.',
        s4: 'Herramientas como Claude Code y Codex pueden leer tus datos directamente por MCP.',
        s5: 'Nueva conexión oficial, que puede funcionar junto a la original.',
      },
      basics: { s1: 'Oscuro, claro o según el sistema.', s2: 'Cambia de idioma cuando quieras.' },
      connect: {
        s1: 'Conecta con tu cuenta de Zepp: la autorización oficial primero; el canal antiguo completa lo que falta (VFC, SpO₂, estrés…).',
        s2: 'Antes de sincronizar, desliza para actualizar en la app Zepp del móvil: los datos del reloj tienen que llegar a la nube antes de que este ordenador los descargue.',
      },
      overview: {
        s1: 'Deja aquí las 3–4 métricas que más miras; «Ajustar» las cambia.',
        s2: 'Se compara con tu propio nivel habitual reciente, no con el de otros.',
        s3: 'Ordena el resumen según lo que te interesa.',
      },
      detail: { s1: 'Elige un rango una vez y todas las páginas lo recuerdan.' },
      pick: {
        s1: 'Desde aquí eliges unos días para pasárselos a una IA.',
        s2: 'En la mesa, toca una carta para darle la vuelta y márcala, o arrástrala directo a la caja; toca un montón para abrirlo y un espacio vacío para recoger.',
      },
      handoff: {
        s1: 'A la izquierda están tus datos elegidos: toca una carta para cambiar cuántos días abarca, o lánzala fuera para no incluirla.', s2: 'Escribe tu pregunta a la derecha; se empaqueta en un solo .md para la IA.',
        s3: 'Mantén pulsado el candado del centro para entregarlo: el archivo va al portapapeles y con Ctrl+V en el chat de la IA queda adjunto.',
        s3Auto: '¿Quieres que también se pegue y se envíe solo? Activa «Pasar a la IA automáticamente» en la tarjeta de herramientas de IA de Ajustes.',
      },
      plan: {
        s1: 'Pega aquí la respuesta final de la IA y se convierte en el plan de la semana.',
        s2: 'Toca un día para ajustarlo por separado.',
        s3: 'Mantén pulsado para enviarlo al reloj. Al empezar el entrenamiento en el reloj aún tendrás que elegir el tipo de deporte una vez más.',
      },
      settings: { s1: 'Aquí están las copias de seguridad y la restauración.', s2: 'MCP permite que herramientas de IA como Claude Code y Codex lean tus datos de este ordenador directamente (solo lectura, nada sale a internet); aquí también están la línea de comandos y los complementos.', s3: 'Vuelve a esta tarjeta para ver la guía otra vez.' },
      cards: { s1: 'Toca una carta para darle la vuelta y márcala, o arrástrala directo a la caja; toca un montón para abrirlo y un espacio vacío para recoger.' },
      box: { s1: 'Lanza una carta hacia arriba o toca × para quitarla; toca la flecha para empezar una tarea con estos días.' },
      check: { s1: 'Revisa aquí antes de enviar: todo lo que saldrá aparece en la lista; desmarca lo que prefieras no dar.' },
      planFirst: { s1: 'Toca un día para cambiarlo por separado; mantén pulsado «Enviar al reloj» para mandarlo. En el reloj aún eliges el tipo de deporte una vez al empezar.' },
    },
    next: 'Siguiente', prev: 'Atrás', done: 'Listo', skip: 'Saltar guía', gotIt: 'Entendido', tryIt: 'Pruébalo dentro del marco',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: 'Datos de ejemplo',
    sampleHint: 'La guía usa datos de ejemplo; tu biblioteca no se toca',
    welcomePick: 'Elige un idioma', welcomeStart: 'Muéstrame', welcomeSkip: 'Saltar y empezar',
    inviteLater: 'Más tarde',
    toolsText: 'Tus herramientas de IA siguen usando el ZeppBridge antiguo; vuelve a conectarlas', toolsGo: 'Reconectar',
    cardTitle: 'Guía',
    cardSummary: (seen: number, total: number) => `${seen} de ${total} capítulos vistos`,
    fullTour: 'Desde el principio', start: 'Empezar', look: 'Ver', seenMark: 'Visto',
    resetTips: 'Volver a mostrar los consejos iniciales', resetDone: 'Listo; aparecerán la próxima vez que llegues allí',
  },
  'components/tour/tour',
);

export const useTourText = () => useMessages(messages);
