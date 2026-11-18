import { defineMessages } from '../../../i18n';

/**
 * 设置 › 数据 ›「推送到你自己的站点」（2026-11-18）：PA 推送的配置入口。
 * 写给第一次听说这件事的人：少讲原理，多给下一步；搭站点交给本地 AI（复制一段话过去）。
 * `aiPrompt` 是给 AI 看的整段话，按界面语言给，AI 会用同一种语言回答。
 */
export const pushMessages = defineMessages(
  {
    secTitle: '推送到你自己的站点',
    lead: '每次同步完，把数据加密后送到你自己的网站，给 Muse、Hark 这类 Personal Agent 和手机随时读。站点上只有密文，不会发给 ZeppBridge 或任何别人。',
    flowComputer: '这台电脑',
    flowLock: '加密',
    flowSite: '你的站点',
    flowReader: '手机 / AI',
    companionTitle: '这台电脑装过 ZeppBridge Cloud',
    companionGo: '一键接过来',
    companionDone: '接过来了，正在推送第一轮…',
    pathsTitle: '怎么开始',
    haveSite: '我已经有站点',
    fill: '去填写',
    noSite: '还没有站点',
    siteLabel: '站点地址',
    sitePlaceholder: 'example.com',
    siteHint: '只填域名会自动补成 https://health.你的域名',
    codeLabel: '连接码',
    codePlaceholder: '{"tenant": "…", "dk": "…", "writeKey": "zbw_…"}',
    codeHint: '搭站点时拿到的那一行，整段贴进来。存进系统凭据库，之后不会再显示。',
    codeKeep: '留空就继续用已经存好的连接码',
    save: '保存并推送一次',
    saving: '正在保存…',
    saved: '已保存',
    cancel: '取消',
    askTitle: '让本地 AI 带你搭一个',
    askSub: '复制这段话，粘给 Claude Code、Codex 这类能操作电脑的 AI。它会一步步带你做，最后交给你站点地址和连接码，回到这里填上。',
    askNeeds: '要准备：一个 Cloudflare 账号、一个自己的域名，大约 20 分钟。',
    copyPrompt: '复制给 AI 的话',
    copied: '已复制，去粘给你的 AI',
    copyFailed: '没能复制，请手动选中下面的文字',
    showPrompt: '看看这段话',
    aiPrompt: (language: string) => `你是我电脑上的助手。我在用 ZeppBridge（把 Zepp / Amazfit 健康数据存在本机的应用），想让它每次同步后把数据加密推送到我自己的网站，给手机和 Personal Agent 读。请一步一步带我把站点搭好。

请这样做：
- 每一步先用一两句话说清要做什么，等我说「好」再动手；需要我登录、付钱或点确认的地方停下来，让我自己来。
- 用${language}和我说话，我不是程序员，少用术语。

要做到的结果：
1. 用 ZeppBridge Cloud 的站点模板（ZeppBridge-Cloud 仓库里的 worker/ 文件夹，是一个 Cloudflare Worker）部署一个站点，地址是 https://health.<我的域名>。这需要一个 Cloudflare 账号和一个放在 Cloudflare 上的域名；我没有的话，先告诉我怎么注册、大概花多少钱。
2. 在 ZeppBridge-Cloud 文件夹里运行 node uploader/keys.mjs init。它会输出一行 JSON，里面有 tenant、dk、writeKey、readKey。
3. 最后只给我两样东西，原样贴出来，方便我复制进 ZeppBridge：
   - 站点地址（health.<我的域名>）
   - 连接码：上一步那行完整的 JSON
   另外单独告诉我 readKey 是只读钥匙，以后给手机或 Personal Agent 读数据用。

注意：
- 连接码和钥匙等于密码：不要写进任何文件、不要提交到 GitHub、不要发给别人。
- 不要改动 ZeppBridge 自己的文件和数据库。
- 如果找不到 ZeppBridge Cloud 的站点模板，直接告诉我，不要自己另写一个替代品——加密格式必须和 ZeppBridge 一致。`,
    promptLanguage: '中文',
    enabled: '同步后自动推送',
    enabledSub: '关掉就暂停，设置都留着',
    statusOn: '已开启',
    statusOff: '已暂停',
    statusNoKey: '缺连接码，推不出去',
    statusBroken: '推送配置读不了',
    never: '还没推送过',
    lastOk: (when: string, count: number) => `${when} 推送了 ${count} 项`,
    lastUnchanged: (when: string) => `${when} 检查过，没有新内容`,
    lastLocked: (when: string) => `${when} 上一轮还没结束，这次跳过`,
    lastFailed: (when: string) => `${when} 推送失败`,
    pushNow: '立即推送',
    pushing: '正在推送…',
    change: '换站点或连接码',
    remove: '移除',
    removeConfirm: '再点一次确认移除（站点上的数据不会删）',
    removed: '已移除',
    tasksTitle: 'ZeppBridge Cloud 的计划任务还在',
    tasksSub: '现在由 ZeppBridge 自己推送，那两个计划任务再跑就是重复上传。复制命令，粘进 PowerShell 运行就能删掉。',
    copyTasks: '复制删除命令',
    tasksCopied: '已复制，粘进 PowerShell 运行',
    failed: '没做成，再试一次',
  },
  {
    secTitle: 'Push to your own site',
    lead: 'After every sync, your data is encrypted and sent to your own website, so Personal Agents like Muse and Hark — and your phone — can read it any time. The site only ever holds ciphertext; nothing goes to ZeppBridge or anyone else.',
    flowComputer: 'This computer',
    flowLock: 'Encrypt',
    flowSite: 'Your site',
    flowReader: 'Phone / AI',
    companionTitle: 'ZeppBridge Cloud is set up on this computer',
    companionGo: 'Take it over',
    companionDone: 'Taken over. Sending the first round…',
    pathsTitle: 'How to start',
    haveSite: 'I already have a site',
    fill: 'Fill in',
    noSite: "I don't have a site yet",
    siteLabel: 'Site address',
    sitePlaceholder: 'example.com',
    siteHint: 'A bare domain becomes https://health.your-domain',
    codeLabel: 'Connection code',
    codePlaceholder: '{"tenant": "…", "dk": "…", "writeKey": "zbw_…"}',
    codeHint: 'The one line you got when the site was set up. Paste all of it. It goes into the system credential store and is never shown again.',
    codeKeep: 'Leave empty to keep the connection code already saved',
    save: 'Save and push once',
    saving: 'Saving…',
    saved: 'Saved',
    cancel: 'Cancel',
    askTitle: 'Let your local AI set one up',
    askSub: 'Copy this message and paste it into an AI that can use your computer, such as Claude Code or Codex. It walks you through every step and ends by giving you a site address and a connection code to fill in here.',
    askNeeds: 'You need a Cloudflare account and a domain of your own. About 20 minutes.',
    copyPrompt: 'Copy the message for your AI',
    copied: 'Copied. Paste it into your AI',
    copyFailed: "Couldn't copy. Select the text below by hand",
    showPrompt: 'Read the message',
    aiPrompt: (language: string) => `You are the assistant on my computer. I use ZeppBridge (an app that keeps my Zepp / Amazfit health data on this computer) and I want it to push that data, encrypted, to my own website after every sync, so my phone and my Personal Agent can read it. Please walk me through setting up the site, one step at a time.

How to work with me:
- Before each step, say in a sentence or two what you are about to do, and wait for my OK. Stop whenever I need to sign in, pay or confirm something, and let me do it myself.
- Talk to me in ${language}. I am not a programmer, so keep jargon to a minimum.

What we need to end up with:
1. A site deployed from the ZeppBridge Cloud site template (the worker/ folder of the ZeppBridge-Cloud repository, a Cloudflare Worker) at https://health.<my domain>. This needs a Cloudflare account and a domain on Cloudflare; if I have neither, first tell me how to sign up and roughly what it costs.
2. Run node uploader/keys.mjs init in the ZeppBridge-Cloud folder. It prints one line of JSON containing tenant, dk, writeKey and readKey.
3. At the end, give me exactly two things, pasted as they are so I can copy them into ZeppBridge:
   - the site address (health.<my domain>)
   - the connection code: the whole JSON line from step 2
   Separately, tell me that readKey is a read-only key I can later give to my phone or Personal Agent.

Rules:
- The connection code and the keys are passwords: never write them into files, never commit them to GitHub, never send them to anyone.
- Do not change any of ZeppBridge's own files or its database.
- If you cannot find the ZeppBridge Cloud site template, tell me so. Do not write a replacement yourself: the encryption format has to match ZeppBridge exactly.`,
    promptLanguage: 'English',
    enabled: 'Push after every sync',
    enabledSub: 'Turn off to pause; your settings stay',
    statusOn: 'On',
    statusOff: 'Paused',
    statusNoKey: 'Connection code missing, nothing can be sent',
    statusBroken: "The push settings can't be read",
    never: 'Not pushed yet',
    lastOk: (when: string, count: number) => `${when}: pushed ${count} ${count === 1 ? 'item' : 'items'}`,
    lastUnchanged: (when: string) => `${when}: checked, nothing new`,
    lastLocked: (when: string) => `${when}: the previous round was still running, skipped`,
    lastFailed: (when: string) => `${when}: push failed`,
    pushNow: 'Push now',
    pushing: 'Pushing…',
    change: 'Change site or code',
    remove: 'Remove',
    removeConfirm: 'Click again to remove (data on the site is kept)',
    removed: 'Removed',
    tasksTitle: "ZeppBridge Cloud's scheduled tasks are still there",
    tasksSub: 'ZeppBridge pushes by itself now, so those two scheduled tasks would only upload everything a second time. Copy the command and run it in PowerShell to delete them.',
    copyTasks: 'Copy the delete command',
    tasksCopied: 'Copied. Run it in PowerShell',
    failed: "That didn't work. Try again",
  },
  {
    secTitle: 'Enviar a tu propio sitio',
    lead: 'Tras cada sincronización, tus datos se cifran y se envían a tu propio sitio web para que Personal Agents como Muse y Hark —y tu móvil— puedan leerlos en cualquier momento. El sitio solo almacena texto cifrado; nada va a ZeppBridge ni a nadie más.',
    flowComputer: 'Este equipo',
    flowLock: 'Cifrar',
    flowSite: 'Tu sitio',
    flowReader: 'Móvil / IA',
    companionTitle: 'ZeppBridge Cloud está configurado en este equipo',
    companionGo: 'Importar',
    companionDone: 'Importado. Enviando la primera ronda…',
    pathsTitle: 'Cómo empezar',
    haveSite: 'Ya tengo un sitio',
    fill: 'Rellenar',
    noSite: 'Aún no tengo sitio',
    siteLabel: 'Dirección del sitio',
    sitePlaceholder: 'example.com',
    siteHint: 'Si pones solo el dominio, se completa a https://health.tu-dominio',
    codeLabel: 'Código de conexión',
    codePlaceholder: '{"tenant": "…", "dk": "…", "writeKey": "zbw_…"}',
    codeHint: 'La línea que obtuviste al montar el sitio. Pégala entera. Se guarda en el almacén de credenciales del sistema y no se vuelve a mostrar.',
    codeKeep: 'Déjalo vacío para seguir usando el código guardado',
    save: 'Guardar y enviar una vez',
    saving: 'Guardando…',
    saved: 'Guardado',
    cancel: 'Cancelar',
    askTitle: 'Deja que tu IA local te ayude a montarlo',
    askSub: 'Copia este mensaje y pégalo en una IA que pueda usar tu equipo, como Claude Code o Codex. Te guiará paso a paso y al final te dará la dirección del sitio y el código de conexión para rellenarlos aquí.',
    askNeeds: 'Necesitas una cuenta de Cloudflare y un dominio propio. Unos 20 minutos.',
    copyPrompt: 'Copiar mensaje para IA',
    copied: 'Copiado. Pégalo en tu IA',
    copyFailed: 'No se pudo copiar. Selecciona el texto de abajo a mano',
    showPrompt: 'Leer el mensaje',
    aiPrompt: (language: string) => `Eres el asistente de mi equipo. Uso ZeppBridge (una aplicación que guarda mis datos de salud de Zepp / Amazfit en este equipo) y quiero que, tras cada sincronización, envíe esos datos cifrados a mi propio sitio web para que mi móvil y mi Personal Agent puedan leerlos. Guíame paso a paso para montar el sitio.

Cómo trabajar conmigo:
- Antes de cada paso, dime en una o dos frases qué vamos a hacer y espera mi confirmación. Detente cada vez que tenga que iniciar sesión, pagar o confirmar algo, y déjame hacerlo a mí.
- Háblame en ${language}. No soy programador, así que evita la jerga técnica en lo posible.

Lo que necesitamos conseguir al final:
1. Un sitio desplegado desde la plantilla de ZeppBridge Cloud (la carpeta worker/ del repositorio ZeppBridge-Cloud, un Cloudflare Worker) en https://health.<mi dominio>. Esto requiere una cuenta de Cloudflare y un dominio en Cloudflare; si no tengo ninguno, dime primero cómo registrarme y cuánto cuesta aproximadamente.
2. Ejecutar node uploader/keys.mjs init en la carpeta ZeppBridge-Cloud. Imprimirá una línea JSON con tenant, dk, writeKey y readKey.
3. Al final, dame exactamente dos cosas, tal cual para copiarlas en ZeppBridge:
   - la dirección del sitio (health.<mi dominio>)
   - el código de conexión: la línea JSON completa del paso 2
   Por separado, indícame que readKey es una clave de solo lectura que luego puedo dar a mi móvil o a mi Personal Agent.

Reglas:
- El código de conexión y las claves son contraseñas: nunca los guardes en archivos, nunca los subas a GitHub y nunca se los envíes a nadie.
- No modifiques ningún archivo propio de ZeppBridge ni su base de datos.
- Si no encuentras la plantilla de ZeppBridge Cloud, dímelo. No escribas un reemplazo por tu cuenta: el formato de cifrado debe coincidir exactamente con ZeppBridge.`,
    promptLanguage: 'Español',
    enabled: 'Enviar tras cada sincronización',
    enabledSub: 'Apágalo para pausar; la configuración se conserva',
    statusOn: 'Activado',
    statusOff: 'En pausa',
    statusNoKey: 'Falta el código de conexión; no se puede enviar nada',
    statusBroken: 'No se puede leer la configuración de envío',
    never: 'Aún no se ha enviado nada',
    lastOk: (when: string, count: number) => `${when}: ${count} ${count === 1 ? 'elemento enviado' : 'elementos enviados'}`,
    lastUnchanged: (when: string) => `${when}: revisado, nada nuevo`,
    lastLocked: (when: string) => `${when}: la ronda anterior seguía en curso, omitida`,
    lastFailed: (when: string) => `${when}: error al enviar`,
    pushNow: 'Enviar ahora',
    pushing: 'Enviando…',
    change: 'Cambiar sitio o código',
    remove: 'Quitar',
    removeConfirm: 'Pulsa otra vez para quitar (se conservan los datos del sitio)',
    removed: 'Quitado',
    tasksTitle: 'Las tareas programadas de ZeppBridge Cloud siguen ahí',
    tasksSub: 'Ahora ZeppBridge envía por sí mismo, así que esas dos tareas solo volverían a subirlo todo. Copia el comando y ejecútalo en PowerShell para eliminarlas.',
    copyTasks: 'Copiar comando de borrado',
    tasksCopied: 'Copiado. Ejecútalo en PowerShell',
    failed: 'No funcionó. Inténtalo de nuevo',
  },
  'views/settings/sections/push',
);
