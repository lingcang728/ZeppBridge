import type { LocalePack } from '../index';

/**
 * Português (Portugal)（pt-PT）语言包。
 *
 * 欧洲葡语习惯：ecrã / ficheiro / telemóvel / definições / utilizador /
 * registos，祈使句用 tu 或不定式按钮文案，避免巴西式 gerund 堆叠。
 *
 * 目前只有绑定了 moduleId 的模块可寻址：i18n/errors、views/Explore、
 * views/Settings，外加后端 ui.* 散文码的 backendText。其余模块的
 * defineMessages 还没写第四参数 id，译文放进去也不会生效——它们的键
 * 全部继续留在 pt-PT.pending.txt，等模块绑定后再翻。
 */
export default {
  modules: {
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
      notProvided: 'Não fornecido',
      noRecords: 'Ainda sem registos',
      timeUnknown: 'Hora desconhecida',
      cloudService: 'Serviço na nuvem',
      refreshFailed: (reason: string) => `A identificação falhou; voltou à cache local${reason}`,
      refreshFailedReason: (reason: string) => `: ${reason}`,
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
        spo2: 'Métricas de SpO2 noturno',
        respiratory_rate: 'Frequência respiratória',
        recovery: 'Prontidão e energia',
        training_load: 'Carga de treino',
        lactate_threshold: 'Limiar de lactato',
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
