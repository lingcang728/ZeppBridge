// 授权流程里浏览器能看到的两类页面：授权前的说明页、授权后的结果页。
//
// 只放固定文案：code、state、令牌、Zepp 的错误描述一律不回显。唯一的动态内容是
// 说明页上「前往 Zepp 授权」那个链接，它由服务端自己拼出（App ID + state），
// 并经过 HTML 转义。语言按 Accept-Language 选中文或英文。

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const escapeHtml = (text) => String(text)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const pageLanguage = (request) => {
  const header = request?.headers?.get?.('accept-language') ?? '';
  if (/^\s*zh\b/i.test(header)) return 'zh';
  if (/^\s*es\b/i.test(header)) return 'es';
  if (/^\s*de\b/i.test(header)) return 'de';
  if (/^\s*fr\b/i.test(header)) return 'fr';
  if (/^\s*nl\b/i.test(header)) return 'nl';
  if (/^\s*pt-pt\b/i.test(header)) return 'pt-PT';
  if (/^\s*pt\b/i.test(header)) return 'pt-BR';
  if (/^\s*ru\b/i.test(header)) return 'ru';
  if (/^\s*hi\b/i.test(header)) return 'hi-IN';
  return 'en';
};

const COPY = {
  zh: {
    brand: 'ZeppBridge',
    steps: ['在 Zepp 官方页面登录', '同意 ZeppBridge 读取数据', '回到 ZeppBridge'],
    start: {
      title: '用 Zepp 账号授权 ZeppBridge',
      lead: 'ZeppBridge 把你的 Zepp 健康数据保存到你自己的电脑上。下一步会打开 Zepp 官方授权页（user.zepp.com），账号和密码只交给 Zepp。',
      notes: [
        '浏览器已经登录过 Zepp 的话，会直接显示「同意授权」这一步。',
        '想换一个账号（比如用 Google、小米、Facebook、Apple 登录）：回到 ZeppBridge 点「复制授权链接」，在浏览器的无痕窗口里打开。',
      ],
      action: '前往 Zepp 授权',
      fine: '授权后可以随时在 ZeppBridge 的设置里断开。',
    },
    ready: { title: '授权成功', lead: '回到 ZeppBridge，它会在几秒内自动完成连接。这个页面可以关掉了。' },
    denied: { title: '授权已取消', lead: '你没有同意授权，ZeppBridge 什么也没拿到。需要时可以在应用里重新发起。' },
    expired: { title: '这次授权已过期', lead: '授权链接只能用一次，并且 10 分钟后失效。请回到 ZeppBridge 重新点一次「授权」。' },
    failed: { title: '授权没有完成', lead: 'Zepp 没有接受这次授权，ZeppBridge 什么也没保存。请回到应用重试。' },
  },
  en: {
    brand: 'ZeppBridge',
    steps: ['Sign in on Zepp’s own page', 'Allow ZeppBridge to read data', 'Back to ZeppBridge'],
    start: {
      title: 'Authorize ZeppBridge with your Zepp account',
      lead: 'ZeppBridge keeps your Zepp health data on your own computer. Next you will see Zepp’s official authorization page (user.zepp.com); your account and password go only to Zepp.',
      notes: [
        'If this browser is already signed in to Zepp, it goes straight to the consent step.',
        'To use a different account (for example Google, Xiaomi, Facebook or Apple sign-in), go back to ZeppBridge, click “Copy authorization link” and open it in a private window.',
      ],
      action: 'Continue to Zepp',
      fine: 'You can disconnect at any time in ZeppBridge settings.',
    },
    ready: { title: 'Authorized', lead: 'Go back to ZeppBridge — it finishes connecting by itself within a few seconds. You can close this page.' },
    denied: { title: 'Authorization cancelled', lead: 'You did not grant access, so ZeppBridge received nothing. You can start again from the app.' },
    expired: { title: 'This authorization expired', lead: 'An authorization link works once and expires after 10 minutes. Go back to ZeppBridge and click “Authorize” again.' },
    failed: { title: 'Authorization not completed', lead: 'Zepp did not accept this authorization, so nothing was saved. Go back to the app and try again.' },
  },
  es: {
    brand: 'ZeppBridge',
    steps: ['Inicia sesión en la página oficial de Zepp', 'Permite a ZeppBridge leer los datos', 'Vuelve a ZeppBridge'],
    start: {
      title: 'Autoriza ZeppBridge con tu cuenta de Zepp',
      lead: 'ZeppBridge guarda tus datos de salud de Zepp en tu propio ordenador. El siguiente paso abrirá la página oficial de autorización de Zepp (user.zepp.com); tu cuenta y contraseña solo se envían a Zepp.',
      notes: [
        'Si este navegador ya ha iniciado sesión en Zepp, pasará directamente al paso de consentimiento.',
        'Para cambiar de cuenta (por ejemplo, iniciar sesión con Google, Xiaomi, Facebook o Apple): vuelve a ZeppBridge, haz clic en «Copiar enlace de autorización» y ábrelo en una ventana de incógnito.',
      ],
      action: 'Continuar a Zepp',
      fine: 'Puedes desconectar la cuenta en cualquier momento desde los ajustes de ZeppBridge.',
    },
    ready: { title: 'Autorización correcta', lead: 'Vuelve a ZeppBridge: la conexión se completará automáticamente en unos segundos. Ya puedes cerrar esta página.' },
    denied: { title: 'Autorización cancelada', lead: 'No concediste el acceso, por lo que ZeppBridge no recibió nada. Puedes reiniciar el proceso desde la aplicación.' },
    expired: { title: 'Esta autorización ha caducado', lead: 'El enlace solo es válido una vez y caduca tras 10 minutos. Vuelve a ZeppBridge y haz clic en «Autorizar» de nuevo.' },
    failed: { title: 'Autorización no completada', lead: 'Zepp no aceptó la autorización y ZeppBridge no guardó nada. Vuelve a la aplicación y prueba de nuevo.' },
  },
  de: {
    brand: 'ZeppBridge',
    steps: ['Auf der offiziellen Zepp-Seite anmelden', 'ZeppBridge Datenzugriff gewähren', 'Zurück zu ZeppBridge'],
    start: {
      title: 'ZeppBridge mit deinem Zepp-Konto autorisieren',
      lead: 'ZeppBridge speichert deine Zepp-Gesundheitsdaten auf deinem eigenen Computer. Als Nächstes öffnet sich die offizielle Zepp-Autorisierungsseite (user.zepp.com); Konto und Passwort gehen nur an Zepp.',
      notes: [
        'Wenn du in diesem Browser bereits bei Zepp angemeldet bist, wird direkt der Bestätigungsschritt angezeigt.',
        'Um ein anderes Konto zu verwenden (z. B. Anmeldung mit Google, Xiaomi, Facebook oder Apple): Gehe zurück zu ZeppBridge, klicke auf „Autorisierungslink kopieren“ und öffne ihn in einem privaten Fenster.',
      ],
      action: 'Weiter zu Zepp',
      fine: 'Du kannst die Verbindung in den Einstellungen von ZeppBridge jederzeit trennen.',
    },
    ready: { title: 'Erfolgreich autorisiert', lead: 'Kehre zu ZeppBridge zurück — die Verbindung wird in wenigen Sekunden automatisch hergestellt. Du kannst diese Seite schließen.' },
    denied: { title: 'Autorisierung abgebrochen', lead: 'Du hast den Zugriff nicht erlaubt; ZeppBridge hat keine Daten empfangen. Du kannst den Vorgang in der App erneut starten.' },
    expired: { title: 'Autorisierung abgelaufen', lead: 'Der Link ist nur einmal gültig und verfällt nach 10 Minuten. Gehe zurück zu ZeppBridge und klicke erneut auf „Autorisieren“.' },
    failed: { title: 'Autorisierung nicht abgeschlossen', lead: 'Zepp hat die Autorisierung nicht akzeptiert; ZeppBridge hat nichts gespeichert. Bitte versuche es in der App erneut.' },
  },
  fr: {
    brand: 'ZeppBridge',
    steps: ['Connectez-vous sur la page officielle de Zepp', 'Autorisez ZeppBridge à lire les données', 'Revenez à ZeppBridge'],
    start: {
      title: 'Autoriser ZeppBridge avec votre compte Zepp',
      lead: 'ZeppBridge conserve vos données de santé Zepp sur votre propre ordinateur. L’étape suivante ouvre la page officielle d’autorisation Zepp (user.zepp.com) ; votre identifiant et votre mot de passe ne sont transmis qu’à Zepp.',
      notes: [
        'Si ce navigateur est déjà connecté à Zepp, l’étape de consentement s’affiche directement.',
        'Pour changer de compte (par exemple avec Google, Xiaomi, Facebook ou Apple) : retournez dans ZeppBridge, cliquez sur « Copier le lien d’autorisation » et ouvrez-le dans une fenêtre privée.',
      ],
      action: 'Continuer vers Zepp',
      fine: 'Vous pouvez vous déconnecter à tout moment dans les réglages de ZeppBridge.',
    },
    ready: { title: 'Autorisation réussie', lead: 'Retournez dans ZeppBridge : la connexion se termine automatiquement en quelques secondes. Vous pouvez fermer cette page.' },
    denied: { title: 'Autorisation annulée', lead: 'Vous n’avez pas accordé l’accès, ZeppBridge n’a rien reçu. Vous pouvez relancer la demande depuis l’application.' },
    expired: { title: 'Cette autorisation a expiré', lead: 'Le lien d’autorisation est à usage unique et expire après 10 minutes. Retournez dans ZeppBridge et cliquez à nouveau sur « Autoriser ».' },
    failed: { title: 'Autorisation non terminée', lead: 'Zepp n’a pas accepté cette autorisation, rien n’a été enregistré. Veuillez réessayer depuis l’application.' },
  },
  nl: {
    brand: 'ZeppBridge',
    steps: ['Inloggen op de officiële Zepp-pagina', 'ZeppBridge toestemming geven gegevens te lezen', 'Terug naar ZeppBridge'],
    start: {
      title: 'ZeppBridge autoriseren met je Zepp-account',
      lead: 'ZeppBridge bewaart je Zepp-gezondheidsgegevens op je eigen computer. De volgende stap opent de officiële Zepp-autorisatiepagina (user.zepp.com); je account en wachtwoord gaan alleen naar Zepp.',
      notes: [
        'Als deze browser al is ingelogd bij Zepp, wordt direct de toestemmingsstap getoond.',
        'Om een ander account te gebruiken (bijvoorbeeld Google-, Xiaomi-, Facebook- of Apple-aanmelding): ga terug naar ZeppBridge, klik op «Autorisatielink kopiëren» en open deze in een incognitovenster.',
      ],
      action: 'Doorgaan naar Zepp' ,
      fine: 'Je kunt de koppeling op elk moment verbreken in de instellingen van ZeppBridge.',
    },
    ready: { title: 'Autorisatie geslaagd', lead: 'Ga terug naar ZeppBridge — de verbinding wordt binnen enkele seconden automatisch voltooid. Je kunt deze pagina sluiten.' },
    denied: { title: 'Autorisatie geannuleerd', lead: 'Je hebt geen toegang verleend, dus ZeppBridge heeft niets ontvangen. Je kunt het opnieuw starten vanuit de app.' },
    expired: { title: 'Deze autorisatie is verlopen', lead: 'De link werkt eenmalig en verloopt na 10 minuten. Ga terug naar ZeppBridge en klik opnieuw op «Autoriseren».' },
    failed: { title: 'Autorisatie niet voltooid', lead: 'Zepp heeft deze autorisatie niet geaccepteerd; er is niets opgeslagen. Probeer het opnieuw in de app.' },
  },
  'pt-BR': {
    brand: 'ZeppBridge',
    steps: ['Entrar na página oficial da Zepp', 'Permitir que o ZeppBridge leia os dados', 'Voltar ao ZeppBridge'],
    start: {
      title: 'Autorizar o ZeppBridge com sua conta Zepp',
      lead: 'O ZeppBridge mantém seus dados de saúde da Zepp no seu próprio computador. A próxima etapa abrirá a página oficial de autorização da Zepp (user.zepp.com); sua conta e senha vão apenas para a Zepp.',
      notes: [
        'Se este navegador já estiver conectado à Zepp, irá direto para a etapa de consentimento.',
        'Para usar outra conta (por exemplo, login com Google, Xiaomi, Facebook ou Apple): volte ao ZeppBridge, clique em “Copiar link de autorização” e abra-o em uma janela anônima.',
      ],
      action: 'Continuar para a Zepp',
      fine: 'Você pode desconectar a qualquer momento nas configurações do ZeppBridge.',
    },
    ready: { title: 'Autorização concluída', lead: 'Volte ao ZeppBridge — a conexão será concluída automaticamente em alguns segundos. Você pode fechar esta página.' },
    denied: { title: 'Autorização cancelada', lead: 'Você não concedeu acesso, então o ZeppBridge não recebeu nada. Você pode iniciar novamente pelo aplicativo.' },
    expired: { title: 'Esta autorização expirou', lead: 'O link funciona apenas uma vez e expira após 10 minutos. Volte ao ZeppBridge e clique em “Autorizar” novamente.' },
    failed: { title: 'Autorização não concluída', lead: 'A Zepp não aceitou esta autorização, então nada foi salvo. Volte ao aplicativo e tente novamente.' },
  },
  'pt-PT': {
    brand: 'ZeppBridge',
    steps: ['Iniciar sessão na página oficial da Zepp', 'Permitir que o ZeppBridge leia os dados', 'Voltar ao ZeppBridge'],
    start: {
      title: 'Autorizar o ZeppBridge com a tua conta Zepp',
      lead: 'O ZeppBridge guarda os teus dados de saúde da Zepp no teu próprio computador. A etapa seguinte abrirá a página oficial de autorização da Zepp (user.zepp.com); a tua conta e palavra-passe vão apenas para a Zepp.',
      notes: [
        'Se este navegador já tiver sessão iniciada na Zepp, avança diretamente para a confirmação.',
        'Para mudar de conta (por exemplo, início de sessão com Google, Xiaomi, Facebook ou Apple): volta ao ZeppBridge, clica em «Copiar ligação de autorização» e abre-a numa janela privada.',
      ],
      action: 'Continuar para a Zepp',
      fine: 'Podes desligar a ligação a qualquer momento nas definições do ZeppBridge.',
    },
    ready: { title: 'Autorização concluída', lead: 'Volta ao ZeppBridge — a ligação conclui-se automaticamente em alguns segundos. Podes fechar esta página.' },
    denied: { title: 'Autorização cancelada', lead: 'Não concedeste acesso, pelo que o ZeppBridge não recebeu nada. Podes reiniciar o processo a partir da aplicação.' },
    expired: { title: 'Esta autorização expirou', lead: 'A ligação só funciona uma vez e expira após 10 minutos. Volta ao ZeppBridge e clica novamente em «Autorizar».' },
    failed: { title: 'Autorização não concluída', lead: 'A Zepp não aceitou esta autorização, pelo que nada foi guardado. Volta à aplicação e tenta novamente.' },
  },
  ru: {
    brand: 'ZeppBridge',
    steps: ['Войдите на официальной странице Zepp', 'Разрешите ZeppBridge чтение данных', 'Вернитесь в ZeppBridge'],
    start: {
      title: 'Авторизация ZeppBridge через аккаунт Zepp',
      lead: 'ZeppBridge сохраняет данные о здоровье из Zepp на вашем компьютере. Следующий шаг откроет официальную страницу авторизации Zepp (user.zepp.com); логин и пароль передаются только Zepp.',
      notes: [
        'Если в этом браузере уже выполнен вход в Zepp, откроется сразу шаг подтверждения доступа.',
        'Чтобы сменить аккаунт (например, войти через Google, Xiaomi, Facebook или Apple): вернитесь в ZeppBridge, нажмите «Копировать ссылку авторизации» и откройте её в приватном окне браузера.',
      ],
      action: 'Перейти в Zepp',
      fine: 'Вы можете отключить аккаунт в любое время в настройках ZeppBridge.'
    },
    ready: { title: 'Авторизация успешна', lead: 'Вернитесь в ZeppBridge — подключение завершится автоматически в течение нескольких секунд. Эту страницу можно закрыть.' },
    denied: { title: 'Авторизация отменена', lead: 'Вы не предоставили доступ, поэтому ZeppBridge ничего не получил. При необходимости можно начать заново в приложении.' },
    expired: { title: 'Срок действия ссылки истек', lead: 'Ссылка авторизации одноразовая и действует 10 минут. Вернитесь в ZeppBridge и нажмите «Авторизовать» еще раз.' },
    failed: { title: 'Авторизация не завершена', lead: 'Zepp не принял эту авторизацию, ZeppBridge ничего не сохранил. Пожалуйста, вернитесь в приложение и повторите попытку.' },
  },
  'hi-IN': {
    brand: 'ZeppBridge',
    steps: ['Zepp के आधिकारिक पृष्ठ पर साइन इन करें', 'ZeppBridge को डेटा पढ़ने की अनुमति दें', 'ZeppBridge पर वापस आएँ'],
    start: {
      title: 'अपने Zepp खाते से ZeppBridge को अधिकृत करें',
      lead: 'ZeppBridge आपके Zepp स्वास्थ्य डेटा को आपके अपने कंप्यूटर पर सहेजता है। अगला कदम Zepp का आधिकारिक प्राधिकरण पृष्ठ (user.zepp.com) खोलेगा; खाता और पासवर्ड केवल Zepp को जाता है।',
      notes: [
        'यदि इस ब्राउज़र में Zepp में पहले से साइन इन है, तो यह सीधे सहमति चरण पर जाएगा।',
        'किसी भिन्न खाते का उपयोग करने के लिए (उदाहरण के लिए Google, Xiaomi, Facebook या Apple साइन-इन): ZeppBridge पर वापस जाएँ, "प्राधिकरण लिंक कॉपी करें" पर क्लिक करें और इसे एक निजी विंडो में खोलें।',
      ],
      action: 'Zepp पर जारी रखें',
      fine: 'आप ZeppBridge सेटिंग्स में किसी भी समय डिस्कनेक्ट कर सकते हैं।',
    },
    ready: { title: 'अधिकृत किया गया', lead: 'ZeppBridge पर वापस जाएँ — यह कुछ ही सेकंड में अपने आप कनेक्ट होना समाप्त कर लेता है। आप इस पृष्ठ को बंद कर सकते हैं।' },
    denied: { title: 'प्राधिकरण रद्द किया गया', lead: 'आपने पहुँच की अनुमति नहीं दी, इसलिए ZeppBridge को कुछ नहीं मिला। आप ऐप से फिर से शुरू कर सकते हैं।' },
    expired: { title: 'यह प्राधिकरण समाप्त हो गया', lead: 'प्राधिकरण लिंक एक बार काम करता है और 10 मिनट के बाद समाप्त हो जाता है। ZeppBridge पर वापस जाएँ और फिर से "अधिकृत करें" पर क्लिक करें।' },
    failed: { title: 'प्राधिकरण पूरा नहीं हुआ', lead: 'Zepp ने इस प्राधिकरण को स्वीकार नहीं किया, इसलिए कुछ भी सहेजा नहीं गया। कृपया ऐप पर वापस जाएँ और पुनः प्रयास करें।' },
  },
};

