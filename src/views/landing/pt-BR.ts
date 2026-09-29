import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Seus dados do Zepp no seu computador',
    description: 'ZeppBridge é uma ponte local e de código aberto para dados do Amazfit e do Zepp. Roda no seu próprio Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Seus dados do Zepp de volta nas suas mãos',
    ogDescription: 'Sincronize, veja e organize seus dados do Amazfit no seu computador. Entregue a uma IA com um clique.',
  },
  copy: {
    nav: { home: 'Início do ZeppBridge', site: 'Navegação do site', connect: 'Conectar', motion: 'Interface', handoff: 'Para a IA', privacy: 'Privacidade', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Baixar para Windows', hint: 'Instalador x64', msi: 'Implantação em massa: baixe o MSI' },
      macos: { label: 'Baixar para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'Os pacotes deb, rpm, AppImage e Flatpak saem da CI, mas ninguém testou ainda o login e o chaveiro do início ao fim num desktop Linux de verdade. Se algo der errado, abra uma issue.' },
      status: { loading: 'Procurando o instalador mais recente', ready: 'Clique para baixar direto', fallback: 'Sem link direto agora; a página do GitHub vai abrir' },
    },
    hero: {
      headlineLead: 'Seus dados do Zepp,',
      headlineAccent: 'de volta nas suas mãos.',
      lead: 'Sincronize, veja e organize seus dados do Amazfit no seu computador. Entregue a uma IA com um clique.',
      github: 'Ver no GitHub',
      starNudge: { title: 'O download começou', copy: 'Se o ZeppBridge te ajuda, uma estrela no GitHub ajuda outros usuários de Amazfit a encontrá-lo.', action: 'Dar uma estrela', dismiss: 'Agora não' },
    },
    demo: {
      label: 'Demonstração interativa da visão geral do ZeppBridge',
      sample: 'Dados de exemplo',
      hint: 'Toque em um cartão',
      back: 'Voltar',
      greeting: 'Visão geral',
      heart: { title: 'Frequência cardíaca', unit: 'bpm', detail: 'Minuto a minuto, o dia todo. Minutos sem o relógio ficam vazios em vez de virar zero.' },
      steps: { title: 'Passos de hoje', unit: 'passos', detail: 'Os passos por hora vêm da autorização oficial do Zepp e são comparados só com o seu próprio histórico.' },
      sleep: { title: 'Noite passada', hours: 'h', minutes: 'min', detail: 'Profundo, leve, REM e acordado em ordem. O REM medido pelo Zepp tem prioridade.' },
    },
    devicesLabel: 'Dispositivos Amazfit compatíveis',
    connect: {
      heading: 'Três jeitos de conectar. Escolha o mais fácil.',
      lead: 'Comece pela autorização oficial e acrescente dados avançados para mais métricas. Se nenhum funcionar, ainda dá para inserir manualmente.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorização oficial do Zepp', copy: 'Entre no Zepp pelo seu navegador de sempre e aprove.', detail: 'Contas Google, Xiaomi e Apple funcionam. Sono, frequência cardíaca, passos, treinos, PAI e peso são sincronizados.' },
        { icon: 'zepp-cloud', title: 'Dados avançados', copy: 'Acrescenta VFC, oxigênio no sangue, estresse e prontidão, que a API oficial não oferece.', detail: 'Login com e-mail ou telefone. O token fica só no cofre de credenciais do sistema.' },
        { icon: 'manual-entry', title: 'Inserção manual', copy: 'Uma alternativa quando os outros dois não servem.', detail: 'Cole você mesmo um token. Para quem conhece a API.' },
      ],
    },
    deck: {
      heading: 'Configurações como um baralho, não como uma parede de formulários',
      lead: 'Passe o mouse e elas se abrem em leque. Clique em uma para puxá-la.',
      hint: 'Passe o mouse para abrir, clique para puxar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Conta e dispositivos', copy: 'Autorização oficial e dados avançados têm cada um sua linha, então você sempre sabe qual conta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronização e atualizações', copy: 'Sincroniza ao abrir e depois em segundo plano no intervalo que você escolher.' },
        { icon: 'database', title: 'Arquivo e armazenamento', copy: 'Você decide por quanto tempo guardar. Os snapshots podem ser restaurados a qualquer hora.' },
        { icon: 'structured-data', title: 'Saúde dos dados', copy: 'Se cada fluxo foi baixado, entendido e gravado, mostrado separadamente.' },
        { icon: 'secure', title: 'Privacidade e segurança', copy: 'A API local somente leitura vem desligada e só escuta em 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arraste para a IA o que você quer perguntar',
      lead: 'Arraste uma métrica e as vizinhas saem da frente. Solte no centro e ela entra no pacote que você entrega à IA.',
      hint: 'Arraste um nó até o centro',
      center: 'Para a IA',
      nodes: ['Coração', 'Sono', 'VFC', 'Passos', 'Carga', 'PAI', 'Peso', 'Estresse'],
      picked: '{n} escolhidos',
      reset: 'Recomeçar',
    },
    privacy: {
      heading: 'Seus dados ficam no seu computador',
      lead: 'O ZeppBridge não tem servidor próprio que guarde seus dados de saúde.',
      points: [
        { icon: 'secure', title: 'Tokens no chaveiro do sistema', copy: 'Por padrão no Gerenciador de Credenciais do Windows ou nas Chaves do macOS, não na pasta de dados.' },
        { icon: 'private', title: 'Sem telemetria', copy: 'Sem relatórios de uso. Nenhum dado de saúde é coletado.' },
        { icon: 'database', title: 'Origem clara', copy: 'Cada registro sabe se veio da autorização oficial ou dos dados avançados.' },
        { icon: 'ai-ready', title: 'Você decide o que a IA vê', copy: 'O quê, quanto e quando. Tudo por sua conta.' },
      ],
    },
    footer: {
      heading: 'Grátis, código aberto, pronto para instalar',
      tagline: 'Uma ponte local para dados do Amazfit e do Zepp.',
      disclaimer: 'O ZeppBridge é um projeto independente de código aberto, sem vínculo com a Zepp Health ou a Amazfit.',
      download: 'Baixar',
    },
  },
};

export default pack;
