import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Português (Portugal) landing pack.
 *
 * European register: tu/imperative forms, transferir/ficheiro/utilizador
 * vocabulary, predefinição instead of "padrão". Product terms (ZeppBridge, HAR,
 * appToken, MCP, SQLite, EXE/MSI, Apple Silicon, AI-ready) stay untranslated.
 * Decorative overlines stay in English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'Página inicial do ZeppBridge',
      site: 'Navegação do site',
      features: 'O que lê',
      local: 'Saídas locais',
      connect: 'Ligação',
      privacy: 'Privacidade',
      star: 'Estrela no GitHub',
      language: 'Idioma',
    },
    downloads: {
      windows: { label: 'Transferir para Windows', hint: 'Recomendado · Instalador EXE x64', msi: 'Implementação gerida: transferir MSI' },
      macos: { label: 'Transferir para macOS', hint: 'Apple Silicon · Instalador DMG' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'Os pacotes deb / rpm / AppImage / Flatpak são compilados em CI, mas ninguém concluiu ainda o início de sessão e o porta-chaves (Secret Service / KWallet) num ambiente de trabalho Linux real. Experimenta se quiseres — e abre um issue quando algo falhar. É exatamente disso que precisa agora.',
      },
      status: {
        loading: 'A procurar a versão mais recente no GitHub…',
        ready: 'Transfere diretamente — sem a página do GitHub pelo meio',
        fallback: 'As ligações diretas estão temporariamente indisponíveis; será aberta a página de Release',
      },
    },
    hero: {
      headlineLead: 'Os teus dados do Zepp,',
      headlineAccent: 'devolvidos por inteiro.',
      lead: 'O ZeppBridge liga, organiza e visualiza os dados do teu wearable Amazfit na tua própria máquina Windows, Mac ou Linux. Cada campo mantém a origem — lê-os tu mesmo ou entrega-os a uma IA nos teus termos.',
      starNudge: {
        title: 'A tua transferência começou',
        copy: 'Se o ZeppBridge ganhar um lugar na tua máquina, uma estrela no GitHub ajuda mais utilizadores Amazfit a encontrá-lo.',
        action: 'Dar uma estrela no GitHub',
        dismiss: 'Talvez mais tarde',
      },
      trust: [
        { icon: 'secure', label: 'Local-first' },
        { icon: 'private', label: 'Privado por predefinição' },
        { icon: 'structured-data', label: 'Dados estruturados' },
      ],
      stageLabel: 'Dispositivos Amazfit atuais a alimentar o ZeppBridge e a sair como dados estruturados',
      coreCaption: 'Descodificar · Organizar · Visualizar',
      outputs: [
        { title: 'Registos estruturados', copy: 'Origem e timestamps preservados' },
        { title: 'AI-ready', copy: 'Só sai quando tu disseres' },
      ],
      status: { title: 'Pipeline local pronto', copy: 'Nada passa por um servidor do ZeppBridge' },
    },
    principlesLabel: 'Princípios do produto',
    principles: [
      { icon: 'secure', title: 'Seguro', copy: 'Fica na tua máquina' },
      { icon: 'private', title: 'Privado', copy: 'Nada é enviado, nada é divulgado' },
      { icon: 'database', title: 'Proveniência', copy: 'As origens nunca se misturam' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Estrutura clara, usada a pedido' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'Dos números de hoje a cada sessão.',
      lead: 'A interface só mostra os campos que realmente recebeu. O que falta é marcado como ausente — nada de números inventados para encher um painel.',
      items: [
        { icon: 'heart-rate', title: 'Frequência cardíaca contínua', copy: 'Timestamps e origem preservados: vês a curva real.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Estrutura do sono', copy: 'Fases de sono profundo, leve, REM e vigília, analisadas localmente.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Detalhe do treino', copy: 'Percurso, ritmo, cadência, altitude e carga de treino.', tone: 'green' },
        { icon: 'vo2-max', title: 'Métricas de recuperação', copy: 'VO₂ Max, HRV e recuperação, apresentados por origem.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Nem precisas de o abrir.',
      lead: 'A app de desktop, a linha de comandos, o MCP e a API local só de leitura partilham o mesmo núcleo — unidades, fusos horários, origens e valores em falta contam uma única história. Em falta é em falta: nenhuma saída preenche o vazio com um zero.',
      items: [
        {
          icon: 'structured-data',
          title: 'Histórico completo e snapshots',
          copy: 'Recupera o histórico da nuvem mês a mês, com um livro-razão por bloco. Snapshots da base de dados inteira com checksum, e antes de restaurares vês a diferença no número de linhas.',
          tag: 'Local',
        },
        {
          icon: 'document',
          title: 'Linha de comandos',
          copy: 'status / sync / export. Sem perguntas, códigos de saída estáveis — seguro para pendurar no Agendador de Tarefas ou no cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'MCP só de leitura',
          copy: 'Deixa uma IA consultar os teus dados locais diretamente. Transporte stdio: sem porta à escuta, sem acesso à rede.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Escolhe o caminho que te serve.',
      lead: 'Do início de sessão web oficial simples a uma entrega manual totalmente auditável. O estado da ligação e as causas de erro aparecem sempre por extenso.',
      items: [
        { icon: 'browser-login', title: 'Início de sessão web oficial', copy: 'Autoriza dentro do fluxo oficial. As credenciais ficam na tua máquina.', tag: 'Recomendado' },
        { icon: 'document', title: 'Importar HAR', copy: 'Para depuração e utilizadores avançados: reutiliza um pedido autorizado que já tenhas capturado.', tag: 'Avançado' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'Introduz tu mesmo o appToken e o id de utilizador, à vista.', tag: 'Manual' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Os dados do teu wearable não devem tornar-se o ativo na nuvem de outra pessoa.',
      lead: 'Base de dados local, identificadores mascarados e origens isoladas são a predefinição. Quando quiseres uma IA envolvida, escolhes o que sai e onde aterra.',
      points: [
        { icon: 'database', label: 'Armazenamento SQLite local' },
        { icon: 'profile', label: 'IDs de conta mascarados por predefinição' },
        { icon: 'cloud-output', label: 'Exportação só quando a desencadeias' },
      ],
      vault: 'Não existe nenhum backend do ZeppBridge a retransmitir os teus dados de saúde.',
    },
    footer: {
      tagline: 'Ponte de dados Amazfit open source · Windows e Mac (Apple Silicon)',
      disclaimer: 'Projeto independente e não oficial de código aberto, sem afiliação nem endosso da Zepp Health, Huami ou Amazfit. Apenas para uso com contas e dados a que tens direito de acesso.',
      download: 'Transferir',
    },
  },
  meta: {
    title: 'ZeppBridge · Ponte de dados local',
    description:
      'O ZeppBridge é uma ponte local-first e open source e um visualizador para dados de wearables Amazfit / Zepp. Corre na tua própria máquina Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Os teus dados do Zepp, devolvidos por inteiro',
    ogDescription:
      'Liga, organiza e visualiza os dados do teu wearable Amazfit na tua própria máquina. As origens ficam intactas e nada sai até tu o enviares.',
  },
};

export default pack;
