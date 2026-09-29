import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Os teus dados Zepp no teu computador',
    description: 'Ponte local e de código aberto para dados Amazfit e Zepp. Corre diretamente no teu Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Os teus dados Zepp de volta às tuas mãos',
    ogDescription: 'Sincroniza, consulta e organiza os teus dados Amazfit no teu computador. Envia-os para a IA com um clique.',
  },
  copy: {
    nav: { home: 'Início do ZeppBridge', site: 'Navegação do site', connect: 'Ligar', motion: 'Interface', handoff: 'Enviar à IA', privacy: 'Privacidade', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Transferir para Windows', hint: 'Instalador x64', msi: 'Instalação em massa: transfere o MSI' },
      macos: { label: 'Transferir para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'Os pacotes deb, rpm, AppImage e Flatpak saem da CI, mas ainda ninguém testou a autenticação e o porta-chaves num Linux real. Algum problema? Abre um issue.' },
      status: { loading: 'A procurar o instalador mais recente', ready: 'Clica para transferir diretamente', fallback: 'Sem ligação direta; abre os lançamentos no GitHub' },
    },
    hero: {
      headlineLead: 'Os teus dados Zepp,',
      headlineAccent: 'de volta às tuas mãos.',
      lead: 'Sincroniza, explora e organiza os dados Amazfit no teu computador. Envia-os à IA com um só clique.',
      github: 'Ver no GitHub',
      starNudge: { title: 'A transferência começou', copy: 'Se o ZeppBridge te é útil, uma estrela no GitHub ajuda outros utilizadores a encontrá-lo.', action: 'Dar uma estrela', dismiss: 'Agora não' },
    },
    demo: {
      label: 'Demonstração interativa da visão geral do ZeppBridge',
      sample: 'Dados de exemplo',
      hint: 'Toca num cartão',
      back: 'Voltar',
      greeting: 'Visão geral',
      heart: { title: 'Frequência cardíaca', unit: 'bpm', detail: 'Minuto a minuto, o dia todo. Minutos fora do pulso ficam vazios, nunca com 0 no lugar.' },
      steps: { title: 'Passos de hoje', unit: 'passos', detail: 'Passos por hora via autorização oficial Zepp, comparados apenas com o teu histórico.' },
      sleep: { title: 'Última noite', hours: 'h', minutes: 'min', detail: 'Profundo, leve, REM e acordado por ordem; o valor REM oficial medido tem prioridade.' },
    },
    devicesLabel: 'Dispositivos Amazfit suportados',
    connect: {
      heading: 'Três formas de ligar. Escolhe a mais simples.',
      lead: 'Começa pela autorização oficial e junta Dados avançados para mais métricas. Em alternativa, introduz manualmente.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorização oficial Zepp', copy: 'Inicia sessão no Zepp no teu navegador habitual e autoriza.', detail: 'Contas Google, Xiaomi e Apple. Sincroniza sono, frequência cardíaca, passos, treinos, PAI e peso.' },
        { icon: 'zepp-cloud', title: 'Dados avançados', copy: 'Acrescenta VFC, oxigénio no sangue, stress e prontidão, ausentes da API oficial.', detail: 'Inicia sessão com e-mail ou telemóvel. O token fica guardado no gestor de credenciais do sistema.' },
        { icon: 'manual-entry', title: 'Introdução manual', copy: 'Alternativa quando as outras duas vias não servirem.', detail: 'Cola o teu token diretamente. Para quem conhece a API.' },
      ],
    },
    deck: {
      heading: 'Definições como um baralho, não uma lista sem fim',
      lead: 'Passa o rato para abrir em leque; clica numa para tirar.',
      hint: 'Passa o rato para abrir, clica para tirar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Conta e dispositivos', copy: 'Autorização oficial e Dados avançados em linhas separadas; vês logo que conta está ligada.' },
        { icon: 'auto-sync', title: 'Sincronização e atualizações', copy: 'Sincroniza ao iniciar e depois silenciosamente no intervalo definido.' },
        { icon: 'database', title: 'Arquivo e armazenamento', copy: 'Tu decides o tempo de retenção. Restaura instantâneos a qualquer momento.' },
        { icon: 'structured-data', title: 'Saúde dos dados', copy: 'Vê com clareza se cada fluxo foi obtido, compreendido e gravado.' },
        { icon: 'secure', title: 'Privacidade e segurança', copy: 'A API local só de leitura vem desligada e escuta apenas em 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arrasta para a IA o que queres perguntar',
      lead: 'Arrasta uma métrica e as vizinhas abrem espaço. Larga-a no centro para a incluir no pacote para a IA.',
      hint: 'Arrasta um nó para o centro',
      center: 'Enviar à IA',
      nodes: ['Frequência cardíaca', 'Sono', 'VFC', 'Passos', 'Carga de treino', 'PAI', 'Peso', 'Stress'],
      picked: '{n} selecionados',
      reset: 'Recomeçar',
    },
    privacy: {
      heading: 'Os teus dados ficam no teu computador',
      lead: 'O ZeppBridge não tem servidores próprios a guardar os teus dados de saúde.',
      points: [
        { icon: 'secure', title: 'Tokens no cofre do sistema', copy: 'Guardados no Gestor de Credenciais do Windows ou no Porta-chaves do macOS, nunca na pasta de dados.' },
        { icon: 'private', title: 'Sem telemetria', copy: 'Sem relatórios de utilização nem recolha de dados de saúde.' },
        { icon: 'database', title: 'Origem transparente', copy: 'Cada registo identifica se veio da autorização oficial ou de Dados avançados.' },
        { icon: 'ai-ready', title: 'Tu controlas o envio à IA', copy: 'O quê, quanto e quando. A decisão é sempre tua.' },
      ],
    },
    footer: {
      heading: 'Grátis, código aberto, pronto a usar',
      tagline: 'Ponte local para dados Amazfit e Zepp.',
      disclaimer: 'O ZeppBridge é um projeto independente de código aberto, sem vínculo à Zepp Health nem à Amazfit.',
      download: 'Transferir',
    },
  },
};

export default pack;
