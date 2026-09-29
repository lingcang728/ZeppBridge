import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Os teus dados Zepp no teu computador',
    description: 'O ZeppBridge é uma ponte local e de código aberto para dados Amazfit e Zepp. Corre no teu próprio Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Os teus dados Zepp de volta às tuas mãos',
    ogDescription: 'Sincroniza, consulta e organiza os teus dados Amazfit no teu computador. Entrega-os a uma IA com um clique.',
  },
  copy: {
    nav: { home: 'Início do ZeppBridge', site: 'Navegação do site', connect: 'Ligar', motion: 'Interface', handoff: 'Para a IA', privacy: 'Privacidade', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Transferir para Windows', hint: 'Instalador x64', msi: 'Implementação em massa: transfere o MSI' },
      macos: { label: 'Transferir para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'Os pacotes deb, rpm, AppImage e Flatpak saem da CI, mas ainda ninguém testou o início de sessão e o porta-chaves de ponta a ponta num ambiente Linux real. Se algo falhar, abre uma issue.' },
      status: { loading: 'A procurar o instalador mais recente', ready: 'Clica para transferir diretamente', fallback: 'Sem ligação direta de momento; vai abrir a página do GitHub' },
    },
    hero: {
      headlineLead: 'Os teus dados Zepp,',
      headlineAccent: 'de volta às tuas mãos.',
      lead: 'Sincroniza, consulta e organiza os teus dados Amazfit no teu computador. Entrega-os a uma IA com um clique.',
      github: 'Ver no GitHub',
      starNudge: { title: 'A transferência começou', copy: 'Se o ZeppBridge te é útil, uma estrela no GitHub ajuda outros utilizadores Amazfit a encontrá-lo.', action: 'Dar uma estrela', dismiss: 'Agora não' },
    },
    demo: {
      label: 'Demonstração interativa da vista geral do ZeppBridge',
      sample: 'Dados de exemplo',
      hint: 'Toca num cartão',
      back: 'Voltar',
      greeting: 'Vista geral',
      heart: { title: 'Frequência cardíaca', unit: 'bpm', detail: 'Minuto a minuto, o dia inteiro. Os minutos sem relógio ficam vazios em vez de passarem a zero.' },
      steps: { title: 'Passos de hoje', unit: 'passos', detail: 'Os passos por hora vêm da autorização oficial do Zepp e só são comparados com o teu próprio histórico.' },
      sleep: { title: 'Última noite', hours: 'h', minutes: 'min', detail: 'Profundo, leve, REM e acordado por ordem. O REM medido pelo Zepp tem prioridade.' },
    },
    devicesLabel: 'Dispositivos Amazfit suportados',
    connect: {
      heading: 'Três formas de ligar. Escolhe a mais fácil.',
      lead: 'Começa pela autorização oficial e junta os dados avançados para mais métricas. Se nenhuma resultar, fica a introdução manual.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorização oficial do Zepp', copy: 'Inicia sessão no Zepp no teu navegador habitual e aceita.', detail: 'Funcionam contas Google, Xiaomi e Apple. Sono, frequência cardíaca, passos, treinos, PAI e peso são sincronizados.' },
        { icon: 'zepp-cloud', title: 'Dados avançados', copy: 'Junta VFC, oxigénio no sangue, stress e prontidão, que a API oficial não disponibiliza.', detail: 'Inicia sessão com e-mail ou telefone. O token fica apenas no gestor de credenciais do sistema.' },
        { icon: 'manual-entry', title: 'Introdução manual', copy: 'Uma alternativa quando as outras duas não servem.', detail: 'Cola tu mesmo um token. Pensado para quem conhece a API.' },
      ],
    },
    deck: {
      heading: 'Definições como um baralho, não como uma parede de formulários',
      lead: 'Passa o rato e abrem em leque. Clica numa para a tirar.',
      hint: 'Passa o rato para abrir, clica para tirar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Conta e dispositivos', copy: 'A autorização oficial e os dados avançados têm cada um a sua linha, por isso sabes sempre que conta está ligada.' },
        { icon: 'auto-sync', title: 'Sincronização e atualizações', copy: 'Sincroniza ao abrir e depois em segundo plano ao ritmo que escolheres.' },
        { icon: 'database', title: 'Arquivo e armazenamento', copy: 'Decides tu durante quanto tempo guardar. Os snapshots restauram-se a qualquer momento.' },
        { icon: 'structured-data', title: 'Saúde dos dados', copy: 'Se cada fluxo foi obtido, compreendido e gravado, mostrado em separado.' },
        { icon: 'secure', title: 'Privacidade e segurança', copy: 'A API local só de leitura vem desligada e só escuta em 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arrasta para a IA aquilo que queres perguntar',
      lead: 'Arrasta uma métrica e as vizinhas afastam-se. Larga-a no centro e entra no pacote que entregas à IA.',
      hint: 'Arrasta um nó para o centro',
      center: 'Para a IA',
      nodes: ['Coração', 'Sono', 'VFC', 'Passos', 'Carga', 'PAI', 'Peso', 'Stress'],
      picked: '{n} escolhidos',
      reset: 'Recomeçar',
    },
    privacy: {
      heading: 'Os teus dados ficam no teu computador',
      lead: 'O ZeppBridge não tem servidor próprio que guarde os teus dados de saúde.',
      points: [
        { icon: 'secure', title: 'Tokens no porta-chaves do sistema', copy: 'Por omissão no Gestor de Credenciais do Windows ou no Porta-chaves do macOS, não na pasta de dados.' },
        { icon: 'private', title: 'Sem telemetria', copy: 'Sem relatórios de utilização. Nenhum dado de saúde é recolhido.' },
        { icon: 'database', title: 'Origem clara', copy: 'Cada registo sabe se veio da autorização oficial ou dos dados avançados.' },
        { icon: 'ai-ready', title: 'Decides o que a IA vê', copy: 'O quê, quanto e quando. Depende só de ti.' },
      ],
    },
    footer: {
      heading: 'Grátis, código aberto, pronto a instalar',
      tagline: 'Uma ponte local para dados Amazfit e Zepp.',
      disclaimer: 'O ZeppBridge é um projeto independente de código aberto, sem ligação à Zepp Health nem à Amazfit.',
      download: 'Transferir',
    },
  },
};

export default pack;
