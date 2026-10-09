import type { LandingLocale } from '../../composables/useLandingLocale';

export interface JourneyCopy {
  title: [string, string]; lead: string;
  nav: [string, string, string, string];
  chapters: [string, string, string, string][];
  demo: [string, string, string, string, string];
  guide: [string, string, string][];
  download: [string, string, string];
  response: [string, string, string];
  system: string;
}
// One chapter = title, one explanation and two concrete benefits. No decorative metadata.
export const JOURNEY: Record<LandingLocale, JourneyCopy> = {
  zh: {
    title: ['记录你的每一天。', '看见下一步。'], lead: '把 Amazfit 的睡眠、身体状态和运动连起来，从看懂记录，到安排下一次出发。',
    nav: ['功能', '亲自试试', '使用指南', '下载'],
    chapters: [
      ['每一天，都有迹可循。', '手表里的记录，成为电脑上持续积累的个人档案。', '一眼看清近况，展开查看细节', '同步、归档、备份，各有归处'],
      ['看懂身体的节奏。', '把睡眠、心率与恢复放在一起，看看今天和平时有什么不同。', '从一晚分期，到一年的变化', '未测到的时段，如实留白'],
      ['每一次运动，都有下文。', '重看过程，比较前后，让一次训练成为下一次的参考。', '心率、配速和分段一起看', '训练负荷与恢复放在同一条时间线上'],
      ['把问题，连同记录交给 AI。', '挑出需要的记录，带上你的问题，整理成可阅读的数据包。', '范围、指标和缺失，发送前看清楚', '保留问题与计划的往返记录'],
      ['下一步，由你决定。', 'AI 带回训练计划，你来检查、调整，再安排到接下来的日子。', '逐天检查变化，展开每个训练步骤', '确认后发送，也可以撤回'],
    ],
    demo: ['现在，亲自走一遍。', '一年的虚构记录，完整的应用。随意探索，所有操作只留在这次示例里。', '点击开始探索', '重置示例', '展开体验'],
    guide: [
      ['安装到电脑', '选择自己的系统，下载并安装 ZeppBridge。', 'Windows 运行安装程序；macOS 将应用拖入“应用程序”；Linux 选择适合发行版的安装包。'],
      ['连接你的 Zepp', '在应用里完成官方授权，同步已有记录。', '先在手机 Zepp App 中同步手表，再打开 ZeppBridge 的账号设置。需要额外指标时，可按应用指引添加高级连接。'],
      ['从最近一周开始', '看记录，挑问题，再决定下一步。', '从概览进入睡眠或运动详情；在“交给 AI”中选择数据和问题。AI 返回的计划先审核，确认后再发送。'],
    ],
    download: ['把下一步，带回生活。', '免费开源。为你的 Amazfit，也为每一天。', 'v3 正式安装包尚未发布'],
    response: ['示例 AI 对话', '我已整理你选择的记录，并准备了一周的示例计划。先核对每一天的训练与恢复安排，再决定是否采用。', '查看并审核计划'], system: '跟随系统',
  },
  en: {
    title: ['Every day tells a story.', 'Find your next step.'], lead: 'Bring your Amazfit sleep, recovery and workouts together. Understand your records. Plan what comes next.',
    nav: ['Features', 'Try it', 'Get started', 'Download'],
    chapters: [
      ['Your days, connected.', 'Turn the records on your watch into a personal history on your computer.', 'See the big picture, open the details', 'Sync, archive and back up in one place'],
      ['Understand your rhythm.', 'Read sleep, heart rate and recovery together to see how today compares with your usual.', 'From one night to a year of change', 'Unmeasured periods stay missing'],
      ['Make every workout count.', 'Revisit the effort and compare sessions before you plan the next one.', 'Heart rate, pace and splits together', 'Training load and recovery on one timeline'],
      ['Give AI the full question.', 'Choose your records, add your question and prepare a readable data package.', 'Review the scope and gaps before sending', 'Keep your questions and returned plans together'],
      ['You choose what comes next.', 'Review the plan AI returns, adjust the details and arrange the days ahead.', 'Compare each day and every workout step', 'Confirm before sending, undo when needed'],
    ],
    demo: ['Take it for a spin.', 'A year of fictional records. The complete app. Explore freely; changes stay in this sample session.', 'Click to explore', 'Reset sample', 'Expand app'],
    guide: [
      ['Install on your computer', 'Choose your system and install ZeppBridge.', 'Run the Windows installer, drag the macOS app into Applications, or choose a package for your Linux distribution.'],
      ['Connect your Zepp account', 'Authorize in the app and sync your existing records.', 'Sync your watch in the phone Zepp app first, then open account settings in ZeppBridge. Add an advanced connection if you need its additional metrics.'],
      ['Start with this week', 'Explore your records, choose a question and decide what comes next.', 'Open sleep or workout details from the overview. Select records in Send to AI. Review any returned plan before sending it.'],
    ],
    download: ['Bring your next step to life.', 'Free and open source. For your Amazfit, and your every day.', 'The v3 release is not available yet'],
    response: ['Sample AI conversation', 'Your selected records are organized, and a sample week is ready. Review each workout and recovery day before deciding whether to use the plan.', 'Review the plan'], system: 'System',
  },
  es: {
    title: ['Cada día tiene una historia.', 'Descubre el siguiente paso.'], lead: 'Reúne el sueño, la recuperación y los entrenamientos de Amazfit. Entiende tus registros y prepara lo que viene.', nav: ['Funciones', 'Pruébalo', 'Primeros pasos', 'Descargar'],
    chapters: [
      ['Tus días, conectados.', 'Los registros de tu reloj se convierten en un historial personal en tu ordenador.', 'Un vistazo general y todos los detalles', 'Sincronización, archivo y copias de seguridad'],
      ['Entiende tu ritmo.', 'Compara el sueño, el pulso y la recuperación de hoy con tus valores habituales.', 'De una noche a un año de cambios', 'Lo que no se midió queda sin datos'],
      ['Cada entrenamiento cuenta.', 'Revisa el esfuerzo y compara sesiones para preparar la siguiente.', 'Pulso, ritmo y parciales juntos', 'Carga y recuperación en una misma línea temporal'],
      ['Dale contexto a tu pregunta.', 'Elige registros, añade tu pregunta y prepara un paquete para la IA.', 'Revisa el alcance y los datos que faltan', 'Conserva preguntas y planes recibidos'],
      ['Tú decides el siguiente paso.', 'Revisa el plan de la IA, ajusta los detalles y organiza los próximos días.', 'Compara cada día y cada paso', 'Confirma el envío y deshazlo si lo necesitas'],
    ], demo: ['Pruébalo por ti mismo.', 'Un año de registros ficticios y la aplicación completa. Los cambios solo afectan a esta sesión.', 'Haz clic para explorar', 'Restablecer ejemplo', 'Ampliar aplicación'],
    guide: [['Instala en tu ordenador', 'Elige tu sistema e instala ZeppBridge.', 'Ejecuta el instalador de Windows, arrastra la app a Aplicaciones en macOS o elige un paquete para Linux.'], ['Conecta tu cuenta Zepp', 'Autoriza la conexión y sincroniza tus registros.', 'Sincroniza primero el reloj en Zepp del móvil. Después abre los ajustes de cuenta en ZeppBridge. La conexión avanzada ofrece métricas adicionales.'], ['Empieza por esta semana', 'Explora tus registros y elige una pregunta.', 'Abre los detalles de sueño o entrenamiento. Selecciona registros para la IA y revisa el plan recibido antes de enviarlo.']],
    download: ['Lleva tu siguiente paso a la vida.', 'Gratis y de código abierto. Para tu Amazfit y tu día a día.', 'La versión v3 aún no está disponible'], response: ['Conversación de IA de ejemplo', 'Los registros seleccionados están organizados y hay una semana de ejemplo preparada. Revisa los entrenamientos y la recuperación antes de usar el plan.', 'Revisar el plan'], system: 'Sistema',
  },
  fr: {
    title: ['Chaque jour a son histoire.', 'Trouvez la suite.'], lead: 'Réunissez sommeil, récupération et entraînements Amazfit. Comprenez vos données et préparez la suite.', nav: ['Fonctions', 'Essayer', 'Bien démarrer', 'Télécharger'],
    chapters: [
      ['Vos journées se rejoignent.', 'Les données de votre montre deviennent un historique personnel sur votre ordinateur.', 'Une vue globale, des détails accessibles', 'Synchronisation, archivage et sauvegarde'],
      ['Comprenez votre rythme.', 'Lisez ensemble sommeil, fréquence cardiaque et récupération pour comparer avec vos habitudes.', 'D’une nuit à une année de changements', 'Les périodes non mesurées restent vides'],
      ['Chaque séance compte.', 'Revenez sur vos efforts et comparez les séances avant de préparer la suivante.', 'Fréquence cardiaque, allure et segments', 'Charge et récupération sur une même frise'],
      ['Donnez du contexte à l’IA.', 'Choisissez vos données, ajoutez votre question et préparez un fichier lisible.', 'Vérifiez la période et les données manquantes', 'Gardez les questions et les plans reçus'],
      ['Vous décidez de la suite.', 'Vérifiez le plan de l’IA, ajustez ses détails et organisez les prochains jours.', 'Comparez chaque jour et chaque étape', 'Confirmez l’envoi et annulez si nécessaire'],
    ], demo: ['À vous d’essayer.', 'Une année de données fictives. L’application complète. Vos modifications restent dans cette session.', 'Cliquez pour explorer', 'Réinitialiser', 'Agrandir l’application'],
    guide: [['Installez sur votre ordinateur', 'Choisissez votre système et installez ZeppBridge.', 'Lancez l’installation Windows, glissez l’app dans Applications sur macOS ou choisissez un paquet Linux.'], ['Connectez votre compte Zepp', 'Autorisez la connexion et synchronisez vos données.', 'Synchronisez d’abord la montre dans Zepp sur votre téléphone. Ouvrez ensuite les paramètres du compte dans ZeppBridge. La connexion avancée apporte des métriques supplémentaires.'], ['Commencez par cette semaine', 'Explorez vos données et choisissez une question.', 'Ouvrez une nuit ou une séance. Sélectionnez les données pour l’IA, puis vérifiez le plan reçu avant de l’envoyer.']],
    download: ['Donnez vie à la suite.', 'Gratuit et libre. Pour votre Amazfit et votre quotidien.', 'La version v3 n’est pas encore disponible'], response: ['Conversation IA fictive', 'Les données choisies sont organisées et une semaine d’exemple est prête. Vérifiez les séances et les jours de récupération avant d’adopter le plan.', 'Vérifier le plan'], system: 'Système',
  },
  de: {
    title: ['Jeder Tag erzählt etwas.', 'Finde den nächsten Schritt.'], lead: 'Schlaf, Erholung und Training deiner Amazfit zusammen betrachten. Daten verstehen und den nächsten Schritt planen.', nav: ['Funktionen', 'Ausprobieren', 'Einstieg', 'Download'],
    chapters: [
      ['Deine Tage im Zusammenhang.', 'Aus den Aufzeichnungen deiner Uhr wird ein persönliches Archiv auf deinem Computer.', 'Den Überblick sehen, Details öffnen', 'Synchronisieren, archivieren und sichern'],
      ['Verstehe deinen Rhythmus.', 'Betrachte Schlaf, Puls und Erholung gemeinsam und vergleiche heute mit deinen üblichen Werten.', 'Von einer Nacht bis zu einem Jahr', 'Nicht gemessene Zeiten bleiben offen'],
      ['Jede Einheit führt weiter.', 'Schaue auf deine Belastung zurück und vergleiche Einheiten vor dem nächsten Training.', 'Puls, Tempo und Zwischenzeiten zusammen', 'Trainingslast und Erholung im Zeitverlauf'],
      ['Gib der KI den Kontext.', 'Wähle Aufzeichnungen, ergänze deine Frage und stelle ein lesbares Datenpaket zusammen.', 'Umfang und Lücken vor dem Senden prüfen', 'Fragen und erhaltene Pläne aufbewahren'],
      ['Du bestimmst, was folgt.', 'Prüfe den KI-Plan, passe die Details an und ordne die kommenden Tage.', 'Jeden Tag und jeden Trainingsschritt prüfen', 'Senden bestätigen und bei Bedarf zurücknehmen'],
    ], demo: ['Probier es selbst aus.', 'Ein Jahr fiktiver Daten. Die vollständige App. Änderungen gelten nur in dieser Beispielsitzung.', 'Zum Erkunden klicken', 'Beispiel zurücksetzen', 'App vergrößern'],
    guide: [['Auf dem Computer installieren', 'Wähle dein System und installiere ZeppBridge.', 'Starte das Windows-Setup, ziehe die macOS-App in Programme oder wähle ein Linux-Paket.'], ['Zepp-Konto verbinden', 'Erlaube den Zugriff und synchronisiere deine Daten.', 'Synchronisiere die Uhr zuerst in der Zepp-App auf dem Handy. Öffne dann die Kontoeinstellungen in ZeppBridge. Die erweiterte Verbindung ergänzt weitere Messwerte.'], ['Mit dieser Woche beginnen', 'Erkunde die Daten und wähle eine Frage.', 'Öffne Schlaf- oder Trainingsdetails. Wähle Daten für die KI und prüfe den zurückgegebenen Plan vor dem Senden.']],
    download: ['Mach den nächsten Schritt.', 'Kostenlos und quelloffen. Für deine Amazfit und deinen Alltag.', 'Die Version v3 ist noch nicht verfügbar'], response: ['Beispiel einer KI-Unterhaltung', 'Die ausgewählten Daten sind geordnet und eine Beispielwoche ist vorbereitet. Prüfe Training und Erholung, bevor du den Plan übernimmst.', 'Plan prüfen'], system: 'System',
  },
  nl: {
    title: ['Elke dag vertelt iets.', 'Ontdek je volgende stap.'], lead: 'Breng slaap, herstel en trainingen van Amazfit samen. Begrijp je gegevens en plan wat volgt.', nav: ['Functies', 'Proberen', 'Aan de slag', 'Downloaden'],
    chapters: [
      ['Je dagen, verbonden.', 'Maak van je horlogegegevens een persoonlijk archief op je computer.', 'Overzicht en details binnen handbereik', 'Synchroniseren, bewaren en back-ups maken'],
      ['Begrijp je ritme.', 'Bekijk slaap, hartslag en herstel samen en vergelijk vandaag met je gebruikelijke waarden.', 'Van één nacht tot een heel jaar', 'Niet gemeten blijft ontbrekend'],
      ['Elke training telt mee.', 'Kijk terug op je inspanning en vergelijk trainingen voor je verder plant.', 'Hartslag, tempo en tussentijden samen', 'Trainingsbelasting en herstel op één tijdlijn'],
      ['Geef AI de context.', 'Kies gegevens, voeg je vraag toe en maak een leesbaar gegevenspakket.', 'Controleer het bereik en ontbrekende gegevens', 'Bewaar vragen en ontvangen plannen'],
      ['Jij bepaalt de volgende stap.', 'Controleer het AI-plan, pas details aan en deel de komende dagen in.', 'Bekijk elke dag en elke trainingsstap', 'Bevestig het verzenden en maak het zo nodig ongedaan'],
    ], demo: ['Probeer het zelf.', 'Een jaar fictieve gegevens. De volledige app. Wijzigingen blijven binnen deze voorbeeldsessie.', 'Klik om te verkennen', 'Voorbeeld herstellen', 'App vergroten'],
    guide: [['Installeer op je computer', 'Kies je systeem en installeer ZeppBridge.', 'Start de Windows-installatie, sleep de macOS-app naar Programma’s of kies een Linux-pakket.'], ['Verbind je Zepp-account', 'Geef toestemming en synchroniseer je gegevens.', 'Synchroniseer eerst je horloge in Zepp op je telefoon. Open daarna de accountinstellingen in ZeppBridge. De geavanceerde verbinding voegt extra metingen toe.'], ['Begin met deze week', 'Verken je gegevens en kies een vraag.', 'Open slaap- of trainingsdetails. Selecteer gegevens voor AI en controleer het ontvangen plan voordat je het verstuurt.']],
    download: ['Zet je volgende stap.', 'Gratis en open source. Voor je Amazfit en je dagelijks leven.', 'Versie v3 is nog niet beschikbaar'], response: ['Voorbeeldgesprek met AI', 'De geselecteerde gegevens zijn geordend en een voorbeeldweek is klaar. Controleer trainingen en herstel voordat je het plan gebruikt.', 'Plan controleren'], system: 'Systeem',
  },
  'pt-BR': {
    title: ['Cada dia conta uma história.', 'Descubra o próximo passo.'], lead: 'Reúna sono, recuperação e treinos do Amazfit. Entenda seus registros e planeje o que vem a seguir.', nav: ['Recursos', 'Experimentar', 'Primeiros passos', 'Baixar'],
    chapters: [
      ['Seus dias, conectados.', 'Transforme os registros do relógio em um histórico pessoal no computador.', 'Veja o panorama e abra os detalhes', 'Sincronização, arquivo e backup juntos'],
      ['Entenda seu ritmo.', 'Compare sono, frequência cardíaca e recuperação com seus valores habituais.', 'De uma noite a um ano de mudanças', 'Períodos sem medição continuam sem dados'],
      ['Cada treino tem continuidade.', 'Reveja o esforço e compare sessões antes de planejar a próxima.', 'Frequência cardíaca, ritmo e parciais', 'Carga e recuperação na mesma linha do tempo'],
      ['Dê contexto à sua pergunta.', 'Escolha registros, acrescente sua pergunta e prepare um pacote para a IA.', 'Confira o período e as lacunas antes de enviar', 'Guarde perguntas e planos recebidos'],
      ['Você decide o próximo passo.', 'Revise o plano da IA, ajuste os detalhes e organize os próximos dias.', 'Confira cada dia e cada etapa do treino', 'Confirme o envio e desfaça se precisar'],
    ], demo: ['Experimente por conta própria.', 'Um ano de registros fictícios. O aplicativo completo. Alterações valem só nesta sessão de exemplo.', 'Clique para explorar', 'Redefinir exemplo', 'Ampliar aplicativo'],
    guide: [['Instale no computador', 'Escolha seu sistema e instale o ZeppBridge.', 'Execute o instalador no Windows, arraste o app para Aplicativos no macOS ou escolha um pacote Linux.'], ['Conecte sua conta Zepp', 'Autorize a conexão e sincronize seus registros.', 'Sincronize primeiro o relógio no Zepp do celular. Depois abra os ajustes de conta no ZeppBridge. A conexão avançada oferece métricas adicionais.'], ['Comece por esta semana', 'Explore os registros e escolha uma pergunta.', 'Abra os detalhes de sono ou treino. Selecione dados para a IA e revise o plano recebido antes de enviá-lo.']],
    download: ['Leve o próximo passo para a vida.', 'Grátis e de código aberto. Para seu Amazfit e seu dia a dia.', 'A versão v3 ainda não está disponível'], response: ['Conversa de exemplo com IA', 'Os registros selecionados estão organizados e uma semana de exemplo está pronta. Revise treinos e recuperação antes de adotar o plano.', 'Revisar o plano'], system: 'Sistema',
  },
  'pt-PT': {
    title: ['Cada dia conta uma história.', 'Descobre o próximo passo.'], lead: 'Junta sono, recuperação e treinos do Amazfit. Compreende os teus registos e planeia o que vem a seguir.', nav: ['Funcionalidades', 'Experimentar', 'Primeiros passos', 'Transferir'],
    chapters: [
      ['Os teus dias, ligados.', 'Transforma os registos do relógio num histórico pessoal no computador.', 'Vê o panorama e abre os detalhes', 'Sincronização, arquivo e cópias de segurança'],
      ['Compreende o teu ritmo.', 'Compara sono, frequência cardíaca e recuperação com os teus valores habituais.', 'De uma noite a um ano de mudanças', 'Períodos sem medição continuam sem dados'],
      ['Cada treino tem continuidade.', 'Revê o esforço e compara sessões antes de planeares a próxima.', 'Frequência cardíaca, ritmo e parciais', 'Carga e recuperação na mesma cronologia'],
      ['Dá contexto à tua pergunta.', 'Escolhe registos, acrescenta uma pergunta e prepara um pacote para a IA.', 'Confere o período e as lacunas antes de enviar', 'Guarda perguntas e planos recebidos'],
      ['Tu decides o próximo passo.', 'Revê o plano da IA, ajusta os detalhes e organiza os próximos dias.', 'Confere cada dia e cada etapa do treino', 'Confirma o envio e anula se precisares'],
    ], demo: ['Experimenta por ti.', 'Um ano de registos fictícios. A aplicação completa. As alterações ficam apenas nesta sessão de exemplo.', 'Clica para explorar', 'Repor exemplo', 'Ampliar aplicação'],
    guide: [['Instala no computador', 'Escolhe o teu sistema e instala o ZeppBridge.', 'Executa o instalador no Windows, arrasta a app para Aplicações no macOS ou escolhe um pacote Linux.'], ['Liga a tua conta Zepp', 'Autoriza a ligação e sincroniza os teus registos.', 'Sincroniza primeiro o relógio no Zepp do telemóvel. Depois abre as definições da conta no ZeppBridge. A ligação avançada oferece métricas adicionais.'], ['Começa por esta semana', 'Explora os registos e escolhe uma pergunta.', 'Abre os detalhes de sono ou treino. Seleciona dados para a IA e revê o plano recebido antes de o enviares.']],
    download: ['Leva o próximo passo para a vida.', 'Gratuito e de código aberto. Para o teu Amazfit e o teu dia a dia.', 'A versão v3 ainda não está disponível'], response: ['Conversa de exemplo com IA', 'Os registos escolhidos estão organizados e uma semana de exemplo está pronta. Revê os treinos e a recuperação antes de adotares o plano.', 'Rever o plano'], system: 'Sistema',
  },
  ru: {
    title: ['В каждом дне есть история.', 'Найдите следующий шаг.'], lead: 'Объедините сон, восстановление и тренировки Amazfit. Разберитесь в записях и спланируйте дальнейшее.', nav: ['Возможности', 'Попробовать', 'Начало работы', 'Скачать'],
    chapters: [
      ['Ваши дни связаны.', 'Записи с часов становятся личным архивом на вашем компьютере.', 'Общая картина и подробности', 'Синхронизация, архив и резервные копии'],
      ['Поймите свой ритм.', 'Смотрите на сон, пульс и восстановление вместе и сравнивайте с привычными значениями.', 'От одной ночи до целого года', 'Периоды без измерений остаются пропусками'],
      ['У каждой тренировки есть продолжение.', 'Разберите нагрузку и сравните занятия, прежде чем планировать следующее.', 'Пульс, темп и отрезки рядом', 'Нагрузка и восстановление на одной шкале'],
      ['Дайте ИИ контекст.', 'Выберите записи, добавьте вопрос и подготовьте понятный пакет данных.', 'Проверьте период и пропуски перед отправкой', 'Сохраняйте вопросы и полученные планы'],
      ['Следующий шаг выбираете вы.', 'Проверьте план ИИ, уточните детали и распределите занятия по дням.', 'Просмотрите каждый день и этап тренировки', 'Подтвердите отправку или отмените её'],
    ], demo: ['Попробуйте сами.', 'Год вымышленных записей и полное приложение. Изменения остаются только в этом сеансе.', 'Нажмите для знакомства', 'Сбросить пример', 'Развернуть приложение'],
    guide: [['Установите на компьютер', 'Выберите систему и установите ZeppBridge.', 'Запустите установщик Windows, перенесите приложение в «Программы» на macOS или выберите пакет Linux.'], ['Подключите аккаунт Zepp', 'Разрешите доступ и синхронизируйте записи.', 'Сначала синхронизируйте часы с Zepp на телефоне. Затем откройте настройки аккаунта в ZeppBridge. Расширенное подключение добавляет другие показатели.'], ['Начните с этой недели', 'Посмотрите записи и выберите вопрос.', 'Откройте детали сна или тренировки. Выберите данные для ИИ и проверьте полученный план перед отправкой.']],
    download: ['Сделайте следующий шаг.', 'Бесплатно, с открытым кодом. Для Amazfit и каждого дня.', 'Версия v3 пока недоступна'], response: ['Пример диалога с ИИ', 'Выбранные записи собраны, и пример недельного плана готов. Проверьте тренировки и дни восстановления, прежде чем принять план.', 'Проверить план'], system: 'Системная',
  },
  'hi-IN': {
    title: ['हर दिन की अपनी कहानी है।', 'अपना अगला कदम जानें।'], lead: 'Amazfit की नींद, रिकवरी और कसरत के रिकॉर्ड साथ देखें। उन्हें समझें और आगे की योजना बनाएँ।', nav: ['सुविधाएँ', 'आज़माएँ', 'शुरुआत', 'डाउनलोड'],
    chapters: [
      ['आपके दिन, एक साथ।', 'घड़ी के रिकॉर्ड आपके कंप्यूटर पर व्यक्तिगत इतिहास बन जाते हैं।', 'एक नज़र में स्थिति, फिर पूरा विवरण', 'सिंक, संग्रह और बैकअप एक जगह'],
      ['अपने शरीर की लय समझें।', 'नींद, हृदय गति और रिकवरी को साथ देखकर आज की तुलना सामान्य दिनों से करें।', 'एक रात से पूरे साल तक', 'जहाँ माप नहीं हुआ, वहाँ डेटा खाली रहता है'],
      ['हर कसरत से आगे बढ़ें।', 'अपने प्रयास देखें और अगली कसरत से पहले पुराने सत्रों की तुलना करें।', 'हृदय गति, गति और स्प्लिट साथ देखें', 'ट्रेनिंग लोड और रिकवरी एक समयरेखा पर'],
      ['AI को सवाल का संदर्भ दें।', 'रिकॉर्ड चुनें, अपना सवाल जोड़ें और पढ़ने योग्य डेटा पैकेज बनाएँ।', 'भेजने से पहले अवधि और कमी जाँचें', 'सवाल और लौटे हुए प्लान साथ रखें'],
      ['अगला कदम आप तय करें।', 'AI का प्लान जाँचें, विवरण बदलें और आने वाले दिन व्यवस्थित करें।', 'हर दिन और कसरत के हर चरण की जाँच', 'भेजने की पुष्टि करें, ज़रूरत पर वापस लें'],
    ], demo: ['अब खुद आज़माएँ।', 'एक साल के काल्पनिक रिकॉर्ड और पूरा ऐप। बदलाव केवल इस उदाहरण सत्र में रहते हैं।', 'देखने के लिए क्लिक करें', 'उदाहरण रीसेट करें', 'ऐप बड़ा करें'],
    guide: [['कंप्यूटर पर इंस्टॉल करें', 'अपना सिस्टम चुनें और ZeppBridge इंस्टॉल करें।', 'Windows इंस्टॉलर चलाएँ, macOS ऐप को Applications में रखें या Linux पैकेज चुनें।'], ['अपना Zepp खाता जोड़ें', 'अनुमति दें और मौजूदा रिकॉर्ड सिंक करें।', 'पहले फ़ोन के Zepp ऐप में घड़ी सिंक करें। फिर ZeppBridge की खाता सेटिंग खोलें। अतिरिक्त मापों के लिए उन्नत कनेक्शन जोड़ सकते हैं।'], ['इस हफ़्ते से शुरू करें', 'रिकॉर्ड देखें और अपना सवाल चुनें।', 'नींद या कसरत का विवरण खोलें। AI के लिए डेटा चुनें और लौटे प्लान को भेजने से पहले जाँचें।']],
    download: ['अगले कदम को जीवन में उतारें।', 'मुफ़्त और ओपन सोर्स। आपके Amazfit और हर दिन के लिए।', 'v3 संस्करण अभी उपलब्ध नहीं है'], response: ['AI बातचीत का उदाहरण', 'चुने रिकॉर्ड व्यवस्थित हैं और एक हफ़्ते का उदाहरण प्लान तैयार है। उसे अपनाने से पहले कसरत और रिकवरी के दिन जाँचें।', 'प्लान की जाँच करें'], system: 'सिस्टम',
  },
};
