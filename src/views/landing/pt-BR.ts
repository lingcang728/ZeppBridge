import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Ponte de dados local',
    description: 'ZeppBridge é uma ponte e visualizador local e open source para dados de wearables Amazfit e Zepp.',
    ogTitle: 'ZeppBridge · Seus dados Zepp devolvidos por inteiro',
    ogDescription: 'Conecte, organize e visualize dados de wearables Amazfit no seu Windows, macOS ou Linux. A origem fica registrada e você decide o que vai para a IA.',
  },
  copy: {
    nav: {
      home: 'Início do ZeppBridge',
      site: 'Navegação do site',
      connect: 'Conectar',
      motion: 'Interface',
      handoff: 'Enviar para IA',
      privacy: 'Privacidade',
      star: 'GitHub',
      language: 'Idioma',
    },
    downloads: {
      windows: { label: 'Baixar para Windows', hint: 'Instalador x64', msi: 'Implantação em massa? Baixe o MSI' },
      macos: { label: 'Baixar para macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'deb, rpm, AppImage e Flatpak vêm do CI, mas ninguém ainda rodou login e chaveiro até o fim num desktop Linux real. Achou um problema? Abra uma issue.',
      },
      status: {
        loading: 'Buscando o instalador mais recente',
        ready: 'Clique para baixar direto',
        fallback: 'Sem link direto agora; o clique abre o GitHub Release',
      },
    },
    hero: {
      headlineLead: 'Seus dados Zepp,',
      headlineAccent: 'de volta para você.',
      lead: 'Sincronize, veja e organize seus dados Amazfit no seu computador. Quando quiser uma IA, empacote em um clique.',
      github: 'Ver no GitHub',
      starNudge: {
        title: 'Download iniciado',
        copy: 'Se o ZeppBridge ajudar, uma estrela no GitHub faz mais usuários Amazfit o acharem.',
        action: 'Dar uma estrela',
        dismiss: 'Agora não',
      },
    },
    demo: {
      label: 'Demonstração interativa da visão geral do ZeppBridge',
      sample: 'Dados de exemplo',
      hint: 'Toque num cartão',
      back: 'Voltar',
      greeting: 'Visão geral',
      heart: {
        title: 'Frequência cardíaca recente',
        unit: 'bpm',
        detail: 'Minuto a minuto, o dia todo. Minutos sem o relógio ficam vazios, sem 0 no lugar.',
      },
      steps: {
        title: 'Passos de hoje',
        unit: 'passos',
        detail: 'Passos por hora da autorização oficial do Zepp, comparados só ao seu histórico.',
      },
      sleep: {
        title: 'Sono da última noite',
        hours: 'h',
        minutes: 'min',
        detail: 'Sono profundo, leve, REM e acordado em ordem, com prioridade ao REM medido oficial.',
      },
    },
    devicesLabel: 'Dispositivos Amazfit compatíveis',
    connect: {
      heading: 'Três formas de conectar; escolha a mais cômoda.',
      lead: 'Comece pela autorização oficial e adicione dados avançados para mais métricas. Se as duas falharem, ainda dá para preencher manual.',
      recommended: 'Recomendado',
      paths: [
        {
          icon: 'verified',
          title: 'Autorização oficial do Zepp',
          copy: 'Entre no Zepp pelo seu navegador de sempre e aprove.',
          detail: 'Vale conta Google, Xiaomi e Apple. Sincroniza sono, frequência cardíaca, passos, treinos, PAI e peso.',
        },
        {
          icon: 'zepp-cloud',
          title: 'Dados avançados',
          copy: 'Completa HRV, SpO2, estresse e prontidão, que a API oficial não libera.',
          detail: 'Login com e-mail ou celular. O token fica só no gerenciador de credenciais do sistema.',
        },
        {
          icon: 'manual-entry',
          title: 'Preenchimento manual',
          copy: 'Plano B quando as outras duas não funcionam.',
          detail: 'Cole o token você mesmo. Feito para quem conhece a API.',
        },
      ],
    },
    deck: {
      heading: 'Ajustes: um baralho de cartões, não um formulário sem fim',
      lead: 'Passe o mouse e elas se espalham; clique numa para puxar.',
      hint: 'Passe o mouse para espalhar, clique para puxar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Conta e dispositivos', copy: 'Autorização oficial e dados avançados em linhas separadas; você vê na hora qual conta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronização e atualizações', copy: 'Sincroniza ao abrir e depois em silêncio, no intervalo que você definir.' },
        { icon: 'database', title: 'Arquivo e armazenamento', copy: 'Você decide por quanto tempo guardar. Snapshots restauram a qualquer momento.' },
        { icon: 'structured-data', title: 'Saúde dos dados', copy: 'Cada fluxo: se foi baixado, entendido e gravado, separado e claro.' },
        { icon: 'secure', title: 'Privacidade e segurança', copy: 'A API local somente leitura vem desligada e só escuta 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arraste para a IA os dados que quer perguntar',
      lead: 'Arraste uma métrica e os nós vizinhos abrem espaço. Solte no centro e ela entra no pacote enviado à IA.',
      hint: 'Arraste um nó para o centro',
      center: 'Enviar para IA',
      nodes: ['Freq. cardíaca', 'Sono', 'HRV', 'Passos', 'Carga de treino', 'PAI', 'Peso', 'Estresse'],
      picked: '{n} selecionadas',
      reset: 'Recomeçar',
    },
    privacy: {
      heading: 'Seus dados ficam só no seu computador',
      lead: 'O ZeppBridge não tem servidor para guardar seus dados de saúde.',
      points: [
        { icon: 'secure', title: 'Token no cofre do sistema', copy: 'Fica no Gerenciador de Credenciais do Windows ou nas Chaves do macOS, nunca na pasta de dados.' },
        { icon: 'private', title: 'Sem telemetria', copy: 'Nada de relatórios de uso nem coleta de dados de saúde.' },
        { icon: 'database', title: 'Origem bem separada', copy: 'Cada registro sabe se veio da autorização oficial ou dos dados avançados.' },
        { icon: 'ai-ready', title: 'O que vai para a IA é você quem decide', copy: 'O quê, quanto e quando enviar: tudo nas suas mãos.' },
      ],
    },
    footer: {
      heading: 'Gratuito, open source, pronto para usar',
      tagline: 'Ponte local para dados Amazfit e Zepp.',
      disclaimer: 'O ZeppBridge é um projeto open source independente, sem vínculo com Zepp Health ou Amazfit.',
      download: 'Baixar',
    },
  },
};

export default pack;