const STYLE = `
:root{color-scheme:dark;--bg:#0b0f0c;--ink:#eef4ef;--muted:#a9b6ad;--subtle:#76857b;--line:rgba(255,255,255,.08);
--glass:rgba(22,30,25,.72);--accent:#9ad46a;--accent-ink:#0d1a07;--warn:#f0b35a;--bad:#ef7b6e}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#eef3ee;--ink:#122018;--muted:#46564b;--subtle:#6f7e73;
--line:rgba(10,30,15,.1);--glass:rgba(255,255,255,.78);--accent:#3f8f22;--accent-ink:#fff}
main{box-shadow:0 24px 60px rgba(20,40,25,.12)!important}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--ink);
font:16px/1.65 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;overflow-x:hidden}
body::before{content:"";position:fixed;inset:-20%;background:radial-gradient(40% 35% at 30% 20%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%),
radial-gradient(35% 30% at 80% 85%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 70%);filter:blur(40px);z-index:-1;animation:drift 18s ease-in-out infinite alternate}
@keyframes drift{to{transform:translate3d(3%,-2%,0) scale(1.05)}}
main{width:min(34rem,100%);padding:36px 32px 30px;border:1px solid var(--line);border-radius:28px;background:var(--glass);
backdrop-filter:blur(24px) saturate(1.3);-webkit-backdrop-filter:blur(24px) saturate(1.3);box-shadow:0 30px 80px rgba(0,0,0,.35);
animation:rise .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.98);filter:blur(6px)}}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:26px;color:var(--muted);font-weight:600;letter-spacing:.01em}
.brand img{width:44px;height:44px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.badge{display:grid;place-items:center;width:56px;height:56px;border-radius:18px;margin-bottom:18px;font-size:26px;font-weight:700}
.badge.ok{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
.badge.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.badge.bad{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.badge svg{width:28px;height:28px}
.badge.ok path{stroke-dasharray:24;stroke-dashoffset:24;animation:draw .5s .25s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}
h1{margin:0 0 10px;font-size:1.55rem;line-height:1.3;letter-spacing:-.01em}
p{margin:0 0 12px;color:var(--muted)}
ol{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:22px 0;padding:0;counter-reset:s}
ol li{counter-increment:s;padding:12px 10px 10px;border:1px solid var(--line);border-radius:16px;font-size:.84rem;color:var(--muted);line-height:1.4}
ol li::before{content:counter(s);display:grid;place-items:center;width:22px;height:22px;margin-bottom:8px;border-radius:50%;
background:color-mix(in srgb,var(--accent) 20%,transparent);color:var(--accent);font-weight:700;font-size:.78rem}
.notes{margin:0 0 22px;padding:14px 16px;border-radius:16px;background:color-mix(in srgb,var(--ink) 5%,transparent);font-size:.9rem}
.notes p{margin:0 0 6px;font-size:.9rem}.notes p:last-child{margin:0}
a.go{display:flex;justify-content:center;align-items:center;gap:8px;padding:14px 18px;border-radius:16px;background:var(--accent);
color:var(--accent-ink);font-weight:700;text-decoration:none;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
a.go:hover{transform:translateY(-1px);box-shadow:0 12px 30px color-mix(in srgb,var(--accent) 35%,transparent)}
a.go:active{transform:translateY(1px) scale(.99)}
.fine{margin:14px 0 0;text-align:center;font-size:.82rem;color:var(--subtle)}
@media (max-width:480px){main{padding:28px 20px 24px}ol{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const BADGES = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  warn: '!',
  bad: '×',
};

const HTML_LANG = {
  zh: 'zh-CN', en: 'en', es: 'es', de: 'de', fr: 'fr', nl: 'nl',
  'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT', ru: 'ru', 'hi-IN': 'hi-IN',
};

function shell(lang, title, body, status) {
  const html = `<!doctype html><html lang="${HTML_LANG[lang] ?? 'en'}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${escapeHtml(title)} · ZeppBridge</title><style>${STYLE}</style></head><body><main>`
    + `<div class="brand"><img src="/zeppbridge-icon.png" alt="" width="44" height="44">${COPY[lang].brand}</div>`
    + `${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
  });
}

/** 授权前的说明页：说清连的是什么、下一步去哪、怎么换账号。 */
export function startPage(request, authorizeUrl) {
  const lang = pageLanguage(request);
  const copy = COPY[lang];
  const body = `<h1>${copy.start.title}</h1><p>${copy.start.lead}</p>`
    + `<ol>${copy.steps.map((step) => `<li>${step}</li>`).join('')}</ol>`
    + `<div class="notes">${copy.start.notes.map((note) => `<p>${note}</p>`).join('')}</div>`
    + `<a class="go" href="${escapeHtml(authorizeUrl)}" rel="noreferrer">${copy.start.action} →</a>`
    + `<p class="fine">${copy.start.fine}</p>`;
  return shell(lang, copy.start.title, body, 200);
}

const TONES = { ready: 'ok', denied: 'warn', expired: 'warn', failed: 'bad' };

/** 授权后的结果页。只有固定文案。 */
export function resultPage(kind, status = 200, request = null) {
  const lang = pageLanguage(request);
  const key = TONES[kind] ? kind : 'failed';
  const copy = COPY[lang][key];
  const tone = TONES[key];
  const body = `<div class="badge ${tone}" aria-hidden="true">${BADGES[tone]}</div>`
    + `<h1>${copy.title}</h1><p>${copy.lead}</p>`;
  return shell(lang, copy.title, body, status);
}
