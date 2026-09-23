import { plural, type LocalePack } from '../index';

/**
 * Português (Portugal)（pt-PT）语言包。
 *
 * 欧洲葡语习惯：ecrã / ficheiro / telemóvel / definições / utilizador /
 * registos，祈使句用 tu 或不定式按钮文案，避免巴西式 gerund 堆叠。
 *
 * 已覆盖所有已登记模块的键；`modules` 按 moduleId 给内联文案做覆盖，
 * `errors` 是 `err.*` 错误码的平铺表，`backendText` 是后端 `ui.*`
 * 散文码的兜底表。仍缺漏的键登记在同目录 pt-PT.pending.txt。
 */
export default {
  modules: {
    'components/ai/WorkoutPicker': { previous: 'Anterior', next: 'Seguinte' },
    'views/Explore': {
      title: 'Entregar à IA',
      intro:
        'Escolhe um modelo, vê o que o pacote realmente contém, e envia os teus dados de wearable para a ferramenta de IA que preferires.',
      workoutScopeBanner: (workoutId: string) =>
        `A exportar o treino ${workoutId} e mais nada: o treino em si mais as métricas ponto a ponto registadas enquanto decorria. Fluxos ao nível do dia, como sono e passos, ficam de fora. O intervalo de datas está inativo.`,
      backToDateRange: 'Voltar a um intervalo de datas',
      categoryTitle: 'Categorias',
      categoryAria: 'Categorias de modelos',
      categoryAll: 'Todos os modelos',
      categorySummary: 'Resumo',
      categoryTraining: 'Treino',
      categoryRecovery: 'Recuperação',
      categorySleep: 'Sono',
      templateListTitle: 'Modelos',
      templateSearchPlaceholder: 'Procurar modelos…',
      templateSearchAria: 'Procurar modelos',
      noTemplates: 'Nenhum modelo corresponde.',
      currentTemplate: 'Modelo atual',
      copyPromptTitle: 'Copiar o texto do prompt para a área de transferência',
      copyPrompt: 'Copiar prompt',
      promptEditor: 'Prompt',
      promptEditorHint: ' (os dados são alinhados automaticamente)',
      injected: (count: number) => `${count} fluxos de dados anexados`,
      promptEditorAria: 'Editor de prompt',
      summaryTitle: 'O que o pacote contém',
      summaryHint: 'Só o que assinalares',
      cellRange: 'Intervalo de tempo',
      cellCount: 'Registos',
      cellCountSub: 'registos sincronizados',
      cellTypes: 'Tipos de dados',
      cellTypesValue: (count: number) => `${count}`,
      cellTypesSub: 'no pacote',
      cellSize: 'Tamanho',
      cellSizeSub: 'estimado',
      thisWorkout: 'Este treino',
      onlyThisWorkout: 'só este treino',
      approxMinutes: (minutes: number) => `(cerca de ${minutes} min)`,
      rangeDays: (days: number) => `(${days} dias)`,
      quickRange: 'Intervalo rápido:',
      range7: '7 dias',
      range30: '30 dias',
      startDate: 'Data de início',
      endDate: 'Data de fim',
      datePickerAria: 'Seletor de data',
      secureNote:
        'Tudo é construído localmente: os dados estruturados e o prompt são gerados neste computador.',
      secureOk: 'Só local',
      exportFile: (format: string) => `Exportar ficheiro ${format}`,
      copyPromptOnly: 'Copiar só o prompt',
      preparing: 'A preparar…',
      handTo: (provider: string) => `Entregar a ${provider}`,
      promptCopied: 'Prompt copiado (sem dados incluídos).',
      copyFailed: 'A cópia falhou. Tenta novamente.',
      retryOpen: (provider: string) => `Abrir ${provider} outra vez`,
      packTitle: 'Empacotar e enviar',
      packSub: 'Escolhe o formato de exportação e a ferramenta de IA.',
      packContentsTitle: 'O que a exportação contém',
      packContentsIncluded:
        'Incluído: resumos de treinos (tipo, início e fim, distância, calorias, frequência cardíaca média e de pico, carga de treino), métricas diárias (passos, frequência cardíaca em repouso, HRV, SpO2, stress, frequência respiratória, PAI, VO2max) e sessões de sono com a sua linha temporal de fases. Escolher «Completo» acrescenta as séries de treino ao segundo e as leituras individuais de frequência cardíaca.',
      packContentsExcluded:
        'Não incluído: .tcx, dados da conta, tokens ou números de série de dispositivos. Os percursos GPS aparecem nos formatos GPX e FIT, e só para treinos que trazem percurso. O FIT escreve um ficheiro por treino numa pasta que escolhes.',
      formatGroup: 'Formato de exportação',
      formatAria: 'Formato de exportação',
      formatJsonSub: 'Dados estruturados completos',
      formatCsvSub: 'Tabela de resumo (sem séries ponto a ponto)',
      formatGpxSub: 'Só treinos com percurso GPS',
      formatFitSub: 'Um ficheiro por treino, guardado na pasta que escolheres',
      detailGroup: 'Nível de detalhe',
      detailAria: 'Nível de detalhe',
      streamsGroup: 'Fluxos de dados',
      selectedCount: (selected: number, total: number) => `${selected} de ${total} selecionados`,
      selectNone: 'Limpar',
      selectAll: 'Todos',
      noTypesSelected: 'Nenhum tipo de dados selecionado, por isso a exportação será recusada.',
      estimatedSize: 'Tamanho estimado do pacote',
      targetGroup: 'Ferramenta de IA de destino',
      targetAria: 'Ferramenta de IA de destino',
      providerIconAlt: (provider: string) => `ícone de ${provider}`,
      sendHint:
        'Até 2 MiB viajam na área de transferência com o prompt. Acima disso, o JSON é escrito no teu ambiente de trabalho para o arrastares para a conversa.',
      needDesktop:
        'A entrega à IA precisa da aplicação de desktop; esta pré-visualização no browser não abre sites externos.',
      needValidDates: 'Escolhe primeiro um intervalo de datas válido.',
      needDataTypes: 'Escolhe pelo menos um tipo de dados.',
      stillReading: 'Ainda a ler os registos locais. Tenta novamente daqui a pouco.',
      nothingInScope: 'Nada sincronizado neste intervalo para entregar.',
      previewDesktopOnly:
        'Abre isto na aplicação de desktop do ZeppBridge; a pré-visualização lê registos locais.',
      previewFailed: 'Não foi possível ler a pré-visualização local da exportação',
      previewRetry: 'Tentar novamente',
      attachmentNotice:
        'O pacote de dados foi escrito no teu ambiente de trabalho (zeppbridge-ai-handoff.json) — arrasta-o para a conversa de IA. O prompt está na tua área de transferência.',
      attachmentOpened: (notice: string, provider: string) => `${notice} ${provider} está aberto.`,
      attachmentNotOpened: (notice: string, provider: string) =>
        `${notice} Abre ${provider} num browser para o analisar.`,
      copiedAndOpened: (provider: string) =>
        `Dados desidentificados copiados e ${provider} aberto. Cola-os para começar.`,
      copiedOnly: (provider: string) =>
        `Dados desidentificados copiados. Abre ${provider} tu mesmo e cola-os.`,
      reopened: (provider: string) => `${provider} está aberto. Cola lá os dados.`,
      templates: {
        performance: {
          name: 'Resumo de desempenho',
          sub: 'Uma leitura clara de como as coisas estão a ir',
          prompt:
            'És um analista de saúde desportiva que transforma dados de wearable em conclusões simples e utilizáveis.\r\nCom os dados ZeppBridge abaixo (já por ordem cronológica),\r\nescreve-me um resumo claro e bem estruturado do meu desempenho global.\r\nCobre o panorama geral, as tendências que importam, o que salta à vista, o que vigiar e aquilo em que posso atuar.\r\nOnde os dados forem escassos, diz-o claramente e diz-me o que recolher em vez de adivinhar.\r\n\r\nResponde em Markdown, usando tabelas, listas e bullets onde ajudarem.\r\nMantém o tom profissional, conciso e construtivo.',
        },
        training: {
          name: 'Análise de treino',
          sub: 'Carga de treino e para onde está a ir',
          prompt:
            'És um treinador de resistência experiente.\r\nCom os dados de treino ZeppBridge abaixo (frequência cardíaca, carga de treino e VO₂max),\r\nanalisa a estrutura do meu treino, como a intensidade está distribuída e para onde a carga está a ir.\r\nAponta o que está mal na forma como as sessões estão arranjadas e diz-me o que mudar no próximo ciclo.\r\n\r\nResponde em Markdown. Sê direto.',
        },
        recovery: {
          name: 'Recuperação e prontidão',
          sub: 'Recuperação, HRV e prontidão para treinar',
          prompt:
            'És um fisiologista especializado em recuperação.\r\nCom os dados ZeppBridge de HRV, frequência cardíaca em repouso, sono e stress abaixo,\r\navalia quão recuperado estou e quão pronto estou para treinar,\r\naponta os sinais de fadiga acumulada e diz-me o que ajudaria.\r\n\r\nResponde em Markdown.',
        },
        sleep: {
          name: 'Análise do sono',
          sub: 'Qualidade e regularidade do sono',
          prompt:
            'És um conselheiro de saúde do sono.\r\nCom os dados ZeppBridge de fases de sono, durações e frequência cardíaca abaixo,\r\nanalisa a qualidade e a regularidade do meu sono e o que parece estar a afetá-lo,\r\ne depois dá-me formas concretas e exequíveis de o melhorar.\r\n\r\nResponde em Markdown.',
        },
        activity: {
          name: 'Visão geral da atividade',
          sub: 'Movimento diário e para onde está a tender',
          prompt:
            'És um conselheiro de estilo de vida saudável.\r\nCom os dados ZeppBridge de passos, treinos e frequência cardíaca abaixo,\r\ndá-me uma visão geral do meu nível de atividade diária e de como está a evoluir,\r\ne depois sugere formas práticas de me mexer mais.\r\n\r\nResponde em Markdown.',
        },
        weekly: {
          name: 'Revisão semanal',
          sub: 'Um olhar semanal para trás, com detalhes',
          prompt:
            'És o meu treinador de saúde pessoal, a rever os meus dados uma vez por semana.\r\nCom os dados ZeppBridge desta semana abaixo, compara-me apenas com os meus próprios registos anteriores.\r\nResume o que mudou esta semana, aponta o que correu bem e o que merece atenção, e dá-me uma lista curta de coisas a fazer na próxima semana.\r\n\r\nRestrições:\r\n- Não há referência populacional nestes dados. Não me compares com «adultos saudáveis» nem com nenhuma média.\r\n- Onde algo faltar, diz que falta. Nunca tapes o buraco com um zero ou uma estimativa.\r\n- Sem diagnóstico médico, sem juízo de risco de doença, sem conselhos de tratamento.\r\n\r\nResponde em Markdown.',
        },
      },
    },
    'views/Settings': {
      title: 'Definições',
      intro:
        'Autenticação, comportamento da sincronização, privacidade e as predefinições de exportação — tudo num só sítio.',
      retry: 'Tentar novamente',
      distanceUnitLabel: 'Unidade de distância',
      displayPrefsTitle: 'Idioma e formatos',
      authTitle: '1. Autenticação',
      authWebTitle: 'Início de sessão web oficial',
      authWebSub: 'Inicia sessão na página oficial; o appToken é recolhido por ti',
      authCancelLogin: 'Cancelar o início de sessão',
      authInUse: 'Em uso',
      authOpening: 'A abrir…',
      authRetry: 'Tentar ligar novamente',
      authUse: 'Usar',
      authHarTitle: 'Importação HAR',
      authHarSub: 'Para utilizadores avançados e depuração: importa um ficheiro HAR',
      authManualTitle: 'Introduzir manualmente',
      authManualSub: 'Escreve o appToken, o user_id e o host da região',
      authCollapse: 'Fechar',
      manualFormTitle: 'Introduz as credenciais',
      manualFormHint:
        'Tira-as de uma captura do mitmproxy/Charles ou das devtools do teu browser. Três campos:',
      manualTokenPlaceholder: 'Copiar do cabeçalho HTTP apptoken',
      manualUserIdPlaceholder: 'Tirar do caminho do URL /users/{user_id}/',
      manualSaving: 'A guardar…',
      manualSave: 'Guardar credenciais',
      cancel: 'Cancelar',
      accountTitle: '2. Conta e região',
      accountLine: (region: string, lastSync: string) =>
        `Região ${region} · última sincronização ${lastSync}`,
      verifyAndSync: 'Verificar e sincronizar',
      reauthenticate: 'Iniciar sessão novamente',
      devicesTitle: '3. Dispositivos ligados / origens de dados',
      identifying: 'A identificar…',
      identifyDevices: 'Identificar dispositivos novamente',
      deviceErrorPrefix: 'Identificação de dispositivos: ',
      noDevices:
        'Ainda não foi identificado nenhum dispositivo físico; o Zepp Cloud continua a sincronizar como origem na nuvem.',
      deviceFirmware: (firmware: string) => `Firmware ${firmware}`,
      deviceLatestData: 'Dados mais recentes',
      deviceIdLine: (masked: string) => `ID do dispositivo ${masked}`,
      viewOrChange: 'Ver / mudar modelo',
      unknownDeviceTitle: 'Um dispositivo não identificado',
      unknownDeviceBodyA: 'Algumas contas Zepp devolvem registos de dispositivo com ',
      unknownDeviceNoName: 'nenhum campo de nome de produto',
      unknownDeviceBodyB:
        ' — só números internos, dos quais não se consegue inferir nenhum modelo. Premir «Identificar dispositivos novamente» nunca vai mudar isso. Podes apontar o modelo tu mesmo acima: fica etiquetado como «Modelo que escolheste» e nunca é apresentado como correspondência automática.',
      unknownDeviceReport:
        'Enviar um relatório de erro ajuda a meter os números deste dispositivo no catálogo incorporado, para ninguém ter de o escolher à mão depois. O relatório leva uma lista fixa de campos permitidos e não precisa de conta GitHub.',
      reportWhat: 'O que está mal',
      reportWhatHint:
        ' (escolhe uma opção e podes enviar mesmo que nada tenha sido detetado automaticamente)',
      reportCategoryPlaceholder: 'Sem especificar (envia só o que foi detetado automaticamente)',
      reportCategoryAria: 'Tipo de problema a reportar',
      reportNote: 'Algo a acrescentar',
      reportNoteHint: ' (opcional, mas muito útil)',
      reportNotePlaceholder:
        'Por exemplo: o meu relógio é um Amazfit Balance 2 mas aparece como não identificado; ou: ciclismo ao ar livre foi lido como treino desconhecido.',
      reportNoteCounter: (used: number, max: number) =>
        `${used} / ${max} · caminhos locais, endereços de email e identificadores longos são removidos antes do envio`,
      reportSubmitting: 'A enviar…',
      reportSubmit: 'Enviar um relatório de erro',
      reportDoneTitle: 'Recebido, obrigado',
      reportDoneLine: (id: string, at: string) => `Relatório ${id}, enviado ${at}.`,
      reportDoneNote:
        'O que saiu foi exatamente os tipos de campo listados acima mais a nota que escreveste. Mais nada.',
      reportConfirm:
        'Isto envia a versão da app, o tipo de SO, a revisão do parser, sugestões ao nível do produto e formas de campos para dispositivos não identificados, a versão de firmware, números ao nível do modelo (deviceSource / deviceType — inteiros que dizem qual o modelo, não qual a unidade), códigos de treino desconhecidos e as suas contagens, o código de erro numérico do pedido mais recente que a nuvem recusou (só o número, qual o fluxo de dados e quando — nunca texto que a nuvem tenha devolvido), e a nota que escreveste acima (com caminhos locais, endereços de email e identificadores longos removidos). Nunca envia a tua conta Zepp, tokens, números de série, IDs de dispositivo, endereços MAC, GPS, valores de saúde ou respostas em bruto. Enviar?',
      reportFailed: 'Não foi possível enviar o relatório de erro',
      capabilityTitle: 'O que os teus dispositivos conseguem fornecer',
      capabilityIntro:
        'O que o ZeppBridge consegue ler atualmente da tua conta. Esta lista atualiza-se durante uma sincronização; não há nada para premir.',
      lampOn: (count: number) => `Obtidos ${count}`,
      lampPending: (count: number) => `Na nuvem, sem dados locais ${count}`,
      lampOff: (count: number) => `Não obtidos ${count}`,
      capabilityEmptyTitle: 'Ainda não sincronizado',
      capabilityEmptyBody: 'Estas acendem depois de uma sincronização.',
      probeSummary: 'Diagnóstico de endpoints',
      probeNote:
        '«Não obtido» não significa que o dispositivo não o tenha: os endpoints da Zepp devolvem uma resposta vazia para fluxos que não existem, e só uma recusa declarada é reportada como «o teu dispositivo não fornece isto».',
      probing: 'A sondar…',
      probeRun: 'Sondar outra vez agora',
      probedToday: 'sondado hoje',
      probedDaysAgo: (days: number) => `sondado há ${days} dias`,
      probeRecords: (records: number, latest: string) =>
        `${records} registos${latest ? `, o mais recente ${latest}` : ''}`,
      probeEmpty: 'sem dados',
      probeRefused: 'endpoint recusado',
      probeFailed: 'o pedido falhou',
      codesTitle: 'Códigos de treino não identificados',
      codesUnnamed: (count: number) => `${count} ainda sem nome`,
      codesIntro:
        'Os modelos de treino personalizados da Zepp dão um número sem nome, e o catálogo incorporado também não tem nada para eles. Em vez de adivinhar um desporto e servir-to, dá um nome ao código uma vez tu mesmo — cada registo com esse código passa a usar o teu nome, e a página do treino diz claramente que é teu.',
      codeNumber: (code: number) => `Código Zepp ${code}`,
      codeRecords: (count: number) => `${count} registos locais passam a ter esse nome`,
      codeShownAs: (label: string) => `Atualmente mostrado como «${label}»`,
      codeShownAsUnknown: (code: number) =>
        `Atualmente mostrado como «Treino não reconhecido (código ${code})»`,
      codeInputAria: (code: number) => `Nome personalizado para o código ${code}`,
      codeInputPlaceholder: 'Dá-lhe um nome, p.ex. A minha sessão de core',
      codeSaving: 'A guardar…',
      codeSave: 'Guardar',
      codeFootnote:
        'O nome fica neste computador, nunca é enviado de volta ao Zepp, e sobrevive a uma re-interpretação. Guarda-o vazio para o limpar.',
      codeSaved: (code: number, label: string) => `O código ${code} agora aparece como «${label}».`,
      codeCleared: (code: number) => `O nome personalizado do código ${code} foi limpo.`,
      codeSaveFailed: 'Não foi possível guardar o nome de treino personalizado',
      codeSuggestions: ['Força', 'Core', 'HIIT', 'Alongamentos', 'Reabilitação', 'Sessão personalizada'],
      privacyTitle: '4. Privacidade e segurança',
      privacyDbTitle: 'A base de dados local não é cifrada',
      privacyDbBody:
        'Os dados de saúde são guardados como SQLite em texto simples na pasta de dados da app, protegidos pela tua conta Windows / macOS e pela cifragem do disco. O ZeppBridge não cifra a base de dados inteira, e não finge que o faz.',
      privacyTokenTitle: 'Os tokens Zepp usam o cofre de credenciais do sistema por predefinição',
      privacyTokenBody:
        'A predefinição é o Gestor de Credenciais do Windows / Keychain do macOS / keyring do Linux. O macOS e o Linux podem usar explicitamente um ficheiro de credenciais em texto simples que só o teu utilizador lê e escreve; o Linux também suporta variáveis de ambiente. O auth.json guarda apenas metadados de conta e região. Os tokens nunca entram em logs, exportações de dados ou relatórios de erro.',
      privacyTelemetryTitle: 'Sem telemetria, sem estatísticas de uso',
      privacyTelemetryBody:
        'A app não reporta comportamento de uso por iniciativa própria. Só quando premes tu «Enviar um relatório de erro» é que envia os campos desidentificados listados abaixo.',
      privacyModalLink: 'Ler os princípios de privacidade local',
      privacyReportTitle: 'Um dispositivo ou treino não reconhecido?',
      privacyReportBody:
        'Sem conta GitHub, sem copiar dados. Ao confirmar envia apenas formas de campos ao nível do produto, a versão de firmware, números ao nível do modelo (inteiros, que dizem só qual o modelo) e códigos de treino desconhecidos com as suas contagens, para o armazenamento privado de relatórios de erro do ZeppBridge. Nunca envia a tua conta, tokens, números de série, IDs de dispositivo, endereços MAC, GPS, valores de saúde, respostas em bruto ou caminhos locais.',
      mcpTitle: '5. MCP (deixa as ferramentas de IA consultarem os teus dados locais)',
      mcpBadge: 'Só de leitura · não escuta em nenhuma porta',
      mcpSkip:
        'Se MCP não te diz nada, salta esta secção — não afeta nenhuma funcionalidade do ZeppBridge.',
      mcpCompareA: 'Em uma linha: «Entregar à IA» és tu a exportar e colar; MCP é ',
      mcpCompareStrong: 'a IA a pedir por ela',
      mcpCompareB:
        ' — uma vez configurado, dizes «como dormi este mês» e ela consulta a tua base de dados local. Só é útil para ferramentas de IA de programação instaladas no teu computador (Claude Code, Codex, Grok e afins).',
      mcpAskA: 'A configuração muda de ferramenta para ferramenta, por isso, em vez de escrever um testamento aqui, ',
      mcpAskStrong: 'copia o texto abaixo para a IA que realmente usas',
      mcpAskB: ' e deixa que ela te guie na tua própria máquina.',
      mcpCopyPrompt: 'Copiar isto e perguntar à tua IA',
      mcpCopyConfig: 'Copiar só o excerto de configuração',
      mcpToolsLead: 'Uma vez configurada, a IA consegue perguntar sobre estas cinco coisas:',
      mcpFootA:
        ' vai incluído no pacote de ferramentas em cada Release, na mesma versão que a aplicação de desktop. Lê a mesma base de dados local, por isso o que vê é exatamente o que vês aqui.',
      mcpPromptCopied:
        'Copiado. Cola-o na IA que usas e ela dá-te os passos de configuração para a tua máquina.',
      mcpPromptCopyFailed: 'A cópia falhou. Seleciona o texto acima à mão.',
      mcpConfigCopied:
        'Configuração copiada. Substitui command pelo caminho real do zeppbridge-mcp na tua máquina.',
      mcpConfigCopyFailed: 'A cópia falhou. Seleciona a configuração acima à mão.',
      mcpToolListWorkouts: 'Lista de treinos, mais recentes primeiro',
      mcpToolWorkoutInsight: 'Um treino contra a tua própria referência',
      mcpToolMetricSeries: 'Séries de métricas dia a dia, cada uma com a sua unidade',
      mcpToolSleepDetail: 'Uma noite de sono, fase a fase',
      mcpToolDataHealth: 'Estado de obtenção/interpretação/escrita de cada fluxo',
      mcpSetupPrompt:
        'Uso uma aplicação de desktop para Windows chamada ZeppBridge que sincroniza os dados do meu relógio Amazfit / Zepp para uma base de dados SQLite local.\r\nEla traz um programa MCP (zeppbridge-mcp) e quero configurá-lo contigo, para poderes consultar os meus treinos e dados de saúde diretamente em vez de eu estar sempre a exportar e colar.\r\n\r\nO que sei sobre ele:\r\n- O programa MCP vem no pacote zeppbridge-tools na página de GitHub Releases do ZeppBridge; descompacta-o e o zeppbridge-mcp está lá dentro. Posso ainda não o ter transferido.\r\n- É um servidor MCP stdio. Lê a base de dados local, não usa a rede, não escuta em nenhuma porta e não precisa de token nem de API key.\r\n- A forma típica da configuração é: {"mcpServers": {"zeppbridge": {"command": "<caminho completo para o zeppbridge-mcp>", "args": []}}}\r\n- Expõe cinco ferramentas só de leitura: list_workouts, get_workout_insight (um treino contra a minha própria referência), get_metric_series (séries de métricas dia a dia), get_sleep_detail (uma noite, fase a fase) e get_data_health (estado de obtenção/interpretação/escrita por fluxo).\r\n\r\nDiz-me por favor:\r\n1. Para ti em concreto — a ferramenta com quem estou a falar agora — em que ficheiro vai a configuração, ou que comando a adiciona;\r\n2. Como escrever um caminho do Windows (as barras invertidas precisam de escape?);\r\n3. Como verificar que funciona depois de configurado.\r\n\r\nSe precisares de algo meu (que cliente uso, onde fica o ficheiro), pergunta.',
      mcpConfigPathPlaceholder: '<caminho para o zeppbridge-mcp>',
      retentionTitle: '6. Retenção de dados locais',
      retentionLabel: 'Guardar durante',
      retentionAria: 'Retenção de dados locais em dias',
      retentionNote: (days: number) =>
        `Guarda os últimos ${days} dias localmente. A poda acontece `,
      retentionNoteStrong: 'depois de uma sincronização bem-sucedida',
      retentionNoteTail: ', nunca sozinha em segundo plano.',
      retentionCutoff: (date: string) =>
        `Depois da próxima sincronização bem-sucedida, dados mais antigos que ${date} são podados`,
      cleaningUp: 'A limpar…',
      cleanupNow: 'Limpar agora',
      reprocessing: 'A reinterpretar…',
      reprocessNow: 'Reinterpretar',
      days: (days: number) => `${days} dias`,
      lastDays: (days: number) => `Últimos ${days} dias`,
      exportTitle: '7. Predefinições de exportação e reposição',
      defaultFormatLabel: 'Formato de exportação predefinido',
      defaultFormatAria: 'Formato de exportação predefinido',
      historyRangeLabel: 'Intervalo da reposição de histórico',
      historyRangeAria: 'Dias da reposição de histórico',
      exportNote:
        'Define o formato predefinido na página «Entregar à IA» e a janela de reposição da nuvem.',
      startBackfill: 'Começar uma reposição de histórico',
      formatJsonHint: 'Dados estruturados',
      formatCsvHint: 'Dados tabulares',
      formatGpxHint: 'Trajetos de treinos',
      updateTitle: '8. Atualizações de software',
      updateSub: 'Verifica discretamente no máximo uma vez por dia; também podes verificar à mão.',
      updateChecking: 'A verificar…',
      updateCheck: 'Procurar atualizações',
      updateCurrent: (version: string) => `Atualmente ${version}`,
      updateVersion: (version: string) => `Versão ${version}`,
      buildStamp: (stamp: string) => `Build ${stamp}`,
      updateVersionLoading: 'a carregar',
      updateSeeNotes: 'Ver o que mudou',
      updateStatusIdle: 'Ainda não verificado',
      updateStatusChecking: 'A verificar o GitHub Releases',
      updateStatusAvailable: (version: string) => `A versão ${version} está disponível`,
      updateStatusDownloading: 'A transferir a atualização',
      updateStatusDownloadingPercent: (percent: number) => `A transferir ${percent}%`,
      updateStatusInstalling: 'A instalar; a app reinicia quando terminar',
      updateStatusFailed: 'A atualização falhou',
      updateStatusUpToDate: 'Estás na versão mais recente',
      updateStatusUnmanaged: 'As atualizações vêm do teu gestor de pacotes',
      updateUnmanagedHint: (version: string) =>
        `Em ${version}. Esta build atualiza-se através do Flatpak ou do gestor de pacotes da tua distribuição: corre flatpak update com.zeppbridge.app, ou atualiza o pacote.`,
      releaseNotesEmpty: 'Esta versão não traz notas.',
      updateModalTitle: (version: string) => `O que mudou no ZeppBridge ${version}`,
      updateModalCurrent: (version: string) => `Estás na ${version}`,
      updateModalUnknownVersion: 'uma versão desconhecida',
      updateModalReleased: (date: string) => ` · lançada ${date}`,
      updateInstalling: 'A instalar…',
      updateDownloading: 'A transferir a atualização',
      updateInstallNote:
        'A app reinicia-se sozinha quando estiver instalada. Os dados de saúde locais não são eliminados.',
      updateDownloadNoteTail:
        ' · instala-se automaticamente quando terminar; podes continuar a ler as notas acima',
      updateDownloadNote:
        'Instala-se automaticamente quando terminar; podes continuar a ler as notas acima.',
      updateFailedPrefix: (reason: string) => `A atualização falhou: ${reason}`,
      updateRestartNote:
        'A app reinicia durante a instalação. Os dados de saúde locais não são eliminados.',
      updateBackground: 'Continuar em segundo plano',
      updateLater: 'Agora não',
      updateRetry: 'Tentar novamente',
      updateInstall: 'Transferir e instalar',
      syncTitle: '9. Sincronização automática',
      syncDescA: (minutes: number) =>
        `Sincroniza os registos da nuvem a cada ${minutes} minutos enquanto a app está aberta`,
      syncDescB: 'Deixá-la ligada mantém as séries temporais contínuas.',
      syncIntervalAria: 'Intervalo da sincronização automática',
      minutes: (minutes: number) => `${minutes} min`,
      syncOn: 'A sincronização está ligada',
      syncOff: 'A sincronização está desligada',
      syncing: 'A sincronizar…',
      syncNow: 'Sincronizar agora',
      advancedTitle: 'Avançado e manutenção',
      advancedSub: 'Escala, a pasta de dados e limpar credenciais. Só quando precisares.',
      scaleLabel: 'Escala da interface',
      scaleNote: '100% é a referência do design. Ctrl + / Ctrl - também funcionam.',
      dataAuthLabel: 'Dados e credenciais',
      dataAuthNote: (days: number) =>
        `Os dados vivem na pasta de dados da app; atualmente a guardar ${days} dias.`,
      openDataFolder: 'Abrir a pasta de dados',
      clearAuth: 'Limpar credenciais',
      logout: 'Terminar sessão',
      logoutHint:
        'Termina apenas a sessão da conta. Tudo o que já foi sincronizado para este computador fica, e a sincronização retoma depois de iniciares sessão outra vez.',
      logoutNoMultiAccount:
        'Alternar entre contas ainda não é suportado: se iniciares sessão com outra conta depois, as duas contas escrevem na mesma biblioteca local.',
      healthCheckLabel: 'Verificação da saúde dos dados',
      healthCheckNote:
        'Até onde cada fluxo de dados chegou a obter da nuvem, interpretar e escrever localmente; que datas cobre; de onde veio. Não é para veres todos os dias — vem aqui quando um resultado de sincronização não bater certo com o que esperavas.',
      healthCheckOpen: 'Abrir a verificação da saúde dos dados',
      compactLabel: 'Compactar pacotes guardados',
      compactNoteA:
        'Os pacotes da nuvem em bruto ocupam a maior parte desta base de dados. São texto JSON e normalmente comprimem para cerca de um quinto.',
      compactNoteStrong: 'Isto acontece automaticamente',
      compactNoteB:
        ': na primeira vez que uma nova versão arranca, o segundo plano compacta o que está guardado, um banner avisa, e desaparece quando termina. Este botão só corre isso outra vez à mão (digamos, se foi interrompido). Antes de substituir o que quer que seja descomprime e compara byte a byte, saltando qualquer pacote que não corresponda — o pacote em bruto é a única base para um replay, por isso prefere deixá-lo quieto. Um VACUUM corre a seguir, que é o que realmente encolhe o ficheiro em disco.',
      compacting: 'A compactar… (uns minutos numa base de dados grande)',
      compactRun: 'Compactar pacotes guardados',
      backupLabel: 'Snapshots da base de dados e restauro',
      backupNote:
        'Uma cópia da base de dados inteira para recuperação de desastre, legível só pelo ZeppBridge. Uma é criada automaticamente antes de uma atualização da base de dados; raramente precisas de o fazer à mão.',
      localApiLabel: 'API REST local',
      localApiNote:
        'Para outros programas neste computador — scripts, dashboards, as tuas ferramentas — lerem séries de treinos normalizadas como JSON. Se não tens essa necessidade, deixa desligada.',
      syncDiagnostics: 'Diagnósticos de sincronização',
      noSyncDiagnostics: 'Ainda sem diagnósticos de sincronização.',
      apiTitle: 'API REST local',
      apiSub:
        'Permite que outros programas neste computador leiam séries de treinos normalizadas como JSON. Desligada por predefinição; ligas-la explicitamente.',
      apiListening: 'A escutar',
      apiEnabledNotListening: 'Ligada mas sem escutar',
      apiOff: 'Desligada',
      apiToggleTitle: 'Ativar a API local',
      apiToggleSub: (address: string) =>
        `Tem efeito imediato, sem reinício. Desligar liberta ${address} de imediato.`,
      apiToggleAria: 'Ativar a API REST local',
      apiCopyExample: 'Copiar um exemplo autenticado',
      apiTokenLabel: 'Token de acesso',
      apiHide: 'Esconder',
      apiShow: 'Mostrar',
      apiCopy: 'Copiar',
      apiRegenerate: 'Regenerar',
      apiAuthNoteA: 'Cada pedido tem de trazer ',
      apiAuthNoteB:
        ', senão recebe um 401. Regenerar invalida o token antigo de imediato.',
      apiBindNote:
        'Vinculada apenas a 127.0.0.1: só de leitura, sem acesso cross-origin de browsers, e não devolve credenciais. Para quando sais do ZeppBridge.',
      apiTokenReadFailed: 'Não foi possível ler o token de acesso da API local',
      apiEnabled: 'A API local está ligada. Sem reinício necessário.',
      apiDisabled: 'A API local está desligada e a porta foi libertada.',
      apiToggleFailed: 'Não foi possível mudar o estado da API local',
      apiTokenCopied: 'Token de acesso copiado para a área de transferência.',
      apiTokenCopyFailed:
        'Não foi possível escrever na área de transferência. Prime «Mostrar» e copia à mão.',
      apiRegenerateConfirm:
        'Regenerar invalida o token antigo de imediato, e cada programa local configurado com ele precisa de ser atualizado. Continuar?',
      apiTokenRegenerated: 'Foi gerado um novo token de acesso. O antigo é inválido.',
      apiRegenerateFailed: 'Não foi possível regenerar o token de acesso',
      apiExampleCopied: 'O exemplo autenticado foi copiado (contém o teu token de acesso).',
      apiExampleCopyFailed:
        'Não foi possível copiar o exemplo. Junta o URL do endpoint e o cabeçalho Authorization à mão.',
      privacyModalTitle: 'Princípios de privacidade local do ZeppBridge',
      privacyPoint1Title: '1. Local primeiro: ',
      privacyPoint1:
        'todas as séries temporais de saúde e treino vivem só na base de dados SQLite local; a interpretação e a desidentificação acontecem inteiramente neste computador.',
      privacyPoint2Title: '2. As credenciais ficam isoladas: ',
      privacyPoint2:
        'o App Token e o User ID não são partilhados com nenhum terceiro, e uma exportação para IA desidentifica-os irreversivelmente.',
      privacyPoint3Title: '3. Localização sob controlo: ',
      privacyPoint3:
        'as coordenadas GPS nunca vão para a área de transferência da IA por predefinição, mantendo privados a tua casa e os teus trajetos habituais.',
      privacyPoint4Title: '4. Os relatórios de erro são uma decisão tua: ',
      privacyPoint4:
        'só depois de premires e confirmares «Enviar um relatório de erro» é que envia uma lista fixa de diagnósticos ao nível do produto. Nunca envia a tua conta, IDs de dispositivo, detalhes de treinos ou dados de saúde, e nunca abre uma issue no GitHub por ti.',
      privacyPoint5Title: '5. Código aberto em tudo: ',
      privacyPoint5: 'o código inteiro é aberto, sem lógica escondida de envio para casa.',
      privacyModalOk: 'Entendido',
      closeDialog: 'Fechar o diálogo',
      connExtracting: 'A extrair os detalhes de início de sessão',
      connVerifying: 'A verificar',
      connWaiting: 'À espera do início de sessão',
      connFailed: 'O início de sessão falhou',
      unidentified: 'Não identificado',
      unidentifiedInitial: 'N',
      notProvided: 'Não fornecido',
      noRecords: 'Ainda sem registos',
      timeUnknown: 'Hora desconhecida',
      cloudService: 'Serviço na nuvem',
      refreshFailed: (reason: string) => `A identificação falhou; voltou à cache local${reason}`,
      refreshFailedReason: (reason: string) => `: ${reason}`,
      refreshFailedPeriod: '.',
      refreshDone: (count: number) =>
        `Identificação terminada; ${count} dispositivos físicos encontrados.`,
      refreshNoNewList: 'Não veio nenhuma lista de dispositivos nova; a mostrar a cache local.',
      loginIncomplete: 'O início de sessão não terminou',
      loginWindowFailed: 'Não foi possível abrir a janela de início de sessão',
      loginCancelFailed: 'Não foi possível cancelar o início de sessão',
      harFilter: 'Ficheiro HAR',
      harImported: 'Ficheiro HAR importado; as credenciais estão guardadas.',
      harImportFailed: 'A importação HAR falhou',
      filePickerFailed: 'Não foi possível abrir o seletor de ficheiros',
      fillAllFields: 'Preenche todos os campos obrigatórios',
      manualAuthDone: 'Autenticação manual concluída; as credenciais estão guardadas.',
      manualAuthFailed: 'A autenticação manual falhou',
      verifyFailed: 'A verificação não terminou',
      clearAuthConfirm:
        'Terminar sessão desta conta?\n\nSó as credenciais de início de sessão são limpas; tudo o que já foi sincronizado para este computador fica.\n\nNota: alternar entre contas ainda não é suportado — iniciar sessão com outra conta escreve as duas na mesma biblioteca local.',
      authCleared:
        'Sessão terminada. Tudo o que já foi sincronizado para este computador continua aqui.',
      clearAuthFailed: 'Não foi possível limpar as credenciais',
      reprocessed: (count: number) =>
        `Dados locais reinterpretados em ${count} registos normalizados. A hora de sincronização da nuvem não mudou.`,
      reprocessFailed: 'A reinterpretação dos dados locais falhou',
      cleanupConfirm: (days: number) =>
        `Limpar dados locais com mais de ${days} dias? Não é possível anular.`,
      cleanupDone: (days: number) => `Os dados com mais de ${days} dias foram limpos.`,
      cleanupFailed: 'A limpeza de dados antigos falhou',
      openFolderFailed: 'Não foi possível abrir a pasta de dados',
      nothingToCompact: 'Nada para compactar — os pacotes guardados já estão comprimidos.',
      compactSkipped: (count: number) =>
        `, ${count} saltados (não ficaram mais pequenos depois de comprimir, ou a verificação não correspondeu)`,
      compactDone: (count: number, before: string, after: string, saved: string, skipped: string) =>
        `${count} pacotes compactados, ${before} → ${after}, poupando ${saved}${skipped}.`,
      compactFailed: 'A compactação dos pacotes guardados falhou',
      retentionConfirm: (days: number) =>
        `A próxima sincronização bem-sucedida vai eliminar definitivamente os dados locais com mais de ${days} dias. Continuar?`,
      prefsSavedNoEstimate:
        'Definições guardadas, mas a estimativa de espaço em disco está indisponível neste momento',
      prefsSaved: 'Definições de retenção e reposição guardadas.',
      prefsSaveFailed: 'Não foi possível guardar as definições',
      syncInProgress: 'Há uma sincronização a decorrer. Repõe quando terminar',
      backfillYearCap:
        '\nUm ano é o limite; registos da nuvem mais antigos que isso não vêm para este computador.',
      backfillConfirm: (days: number, low: number, high: number, extra: string) =>
        `Repor ${days} dias demora cerca de ${low}–${high} minutos (estimativa). Mantém a app aberta; podes cancelar a qualquer momento.${extra}`,
      backfillTightSpace: (message: string, days: number) =>
        `${message}\nAinda queres repôr ${days} dias? Considera primeiro 30 dias.`,
      stream: {
        heart_rate: 'Frequência cardíaca',
        sleep: 'Sono',
        workouts: 'Treinos',
        steps: 'Passos',
        daily_activity: 'Atividade diária',
        stress: 'Stress',
        spo2: 'Métricas de SpO2 noturno',
        respiratory_rate: 'Frequência respiratória',
        hrv: 'HRV (SDNN)',
        hrv_rmssd: 'HRV (RMSSD)',
        recovery: 'Prontidão e energia',
        training_load: 'Carga de treino',
        vo2max: 'VO₂max',
        lactate_threshold: 'Limiar de lactato',
        pai: 'PAI',
        blood_pressure: 'Tensão arterial',
        weight: 'Peso',
        emotion: 'Humor',
        food: 'Registo alimentar (calorias e macros)',
        second_heart_rate: 'Índice de frequência cardíaca por segundo',
        spo2_files: 'Índice de ficheiros SpO2 em bruto por leitura',
      },
      unitDays: 'dias',
      unitRecords: 'registos',
      capabilityNoRecords: (days: number) => `Nada registado nos últimos ${days} dias`,
      capabilityNotIngested:
        'A nuvem tem registos, mas ainda não há dados utilizáveis guardados localmente. Tenta sincronizar ou repor; se os registos continuarem sem aparecer, o formato do pacote pode precisar de suporte adicional.',
      capabilityFoodHistoryHint: 'Há registos alimentares na nuvem, mas ainda não estão guardados localmente. Se forem anteriores ao período da sincronização incremental, sincroniza o histórico que inclua essas datas. Se continuarem sem aparecer, comunica o formato dos dados.',
      capabilityUnsupported: 'A tua conta ou dispositivo não fornece isto',
      capabilityNoneProbed: (days: number) => `Nenhuma medição nos últimos ${days} dias`,
      capabilityNotProbed: 'Ainda não sondado',
      capabilityLocal: (records: number, unit: string, latest: string) =>
        `${records} ${unit}${latest ? ` · até ${latest}` : ''}`,
      capabilityCloud: (records: number, unit: string, latest: string) =>
        `${records} ${unit} na nuvem${latest ? ` · até ${latest}` : ''}`,
      reportCategory: {
        device: {
          label: 'Um dispositivo não foi reconhecido',
          hint: 'o modelo está errado, ou aparece como «Não identificado»',
        },
        workout: {
          label: 'Um tipo de treino não foi reconhecido',
          hint: 'aparece como treino desconhecido, ou como o desporto errado',
        },
        data: {
          label: 'Os números não batem certo',
          hint: 'algo está sempre vazio, ou difere da app Zepp',
        },
        other: {
          label: 'Outra coisa',
          hint: 'descreve-a abaixo',
        },
      },
    },
    App: {
      quickReturn: (page: string) => `Voltar a ${page}`,
      navRecent: 'registos recentes',
      skipToContent: 'Saltar para o conteúdo principal',
      mainNav: 'Navegação principal',
      bottomNav: 'Navegação principal móvel',
      navOverview: 'Visão geral',
      navHandoff: 'Entregar à IA',
      navSettings: 'Definições',
      preparingData:
        'A abrir a tua base de dados local — o primeiro arranque depois de uma atualização pode demorar uns segundos…',
      compacting: (pending: number) =>
        `A compactar pacotes guardados (faltam ${pending}). Isto limpa-se sozinho; a sincronização espera a sua vez.`,
      compacted: (saved: string) =>
        `Pacotes guardados compactados; cerca de ${saved} de disco recuperados.`,
      trayHint:
        'Fechar a janela mantém o ZeppBridge na área de notificação, por isso a sincronização automática continua.',
      browserPreview:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      routeNotFound: 'Essa página não existe, por isso voltaste à visão geral.',
    },
    'components/BackupPanel': {
      title: 'Snapshots da base de dados e restauro',
      intro1a: 'Um snapshot é uma cópia completa de todo o ficheiro ',
      intro1b:
        '. Fica nesta máquina e nunca é enviado para lado nenhum. Um é criado automaticamente antes de uma atualização da base de dados, e podes criar um quando quiseres.',
      compareLead: 'Três coisas aqui se chamam «exportação», e não são a mesma coisa: ',
      compareExchange:
        ' são intercâmbio de dados para outras ferramentas e só trazem o intervalo que escolheste;',
      compareSnapshotName: 'um snapshot da base de dados',
      compareSnapshot:
        ' é uma cópia da base de dados inteira para recuperação de desastre que só o ZeppBridge consegue reler;',
      comparePackName: 'um pacote de IA',
      comparePack:
        ' é material que escolhes e desidentificas de propósito para um modelo externo. Só um snapshot consegue repor a base de dados como estava.',
      pendingTitle: 'Há um restauro agendado',
      pendingBodyA: (stagedAt: string) =>
        `Agendado ${stagedAt}. A base de dados será substituída no `,
      pendingNextStart: 'próximo arranque',
      pendingBodyB:
        '. A base de dados atual já ficou guardada como ponto de reversão, por isso podes voltar atrás a partir dela.',
      cancelRestore: 'Cancelar o restauro',
      creating: 'A criar…',
      createSnapshot: 'Criar um snapshot',
      refreshList: 'Atualizar',
      noSnapshots: 'Ainda sem snapshots.',
      pinned: 'Mantido',
      metaLine: (size: string, appVersion: string, schemaVersion: number) =>
        `${size} · app ${appVersion} · esquema ${schemaVersion}`,
      coverage: (from: string, to: string) => ` · amostras ${from} ~ ${to}`,
      noSamples: ' · sem amostras de saúde neste snapshot',
      verifyFailed: (problem: string) => `A verificação falhou: ${problem}`,
      problemFileMissing: 'O ficheiro de cópia já não está na pasta de cópias',
      problemSizeMismatch:
        'O tamanho do ficheiro de cópia não corresponde ao manifesto — pode estar danificado',
      problemSha256Mismatch:
        'O SHA-256 do ficheiro de cópia não corresponde ao manifesto — pode estar danificado ou alterado',
      problemIntegrityFailed:
        'O ficheiro de cópia não passou na verificação de integridade do SQLite',
      problemUnknown:
        'Este snapshot falhou na verificação e não foi registado nenhum motivo.',
      blockerFutureSchema: (backup: number, current: number) =>
        `Este snapshot vem de um ZeppBridge mais recente (esquema ${backup}, esta app é ${current}). Abri-lo aqui perderia campos, por isso não será restaurado e a biblioteca atual fica como está. Atualiza primeiro o ZeppBridge.`,
      blockerUnknown:
        'Este snapshot não pode ser restaurado neste momento, e não foi registado nenhum motivo.',
      verifyPassed:
        'Acabou de ser reverificado: ficheiro, tamanho, SHA-256 e integridade batem todos certo.',
      integrityOk: (sha: string) =>
        `Verificação de integridade passada à criação · SHA-256 ${sha}…`,
      integrityBad:
        'A verificação de integridade falhou à criação. Não restaures a partir dele.',
      verifyAgain: 'Verificar novamente',
      unpin: 'Deixar de manter',
      pin: 'Manter',
      restoreToThis: 'Restaurar para este',
      previewTitle: 'Pré-visualização do restauro',
      compatibilityUnknown: 'Compatibilidade desconhecida.',
      colContent: 'Conteúdo',
      colBackup: 'No snapshot',
      colCurrent: 'Atual',
      colDelta: 'Diferença',
      previewNote:
        'As linhas com diferença negativa ficam com menos esse número de registos depois do restauro. Um restauro nunca vai buscar nada à nuvem, por isso, se ainda precisares desses dados, sincroniza outra vez quando terminar.',
      staging: 'A agendar…',
      stageRestore: 'Agendar o restauro (tem efeito no próximo arranque)',
      cancel: 'Cancelar',
      listFailed: 'Não foi possível ler a lista de snapshots',
      created: (size: string) =>
        `Snapshot criado: ${size}, verificação de integridade passada.`,
      createFailed: 'Não foi possível criar o snapshot',
      verifyError: 'A verificação falhou',
      pinFailed: 'Não foi possível mudar o estado de «manter»',
      previewFailed: 'Não foi possível construir a pré-visualização do restauro',
      staged:
        'O restauro está agendado. Nada muda nesta execução; a base de dados é substituída na próxima vez que o ZeppBridge arrancar.',
      stageFailed: 'Não foi possível agendar o restauro',
      cancelled: 'O restauro agendado foi cancelado. A base de dados ficou igual.',
      cancelFailed: 'Não foi possível cancelar o restauro',
      kind: {
        manual: 'manual',
        pre_migration: 'antes da atualização',
        pre_restore: 'ponto de reversão',
      },
      compatibility: {
        same_schema:
          'O snapshot tem a mesma versão de esquema que esta app, por isso restaura diretamente.',
        older_schema_will_migrate:
          'O snapshot vem de uma versão de esquema mais antiga. Depois de restaurado, atualiza-se sozinho no próximo arranque.',
        future_schema_refused:
          'O snapshot vem de uma versão da app mais recente cuja estrutura esta app não consegue ler, por isso não pode ser restaurado.',
      },
      table: {
        raw_records: 'Pacotes em bruto',
        life_events: 'Acontecimentos de vida',
        workouts: 'Treinos',
        daily_metrics: 'Métricas diárias',
        workout_samples: 'Amostras de treino',
        metric_samples: 'Amostras de métricas',
        sleep_sessions: 'Sono',
      },
    },
    'components/CoverageNotice': {
      empty:
        'Ainda não há nada nesta máquina. Faz uma sincronização e os gráficos terão o que desenhar.',
      emptyAfterSync:
        'A sincronização terminou mas não trouxe nada. Ou esta conta não tem dados deste período no Zepp, ou o relógio ainda não enviou nada para a app Zepp. Vê primeiro a app Zepp no telemóvel e depois sincroniza aqui outra vez.',
      emptyUnconfirmedRegion:
        'A sincronização terminou mas não trouxe nada. O início de sessão não conseguiu confirmar a que região Zepp pertence a tua conta, por isso o ZeppBridge está a usar o seu melhor palpite — e uma sincronização apontada à região errada comporta-se exatamente assim: tem sucesso e não devolve nada. Tenta ligar a tua conta outra vez.',
      reconnect: 'Ligar a conta novamente',
      short: (covered: number, earliest: string) =>
        `Esta máquina guarda ${covered} dias (o mais antigo ${earliest}). Tudo antes disso está em branco porque ainda não foi obtido da nuvem — não porque não tenhas registado nada nessa altura.`,
      backfill: 'Repôr mais histórico',
      backfilling: 'A repôr…',
      syncNow: 'Sincronizar agora',
    },
    'components/DatePicker': {
      placeholder: 'Escolhe uma data',
      aria: 'Escolher uma data',
      prev: 'Mês anterior',
      next: 'Mês seguinte',
    },
    'components/DeviceMarquee': {
      marqueeAria: 'Dispositivos Amazfit atualmente no catálogo',
    },
    'components/DevicePicker': {
      pickerAria: 'Escolher o modelo do teu dispositivo à mão',
      searchAria: 'Procurar por nome de modelo',
      searchPlaceholder: 'Procura um modelo, p.ex. Balance 2',
      empty:
        'Nenhum modelo corresponde. Tenta outra palavra-chave ou volta a pôr o filtro em Todos.',
      prev: 'Modelo anterior',
      next: 'Modelo seguinte',
      alreadyAssigned: 'Já é este',
      confirm: 'É este o meu dispositivo',
      clear: 'Retirar a escolha',
      later: 'Agora não',
      contributeTitle: 'Ajuda a próxima versão a reconhecer este dispositivo sozinha',
      contributeBody:
        'Envia ao ZeppBridge o modelo que escolheste mais os números de modelo deste dispositivo (deviceSource / deviceType, só inteiros). Ambos dizem que relógio é e nada mais: sem conta, sem número de série, sem MAC, sem dados de saúde. A Huami não publica nenhuma tabela de correspondência para esses números, por isso é a única maneira de o catálogo incorporado crescer. Quando algumas pessoas tiverem apontado para um modelo, ele passa a ser reconhecido automaticamente para toda a gente.',
      note: 'A tua escolha aparece como «Modelo que escolheste» e nunca é apresentada como correspondência automática. As imagens e os nomes de modelos vêm do catálogo incorporado; folheá-los não toca na rede.',
      filterAll: 'Todos',
      filterWatch: 'Relógios',
      filterBand: 'Pulseiras',
      filterStrap: 'Correias',
      filterRing: 'Anéis',
      filterEarbuds: 'Auriculares',
    },
    'components/DeviceVisual': {
      watch: 'Relógio',
      strap: 'Correia',
      ring: 'Anel',
      band: 'Pulseira',
      earbuds: 'Auriculares',
      scale: 'Balança',
      unknown: 'Dispositivo',
    },
    'components/HeartRateZonePicker': {
      title: 'Zonas de frequência cardíaca',
      intro:
        'Os três modelos desenham zonas diferentes, e só tu sabes qual deles significa algo para ti — por isso o ZeppBridge não escolhe nenhuma predefinição e nunca estima a partir de uma fórmula como 220 menos a tua idade. Cada base abaixo traz a sua origem e a data em que foi medida.',
      clearChoice: 'Limpar a seleção',
      desktopOnly:
        'Abre isto na aplicação de desktop do ZeppBridge; as zonas de frequência cardíaca leem registos locais.',
      noBases:
        'Ainda não há nenhuma base de frequência cardíaca nesta máquina. Depois de uma sincronização de treinos, valores medidos como a tua frequência cardíaca mais alta registada aparecem aqui.',
      modelGroup: 'Modelo',
      modelAria: 'Modelo de zonas de frequência cardíaca',
      pickModelFirst:
        'Escolhe um modelo e as zonas são calculadas a partir das bases que escolheres.',
      pickBasesNext:
        'Escolhe acima as bases que faltam para teres as zonas e o tempo passado em cada uma.',
      window: (days: number, total: string) =>
        `Frequência cardíaca de treino segundo a segundo ao longo de ${days} dias · ${total} no total`,
      outside: (below: string, above: string) =>
        `Fora das zonas: abaixo de Z1 ${below} · acima de Z5 ${above}`,
      formulaNote: (formula: string, bases: string) =>
        `${formula}. Os limites arredondam para baixo, como no relógio. Bases: ${bases}`,
      missingBases: (list: string) => `Ainda não estão nesta máquina: ${list}`,
      basesSeparator: ', ',
      zonesUnavailable:
        'As zonas de frequência cardíaca estão indisponíveis neste momento',
      saveFailed:
        'Não foi possível guardar as definições de zonas de frequência cardíaca',
      zeroMinutes: '0 min',
      durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
      kind: {
        max_hr: 'Base de FC máx',
        resting_hr: 'Base de FC em repouso',
        threshold_hr: 'Base de FC limiar',
      },
      model: {
        max_hr: {
          label: 'Zonas de frequência cardíaca máxima',
          formula: 'Limite da zona = frequência cardíaca máxima × percentagem',
        },
        hr_reserve: {
          label: 'Zonas de reserva de frequência cardíaca',
          formula: 'Limite da zona = FC em repouso + (FC máx − FC em repouso) × percentagem',
        },
        lactate_threshold: {
          label: 'Zonas de limiar de lactato',
          formula: 'Limite da zona = frequência cardíaca limiar × percentagem',
        },
      },
      percentBands: ['Aquecimento', 'Queima de gordura', 'Aeróbica', 'Anaeróbica', 'Máximo'],
      thresholdBands: ['Fácil', 'Resistência', 'Tempo', 'Limiar', 'Anaeróbica'],
      basis: {
        observed_max: {
          label: 'Frequência cardíaca mais alta registada',
          note: 'A frequência cardíaca mais alta registada localmente. Se nunca foste a um limite real, as zonas saem estreitas.',
        },
        device_max: {
          label: 'Frequência cardíaca máxima reportada pelo relógio',
          note: 'O que o relógio reporta no seu pacote PAI, normalmente tirado do teu perfil na app Zepp.',
        },
        device_resting: {
          label: 'Frequência cardíaca em repouso reportada pelo relógio',
          note: 'O que o relógio reporta no seu pacote PAI.',
        },
        lactate_threshold: {
          label: 'Frequência cardíaca de limiar de lactato',
          note: 'Medida pelo relógio depois de uma corrida forte.',
        },
        computed_resting: {
          label: 'Frequência cardíaca em repouso calculada localmente',
          note: '' as string, // en/zh são propositadamente vazios
        },
      },
      computedRestingNote: (days: number) =>
        `Média dos ${days} dias com dados nos últimos 30.`,
    },
    'components/HistoryArchivePanel': {
      title: 'Arquivo de longo prazo e histórico completo',
      intro:
        'O arquivo trata de «deixar de apagar daqui para a frente»; a reposição trata de «ir buscar o que veio antes». Só com as duas é que a cópia local fica mesmo completa.',
      archiveTitle: 'Arquivo de longo prazo',
      archiveBody:
        'Com isto ligado, uma sincronização bem-sucedida deixa de podar o histórico pela janela de retenção. A base de dados continua a crescer; podes desligar a qualquer momento, e desligar diz-te o que a próxima sincronização podaria.',
      archiveAria: 'Arquivo de longo prazo',
      startLabel: 'Repôr desde',
      startAria: 'Início da reposição de histórico',
      customDateLabel: 'Data de início',
      customDateAria: 'Data de início da reposição',
      estimateTitle: 'Crescimento estimado',
      estimateRate: (days: number, perDay: string) =>
        `${days} dias de amostras locais · cerca de ${perDay}/dia`,
      unmeasured: (streams: string) =>
        `Amostras locais insuficientes para estimar: ${streams}. Estas ficam de fora do total acima — melhor dizer que não sabemos do que inventar um ritmo e multiplicá-lo por anos.`,
      wouldBeCleanedUp: (requested: number, retention: number) =>
        `Esta reposição iria buscar ${requested} dias de histórico, mas esta máquina só guarda os últimos ${retention} dias — o que voltasse seria eliminado na próxima sincronização bem-sucedida. Liga primeiro o arquivo de longo prazo, ou aumenta a janela de retenção.`,
      backfilling: 'A repôr…',
      continueBackfill: 'Continuar a repôr',
      startBackfill: 'Começar a repôr',
      autoContinue: 'Correr até ao fim',
      autoContinueHint:
        'Cada ronda arranca a seguinte automaticamente até o intervalo estar todo reposto. Pára quando quiseres — nada do que já foi obtido se perde.',
      stopBackfill: 'Parar',
      stopping: 'A parar…',
      roundProgress: (done: number, total: number) =>
        `A repôr: ${done} de ${total} blocos mensais concluídos. Podes parar a qualquer momento.`,
      stoppedByUser: (remaining: number) =>
        `Parado com ${remaining} blocos mensais por fazer. Tudo o que já foi obtido fica guardado — prime «Continuar a repôr» para retomar.`,
      stalled: (remaining: number) =>
        `Faltam ${remaining} blocos mensais, mas esta ronda não moveu nenhum, por isso parou. O mais provável é estarem a falhar repetidamente — vê a lista de falhados abaixo, ou prime «Tentar novamente os meses falhados».`,
      deferredRetry:
        'Há manutenção local a decorrer. A reposição continua sozinha',
      resetLedger: 'Limpar o registo',
      ledgerTitle: 'Registo de cobertura',
      ledgerProgress: (done: number, total: number) =>
        `${done} de ${total} blocos mensais resolvidos`,
      ledgerFrom: (from: string) => ` · pedido desde ${from}`,
      ledgerComplete:
        'Todos os blocos mensais do registo estão resolvidos: ou escritos localmente, ou a nuvem disse claramente que não tem nada desse período.',
      ledgerIncomplete: (remaining: number) =>
        `${remaining} blocos continuam por resolver. Enquanto não estiverem todos feitos, esta cópia local é uma cópia do intervalo sincronizado com sucesso — não uma cópia completa.`,
      ledgerStats: (persisted: number, empty: number, pending: number) =>
        `${persisted} escritos · ${empty} vazios na nuvem · ${pending} por fazer`,
      ledgerFailed: (failed: number) => `${failed} falharam`,
      ledgerRange: (from: string, to: string, records: number) =>
        `${from} ~ ${to} · ${records} registos`,
      ledgerNothingWritten: 'Ainda não foi escrito nenhum mês',
      range1y: 'Último ano',
      range2y: 'Últimos 2 anos',
      range3y: 'Últimos 3 anos',
      rangeAll: (years: number) => `Todo o histórico disponível (até ${years} anos)`,
      rangeCustom: 'Início personalizado',
      confirmDisableArchive:
        'Com o arquivo de longo prazo desligado, a próxima sincronização bem-sucedida poda os dados antigos pela janela de retenção, e isso não tem anulação.\nSe acabaste de repôr histórico, cria primeiro um snapshot da base de dados.\nDesligar?',
      archiveEnabled:
        'Arquivo de longo prazo ligado: as sincronizações bem-sucedidas deixam de podar o histórico.',
      archiveDisabled:
        'Arquivo de longo prazo desligado: a próxima sincronização bem-sucedida poda pela janela de retenção.',
      archiveSaveFailed: 'Não foi possível guardar a definição do arquivo',
      pickStartFirst: 'Escolhe primeiro onde começa a reposição.',
      outOfRetention:
        'Esta reposição vai além da janela de retenção local, por isso o que voltasse seria podado na próxima sincronização bem-sucedida. Liga primeiro o arquivo de longo prazo, ou aumenta a janela de retenção.',
      roundDone: (remaining: number) =>
        `Esta ronda terminou; faltam ${remaining} blocos mensais. Prime «Continuar a repôr» para retomar — podes parar quando quiseres.`,
      allChunksDone: 'Todos os blocos mensais do registo estão resolvidos.',
      backfillFailed: 'A reposição de histórico falhou',
      confirmResetLedger:
        'Isto limpa apenas o registo de cobertura. Nada do que já foi escrito localmente é eliminado, e podes planear uma nova reposição a seguir. Continuar?',
      ledgerReset: 'O registo está limpo. Podes planear um novo intervalo de reposição.',
      ledgerResetFailed: 'Não foi possível limpar o registo',
      failedTitle: 'Meses que não foi possível obter',
      failedIntro:
        'Estes blocos falharam. Todos os outros meses não foram afetados e foram repostos como habitual.',
      failedRow: (stream: string, month: string) => `${stream} · ${month}`,
      failedAttempts: (attempts: number) =>
        plural(attempts, { one: `${attempts} tentativa`, other: `${attempts} tentativas` }),
      failedExhausted:
        'As tentativas automáticas esgotaram-se. Usa «Tentar novamente os meses falhados» para tentar outra vez',
      failedNoReason: 'Sem motivo registado',
      retryFailed: 'Tentar novamente os meses falhados',
      retryFailedDone: 'Os meses falhados voltaram à fila. Podes continuar a reposição.',
      retryFailedFailed: 'Não foi possível voltar a pôr os meses falhados em fila',
      streamSeparator: ', ',
      stream: {
        heart_rate: 'Frequência cardíaca',
        daily_summary: 'Resumos diários',
        workouts: 'Treinos',
        sleep: 'Sono',
        hrv: 'Variabilidade da frequência cardíaca',
        wellness: 'Stress / SpO2 e afins',
      },
    },
    'components/InsightCard': {
      title: 'Como correu a corrida',
      unsupportedWorkoutType:
        'Ainda não há leituras para este tipo de treino. A primeira versão cobre só corrida, porque é o que foi verificado contra dados reais. Todos os outros treinos continuam a mostrar, corrigir e exportar normalmente.',
      handoff: 'Deixar a IA investigar',
      currentRun: 'Esta corrida',
      baselineRun: 'Referência',
      reading: 'A ler os registos locais…',
      comparedTo: (count: number) =>
        `Contra as tuas ${count} corridas mais recentes de distância semelhante:`,
      noComparison:
        'Ainda não há histórico comparável suficiente, por isso esta corrida reporta os seus números sem os comparar.',
      baselinePrefix: (value: string, delta: string) => `referência ${value} · ${delta}`,
      driftTitle: 'Primeira metade vs segunda',
      driftSub:
        'Divide este treino em duas metades pelo tempo e compara quantos batimentos a mesma velocidade custou.',
      driftFirst: 'Primeira metade',
      driftSecond: 'Segunda metade',
      driftPerBeat: (metres: string) => `${metres} m/batimento`,
      driftHrSpeed: (hr: number, pace: string) => `${hr} bpm · ${pace}`,
      driftDelta: (percent: string) => `${percent}%`,
      driftRising: 'Manter a mesma velocidade custou mais batimentos na segunda metade.',
      driftFlat: 'As duas metades são essencialmente iguais.',
      driftFalling: 'Cada batimento levou-te mais longe na segunda metade.',
      driftNote:
        'Isto compara o treino apenas consigo mesmo, nunca com outra pessoa. Semáforos, subidas, intervalos e desvio de GPS contaminam-no, por isso não é dado nenhum número quando o ritmo não foi estável.',
      driftUnavailable: (code: string) =>
        ({
          too_short:
            'Curto demais para dividir. Os primeiros dez minutos são sobretudo a frequência cardíaca ainda a subir, por isso compará-los com a segunda metade mede o aquecimento, não a deriva.',
          pace_too_variable:
            'O ritmo variou demais (intervalos, semáforos ou subidas têm todos este aspeto), por isso as duas metades não são comparáveis e não é dado nenhum número.',
          not_enough_samples:
            'Amostras de frequência cardíaca e velocidade ponto a ponto insuficientes neste treino para o dividir.',
          unsupported_workout_type:
            'A comparação primeira/segunda metade por agora cobre só corrida. Caminhada e ciclismo também trazem amostras suficientes, mas os limiares ainda não foram verificados contra dados reais.',
        } as Record<string, string | undefined>)[code] ?? 'Este treino não pode ser dividido.',
      baselineSummary: 'De onde vem a referência',
      baselineRule: (days: number, tolerance: number | null | undefined, min: number, max: number) =>
        `A regra: corridas do mesmo tipo dos últimos ${days} dias cuja distância fica a ±${tolerance ?? '—'}% desta, no mínimo ${min} e no máximo ${max} delas.`,
      excludedPrefix: 'Excluídas: ',
      excludedItem: (label: string, count: number) => `${label} ×${count} `,
      footnote:
        'Cada conclusão aqui compara-te com o teu próprio histórico — nunca com uma referência populacional — e nada disto é um julgamento médico. Dados em falta leem «Não fornecido» em vez de serem preenchidos com um zero.',
      notProvided: 'Não fornecido',
      durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
      metric: {
        'run.distance': 'Distância',
        'run.duration': 'Tempo',
        'run.pace': 'Ritmo médio',
        'run.avg_hr': 'FC média',
        'run.training_load': 'Carga de treino',
      },
      confidence: {
        high: 'Bem fundamentado',
        medium: 'Alguma evidência',
        low: 'Pouca evidência',
        insufficient: 'Evidência insuficiente',
      },
      exclusion: {
        distance_out_of_tolerance: 'distância muito diferente',
        missing_distance: 'sem distância',
        missing_duration: 'sem duração',
        implausible_pace: 'ritmo implausível',
        beyond_max_samples: 'além do limite de amostras',
      },
    },
    'components/MetricTrendCard': {
      latestTag: 'Mais recente',
      measuredOn: (date: string) => `medido ${date}`,
      trendAria: (label: string) => `linha de tendência de ${label}`,
      onlyOneDay:
        'Só um dia de dados neste intervalo, por isso ainda não há tendência para desenhar.',
      defaultEmpty: 'Esta métrica mostra a sua tendência depois de ser sincronizada.',
      average: 'Média',
      minimum: 'Mín',
      maximum: 'Máx',
    },
    'components/SelectMenu': {
      placeholder: 'Selecionar…',
    },
    'components/StageBar': {
      notProvided: 'Não fornecido',
      zeroMinutes: '0 min',
      hypnogramAria: 'Hipnograma de fases de sono',
      summaryAria: 'Partilha de fases de sono',
    },
    'components/WeeklyReportCard': {
      title: 'Esta semana',
      window: (recentStart: string, recentEnd: string, baseStart: string, baseEnd: string) =>
        `${recentStart} ~ ${recentEnd} · contra os teus ${baseStart} ~ ${baseEnd}`,
      legendGood: 'Verde = melhor para esta métrica',
      legendBad: 'Vermelho = pior',
      legendNote:
        'Comparado só com os teus próprios 28 dias anteriores, nunca com uma referência populacional',
      desktopOnly: 'O relatório semanal precisa da aplicação de desktop do ZeppBridge.',
      nothingComparable: 'Ainda nada comparável esta semana. Volta depois de uma sincronização.',
      loadFailed: 'Não foi possível construir o relatório semanal local',
      barsAria: (recent: string, baseline: string) =>
        `Esta semana ${recent}, 28 dias anteriores ${baseline}`,
      barThisWeek: 'Esta semana',
      barBaseline: '28 dias ant.',
      noBaseline: 'Não há histórico suficiente por trás, por isso isto é só o valor atual',
      baselineCountUnknown:
        'Dias de referência desconhecidos, por isso isto é o valor atual sem comparação.',
      thinBaseline: (days: number, found: number, needed: number) =>
        `Só ${found} dos ${days} dias anteriores trazem esta métrica, menos que os ${needed} necessários, por isso isto é o valor atual sem comparação.`,
      noRecentData: 'Nada registado localmente para esta métrica nos últimos 7 dias.',
      zeroBaseline:
        'A referência anterior teve média 0, por isso não é possível calcular uma variação relativa — isto é só o valor atual.',
      notProvided: 'Não fornecido',
      sleepDuration: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
      regularity: (minutes: number) => `±${minutes} min`,
      workoutCount: (count: number) =>
        plural(count, { one: `${count} sessão`, other: `${count} sessões` }),
      unitWord: (unit: string) => unit,
      metric: {
        'weekly.resting_hr': 'FC em repouso',
        'weekly.hrv': 'HRV',
        'weekly.stress': 'Stress',
        'weekly.sleep_duration': 'Duração do sono',
        'weekly.sleep_start_regularity': 'Dispersão da hora de deitar',
        'weekly.workout_count': 'Treinos',
        'weekly.training_load': 'Carga de treino',
      },
    },
    'components/overview/HeartRateCard': {
      hrPanelAria: 'Abrir o detalhe de frequência cardíaca das 24 horas completas',
      hrTitle: 'Frequência cardíaca recente',
      hrWindow: (hours: number) => `Últimas ${hours} horas`,
      latest: 'Mais recente',
      bpm: 'bpm',
      hrChartAria: 'Curva de frequência cardíaca de 24 horas',
      hrZonesAria: 'Zonas de frequência cardíaca (limiares absolutos)',
      hrEmpty:
        'O movimento real da frequência cardíaca aparece aqui depois de uma sincronização.',
      hrMore: '24 horas completas',
      hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
      zoneRest: 'Repouso 0–99',
      zoneFat: 'Queima de gordura 100–139',
      zoneAerobic: 'Aeróbica 140–169',
      zoneAnaerobic: 'Anaeróbica 170+',
    },
    'components/overview/RecentCard': {
      recentAria: 'Registos recentes',
      recentTitle: 'Registos recentes',
      recentSub: 'Sono, corridas e trabalho de força',
      seeAll: 'Ver tudo',
      recentEmpty: 'Ainda nada registado. Faz uma sincronização e aparece aqui.',
      sleepRecordTitle: 'Sono',
      sleepScore: (score: number) => `Pontuação de sono ${score}`,
      avgHr: (value: number) => `FC média ${value}`,
      timeUnknown: 'Hora desconhecida',
    },
    'components/overview/SleepCard': {
      sleepPanelAria: 'Abrir o detalhe de sono',
      sleepTitle: 'A noite passada',
      sleepSub: 'Estrutura do sono num relance',
      sleepBarAria: 'Partilha de fases de sono',
      sleepEmpty: 'O sono da noite passada aparece aqui depois de uma sincronização.',
      seeMore: 'Ver mais',
      durationHours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
      durationMinutes: (minutes: number) => `${minutes} min`,
    },
    'components/overview/SourcesStrip': {
      dataSources: 'Origens de dados',
      identifyingDevices: 'A identificar os teus dispositivos…',
      identifyFailed: (reason: string) =>
        `A identificação de dispositivos está indisponível: ${reason}`,
      noDevicesYet: 'Ainda não foi identificado nenhum dispositivo.',
      manage: 'Gerir',
      sourcesAria: 'Origens de dados e estado da conta',
    },
    'components/overview/StepsCard': {
      stepsPanelAria: 'Abrir o detalhe de atividade diária',
      stepsTitle: 'Passos de hoje',
      stepsGoalReference: 'Meta de referência',
      stepsGoalToday: 'Meta de hoje',
      stepsUnit: 'passos',
      stepsGoalLine: (goal: string, percent: number) => `Meta ${goal} · ${percent}%`,
      seeMore: 'Ver mais',
    },
    'components/shell/AppTopBar': {
      mainNav: 'Navegação principal',
      brandHome: 'ZeppBridge 3 · Visão geral',
      connectionTitle: 'Estado da ligação à nuvem',
      lastSyncPrefix: 'Última sincronização: ',
      notFetchedYet: 'Ainda não obtido',
      timeUnknown: 'Hora desconhecida',
      syncNow: 'Sincronizar agora',
      verifyFirst: 'Verifica primeiro a ligação',
      syncing: 'A sincronizar…',
      syncFailed: 'A sincronização falhou',
      syncPartial: 'Parcialmente sincronizado',
      cancel: 'Cancelar',
      themeTitle: 'Mudar de tema',
      themeLight: 'Claro',
      themeDark: 'Escuro',
      themeSystem: 'Sistema',
      localeLabel: 'Idioma da interface',
    },
    'composables/useAiHandoff': {
      clipboardUnsupported:
        'Este ambiente não consegue escrever na área de transferência',
      targetNotAllowed: 'Esse endereço de IA não está na lista de permissões',
      handoffFailed: 'A entrega à IA não foi concluída',
      copiedButCannotOpen: (label: string) => `Copiado, mas não foi possível abrir ${label}`,
      nothingToRetry: 'Não há nenhuma entrega à IA para tentar novamente',
    },
    'composables/useAiTaskDraft': {
      loadFailed: 'Não foi possível carregar a tarefa',
      saveFailed: 'Não foi possível guardar a tarefa',
      deleteFailed: 'Não foi possível eliminar a tarefa',
      untitled: 'Tarefa sem título',
    },
    'composables/useAiTaskHandoff': {
      prepareFailed: 'Não foi possível preparar os ficheiros',
      copyFailed: 'Não foi possível copiar o prompt',
      openFailed: 'Não foi possível abrir o site de IA',
    },
    'composables/useDevices': {
      stateAccount: 'Conhecido da conta',
      stateUserAssigned: 'Modelo que escolheste',
      stateRecentData: 'Tem dados recentes',
      stateCached: 'Da cache',
      stateUnknown: 'Não identificado',
      notFetchedYet: 'Ainda não obtido',
      timeUnknown: 'Hora desconhecida',
      unidentifiedDevice: 'Dispositivo não identificado',
      notProvided: 'Não fornecido',
      identifyUnavailable: 'A identificação de dispositivos está indisponível neste momento',
      cacheUnavailable: 'A cache de dispositivos está indisponível neste momento',
      noLocalIdentifier:
        'Este dispositivo não traz nenhum identificador local, por isso a escolha não pode ser guardada.',
      assignmentCleared: 'Escolha retirada. De volta à correspondência automática.',
      assignmentSaved:
        'A tua escolha está guardada. Aparece como «Modelo que escolheste» — nunca apresentada como correspondência automática.',
      assignmentContributed: (reportId: string) =>
        `A tua escolha está guardada e os números de modelo foram para o ZeppBridge (relatório ${reportId}). A próxima versão do catálogo identifica este modelo sozinha.`,
      assignmentContributionFailed: (reason: string) =>
        `A tua escolha está guardada nesta máquina. O envio da contribuição para o catálogo falhou: ${reason}`,
      networkUnavailable: 'Rede indisponível',
      assignmentFailed: 'Não foi possível guardar a escolha de modelo',
    },
    'composables/useExport': {
      typeSteps: 'Passos',
      typeLifeEvents: 'Acontecimentos de vida',
      groupContext: 'Contexto',
      typeDailyActivity: 'Atividade diária',
      typeWorkouts: 'Treinos',
      typeSleep: 'Sono',
      typeHeartRate: 'Frequência cardíaca',
      typeSpo2: 'Oxigénio no sangue',
      typeStress: 'Stress',
      typeRespiratoryRate: 'Frequência respiratória',
      typeRecovery: 'Prontidão',
      typeTrainingLoad: 'Carga de treino',
      typeLactateThreshold: 'Limiar de lactato',
      typePai: 'PAI',
      groupActivity: 'Atividade',
      groupSleep: 'Sono',
      groupBody: 'Estado corporal',
      groupTraining: 'Treino',
      detailSummary: 'Resumo',
      detailSummaryHint:
        'Frequência cardíaca agregada à hora, séries de treino ao segundo de fora. As métricas estruturadas ficam completas, e o tamanho é adequado para entregar a uma IA.',
      detailFull: 'Completo',
      detailFullHint:
        'Mantém as séries de treino ao segundo e as leituras individuais de frequência cardíaca. Grande, e feito para arquivar.',
      scopeConflict:
        'Um intervalo de datas e um único treino são âmbitos mutuamente exclusivos. Escolhe um.',
      noDataTypes: 'Escolhe pelo menos um tipo de dados.',
      invalidDates: 'Escolhe uma data de início e de fim válidas.',
      endBeforeStart: 'A data de fim não pode ser anterior à data de início.',
      rangeTooLong: (days: number) =>
        `Uma exportação cobre no máximo ${days} dias. Para histórico mais longo, usa o snapshot da base de dados nas Definições.`,
      nothingToExport: 'Nada para exportar neste período.',
      jsonTooLarge: 'O JSON passa de 1 MB. Usa «Guardar ficheiro».',
      copied: (count: number) => `${count} registos normalizados copiados.`,
      copyFailed: 'Não foi possível copiar o JSON',
      saveJsonTitle: 'Guardar JSON do ZeppBridge',
      saveCsvTitle: 'Guardar CSV do ZeppBridge (tabela de resumo)',
      saveGpxTitle: 'Guardar GPX do ZeppBridge (percurso GPS)',
      saveFitTitle: 'Escolher uma pasta para a exportação FIT (um ficheiro por treino)',
      jsonFilter: 'Ficheiro JSON',
      csvFilter: 'Tabela CSV',
      gpxFilter: 'Percurso GPX',
      fitFilter: 'Ficheiros de atividade FIT',
      unitRecords: 'registos',
      unitRows: 'linhas',
      unitTrackPoints: 'pontos de percurso',
      unitSamplePoints: 'pontos de amostra',
      saved: (count: number, unit: string) => `Guardado: ${count} ${unit}.`,
      savedFiles: (files: number, count: number, unit: string) =>
        `${files} ficheiros FIT guardados, ${count} ${unit} no total.`,
      saveFailed: (format: string) => `Não foi possível guardar o ${format}`,
      feedUpdated: (count: number) => `O feed de IA local tem agora ${count} registos.`,
      feedFailed: 'Não foi possível atualizar o feed de IA local',
    },
    'composables/useSyncController': {
      notSyncedYet: 'Ainda não sincronizado',
      timeUnknown: 'Hora desconhecida',
      updatedWithLatest: (clock: string) =>
        `Dados novos obtidos · última frequência cardíaca ${clock}`,
      updated: 'Dados novos obtidos',
      noNewDataWithLatest: (clock: string) =>
        `Nada de novo na nuvem · última frequência cardíaca ainda ${clock}`,
      noNewData: 'Sincronização terminada. A nuvem não tinha nada de novo',
      partialWithStreams: (streams: string) => `Alguns fluxos falharam: ${streams}`,
      partial: 'Sincronização terminada, mas alguns fluxos de dados falharam',
      cancelled: 'Sincronização cancelada',
      deferred: 'A reconstruir dados derivados locais. A sincronização tenta novamente sozinha',
      failed: 'A sincronização falhou. Verifica a ligação e tenta novamente',
      lastCloudSync: (clock: string) => `Última sincronização da nuvem ${clock}`,
      cloudSyncClock: (clock: string) => `Sincronização da nuvem ${clock}`,
      cloudSyncClockUnknown: 'Sincronização da nuvem —',
      statusUnavailable: 'O estado da ligação está indisponível neste momento',
      alreadySyncing: 'Já há uma sincronização a decorrer. Tenta novamente quando terminar',
      desktopOnly: 'Usa a aplicação de desktop',
      reauthNeeded: 'A tua sessão Zepp expirou. Liga novamente',
      verifyFirst: 'Verifica primeiro a ligação',
      connectFirst: 'Liga primeiro ao Zepp',
      syncingRecent: (days: number) => `A sincronizar os últimos ${days} dias…`,
      backfilling: (days: number) => `A repôr os últimos ${days} dias…`,
      syncDidNotFinish: 'A sincronização da nuvem não terminou',
      cancelling: 'A cancelar a sincronização…',
      cancelFailed: 'Não foi possível cancelar a sincronização',
      streamSeparator: ', ',
      syncingStream: (stream: string) => `A sincronizar ${stream.toLowerCase()}`,
      backfillingStream: (stream: string, month: string) =>
        `A repôr ${stream.toLowerCase()} · ${month}`,
    },
    'lib/aiTask/copy': {
      'ui.ai_task.cat.workout': 'Treinos',
      'ui.ai_task.cat.sleep': 'Sono',
      'ui.ai_task.cat.recovery': 'Prontidão',
      'ui.ai_task.cat.heart_rate': 'Frequência cardíaca',
      'ui.ai_task.cat.training': 'Carga de treino',
      'ui.ai_task.cat.body': 'Estado corporal',
      'ui.ai_task.cat.personal_note': 'Nota pessoal',
      'ui.ai_task.cat.attachment': 'Anexos',
      'ui.ai_task.prompt.coverage_note':
        'A cobertura abaixo foi medida no dispositivo pelo ZeppBridge. Os dias sem dados estão marcados como em falta — não os inferas nem inventes.',
      'ui.ai_task.blocked.attachment_missing':
        'Um anexo original já não se encontra. Volta a selecionar o ficheiro ou remove primeiro a referência.',
      'ui.ai_task.blocked.no_workouts':
        'Ainda não há nenhum treino ligado a esta tarefa. Volta atrás e escolhe pelo menos um.',
      'ui.ai_task.blocked.empty':
        'A seleção atual não cobre dados nenhuns. Ajusta primeiro as categorias ou os treinos.',
      'ui.ai_task.warn.attachment_changed':
        'Um anexo tem um tamanho diferente de quando foi adicionado — confirma que ainda é o mesmo original antes de entregar.',
      'ui.ai_task.warn.category_missing':
        'Esta categoria não tem dados na janela selecionada; a exportação marca-a como em falta.',
      'ui.ai_task.warn.partial_coverage':
        'Só parte da janela tem dados. Vê a tabela de cobertura abaixo.',
      'ui.ai_task.unknown': 'Nota de estado não reconhecida',
      'ui.ai_task.attach.no_redaction':
        'Os originais são referenciados tal como estão, sem desidentificação. Confirma que queres ser tu a anexar este ficheiro à IA escolhida.',
      'ui.ai_template.recovery_run.name': 'Corrida de recuperação',
      'ui.ai_template.recovery_run.prompt':
        'Este foi um treino de fase de recuperação. Com as duas semanas de contexto de sono, prontidão e frequência cardíaca anteriores a ele, avalia se a intensidade correspondia ao meu nível de recuperação e sugere o treino para as próximas 48 horas.',
      'ui.ai_template.long_run_compare.name': 'Comparação de corridas longas',
      'ui.ai_template.long_run_compare.prompt':
        'Compara estas corridas longas: deriva de ritmo/frequência cardíaca, esforço percebido e contexto de recuperação. Qual foi a sessão mais eficiente, e como devo regular a intensidade da próxima?',
      'ui.ai_template.hr_drift.name': 'Deriva da frequência cardíaca',
      'ui.ai_template.hr_drift.prompt':
        'Analisa a deriva da frequência cardíaca neste treino: a subida a ritmo constante, julgada contra duas semanas de sono e carga de treino — fadiga, meteorologia ou mudança de condição física?',
      fallbackIssue: 'Não foi possível reconhecer uma nota de estado',
    },
    'lib/bridge/errors': {
      desktopOnly: 'Usa a aplicação de desktop',
      genericFailure: 'Isso não foi concluído. Tenta novamente daqui a pouco',
      timedOut:
        'O pedido excedeu o tempo limite. Verifica a tua rede e a região Zepp, depois tenta novamente.',
    },
    'lib/dateTime': {
      time: 'Formato da hora',
      date: 'Formato da data',
      regional: 'Região do sistema',
      '12h': '12 horas',
      '24h': '24 horas',
      ymd: 'Ano/mês/dia',
      dmy: 'Dia/mês/ano',
      mdy: 'Mês/dia/ano',
    },
    'lib/deviceCopy': {
      introNoDevice:
        'Local primeiro, origens intactas: os teus registos de wearable, organizados num ficheiro de saúde que consegues mesmo ler.',
      introOne: (name: string) =>
        `Local primeiro, origens intactas: registos de ${name}, organizados num ficheiro de saúde que consegues mesmo ler.`,
      introTwo: (first: string, second: string) =>
        `Local primeiro, origens intactas: registos de ${first} e ${second}, organizados num ficheiro de saúde que consegues mesmo ler.`,
      introMany: (first: string, second: string, count: number) =>
        `Local primeiro, origens intactas: ${first}, ${second} e ${count} dispositivos no total, organizados num ficheiro de saúde que consegues mesmo ler.`,
      notProvided: 'Não fornecido',
    },
    'lib/failedChunkText': {
      noCanonical:
        'A nuvem devolveu um pacote, mas não foi possível extrair dele nenhum registo utilizável',
      noReason: 'Sem motivo registado',
    },
    'lib/format': {
      noUpdates: 'Ainda sem atualizações',
      noRecords: 'Ainda sem registos',
      timeUnknown: 'Hora desconhecida',
      dateUnknown: 'Data desconhecida',
      durationUnknown: 'Duração desconhecida',
      notRecorded: 'Não registado',
      duration: (hours: number, minutes: number) =>
        (hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`),
    },
    'lib/labels': {
      unknownWithCode: (code: string) => `Treino não reconhecido (código ${code})`,
      unknownWorkout: 'Treino não reconhecido',
      workout: 'Treino',
      fallback: {
        run: 'Corrida ao ar livre',
        running: 'Corrida',
        walking: 'Caminhada',
        walk: 'Caminhada',
        ride: 'Ciclismo ao ar livre',
        cycling: 'Ciclismo ao ar livre',
        indoor_cycling: 'Ciclismo em pavilhão',
        swimming: 'Natação',
        treadmill: 'Passadeira',
        indoor_run: 'Corrida em pavilhão',
        trail: 'Trail running',
        hiking: 'Trekking',
        strength: 'Treino de força',
        elliptical: 'Elíptica',
        rowing: 'Remo',
        yoga: 'Ioga',
        climb: 'Escalada',
        badminton: 'Badmínton',
        activity: 'Atividade',
        unknown: 'Treino não reconhecido',
      },
      providerZeppCloud: 'Zepp Cloud',
      scopeUserFused: 'Fusão do utilizador',
      scopeDevice: 'Um só dispositivo',
      scopeMixed: 'Várias origens',
      scopeUnknown: 'Âmbito por confirmar',
    },
    'lib/lifeEvents': {
      title: 'Acontecimentos de vida',
      intro: 'Regista o que aconteceu ao lado dos teus dados de saúde.',
      add: 'Adicionar acontecimento',
      edit: 'Editar acontecimento',
      empty:
        'Ainda sem acontecimentos de vida. Começa com uma doença, uma viagem ou uma mudança no treino.',
      name: 'Título',
      category: 'Categoria',
      start: 'Data de início',
      end: 'Data de fim',
      ongoing: 'Ainda a decorrer',
      notes: 'Notas (opcional)',
      placeholder: 'Por exemplo: uma constipação, uns dias de pausa no treino',
      save: 'Guardar',
      cancel: 'Cancelar',
      remove: 'Eliminar',
      deleteTitle: 'Eliminar este acontecimento de vida?',
      deleteHint: 'Esta nota será removida da base de dados local.',
      invalid:
        'Introduz um título e datas válidas. A data de fim não pode ser anterior à data de início.',
      failed: 'Não foi possível concluir a ação. Tenta novamente.',
      saved: 'Acontecimento de vida guardado.',
      deleted: 'Acontecimento de vida eliminado.',
      loading: 'A carregar acontecimentos de vida…',
      retry: 'Tentar novamente',
      all: 'Todos',
      active: 'A decorrer',
      search: 'Procurar acontecimentos de vida',
      noMatch: 'Sem acontecimentos correspondentes.',
      previous: 'Anterior',
      next: 'Seguinte',
      manage: 'Gerir acontecimentos de vida',
      related: 'Acontecimentos relacionados',
      local:
        'Guardado localmente e incluído nas cópias da base de dados. Podes incluir acontecimentos de vida ao entregar dados à IA.',
      categories: {
        health: 'Saúde e recuperação',
        travel: 'Viagens',
        routine: 'Rotina e estilo de vida',
        training: 'Treino e provas',
        other: 'Outro',
      },
    },
    'lib/metricSeries': {
      noRecordsToShow: 'Sem registos para mostrar',
      noRecordsInWindow: (days: number) => `Sem registos nos últimos ${days} dias`,
      coverage: (days: number, withData: number) => `${withData} de ${days} dias têm registos`,
      dayRange: (low: string, high: string, unit: string) =>
        `Nesse dia variou entre ${low} – ${high}${unit}`,
      samples: (count: number) =>
        plural(count, { one: `${count} leitura`, other: `${count} leituras` }),
    },
    'lib/rangeOptions': {
      d7: '7 dias',
      d30: '1 mês',
      d90: '3 meses',
      d180: '6 meses',
      d365: '1 ano',
    },
    'lib/sleepStages': {
      deep: 'Profundo',
      light: 'Leve',
      rem: 'REM',
      awake: 'Acordado',
      unknown: 'Desconhecido',
    },
    'lib/storageEstimateText': {
      stopNoSpace: (needed: string, free: string) =>
        `Esta reposição precisa de cerca de ${needed} (incluindo margem de segurança), mas só ${free} estão livres, por isso não vai arrancar. Liberta espaço ou encurta o intervalo.`,
      diskUnknown:
        'Não foi possível ler o espaço livre em disco. Garante que há espaço suficiente antes de repôr.',
      diskTooSmall:
        'Menos de 300 MB livres — não é possível repôr histórico com mais de 90 dias.',
      builtinGuess: (days: number, add: string, free: string) =>
        `Ainda não há amostras locais suficientes, por isso é uma estimativa aproximada incorporada: ${days} dias ocupam cerca de ${add}, e ${free} estão livres neste disco.`,
      measured: (days: number, add: string, free: string) =>
        `Com base no ritmo a que os teus dados realmente acumulam, ${days} dias ocupam cerca de ${add}, e ${free} estão livres neste disco.`,
      partial: (days: number, add: string, free: string) =>
        `Com base apenas nos fluxos com amostras locais suficientes, ${days} dias ocupam cerca de ${add} (os restantes não contam), e ${free} estão livres neste disco.`,
      unknownEstimate: 'O tamanho desta reposição não pode ser estimado neste momento.',
    },
    'lib/syncStreams': {
      heart_rate: 'Frequência cardíaca',
      daily_summary: 'Resumos diários',
      sleep: 'Sono',
      hrv: 'Variabilidade da frequência cardíaca',
      wellness: 'Stress, SpO2 e outras métricas opcionais',
      workouts: 'Treinos',
      workout_detail: 'Detalhe e percursos de treinos',
      weight: 'Peso e composição corporal',
      vo2max: 'VO₂max',
      lactate_threshold_hr: 'Frequência cardíaca de limiar de lactato',
      lactate_threshold_pace: 'Ritmo de limiar de lactato',
      resting_heart_rate: 'Frequência cardíaca em repouso',
      training_load: 'Carga de treino',
      blood_oxygen: 'Oxigénio no sangue',
      breathing_rate: 'Frequência respiratória',
      skin_temperature: 'Temperatura da pele',
    },
    'lib/units': {
      big: 'km',
      short: 'm',
      bigImperial: 'mi',
      shortImperial: 'ft',
    },
    'services/updateService': {
      nothingToInstall: 'Não há nenhuma atualização para instalar. Verifica novamente.',
    },
    'views/ActivityDetail': {
      backToOverview: 'Voltar à visão geral',
      eyebrow: 'Atividade diária',
      title: 'Atividade diária',
      intro:
        'Passos, distância, gasto ativo e minutos ativos, dia a dia. Comparado só com os teus próprios registos anteriores; os dias sem dados ficam vazios em vez de serem preenchidos com zero.',
      rangeAria: 'Intervalo de tempo',
      desktopOnly:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      loadFailed: 'Os dados de atividade estão indisponíveis neste momento',
      retry: 'Tentar novamente',
      loadingAria: 'A carregar a atividade diária',
      noneInRange:
        'Sem registos de atividade neste intervalo. Tenta um intervalo maior, ou corre primeiro uma sincronização.',
      emptyCard: 'Nada registado neste intervalo.',
      stepsLabel: 'Passos',
      stepsHint: 'Total diário de passos do relógio',
      stepsUnit: 'passos',
      distanceLabel: 'Distância',
      distanceHint: 'Distância percorrida nesse dia',
      distanceUnit: 'm',
      caloriesLabel: 'Gasto ativo',
      caloriesHint: 'Só atividade, metabolismo basal excluído',
      caloriesUnit: 'kcal',
      minutesLabel: 'Minutos ativos',
      minutesHint: 'Minutos que o relógio contou como ativos',
      minutesUnit: 'min',
    },
    'views/AiComposer': {
      daysOption: (days: number) =>
        plural(days, { one: `${days} dia`, other: `${days} dias` }),
    },
    'views/BodyStatus': {
      backToOverview: 'Voltar à visão geral',
      eyebrow: 'Estado corporal',
      title: 'Estado corporal',
      intro:
        'Tendências locais de prontidão, stress, oxigénio no sangue, HRV, frequência respiratória, frequência cardíaca em repouso, composição corporal e ingestão alimentar. Tudo lido de registos sincronizados.',
      rangeAria: 'Intervalo de tempo',
      trendRangeLabel: 'Intervalo da tendência',
      desktopOnly:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      loadFailed: 'Os dados de estado corporal estão indisponíveis neste momento',
      retry: 'Tentar novamente',
      loadingAria: 'A carregar o estado corporal',
      noneInRange:
        'Sem registos de estado corporal neste intervalo. Tenta um intervalo maior, ou corre primeiro uma sincronização.',
      emptyCard: 'Nada registado neste intervalo.',
      readinessLabel: 'Prontidão',
      readinessHint:
        'O relógio pesa sono, HRV e frequência cardíaca em repouso numa só pontuação',
      stressLabel: 'Stress',
      stressHint: 'Média do dia inteiro; a faixa sombreada é o intervalo medido nesse dia',
      curveCardAria: 'Stress de 24 horas',
      curveTitle: 'Últimas 24 horas de stress',
      curveSub:
        'O relógio mede de cinco em cinco minutos; leituras individuais por ordem temporal',
      curveChartAria: 'Stress nas últimas 24 horas',
      curveNoSamples:
        'Sem leituras de stress nas últimas 24 horas, por isso não há curva para desenhar. É este o aspeto de um relógio por usar, ou de monitorização diária desligada.',
      curveNote:
        'As faixas (relaxado 1-39, normal 40-59, médio 60-79, alto 80-100) são da Zepp, não nossas. O tempo sem leituras fica em branco em vez de ser preenchido com zeros.',
      statLatest: 'Mais recente',
      statAverage: 'Média',
      statLowest: 'Mínimo',
      statHighest: 'Máximo',
      stressTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b>`,
      spo2Label: 'Oxigénio no sangue',
      spo2Hint:
        'Leituras individuais de SpO2 com média por dia; a faixa é o intervalo medido nesse dia',
      spo2Empty: 'Sem leituras individuais de SpO2 neste intervalo.',
      odiLabel: 'ODI de SpO2 noturno',
      odiHint: 'Dessaturações por hora; quanto mais baixo melhor',
      hrvHint: 'Variabilidade da frequência cardíaca, medições individuais com média por dia',
      rmssdHint: 'Variabilidade de alta frequência noturna, com média por dia',
      respiratoryLabel: 'Frequência respiratória',
      respiratoryHint:
        'Ritmo de respiração durante o sono; a faixa é o intervalo medido nesse dia',
      restingLabel: 'Frequência cardíaca em repouso',
      restingHint: 'Frequência cardíaca em repouso como o ZeppBridge a calcula por dia',
      unitScore: 'pts',
      unitPerHour: '/h',
      unitBreathsPerMinute: 'resp/min',
      weightLabel: 'Peso',
      weightHint: 'Cada pesagem, com média por dia; a faixa é o intervalo medido nesse dia',
      bmiLabel: 'IMC',
      bmiHint: 'Índice de massa corporal, enviado pela nuvem junto com o peso',
      fatLabel: 'Gordura corporal',
      fatHint:
        'Precisa de uma balança de composição corporal. Pesos do relógio e introduzidos à mão não trazem leitura de gordura',
      muscleLabel: 'Massa muscular',
      muscleHint: 'Precisa de uma balança de composição corporal',
      waterLabel: 'Água corporal',
      waterHint: 'Precisa de uma balança de composição corporal',
      boneLabel: 'Massa óssea',
      boneHint: 'Precisa de uma balança de composição corporal',
      visceralLabel: 'Gordura visceral',
      visceralHint: 'Um grau, não uma percentagem. A Zepp pontua-o de 1-30',
      bmrLabel: 'Metabolismo basal',
      bmrHint: 'Precisa de uma balança de composição corporal',
      heightLabel: 'Altura',
      heightHint:
        'Dado do perfil devolvido com cada pesagem, não uma medição do dia',
      unitGrade: 'grau',
      unitKcalPerDay: 'kcal/dia',
      scaleEmpty:
        'Sem pesagens neste intervalo. As leituras da balança aparecem aqui depois de uma sincronização.',
      bodyGroupTitle: 'Peso e composição corporal',
      bodyGroupEmpty:
        'Sem registos de peso ou composição corporal neste intervalo. As leituras de composição precisam de uma balança de composição corporal; pesos do relógio e introduzidos à mão não trazem nenhuma.',
      intakeGroupTitle: 'Ingestão',
      intakeGroupEmpty:
        'Sem registos alimentares neste intervalo. As refeições são registadas à mão na app Zepp; uma vez registadas, aparecem aqui depois de uma sincronização.',
      intakeCaloriesLabel: 'Calorias ingeridas',
      intakeCaloriesHint:
        'Total registado no dia. Dias sem registo não têm barra e nunca são preenchidos com 0',
      proteinLabel: 'Proteína',
      fatIntakeLabel: 'Gordura',
      carbsLabel: 'Hidratos',
      macroHint: 'Total registado no dia',
      unitKcal: 'kcal',
      unitGram: 'g',
      macroTitle: 'Equilíbrio alimentar',
      macroSub:
        'Quota de calorias que cada macronutriente contribuiu ao longo deste intervalo',
      macroNote:
        'As quotas são derivadas aqui a partir dos gramas diários usando 4/9/4 kcal por grama (proteína / gordura / hidratos). Não são enviadas pela nuvem e podem diferir um ponto ou dois das percentagens na app Zepp. Nada é desenhado a menos que as três estejam presentes.',
      gramsPerDay: (grams: number) => `${grams} g por dia em média`,
    },
    'views/DeviceDetail': {
      backToSettings: 'Voltar às definições',
      notFoundTitle: 'Este dispositivo não está aqui',
      notFoundMessage:
        'Pode ter sido removido da conta, ou esta máquina ainda não o identificou.',
      reidentify: 'Identificar dispositivos novamente',
      factsAria: 'Informação do dispositivo',
      factOrigin: 'De onde veio o modelo',
      factFirmware: 'Firmware',
      factLastData: 'Dados mais recentes',
      factHasLocal: 'Dados locais dele',
      factDeviceId: 'ID do dispositivo',
      hasLocalYes: 'Sim',
      hasLocalNo: 'Ainda nenhum',
      factsNote:
        'O ID do dispositivo só é usado nesta máquina, só os últimos quatro caracteres aparecem no ecrã, e nunca chega a uma exportação ou a um relatório de erro.',
      assignAria: 'Identificação do modelo',
      assignTitle: 'Está certo?',
      assignSub:
        'Se a correspondência estiver errada — digamos que é mesmo um Balance 2 e isto diz outra coisa — podes apontar tu o modelo certo. A tua escolha fica nesta máquina, aparece como «Modelo que escolheste» em vez de se fazer passar por correspondência automática, e pode ser retirada a qualquer momento.',
      changeModel: 'Escolher outro',
      pickModel: 'Está errado, deixa-me escolher',
      clearAssignment: 'Retirar a escolha e voltar ao automático',
      noLocalIdentifier:
        'Este dispositivo não traz nenhum identificador local, por isso não se pode guardar uma escolha para ele.',
      originUnknown: 'Desconhecido',
      originUserAssigned: 'Escolheste-o da última vez',
      originExact: 'Correspondência exata no catálogo incorporado',
      originAlias: 'Correspondência por alias no catálogo incorporado',
      originNoMatchCloud:
        'Sem correspondência (a nuvem não deu nenhum nome de produto reconhecível)',
      originCatalog: 'Correspondido no catálogo incorporado',
      originNoMatch: 'Sem correspondência',
    },
    'views/HealthCheck': {
      window30: 'Últimos 30 dias',
      window90: 'Últimos 90 dias',
      window365: 'Último ano',
      loadFailed: 'Não foi possível ler o estado de saúde dos dados',
      retry: 'Tentar novamente',
      noRecords: 'Ainda sem registos',
      timeUnknown: 'Hora desconhecida',
      notProvided: 'Não fornecido',
      backToSettings: 'Voltar às definições',
      eyebrow: 'Saúde dos dados',
      title: 'Verificação da saúde dos dados',
      intro:
        'Para cada fluxo de dados: até onde chegou a obter da nuvem, interpretar e escrever localmente; que datas cobre; e de onde veio. Em falta é em falta — nunca preenchido com um zero.',
      rangeAria: 'Janela de cobertura',
      loadingAria: 'A ler o estado de saúde dos dados',
      replayInProgress:
        'A reler os pacotes locais com o novo parser. As sincronizações da nuvem cedem o lugar e retentam sozinhas durante isto; não é uma falha.',
      timingsTitle: 'Três «últimas vezes» diferentes',
      timingCloud: 'Última obtenção da nuvem',
      timingCloudNote: 'Ainda sem resultado',
      timingReplay: 'Último replay local',
      timingReplayNote:
        'Relê os pacotes locais com o parser atual. Sem rede, e não reescreve a hora acima.',
      timingManual: 'Última reinterpretação manual',
      timingManualNote: 'A que clicaste tu',
      timingNewest: 'Amostra de saúde mais recente',
      timingNewestNote: 'Quando o registo em si aconteceu no relógio',
      dbTitle: 'Base de dados local',
      dbSize: 'Tamanho do ficheiro',
      dbRaw: 'Pacotes em bruto',
      dbCanonical: 'Registos normalizados',
      dbPending: 'Por normalizar',
      dbSchema: 'Versão do esquema',
      dbNormalizer: 'Revisão do parser',
      integrityPassed: 'passou',
      integrityFailed: (detail: string) => `falhou (${detail})`,
      integrityDetailBelow: 'detalhes abaixo',
      integrityLine: (verdict: string, checkedAt: string) =>
        `Verificação de integridade: ${verdict} · ${checkedAt}`,
      integrityNeverRun:
        'Nunca foi corrida uma verificação de integridade. Ela varre a base de dados inteira, o que demora numa grande, por isso só corre quando a pedes.',
      streamsTitle: 'Até onde chegou cada fluxo',
      streamsNote:
        'Obter, interpretar e escrever são três coisas que falham separadamente. Colapsadas num só ponto vermelho, não conseguias dizer se deves tentar novamente, voltar a ligar, ou se esta conta simplesmente não tem esse fluxo.',
      stageFetch: 'Obtenção',
      stageParse: 'Interpretação',
      stageWrite: 'Escrita',
      stageLine: (stage: string, state: string) => `${stage}: ${state}`,
      factRaw: 'Pacotes em bruto',
      factCanonical: 'Registos normalizados',
      factSources: 'Origens',
      factObservedDays: 'Dias observados',
      days: (count: number) =>
        plural(count, { one: `${count} dia`, other: `${count} dias` }),
      gapExamples: (dates: string) => `As falhas incluem: ${dates}`,
      gapMore: ' e mais',
      period: '.',
      latestObserved: (date: string) => `Mais recente ${date}.`,
      noRecordsYet: 'Ainda sem registos',
      sourceSeparator: ', ',
      occasionalTitle: 'Métricas que só aparecem ocasionalmente',
      occasionalNote:
        'Métricas como VO₂max e limiar de lactato não são reportadas diariamente por desenho. Esta secção reporta os dias observados e o mais recente, e nunca conta falhas diárias — pintar de vermelho uma dispersão normal é que seria enganador.',
      occasionalLine: (records: string, days: number) =>
        `${records} registos · observados em ${days} dias`,
      occasionalLatest: (date: string) => `mais recente ${date}`,
      occasionalNone: 'Nada observado neste intervalo',
      actionsTitle: 'O que podes fazer',
      actionRunning: 'A correr…',
      actionRun: 'Correr',
      confirmDestructive: (label: string, reason: string) => `${label}: ${reason}\nContinuar?`,
      actionSynced: 'A sincronização correu e o estado foi atualizado.',
      actionReplayed: (count: string) =>
        `Pacotes locais relidos com o parser atual (${count} registos derivados). A hora de sincronização da nuvem não foi reescrita.`,
      actionIntegrityOk: 'A base de dados passou na verificação de integridade.',
      actionIntegrityFailed: (detail: string) =>
        `A base de dados falhou na verificação de integridade: ${detail}`,
      actionIntegrityFallback: 'Faz uma cópia da pasta de dados e sincroniza outra vez',
      actionFolderOpened: 'Pasta de dados aberta.',
      actionReconnect: 'Vai às Definições e liga a conta Zepp outra vez.',
      actionFailed: (label: string) => `${label} falhou`,
      coveragePerEvent:
        'Produzido por evento: sem registo significa que nada aconteceu nessa altura, não que falte algo.',
      coverageOccasional:
        'O relógio só reporta isto ocasionalmente; dias em branco são normais e não significam que se perdeu nada.',
      coverageNoData:
        'Ainda sem dados locais para este período. Corre primeiro uma sincronização.',
      coverageNoGaps: 'Sem falhas observadas desde o primeiro dia com dados.',
      coverageGaps: (days: number) =>
        `${days} dias sem dados observados desde o primeiro dia com dados. Não usar o relógio, não sincronizar ou a nuvem não devolver nada — tudo causa falhas.`,
      action: {
        reauth: {
          label: 'Ligar a conta Zepp outra vez',
          reason: 'Alguns fluxos não conseguem obter porque as credenciais expiraram.',
        },
        reprocess: {
          label: 'Reler os pacotes locais com o parser atual',
          reason: '' as string, // en/zh são propositadamente vazios
        },
        sync_retry: {
          label: 'Sincronizar outra vez',
          reason: 'Alguns fluxos falharam a obtenção da nuvem da última vez.',
        },
        sync_first: {
          label: 'Correr a primeira sincronização',
          reason: 'Esta máquina ainda não tem nenhuma sincronização da nuvem bem-sucedida registada.',
        },
        integrity_check: {
          label: 'Verificar a integridade da base de dados',
          reason: 'Corre um integrity_check do SQLite sobre a base de dados inteira; demora numa grande.',
        },
        open_data_folder: {
          label: 'Abrir a pasta de dados',
          reason: 'A base de dados local, as cópias e as exportações vivem todas aqui.',
        },
      },
      reprocessReason: (pending: number) =>
        `${pending} pacotes guardados ainda não produziram nenhum registo normalizado. Um replay não toca na rede e não reescreve a hora de sincronização da nuvem.`,
      cadence: {
        continuous: 'várias vezes ao dia',
        daily: 'uma vez por dia',
        nightly: 'uma vez por noite',
        per_event: 'só quando acontece',
        occasional: 'só ocasionalmente',
      },
      stage: { ok: 'OK', failed: 'falhou', never: 'nunca aconteceu' },
      errorKind: {
        network: 'não foi possível chegar à nuvem',
        auth: 'a conta precisa de ser ligada novamente',
        not_available: 'esta conta não tem esse fluxo',
        unrecognized_payload: 'chegou um pacote mas não foi possível lê-lo',
        cloud_rejected: 'a nuvem recebeu o pedido e recusou-o',
        storage: 'a escrita na base de dados local falhou',
        busy: 'outra operação estava a escrever, por isso esta cedeu o lugar',
        cancelled: 'cancelado',
        unknown: 'falha não classificada',
      },
      source: {
        device: 'um só dispositivo',
        user_fused: 'fusão do utilizador',
        unknown: 'origem desconhecida',
      },
    },
    'views/HeartRateDetail': {
      backToOverview: 'Voltar à visão geral',
      eyebrow: 'Frequência cardíaca',
      title: 'Frequência cardíaca',
      intro:
        'A curva do dia inteiro acima é sempre das últimas 24 horas; 7 dias / 1 mês / 6 meses só mudam as tendências dia a dia abaixo. Os trechos sem amostras ficam em branco, não preenchidos com zero.',
      rangeAria: 'Intervalo de tempo da tendência',
      trendRangeLabel: 'Intervalo da tendência',
      desktopOnly:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      loadFailed: 'Os dados de frequência cardíaca estão indisponíveis neste momento',
      dayFailed: 'Não foi possível ler as últimas 24 horas de frequência cardíaca.',
      dailyMaxFailed: 'Não foi possível ler o pico diário de frequência cardíaca.',
      trendsFailed:
        'Não foi possível ler as tendências de frequência cardíaca em repouso e HRV.',
      retry: 'Tentar novamente',
      loadingAria: 'A carregar a frequência cardíaca',
      dayCardAria: 'Frequência cardíaca de 24 horas',
      dayTitle: 'Últimas 24 horas',
      daySub: 'Leituras individuais, por ordem temporal',
      statLatest: 'Mais recente',
      statAverage: 'Média',
      statLowest: 'Mín',
      statHighest: 'Máx',
      chartAria: 'Frequência cardíaca nas últimas 24 horas',
      noSamples:
        'Sem amostras de frequência cardíaca nas últimas 24 horas, por isso não há curva para desenhar.',
      bpmTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
      restingLabel: 'Frequência cardíaca em repouso',
      restingHint: 'O relógio reporta uma por dia; mais estável é melhor',
      hrvHint: 'Leituras individuais de HRV, com média por dia',
      rmssdHint: 'Uma medida de HRV diferente, não o mesmo número que acima',
      emptyCard: 'Nada registado neste intervalo.',
      dailyMaxTitle: 'Pico diário de frequência cardíaca (amostras em bruto nesta máquina)',
      dailyMaxSub:
        'A app Zepp filtra o seu pico diário; esta não. Os dois números diferirem é esperado.',
      dailyMaxAria: 'Tendência do pico diário de frequência cardíaca',
      dailyMaxNone:
        'Sem amostras de frequência cardíaca nesta máquina para este intervalo, por isso não há pico para comparar.',
      dailyMaxSparse: (days: number) =>
        `${days} destes dias têm muito poucas amostras (menos de 60). Nesses dias o pico é o mais alto só desses pontos, não o pico real do dia — estão desenhados como marcadores vazados.`,
      dailyMaxLegendMax: 'Pico',
      dailyMaxLegendAvg: 'Média',
      dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
        `${date}<br/>Pico <b>${max}</b> bpm<br/>Média ${avg} bpm<br/>${samples} amostras`,
      dailyMaxNote:
        'Isto usa apenas as amostras em bruto por leitura guardadas nesta máquina. O pico diário da Zepp nunca nos é enviado (o device_max_hr na biblioteca é o máximo configurado usado para limites de zona, não um pico medido), por isso não há nada para pôr ao lado aqui — abre a app Zepp para comparar esse número do dia.',
    },
    'views/Overview': {
      overviewTitle: 'Visão geral',
      unrecognizedSuffix: ' ainda não tem modelo identificado',
      unrecognizedCta: 'Escolher à mão',
      deviceErrorPrefix: 'Identificação de dispositivos: ',
      loadingAria: 'A carregar a visão geral',
      loadFailedTitle: 'Não foi possível ler a visão geral de dados',
      retry: 'Tentar novamente',
      healthUnavailable: 'Os dados de saúde estão indisponíveis neste momento',
      partialUnavailable: 'Alguns fluxos de dados ainda não foram obtidos',
      bodyPanelAria: 'Abrir o estado corporal',
      bodyTitle: 'Estado corporal',
      factRecovery: 'Prontidão',
      factStress: 'Stress',
      factSpo2: 'SpO2',
      bodySparkLabel: 'Prontidão nos últimos 7 dias',
      bodyThin: 'Registos insuficientes nos últimos 7 dias para desenhar uma tendência',
      bodyEmpty:
        'Prontidão, stress e oxigénio no sangue aparecem aqui depois de uma sincronização',
      trainingPanelAria: 'Abrir o estado de treino',
      trainingTitle: 'Estado de treino',
      factLoad: 'Carga',
      trainingSparkLabel: 'Carga de treino nos últimos 7 dias',
      trainingThin: 'Registos insuficientes nos últimos 7 dias para desenhar uma tendência',
      trainingEmpty: 'VO₂max e carga de treino aparecem aqui depois de uma sincronização',
      loadLow: 'baixa',
      loadMedium: 'moderada',
      loadHigh: 'alta',
      loadVeryHigh: 'muito alta',
      loadBandReference: (band: string) => `${band} (referência)`,
    },
    'views/RecentRecords': {
      backToOverview: 'Voltar à visão geral',
      title: 'Registos recentes',
      intro: 'Sono e treinos sincronizados recentemente, lado a lado.',
      loadingLabel: 'A carregar os registos recentes',
      loadFailedTitle: 'Não foi possível carregar os registos recentes',
      desktopOnly:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      retry: 'Tentar novamente',
      partialUnavailable: 'Alguns dados estão indisponíveis neste momento',
      filterAll: 'Todos',
      recentSleep: 'Sono recente',
      recentWorkouts: 'Treinos recentes',
      countBadge: (count: number) => `${count} no total`,
      seeAll: 'Ver tudo',
      noSleep: 'Ainda sem registos de sono',
      noWorkouts: 'Nada para mostrar aqui.',
      noWorkoutsOfType: 'Nada para mostrar deste tipo de treino.',
      hiddenIncomplete: (count: number) =>
        plural(count, {
          one: `${count} registo incompleto escondido`,
          other: `${count} registos incompletos escondidos`,
        }),
      notProvided: 'Não fornecido',
      dateUnknown: 'Data desconhecida',
      today: 'Hoje',
      yesterday: 'Ontem',
      listDate: (month: number, day: number, weekday: string) =>
        `${weekday}, ${day}/${month}`,
    },
    'views/SleepDetail': {
      backToRecent: 'Voltar aos registos recentes',
      title: 'Registo de sono',
      loadingDetail: 'A ler o registo de sono…',
      loadFailedTitle: 'Não foi possível ler este registo de sono',
      loadFailed: 'O detalhe de sono está indisponível neste momento',
      retry: 'Tentar novamente',
      notFoundTitle: 'Este registo de sono não está aqui',
      notFoundMessage:
        'Pode ter sido limpo, ou ainda não foi sincronizado para esta máquina.',
      heroAria: 'Duração e pontuação do sono',
      durationKicker: 'Tempo a dormir',
      heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
        `Adormeceu ${fellAsleep} · acordou ${wokeUp} · na cama ${inBed}`,
      scoreKicker: 'Pontuação de sono',
      scoreNote: 'Reportada pelo dispositivo; mostrada como registada, nada mais.',
      stagesAria: 'Fases de sono',
      stagesTitle: 'Fases de sono',
      stageHelpButton: 'O que significam as fases',
      stageHelp:
        'Profundo: o trecho restaurador. Leve: a fase de transição que ocupa a maior parte da noite. REM: movimento rápido dos olhos, ligado à memória e aos sonhos. Acordado: despertar ou estar acordado na cama durante a noite. São definições, não um diagnóstico de saúde.',
      weeklyAria: 'Sono nos últimos 7 dias',
      weeklyTitle: 'Estrutura do sono, últimos 7 dias',
      weeklySub: 'Fases empilhadas por noite',
      weeklyChartAria:
        'Gráfico de barras empilhadas da estrutura do sono nos últimos 7 dias',
      metaAria: 'Origem e dispositivo',
      sourceTitle: 'Origem',
      sourceProvider: 'Fornecedor',
      sourceScope: 'Âmbito',
      syncedAt: 'Sincronizado',
      timezone: 'Fuso horário',
      deviceTitle: 'Dispositivo',
      deviceName: 'Nome',
      deviceFirmware: 'Firmware',
      deviceId: 'ID do dispositivo',
      footnote:
        'Só o resumo de fases que a nuvem realmente deu. Quando não há campo REM lê-se «Não fornecido» — nunca calculado por subtração — e uma linha temporal não fornecida nunca é desenhada.',
      notProvided: 'Não fornecido',
      syncTimeMissing: 'Hora de sincronização não fornecida',
      lastCloudSync: (clock: string) => `Última sincronização da nuvem ${clock}`,
      deviceUndetermined: 'Dispositivo por determinar',
      hoursAxis: 'horas',
      tooltipTotal: (date: string, hours: string) =>
        `<b>${date} — ${hours} h de sono no total</b><br/>`,
      tooltipRow: (name: string, hours: number) => `${name}: ${hours} h<br/>`,
      tooltipRowMissing: (name: string) => `${name}: Não fornecido<br/>`,
    },
    'views/SleepList': {
      backToRecent: 'Voltar aos registos recentes',
      backToOverview: 'Voltar à visão geral',
      title: 'Sono',
      intro:
        'Registos de sono sincronizados para esta máquina. Sem uma linha temporal completa, só é mostrado o resumo.',
      loadFailedTitle: 'Não foi possível ler os registos de sono',
      loadFailed: 'A lista de sono está indisponível neste momento',
      retry: 'Tentar novamente',
      emptyTitle: 'Ainda sem registos de sono',
      emptyMessage: 'Aparecem aqui depois de uma sincronização. As fases nunca são inventadas.',
      scoreLabel: 'Pontuação',
      footnote: (count: number, from: string) => `${count} registos · desde ${from}`,
      shown: (shown: number, total: number) => `A mostrar ${shown} de ${total}`,
      loadMore: 'Carregar mais',
      loadingMore: 'A carregar…',
    },
    'views/TrainingStatus': {
      backToOverview: 'Voltar à visão geral',
      eyebrow: 'Estado de treino',
      title: 'Estado de treino',
      intro:
        'VO₂max, limiar de lactato, carga de treino e zonas de frequência cardíaca. Tudo lido de registos sincronizados; sem conselhos de treino.',
      rangeAria: 'Intervalo de tempo',
      desktopOnly:
        'Usa a aplicação de desktop. Esta pré-visualização no browser não lê dados da conta.',
      loadFailed: 'Os dados de estado de treino estão indisponíveis neste momento',
      retry: 'Tentar novamente',
      loadingAria: 'A carregar o estado de treino',
      vo2Hint: 'Consumo máximo de oxigénio, estimado pelo relógio depois de corridas ao ar livre',
      vo2Empty:
        'Sem registos de VO₂max neste intervalo; só atualiza depois de uma corrida ao ar livre.',
      loadLabel: 'Carga de treino',
      loadHint: 'Pontuação diária de carga de treino',
      loadEmpty: 'Sem registos de carga de treino neste intervalo.',
      paiLabel: 'PAI',
      paiHint: 'Personal Activity Intelligence numa janela móvel de 7 dias',
      paiEmpty: 'Sem registos de PAI neste intervalo.',
      thresholdLabel: 'Limiar de lactato',
      thresholdHint: 'Frequência cardíaca e ritmo; só atualiza depois de uma corrida forte',
      thresholdHr: 'FC limiar',
      thresholdPace: 'Ritmo limiar',
      thresholdChartAria: 'Frequência cardíaca e ritmo de limiar de lactato',
      thresholdOnce: (date: string) =>
        `Só uma medição de limiar neste intervalo (${date}), por isso não há tendência para desenhar.`,
      thresholdEmpty: 'Sem medições de limiar de lactato neste intervalo.',
      thresholdPaceTooltip: (value: string, unit: string) =>
        `Ritmo limiar <b>${value}</b> ${unit}`,
      loadUnit: 'carga',
      thresholdHrTooltip: (value: number) => `FC limiar <b>${value}</b> bpm`,
      balanceLabel: 'Equilíbrio da carga de treino',
      balanceHint:
        'Carga de 7 dias contra a média semanal de 28 dias, ou seja o rácio aguda:crónica',
      balanceChartAria: 'Carga de treino de 7 e 28 dias com o rácio aguda:crónica',
      balanceEmpty:
        'Ainda não há registos de carga de treino suficientes para desenhar esta linha.',
      balanceNote:
        'Aguda:crónica = soma dos últimos 7 dias ÷ (soma dos últimos 28 dias ÷ 4). Quando a janela de 28 dias cobre menos de 21 dias, não é dado rácio e a linha quebra aí. Isso é não calculado, não zero.',
      acute7d: 'Carga de 7 dias',
      chronicWeekly: 'Média semanal de 28 dias',
      acuteChronic: 'Aguda:crónica',
      ratioMissing: (days: number) =>
        `— (só ${days} dias de dados na janela de 28 dias)`,
      notProvided: 'Não fornecido',
      acuteTooltip: (value: string, days: number) =>
        `Carga de 7 dias <b>${value}</b> (${days}/7 dias com dados)`,
      chronicTooltip: (value: string) => `Média semanal de 28 dias <b>${value}</b>`,
      ratioTooltip: (value: string) => `Aguda:crónica <b>${value}</b>`,
    },
    'views/WorkoutDetail': {
      notProvided: 'Não fornecido',
      backToRecent: 'Voltar aos registos recentes',
      loadFailedTitle: 'Não foi possível ler este treino',
      loadFailed: 'O detalhe do treino está indisponível neste momento',
      retry: 'Tentar novamente',
      notFoundTitle: 'Este treino não está aqui',
      notFoundMessage:
        'Pode ter sido limpo, ou ainda não foi sincronizado para esta máquina.',
      insightFailed: 'Não foi possível construir uma leitura para este treino',
      seriesFailed: 'Não foi possível ler as séries ponto a ponto deste treino',
      seriesFailedTitle: 'A leitura das séries ponto a ponto falhou',
      exportNeedsSeries:
        'As séries ponto a ponto falharam a leitura, por isso este registo não pode ser exportado.',
      thisWorkout: 'treino',
      aiPrompt: (label: string) => `És um analista de desporto. Abaixo está o registo completo de um ${label} meu, tirado da base de dados local do ZeppBridge e desidentificado.
Analisa esta sessão usando apenas os factos deste registo: a intensidade, como o ritmo se relaciona com a frequência cardíaca, se há um abrandamento claro ou um trecho anómalo, e o que fazer concretamente de diferente da próxima vez.

Restrições:
- Não há referência populacional nestes dados. Não me compares com «adultos saudáveis» nem com nenhuma média.
- Onde algo faltar, diz que falta. Nunca tapes o buraco com um zero ou uma estimativa.
- Sem diagnóstico médico, sem juízo de risco de doença, sem conselhos de tratamento.

Responde em Markdown.`,
      needDesktop:
        'A entrega à IA precisa da aplicação de desktop; esta pré-visualização no browser não abre sites externos.',
      attachmentOpened: (provider: string) =>
        `O pacote de dados foi escrito no teu ambiente de trabalho (zeppbridge-ai-handoff.json) — arrasta-o para ${provider}. O prompt está na tua área de transferência.`,
      attachmentNotOpened: (provider: string) =>
        `O pacote de dados foi escrito no teu ambiente de trabalho (zeppbridge-ai-handoff.json). O prompt está na tua área de transferência; abre ${provider} tu mesmo.`,
      copiedAndOpened: (provider: string) =>
        `Dados desidentificados deste treino copiados e ${provider} aberto. Cola-os.`,
      copiedOnly: (provider: string) =>
        `Dados desidentificados deste treino copiados. Abre ${provider} tu mesmo e cola-os.`,
      noCorrection: 'Sem correção',
      deviceNameMissing: 'Nome do dispositivo não fornecido',
      notFetchedYet: 'Ainda não obtido',
      timeUnknown: 'Hora desconhecida',
      overrideSaved: 'Correção do tipo de treino guardada localmente.',
      overrideCleared: 'Correção limpa. De volta à correspondência do próprio ZeppBridge.',
      overrideFailed: 'Não foi possível guardar a correção do tipo de treino',
      copied: (format: string) => `Dados ${format} copiados para a área de transferência.`,
      copyFailed: 'Não foi possível copiar este registo',
      metricDistance: 'Distância',
      metricDuration: 'Tempo em movimento',
      metricAvgHr: 'FC média',
      metricAvgPace: 'Ritmo médio',
      metricMovingTime: 'Tempo em movimento',
      metricPausedTime: 'Tempo em pausa',
      metricMovingPace: 'Ritmo em movimento',
      metricElapsedPace: 'Ritmo decorrido',
      metricAscent: 'Subida',
      metricTrainingLoad: 'Carga de treino',
      metricTrainingEffect: 'Efeito aeróbico',
      metricAnaerobicEffect: 'Efeito anaeróbico',
      metricRpe: 'Esforço percebido',
      metricMaxHr: 'FC máxima',
      metricCalories: 'Calorias',
      unitKcal: 'kcal',
      statFastest: 'Mais rápido',
      statAverage: 'Média',
      statSlowest: 'Mais lento',
      statMin: 'Mín',
      statMax: 'Máx',
      chartHeart: 'Frequência cardíaca',
      chartPace: 'Ritmo',
      chartAltitude: 'Altitude',
      chartCadence: 'Cadência',
      chartAria: (title: string) => `${title} ao longo da sessão`,
      decodedRoutePoints: 'Pontos do percurso GPS',
      decodedSamples: 'Amostras das séries temporais',
      decodedPauses: 'Intervalos de pausa',
      decodedAvgCadence: 'Cadência média',
      decodedMaxCadence: 'Cadência máxima',
      decodedAvgStride: 'Passada média',
      decodedDescent: 'Descida',
      decodedMaxHr: 'FC máxima',
      decodedAvgPower: 'Potência média',
      decodedMaxPower: 'Potência máxima',
      decodedGroundContact: 'Contacto com o solo médio',
      decodedVerticalOscillation: 'Oscilação vertical média',
      decodedVerticalRatio: 'Rácio vertical',
      decodedBestEquivalentPace: 'Melhor ritmo equivalente',
      heroAria: 'Visão geral do treino',
      decodedLocally: 'Descodificado localmente',
      typeEvidenceAria: 'Como foi decidido o tipo de treino',
      zeppRawCode: (code: string) => `Código em bruto Zepp: ${code}`,
      zeppBridgeMatch: (label: string) => `O ZeppBridge lê-o como: ${label}`,
      customName: (code: string, name: string) => `O teu nome para o código ${code}: ${name}`,
      myCorrection: 'A minha correção',
      correctionAria: 'A minha correção para este tipo de treino',
      metricListAria: 'Resumo de desempenho do treino',
      routeAria: 'Percurso GPS completo',
      eyebrowRoute: 'Percurso',
      routeTitle: 'Percurso GPS completo',
      routeNote: 'Desenhado localmente · sem pedidos de mapa',
      routeSvgAria:
        'Percurso GPS local colorido pelo tempo e pela amostra de ritmo mais próxima',
      routeLegendPace: (count: number) =>
        plural(count, {
          one: `${count} ponto de ritmo válido · P10–P90`,
          other: `${count} pontos de ritmo válidos · P10–P90`,
        }),
      routeLegendNoPace: 'Menos de 3 pontos de ritmo válidos · sem cor por velocidade',
      legendFast: 'Rápido',
      legendSteady: 'Estável',
      legendWarm: 'Mais lento',
      legendSlow: 'Lento',
      routeEmptyTitle: 'Sem percurso utilizável',
      routeEmptyBody:
        'Este registo não traz pontos de GPS suficientes, por isso não é desenhado nenhum percurso.',
      chartsEmptyTitle: 'Sem curvas ponto a ponto',
      chartsEmptyBody:
        'Não foi sincronizada nenhuma série de frequência cardíaca, ritmo, altitude ou cadência para esta sessão.',
      hrZonesAria: 'Zonas de frequência cardíaca',
      eyebrowHrZones: 'Zonas de FC',
      hrZonesTitle: 'Zonas de frequência cardíaca',
      hrZonesNote:
        'Os limites de zona vêm das tuas próprias definições no relógio e são enviados pela Zepp com este treino; o ZeppBridge não os volta a cortar. A página Estado de treino usa um modelo separado que escolhes tu, por isso os dois conjuntos de números não vão concordar.',
      hrZoneBelow: (upper: number) => `Abaixo de ${upper}`,
      hrZoneBetween: (low: number, high: number) => `${low}–${high}`,
      hrZoneShare: (percent: string) => `${percent}%`,
      hrZoneTotal: (duration: string) => `${duration} com frequência cardíaca`,
      hrZoneBarAria: 'Quota de tempo passado em cada zona de frequência cardíaca',
      decodedAria: 'Valores descodificados',
      eyebrowDecoded: 'Descodificado',
      decodedTitle: 'Valores descodificados',
      decodedNote:
        'O resumo é calculado só a partir de amostras válidas deste registo; saltos anómalos são ignorados.',
      exportAria: 'Exportar e partilhar',
      eyebrowExport: 'Exportação',
      exportTitle: 'Exportar e partilhar',
      exportSub: 'Copia JSON, CSV ou GPX, ou escolhe uma pasta para guardar este treino como FIT.',
      exportFormatAria: 'Formato de exportação',
      exportGo: (format: string) => `Copiar dados ${format}`,
      saveFit: 'Guardar ficheiro FIT',
      savedFit: 'Ficheiro FIT guardado',
      exportFailed: 'A exportação falhou',
      handoffAria: 'Entregar à IA',
      eyebrowHandoff: 'Entrega',
      handoffTitle: 'Entregar à IA',
      handoffSub:
        'Copia os dados desidentificados só deste treino, mais o prompt, e abre o site de IA que escolheres. Fluxos ao nível do dia como sono e passos ficam de fora.',
      handoffTarget: 'Ferramenta de destino',
      handoffTargetAria: 'A que ferramenta de IA entregar',
      preparing: 'A preparar…',
      handTo: (provider: string) => `Entregar a ${provider}`,
      provenanceAria: 'Proveniência',
      eyebrowProvenance: 'Proveniência',
      provenanceTitle: 'Proveniência',
      provenanceProvider: 'Fornecedor',
      provenanceScope: 'Âmbito',
      provenanceSynced: 'Última sincronização',
      provenanceRecordId: 'ID do registo',
      provenanceDevice: 'Dispositivo',
      pageFoot:
        'Descodificado nesta máquina. O percurso é desenhado numa canvas local e nunca é enviado para um serviço de mapas.',
    },
    'views/WorkoutList': {
      backToRecent: 'Voltar aos registos recentes',
      backToOverview: 'Voltar à visão geral',
      title: 'Treinos',
      intro: 'Treinos sincronizados para esta máquina. Sem percurso, sem mapa.',
      loadFailedTitle: 'Não foi possível ler os treinos',
      loadFailed: 'A lista de treinos está indisponível neste momento',
      retry: 'Tentar novamente',
      emptyTitle: 'Ainda nada para mostrar',
      emptyMessage:
        'Depois de uma sincronização, só aparecem aqui registos que tragam um tipo, uma hora e pelo menos uma métrica real. Sem GPS ou amostras ponto a ponto, não é desenhado nenhum gráfico vazio.',
      labelDistance: 'Distância',
      labelBurn: 'Gasto',
      labelDuration: 'Duração',
      notProvided: 'Não fornecido',
      footnote: (count: number) => `${count} registos mostrados`,
      shown: (loaded: number, total: number) => `Carregados ${loaded} de ${total}`,
      loadMore: 'Carregar mais',
      loadingMore: 'A carregar…',
    },
  },
  errors: {
    'err.core.network':
      'Não foi possível chegar à região Zepp. Verifica a tua rede e tenta novamente',
    'err.core.needs_reauth': 'A tua sessão expirou. Volta a ligar ao Zepp',
    'err.core.unavailable': 'Esta conta ou região não fornece esses dados',
    'err.core.retry_exhausted':
      'O Zepp está temporariamente indisponível. Tenta novamente daqui a pouco',
    'err.core.http_status': 'O Zepp devolveu um erro. Tenta novamente daqui a pouco',
    'err.core.cloud_rejected':
      'O Zepp recebeu o pedido e recusou-o. Se isto continuar, volta a ligar a conta Zepp nas Definições',
    'err.core.cancelled': 'Cancelado',
    'err.core.auth': 'Algo correu mal na autenticação',
    'err.headless.no_credential_store':
      'Esta máquina não tem um cofre de credenciais do sistema (GNOME Keyring / KWallet). Servidores headless e contentores normalmente não têm nenhum. Define ZEPPBRIDGE_CREDENTIAL_STORE=file para escrever o token com permissões 0600 na pasta de dados, ou ZEPPBRIDGE_CREDENTIAL_STORE=env juntamente com ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'Esta biblioteca é mais antiga do que a build que a está a ler, e uma ligação só de leitura não consegue atualizá-la. Abre uma vez a aplicação de desktop, ou corre zeppbridge-cli reprocess numa máquina headless. Ambos fazem uma cópia de segurança antes de atualizar.',
    'err.headless.token_not_in_store':
      'Os detalhes da conta estão aqui, mas o cofre de credenciais não tem token para eles. Uma base de dados copia-se entre máquinas; um token não — fica no cofre de credenciais da máquina onde foi criado. Inicia sessão novamente.',
    'err.core.credential_store':
      'Não foi possível aceder ao cofre de credenciais. Verifica se está bloqueado, vedado por política do sistema, mal configurado ou com permissões de ficheiro erradas. O início de sessão web, a importação HAR e a entrada manual usam todos o mesmo cofre, por isso mudar de método não contorna uma falha de armazenamento. Se o Keychain do macOS ou o keyring do Linux estiverem indisponíveis, segue o guia de armazenamento de credenciais ligado no README: arranca com ZEPPBRIDGE_CREDENTIAL_STORE=file e inicia sessão novamente. Isto guarda os tokens num ficheiro em texto simples que só o teu utilizador consegue ler e escrever.',
    'err.core.invalid_host': 'Endereço de região Zepp inseguro',
    'err.core.config': 'Há algo na configuração que precisa de ser mudado primeiro',
    'err.har.missing_user':
      'Não foi encontrado nenhum user ID no HAR. Exporta o tráfego de rede outra vez depois de iniciares sessão.',
    'err.har.missing_token':
      'Não foi encontrado nenhum token de sessão no HAR. Ativa a exportação com dados sensíveis.',
    'err.har.invalid_file':
      'Não foi possível ler um HAR válido. Seleciona um ficheiro HAR exportado pelo teu browser.',
    'err.har.too_large':
      'O ficheiro HAR é demasiado grande. Exporta uma captura mais pequena e tenta novamente.',
    'err.har.unverified':
      'As credenciais no HAR não passaram na verificação do Zepp, por isso nada foi guardado. Inicia sessão novamente e exporta outra vez, ou introduz um App Token à mão.',
    'err.core.busy': 'Há outra escrita em curso. Espera que termine',
    'err.core.parse': 'Não foi possível interpretar a resposta do Zepp',
    'err.core.database': 'A base de dados local está temporariamente indisponível',
    'err.core.io': 'Falhou a leitura ou escrita de um ficheiro local',
    'err.core.unknown': 'Algo correu mal',
    'err.auth.sync_init_failed':
      'Não foi possível preparar a sincronização. Verifica a região da conta e tenta novamente',
    'err.auth.verify_network':
      'A verificação falhou: não foi possível chegar ao Zepp. Verifica a tua rede e tenta novamente',
    'err.auth.verify_needs_reauth':
      'A verificação falhou: a credencial já não é válida. Guarda-a novamente',
    'err.auth.verify_failed': 'A verificação falhou',
    'err.login.waiting': 'Termina o início de sessão no Zepp na janela pop-up',
    'err.login.fallback_page': 'A abrir a página de início de sessão alternativa',
    'err.login.extracting': 'Credenciais lidas. A confirmar a tua região',
    'err.login.verifying': 'A verificar a conta',
    'err.login.connected': 'Ligado à tua conta Zepp',
    'err.login.timeout': 'O início de sessão excedeu o tempo limite. Tenta novamente',
    'err.login.credentials_unreadable':
      'Estás com sessão iniciada, mas não foi possível ler as credenciais na janela de início de sessão. Tenta a importação HAR ou introduz um App Token manualmente.',
    'err.login.region_probe_failed':
      'As credenciais foram lidas, mas não foi possível confirmar a região da conta. Inicia sessão novamente ou importa um ficheiro HAR.',
    'err.login.credentials_rejected':
      'O Zepp rejeitou estas credenciais. Termina a sessão na janela de início de sessão e depois inicia sessão novamente',
    'err.login.region_unreachable':
      'Não foi possível chegar ao serviço de regiões do Zepp. Verifica a tua rede e tenta novamente',
    'err.login.region_retrying':
      'Não é possível chegar ao serviço de regiões do Zepp neste momento — a tentar novamente. A janela de início de sessão fica aberta, por isso não precisas de iniciar sessão outra vez',
    'err.login.third_party_stalled':
      'Este início de sessão de terceiros parece encravado. As passkeys da Google costumam encravar no passo de verificação dentro de uma janela da app. Fecha a janela de início de sessão e usa email + palavra-passe, ou introduz um App Token manualmente nas Definições.',
    'err.login.bad_url': 'Endereço de início de sessão inválido',
    'err.login.window_failed': 'Não foi possível abrir a janela de início de sessão',
    'err.login.window_busy':
      'A janela de início de sessão anterior ainda está a fechar. Espera um momento e tenta novamente',
    'err.login.state_unavailable': 'O estado da aplicação está indisponível',
    'err.login.cancelled': 'Início de sessão cancelado',
    'err.login.sync_init_failed': 'Sessão iniciada, mas não foi possível inicializar a sincronização',
    'err.sync.not_connected': 'Ainda não ligado ao Zepp. Liga primeiro',
    'err.sync.not_verified': 'Termina de verificar a ligação antes de sincronizar dados recentes',
    'err.sync.not_verified_probe': 'Termina de verificar a ligação antes de sondar capacidades',
    'err.sync.not_verified_backfill': 'Termina de verificar a ligação antes de repôr o histórico',
    'err.sync.history_days_out_of_range': 'Esse número de dias está fora do intervalo permitido',
    'err.sync.deferred_compaction':
      'A compactar pacotes guardados para poupar espaço em disco. Esta sincronização vai tentar novamente automaticamente',
    'err.sync.deferred_replay':
      'A reconstruir dados derivados a partir de pacotes locais. Esta sincronização vai tentar novamente automaticamente',
    'err.sync.deferred_busy':
      'Há outra escrita em curso. Esta sincronização vai tentar novamente automaticamente',
    'err.backfill.bad_start_date': 'Data de início da reposição inválida — usa AAAA-MM-DD',
    'err.backfill.no_canonical_records':
      'A nuvem devolveu um pacote, mas não foi possível extrair dele nenhum registo utilizável',
    'err.backfill.partial_window':
      'Só parte deste intervalo de datas foi escrita. Ainda precisa de uma nova tentativa',
    'err.backfill.start_in_future': 'O início da reposição não pode ser depois de hoje',
    'err.backup.restore_busy':
      'O restauro não correu: há outra escrita em curso. A biblioteca atual ficou igual e será tentado novamente no próximo arranque',
    'err.backup.restore_failed':
      'O restauro não terminou. A biblioteca atual ficou igual e será tentado novamente no próximo arranque',
    'err.capability.not_synced': 'Ainda não sincronizado',
    'err.capability.needs_reauth': 'Precisa de nova autenticação',
    'err.capability.unverified': 'Ainda não verificado',
    'err.capability.unavailable': 'Indisponível',
    'err.capability.unknown': 'Estado desconhecido',
    'err.capability.other': 'Estado desconhecido',
    'err.export.empty_range': 'Não há registos neste intervalo para exportar',
    'err.export.read_failed': 'Não foi possível ler os dados de exportação',
    'err.export.convert_failed': 'Não foi possível converter para o formato pedido',
    'err.export.write_failed': 'Não foi possível escrever o ficheiro de exportação',
    'err.export.write_json_failed': 'Não foi possível escrever a exportação JSON',
    'err.export.mkdir_failed': 'Não foi possível criar a pasta de exportação',
    'err.export.path_required': 'Escolhe primeiro onde guardar o ficheiro',
    'err.export.path_not_absolute': 'A localização de gravação tem de ser um caminho absoluto',
    'err.export.not_a_directory':
      'Uma exportação FIT precisa de uma pasta, mas o caminho selecionado é um ficheiro',
    'err.export.bad_extension': 'O ficheiro de exportação tem a extensão errada',
    'err.export.path_no_parent': 'A localização de gravação não tem uma pasta válida',
    'err.export.parent_missing': 'A pasta escolhida não existe',
    'err.handoff.prompt_required': 'Escreve primeiro um prompt',
    'err.handoff.empty_range': 'Não há registos neste intervalo para entregar',
    'err.handoff.mkdir_failed': 'Não foi possível criar a pasta de entrega',
    'err.handoff.write_failed': 'Não foi possível escrever os dados de IA desidentificados',
    'err.handoff.parse_failed': 'Não foi possível interpretar o JSON de exportação para IA',
    'err.handoff.encode_failed': 'Não foi possível codificar a exportação de IA desidentificada',
    'err.diagnostic.nothing_to_submit':
      'Este dispositivo não tem um número de modelo que ajude o catálogo, por isso não há nada para enviar',
    'err.diagnostic.empty_report':
      'Escolhe um tipo de problema ou escreve uma frase primeiro — senão o relatório não contém nada em que se possa atuar',
    'err.diagnostic.client_init_failed': 'Não foi possível abrir uma ligação para o relatório',
    'err.diagnostic.send_failed':
      'Não foi possível enviar o relatório. Verifica a tua rede e tenta novamente',
    'err.diagnostic.http_error': 'O serviço de relatórios devolveu um erro',
    'err.diagnostic.rate_limited':
      'Demasiados relatórios em pouco tempo. Tenta novamente daqui a pouco — os que já foram enviados ficam guardados, não precisas de os reenviar.',
    'err.diagnostic.bad_response': 'O serviço de relatórios devolveu algo que não conseguimos ler',
    'err.workout.not_found': 'Esse treino já não existe',
    'err.prefs.retention_out_of_range': 'A retenção tem de estar entre 1 e 365 dias',
    'err.storage.write_busy': 'Há outra escrita do ZeppBridge em curso. Espera que termine',
    'err.storage.write_lock_unavailable':
      'Não foi possível criar o bloqueio de escrita. Verifica as permissões na pasta de dados',
    'err.storage.worker_failed': 'A tarefa de base de dados em segundo plano foi interrompida',
    'err.local_api.token_unavailable': 'Não foi possível ler a credencial da API local',
    'err.local_api.token_rotate_failed': 'Não foi possível regenerar a credencial da API local',
    'err.local_api.port_in_use': 'A porta da API local já está a ser usada por outro programa',
    'err.local_api.bind_failed': 'Não foi possível arrancar a API local',
    'err.local_api.thread_failed': 'Não foi possível arrancar o thread da API local',
    'err.local_api.state_write_failed':
      'Não foi possível guardar o estado ligado/desligado da API local',
    'err.data_folder.open_failed': 'Não foi possível abrir a pasta de dados',
    'err.data_folder.unsupported_os': 'Abrir a pasta de dados só é suportado no Windows e no macOS',
    'err.update.localappdata_missing': 'O caminho LOCALAPPDATA do Windows está indisponível',
    'err.update.launch_failed': 'Não foi possível arrancar a build instalada atualizada',
    'err.update.installed_build_missing':
      'Não foi encontrada nenhuma build nova do ZeppBridge instalada depois da configuração',
    'err.update.portable_windows_only': 'A migração de portátil para instalado é só no Windows',
    'err.update.unsafe_data_location':
      'A instalação parou porque não foi possível verificar a localização dos dados como segura para atualizações. Sai do ZeppBridge, copia qualquer pasta de dados incluída no pacote para a pasta Application Support do teu utilizador e corrige ZEPPBRIDGE_DATA_DIR antes de tentar novamente. Mantém os dados originais.',
    'err.ai_task.invalid': 'A entrada da tarefa não é válida. Verifica os campos',
    'err.ai_task.not_found': 'A tarefa de análise não existe ou foi eliminada',
    'err.ai_task.workout_not_found':
      'Alguns treinos selecionados não existem neste dispositivo',
    'err.ai_task.write_failed': 'Não foi possível escrever os ficheiros de entrega',
    'err.ai_task.attachment_missing':
      'Um ficheiro anexo já não está na sua localização original',
    'err.ai_template.invalid': 'A entrada do modelo não é válida. Verifica os campos',
    'err.ai_template.not_found': 'O modelo não existe ou foi eliminado',
    'err.ai_template.builtin_readonly':
      'Os modelos incorporados são só de leitura. Guarda uma cópia como modelo teu',
    'err.mcp.scope_denied': 'Esse pedido está fora das tarefas partilhadas com o MCP',
    'err.mcp.scope_no_grants':
      'Ainda nenhuma tarefa está partilhada com o MCP. Marca uma tarefa como partilhada na página de Tarefas e tenta novamente',
  },
  backendText: {
    'ui.backup.file_missing': 'O ficheiro de cópia já não está na pasta de cópias',
    'ui.backup.integrity_failed':
      'O ficheiro de cópia não passou na verificação de integridade do SQLite',
    'ui.backup.sha256_mismatch':
      'O SHA-256 do ficheiro de cópia não corresponde ao manifesto — pode estar danificado ou alterado',
    'ui.backup.size_mismatch':
      'O tamanho do ficheiro de cópia não corresponde ao manifesto — pode estar danificado',
    'ui.estimate.builtin_guess':
      'Estimativa aproximada incorporada: ainda não há amostras locais suficientes',
    'ui.estimate.disk_too_small':
      'Menos de 300 MB livres — não é possível repôr histórico com mais de 90 dias',
    'ui.estimate.disk_unknown': 'Não foi possível ler o espaço livre em disco',
    'ui.estimate.measured': 'Estimativa medida a partir do ritmo real dos teus dados',
    'ui.estimate.partial': 'Estimativa parcial — só contam os fluxos com amostras suficientes',
    'ui.estimate.stop_no_space': 'Espaço livre em disco insuficiente para esta reposição',
  },
} satisfies LocalePack;
