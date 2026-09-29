import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Seus dados do Zepp no seu computador',
    description: 'Ponte local e de código aberto para dados do Amazfit e Zepp. Roda no seu Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Seus dados do Zepp no seu controle',
    ogDescription: 'Sincronize, visualize e organize seus dados do Amazfit no computador. Envie para a IA com um clique.',
  },
  copy: {
    nav: {
      home: 'Início',
      site: 'Navegação',
      connect: 'Conectar',
      motion: 'Interface',
      handoff: 'Enviar para IA',
      privacy: 'Privacidade',
      star: 'GitHub',
      language: 'Idioma',
    },
    downloads: {
      windows: { label: 'Baixar para Windows', hint: 'Instalador x64', msi: 'Instalação corporativa: baixe o MSI' },
      macos: { label: 'Baixar para macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'Pacotes deb, rpm, AppImage e Flatpak gerados no CI, mas login e chaveiro ainda não foram testados em desktops Linux reais. Encontrou um problema? Abra uma issue.',
      },
      status: {
        loading: 'Buscando o instalador mais recente',
        ready: 'Clique para baixar direto',
        fallback: 'Sem link direto agora; abrirá a página de releases do GitHub',
      },
    },
    hero: {
      headlineLead: 'Seus dados do Zepp,',
      headlineAccent: 'de volta ao seu controle.',
      lead: 'Sincronize, visualize e organize seus dados do Amazfit no computador. Envie para a IA em um clique.',
      github: 'Ver no GitHub',
      starNudge: {
        title: 'Download iniciado',
        copy: 'Se o ZeppBridge for útil para você, deixe uma estrela no GitHub para que outros usuários do Amazfit possam encontrá-lo.',
        action: 'Deixar uma estrela',
        dismiss: 'Agora não',
      },
    },
    demo: {
      label: 'Demonstração interativa da visão geral do ZeppBridge',
      sample: 'Dados de exemplo',
      hint: 'Toque em um card',
      back: 'Voltar',
      greeting: 'Visão geral',
      heart: {
        title: 'Frequência cardíaca',
        unit: 'bpm',
        detail: 'Minuto a minuto, o dia todo. Períodos sem o relógio ficam vazios, sem zeros falsos.',
      },
      steps: {
        title: 'Passos de hoje',
        unit: 'passos',
        detail: 'Passos por hora da autorização oficial do Zepp, comparados apenas com seu histórico.',
      },
      sleep: {
        title: 'Última noite',
        hours: 'h',
        minutes: 'min',
        detail: 'Sono profundo, leve, REM e acordado em ordem cronológica, priorizando o REM oficial.',
      },
    },
    devicesLabel: 'Dispositivos Amazfit compatíveis',
    connect: {
      heading: 'Três formas de conectar. Escolha a mais fácil.',
      lead: 'Comece pela autorização oficial e adicione dados avançados para mais métricas. Preencha manualmente se precisar.',
      recommended: 'Recomendado',
      paths: [
        {
          icon: 'verified',
          title: 'Autorização oficial do Zepp',
          copy: 'Faça login no Zepp pelo seu navegador e autorize.',
          detail: 'Compatível com contas Google, Xiaomi e Apple. Sincroniza sono, frequência cardíaca, passos, treinos, PAI e peso.',
        },
        {
          icon: 'zepp-cloud',
          title: 'Dados avançados',
          copy: 'Adiciona HRV, SpO2, estresse e prontidão, indisponíveis na API oficial.',
          detail: 'Login com e-mail ou telefone. O token fica salvo apenas no cofre de credenciais do sistema.',
        },
        {
          icon: 'manual-entry',
          title: 'Inserção manual',
          copy: 'Alternativa caso os outros métodos não funcionem.',
          detail: 'Cole o token diretamente. Recomendado para quem já conhece a API.',
        },
      ],
    },
    deck: {
      heading: 'Configurações em cartas, não em formulários longos',
      lead: 'Passe o mouse para abrir em leque. Clique em uma para puxar.',
      hint: 'Passe o mouse para abrir, clique para puxar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Conta e dispositivos', copy: 'Linhas separadas para autorização oficial e dados avançados, mostrando qual conta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronização e atualizações', copy: 'Sincroniza ao abrir e em segundo plano no intervalo que você definir.' },
        { icon: 'database', title: 'Arquivo e armazenamento', copy: 'Você decide a retenção. Restaure backups a qualquer momento.' },
        { icon: 'structured-data', title: 'Saúde dos dados', copy: 'Veja o status de cada fluxo: baixado, interpretado e salvo localmente.' },
        { icon: 'secure', title: 'Privacidade e segurança', copy: 'API local somente leitura desativada por padrão, restrita a 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arraste os dados que quer analisar para a IA',
      lead: 'Arraste uma métrica e os nós vizinhos abrem espaço. Solte no centro para incluir no pacote da IA.',
      hint: 'Arraste um nó para o centro',
      center: 'Enviar para IA',
      nodes: ['Cardíaco', 'Sono', 'HRV', 'Passos', 'Carga', 'PAI', 'Peso', 'Estresse'],
      picked: '{n} selecionados',
      reset: 'Redefinir',
    },
    privacy: {
      heading: 'Seus dados ficam no seu computador',
      lead: 'O ZeppBridge não tem servidores para armazenar seus dados de saúde.',
      points: [
        { icon: 'secure', title: 'Tokens no cofre do sistema', copy: 'Salvos no Gerenciador de Credenciais do Windows ou Chaves do macOS, nunca na pasta de dados.' },
        { icon: 'private', title: 'Zero telemetria', copy: 'Sem relatórios de uso. Nenhum dado de saúde é coletado.' },
        { icon: 'database', title: 'Origem transparente', copy: 'Cada registro identifica se veio da autorização oficial ou de dados avançados.' },
        { icon: 'ai-ready', title: 'Controle total da IA', copy: 'Você decide o que, quanto e quando enviar para a IA.' },
      ],
    },
    footer: {
      heading: 'Gratuito, código aberto, pronto para usar',
      tagline: 'Ponte local para seus dados do Amazfit e Zepp.',
      disclaimer: 'O ZeppBridge é um projeto de código aberto independente, sem vínculo com a Zepp Health ou Amazfit.',
      download: 'Baixar',
    },
  },
};

export default pack;
