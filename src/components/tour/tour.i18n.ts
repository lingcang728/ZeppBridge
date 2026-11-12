import { defineMessages, useMessages } from '../../i18n';

/*
 * 新手引导的文案（3.1.1 重写，桌面《计划.md》四）。每步一句短话，说明小字能省就省。
 * 步骤文案按 `steps.<章>` 下的 s1、s2… 取，序号和 lib/tour/chapters.ts 的步骤下标一一对应。
 */
const messages = defineMessages(
  {
    chapter: {
      intro: '入门', home: '概览', metric: '指标与挑日子', workouts: '运动', sleep: '睡眠', ai: '交给 AI',
      plan: '训练计划', journal: '履历与年轮', letters: '信匣', devices: '设备与数据健康', settings: '设置',
    },
    steps: {
      intro: {
        s1: '深色、浅色，或者跟着系统。点一下试试。',
        s2: '随时换语言，拨一下试试。',
        s3: '用 Zepp 账号连两条：官方授权为主，高级数据补上 HRV、血氧、压力这些官方没有的。',
        s4: '常看的几项放在这里；每张下面那行是你自己的常态范围，不和别人比。',
        s5: '顶上三个入口；睡眠、运动、履历从概览的卡片点进去。',
        s6: '这里看同步到哪了，点一下就同步；左上角图标亮起绿圈就是有更新。',
        s7: '右上角这枚信件图标：点一下给作者写信，长按打开信匣；有新来信或回信会亮起红点。',
        s8: '各板块第一次打开时会就地讲一遍；想再看，回这张卡。',
      },
      home: {
        s1: '按你关注的方向重排概览，点一下试试。',
        s2: '每一块都能点开，看更长的时间和更多细节。',
        s3: '推到手表的计划练完后，在这里说说练得怎么样。',
        s4: 'AI 想记住的事先放这里，你点头才算数。',
        s5: '履历和年轮从这里进。',
      },
      metric: {
        s1: '时间范围选一次，各页都记得。',
        s2: '点「?」看这项指标是什么、怎么来的，也能让它不参与分析。',
        s3: '从这里挑几天交给 AI。',
        s4: '点牌翻过来再打勾，或直接拖进收集箱；点空白处收牌。',
      },
      workouts: {
        s1: '每次运动一行；点开看配速、心率和轨迹，还能记下你的感受。',
        s2: '多选后能批量改类型或隐藏；GPX、FIT、Strava 也从这里导入。',
      },
      sleep: { s1: '每晚一条；点开看分期、心率和夜里醒来的时候。' },
      ai: {
        s1: '左边是挑好的数据：点一张改看几天，往外甩掉就不给。',
        s2: '在右边写下想问的，打包成一个 .md 交给 AI。',
        s3: '按住中间的锁交出去：文件自动放进剪贴板，在 AI 对话框里按 Ctrl+V 就附上了。',
        s3Auto: '连粘贴和发送都想省掉？去设置「交给 AI 工具」卡打开「全自动」。',
        s4: 'Claude Code、Codex 这类工具也能经 MCP 直接读，不用复制粘贴。',
      },
      plan: {
        s1: '把 AI 的最终回复粘贴回来，就成了一周计划。',
        s2: '点某一天单独微调。',
        s3: '长按发到手表；手表上开始训练时还要再选一次运动类型。',
        s4: '发过的计划都留在这里。',
      },
      journal: {
        s1: '一年的活动都在这一页；点年轮进去看它一圈圈长出来。',
        s2: '5 公里到全马的个人最好成绩。',
        s3: '比赛倒计时和奖牌墙。',
        s4: '跑鞋里程，到点提醒退役。',
        s5: '一年长一圈，哪周练得多那圈就更宽；点一圈看那次运动。',
      },
      letters: {
        s1: '右上角这枚信件图标：点一下给作者写信，长按打开信匣；有新来信或回信会亮起红点。',
        s2: '作者每次更新寄来的信都在这里，点开就拆。',
        s3: '「你的信」是每周的数据来信和写给未来自己的信；回信和集邮册在后两格。',
      },
      devices: {
        s1: '每台设备一行；认错了点进去改型号，不想看见可以隐藏，数据都还在。',
        s2: '每条数据同步到哪天、缺了什么，在这里一眼看清；入口在设置的高级卡里。',
      },
      settings: {
        s1: '设置是一叠卡，点一张就展开。',
        s2: '备份、恢复和补拉历史都在这里。',
        s3: 'MCP 让 Claude Code、Codex 这类工具直接读你本机的数据（只读，不联网）；命令行工具也在这里。',
      },
    },
    next: '下一步', prev: '上一步', done: '完成', skip: '跳过引导', gotIt: '知道了', tryIt: '圈里可以直接上手试',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: '示例数据',
    sampleHint: '引导里看的是示例数据，你的库不受影响',
    welcomePick: '选一种语言', welcomeStart: '开始看看', welcomeSkip: '跳过，直接用',
    inviteLater: '以后再说',
    toolsText: 'AI 工具里连的还是旧版 ZeppBridge，要重新连一次', toolsGo: '去重新连接',
    cardTitle: '新手引导',
    seenCount: (seen: number, total: number) => `看过 ${seen} / ${total}`,
    start: '开始', look: '看看', seenMark: '看过',
    resetAll: '全部重新提示', resetAllDone: '好了，各板块下次打开会再讲一遍',
  },
  {
    chapter: {
      intro: 'Getting started', home: 'Overview', metric: 'Metrics and picking days', workouts: 'Workouts', sleep: 'Sleep', ai: 'Send to AI',
      plan: 'Training plans', journal: 'Journal and rings', letters: 'Letter box', devices: 'Devices and data health', settings: 'Settings',
    },
    steps: {
      intro: {
        s1: 'Dark, light, or follow the system. Try it.',
        s2: 'Switch language any time; give the wheel a spin.',
        s3: 'Connect your Zepp account two ways: official authorization first, advanced data for what it lacks, like HRV, SpO₂ and stress.',
        s4: 'Your go-to metrics are pinned here; the line under each is your own usual range, not anyone else’s.',
        s5: 'Three tabs up top; sleep, workouts and your journal open from the cards on Overview.',
        s6: 'Sync status lives here; click to sync. A green ring on the top-left icon means an update is ready.',
        s7: 'Top-right mail icon: click to write to the author, or press and hold to open the letter box; a red dot marks new mail or replies.',
        s8: 'Each section explains itself the first time you open it; come back to this card to see any of it again.',
      },
      home: {
        s1: 'Reorder the overview by what you care about. Try it.',
        s2: 'Every panel opens into a longer range and more detail.',
        s3: 'After a planned workout you sent to your watch, tell it here how it went.',
        s4: 'Things an AI wants to remember wait here until you say yes.',
        s5: 'Your journal and rings open from here.',
      },
      metric: {
        s1: 'Pick a time range once and every page remembers it.',
        s2: 'Tap “?” to see what this metric is and where it comes from, or leave it out of analysis.',
        s3: 'Pick a few days from here to hand to an AI.',
        s4: 'Tap a card to turn it over and tick it, or drag it straight into the box; tap empty space to put the cards away.',
      },
      workouts: {
        s1: 'One row per workout; open it for pace, heart rate and route, and to note how it felt.',
        s2: 'Select several to change their type or hide them; GPX, FIT and Strava imports start here too.',
      },
      sleep: { s1: 'One row per night; open it for stages, heart rate and when you woke.' },
      ai: {
        s1: 'Your picked data is on the left: tap a card to change how many days it covers, or flick it away to leave it out.',
        s2: 'Write your question on the right; it is packed into one .md for the AI.',
        s3: 'Hold the lock in the middle to hand it off: the file lands on your clipboard, so pressing Ctrl+V in the AI chat box attaches it.',
        s3Auto: 'Want the pasting and sending done for you too? Turn on “Hand off to AI automatically” in the AI tools card in Settings.',
        s4: 'Tools like Claude Code and Codex can also read it directly over MCP, no copy and paste.',
      },
      plan: {
        s1: "Paste the AI's final reply back and it becomes a week's plan.",
        s2: 'Tap a day to fine-tune it on its own.',
        s3: 'Hold to send it to your watch; when you start the workout there, you still pick the sport type once more.',
        s4: 'Plans you have sent are kept here.',
      },
      journal: {
        s1: 'A whole year of activity on one page; open the rings to watch them grow.',
        s2: 'Personal bests from 5K to the marathon.',
        s3: 'Race countdowns and your medal wall.',
        s4: 'Shoe mileage, with a reminder when it’s time to retire a pair.',
        s5: 'One ring a year, bulging in the weeks you trained more; tap a fine line to see that workout.',
      },
      letters: {
        s1: 'Top-right mail icon: click to write to the author, or press and hold to open the letter box; a red dot marks new mail or replies.',
        s2: 'The author’s letters, one with each update, are kept here; open one to read it.',
        s3: '“Your letters” holds the weekly data letters and the ones you write to your future self; replies and stamps are in the last two.',
      },
      devices: {
        s1: 'One row per device; open one to correct its model, or hide it. Its data stays either way.',
        s2: 'See how far each data stream has synced and what is missing; it lives in the Advanced card in Settings.',
      },
      settings: {
        s1: 'Settings is a stack of cards; tap one to open it.',
        s2: 'Backup, restore and history backfill live here.',
        s3: 'MCP lets tools like Claude Code and Codex read your data on this computer directly (read-only, nothing goes online); the command-line tool is here too.',
      },
    },
    next: 'Next', prev: 'Back', done: 'Done', skip: 'Skip guide', gotIt: 'Got it', tryIt: 'Try it inside the frame',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: 'Sample data',
    sampleHint: 'The guide uses sample data; your library is untouched',
    welcomePick: 'Pick a language', welcomeStart: 'Show me around', welcomeSkip: 'Skip and start',
    inviteLater: 'Later',
    toolsText: 'Your AI tools still use the old ZeppBridge; reconnect them once', toolsGo: 'Reconnect',
    cardTitle: 'Guide',
    seenCount: (seen: number, total: number) => `${seen} of ${total} seen`,
    start: 'Start', look: 'Show', seenMark: 'Seen',
    resetAll: 'Show all tips again', resetAllDone: 'Done; each section will explain itself again next time you open it',
  },
  {
    chapter: {
      intro: 'Primeros pasos', home: 'Resumen', metric: 'Métricas y elegir días', workouts: 'Entrenamientos', sleep: 'Sueño', ai: 'Pasar a la IA',
      plan: 'Planes de entrenamiento', journal: 'Diario y anillos', letters: 'Buzón', devices: 'Dispositivos y estado de los datos', settings: 'Ajustes',
    },
    steps: {
      intro: {
        s1: 'Oscuro, claro o según el sistema. Pruébalo.',
        s2: 'Cambia de idioma cuando quieras; gira la rueda.',
        s3: 'Conecta tu cuenta de Zepp por dos vías: la autorización oficial primero y los datos avanzados para lo que le falta, como VFC, SpO₂ y estrés.',
        s4: 'Tus métricas de siempre quedan fijadas aquí; la línea de debajo es tu propio rango habitual, no el de otros.',
        s5: 'Tres pestañas arriba; el sueño, los entrenamientos y el diario se abren desde las tarjetas del Resumen.',
        s6: 'Aquí ves el estado de la sincronización; haz clic para sincronizar. Un anillo verde en el icono de arriba a la izquierda indica que hay una actualización.',
        s7: 'Icono de correo arriba a la derecha: haz clic para escribir al autor o mantén pulsado para abrir el buzón; un punto rojo avisa de cartas o respuestas nuevas.',
        s8: 'Cada sección se explica la primera vez que la abres; vuelve a esta tarjeta para verlo de nuevo.',
      },
      home: {
        s1: 'Reordena el resumen según lo que te interesa. Pruébalo.',
        s2: 'Cada panel se abre con un rango más largo y más detalle.',
        s3: 'Tras un entrenamiento del plan que enviaste al reloj, cuenta aquí cómo fue.',
        s4: 'Lo que una IA quiere recordar espera aquí hasta que digas que sí.',
        s5: 'Tu diario y tus anillos se abren desde aquí.',
      },
      metric: {
        s1: 'Elige un rango una vez y todas las páginas lo recuerdan.',
        s2: 'Toca «?» para ver qué es esta métrica y de dónde sale, o dejarla fuera del análisis.',
        s3: 'Desde aquí eliges unos días para pasárselos a una IA.',
        s4: 'Toca una carta para darle la vuelta y márcala, o arrástrala directo a la caja; toca un espacio vacío para recoger.',
      },
      workouts: {
        s1: 'Una fila por entrenamiento; ábrela para ver ritmo, pulso y recorrido, y anotar cómo te sentiste.',
        s2: 'Selecciona varios para cambiar el tipo u ocultarlos; aquí también importas GPX, FIT y Strava.',
      },
      sleep: { s1: 'Una fila por noche; ábrela para ver fases, pulso y cuándo te despertaste.' },
      ai: {
        s1: 'A la izquierda están tus datos elegidos: toca una carta para cambiar cuántos días abarca, o lánzala fuera para no incluirla.',
        s2: 'Escribe tu pregunta a la derecha; se empaqueta en un solo .md para la IA.',
        s3: 'Mantén pulsado el candado del centro para entregarlo: el archivo va al portapapeles y con Ctrl+V en el chat de la IA queda adjunto.',
        s3Auto: '¿Quieres que también se pegue y se envíe solo? Activa «Pasar a la IA automáticamente» en la tarjeta de herramientas de IA de Ajustes.',
        s4: 'Herramientas como Claude Code y Codex también pueden leerlo directamente por MCP, sin copiar y pegar.',
      },
      plan: {
        s1: 'Pega aquí la respuesta final de la IA y se convierte en el plan de la semana.',
        s2: 'Toca un día para ajustarlo por separado.',
        s3: 'Mantén pulsado para enviarlo al reloj; al empezar el entrenamiento allí aún eliges el tipo de deporte una vez más.',
        s4: 'Los planes que enviaste se guardan aquí.',
      },
      journal: {
        s1: 'Todo un año de actividad en una página; abre los anillos para verlos crecer.',
        s2: 'Mejores marcas personales, de 5 km al maratón.',
        s3: 'Cuenta atrás de carreras y tu muro de medallas.',
        s4: 'Kilometraje de las zapatillas, con aviso cuando toca retirarlas.',
        s5: 'Un anillo por año, más ancho en las semanas que entrenaste más; toca una línea fina para ver ese entrenamiento.',
      },
      letters: {
        s1: 'Icono de correo arriba a la derecha: haz clic para escribir al autor o mantén pulsado para abrir el buzón; un punto rojo avisa de cartas o respuestas nuevas.',
        s2: 'Aquí se guardan las cartas del autor, una con cada actualización; abre una para leerla.',
        s3: 'En «Tus cartas» están las cartas semanales de datos y las que escribes a tu yo futuro; las respuestas y los sellos, en las dos últimas.',
      },
      devices: {
        s1: 'Una fila por dispositivo; ábrelo para corregir el modelo u ocúltalo. Sus datos se quedan igual.',
        s2: 'Mira hasta dónde se sincronizó cada flujo de datos y qué falta; está en la tarjeta Avanzado de Ajustes.',
      },
      settings: {
        s1: 'Los ajustes son un mazo de tarjetas; toca una para abrirla.',
        s2: 'Aquí están las copias de seguridad, la restauración y la descarga del historial.',
        s3: 'MCP permite que herramientas como Claude Code y Codex lean tus datos de este ordenador directamente (solo lectura, nada sale a internet); aquí también está la herramienta de línea de comandos.',
      },
    },
    next: 'Siguiente', prev: 'Atrás', done: 'Listo', skip: 'Saltar guía', gotIt: 'Entendido', tryIt: 'Pruébalo dentro del marco',
    progress: (index: number, total: number) => `${index} / ${total}`,
    sample: 'Datos de ejemplo',
    sampleHint: 'La guía usa datos de ejemplo; tu biblioteca no se toca',
    welcomePick: 'Elige un idioma', welcomeStart: 'Muéstrame', welcomeSkip: 'Saltar y empezar',
    inviteLater: 'Más tarde',
    toolsText: 'Tus herramientas de IA siguen usando el ZeppBridge antiguo; vuelve a conectarlas', toolsGo: 'Reconectar',
    cardTitle: 'Guía',
    seenCount: (seen: number, total: number) => `${seen} de ${total} vistos`,
    start: 'Empezar', look: 'Ver', seenMark: 'Visto',
    resetAll: 'Volver a mostrar todo', resetAllDone: 'Listo; cada sección se explicará de nuevo la próxima vez que la abras',
  },
  'components/tour/tour',
);

/** 测试用：核对每一步都有文案。 */
export const tourMessages = messages;
export const useTourText = () => useMessages(messages);
