import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Português (Brasil) landing pack.
 *
 * Brazilian register: você forms, gerund where natural ("baixando"), and the
 * tela/arquivo vocabulary. Product terms (ZeppBridge, HAR, appToken, MCP,
 * SQLite, EXE/MSI, Apple Silicon, AI-ready) stay untranslated. Decorative
 * overlines stay in English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'Página inicial do ZeppBridge',
      site: 'Navegação do site',
      features: 'O que ele lê',
      local: 'Saídas locais',
      connect: 'Conexão',
      privacy: 'Privacidade',
      star: 'Estrela no GitHub',
      language: 'Idioma',
    },
    downloads: {
      windows: { label: 'Baixar para Windows', hint: 'Recomendado · Instalador EXE x64', msi: 'Implantação gerenciada: baixar MSI' },
      macos: { label: 'Baixar para macOS', hint: 'Apple Silicon · Instalador DMG' },
      linux: {
        label: 'Linux',
        previewBadge: 'Prévia',
        note: 'deb / rpm / AppImage / Flatpak já saem do CI, mas ninguém concluiu ainda o login mais o chaveiro (Secret Service / KWallet) num desktop Linux de verdade. Se quiser testar, abra uma issue quando algo quebrar — é exatamente disso que ele precisa agora.',
      },
      status: {
        loading: 'Buscando a versão mais recente no GitHub…',
        ready: 'Baixa direto — sem página do GitHub no caminho',
        fallback: 'Os links diretos estão indisponíveis no momento; a página de Release será aberta',
      },
    },
    hero: {
      headlineLead: 'Seus dados do Zepp,',
      headlineAccent: 'devolvidos por inteiro.',
      lead: 'O ZeppBridge conecta, organiza e visualiza os dados do seu wearable Amazfit na sua própria máquina Windows, Mac ou Linux. Cada campo mantém a origem — leia você mesmo ou entregue a uma IA nos seus termos.',
      starNudge: {
        title: 'Seu download começou',
        copy: 'Se o ZeppBridge conquistar um lugar na sua máquina, uma estrela no GitHub ajuda mais usuários de Amazfit a encontrá-lo.',
        action: 'Dar uma estrela no GitHub',
        dismiss: 'Talvez depois',
      },
      trust: [
        { icon: 'secure', label: 'Local-first' },
        { icon: 'private', label: 'Privado por padrão' },
        { icon: 'structured-data', label: 'Dados estruturados' },
      ],
      stageLabel: 'Dispositivos Amazfit atuais alimentando o ZeppBridge e saindo como dados estruturados',
      coreCaption: 'Decodificar · Organizar · Visualizar',
      outputs: [
        { title: 'Registros estruturados', copy: 'Origem e timestamps preservados' },
        { title: 'AI-ready', copy: 'Só sai quando você manda' },
      ],
      status: { title: 'Pipeline local pronto', copy: 'Nada passa por um servidor do ZeppBridge' },
    },
    principlesLabel: 'Princípios do produto',
    principles: [
      { icon: 'secure', title: 'Seguro', copy: 'Fica na sua máquina' },
      { icon: 'private', title: 'Privado', copy: 'Nada é enviado, nada vaza' },
      { icon: 'database', title: 'Procedência', copy: 'As origens nunca se misturam' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Estrutura clara, usada quando você pede' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'Dos números de hoje a cada treino.',
      lead: 'A interface só mostra os campos que ela realmente recebeu. O que falta é marcado como ausente — nada de números inventados para encher um painel.',
      items: [
        { icon: 'heart-rate', title: 'Frequência cardíaca contínua', copy: 'Timestamps e origem preservados: você vê a curva real.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Estrutura do sono', copy: 'Sono profundo, leve, REM e vigília, interpretados localmente.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Detalhes do treino', copy: 'Trajeto, ritmo, cadência, altitude e carga de treino.', tone: 'green' },
        { icon: 'vo2-max', title: 'Métricas de recuperação', copy: 'VO₂ Max, HRV e recuperação, exibidos por origem.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Você nem precisa abrir.',
      lead: 'O app de desktop, a linha de comando, o MCP e a API local somente leitura compartilham o mesmo núcleo — unidades, fusos, origens e valores ausentes contam uma única história. Faltando é faltando: nenhuma saída preenche o vazio com zero.',
      items: [
        {
          icon: 'structured-data',
          title: 'Histórico completo e snapshots',
          copy: 'Traga o histórico da nuvem de volta mês a mês, com livro-razão por bloco. Snapshots do banco inteiro vêm com checksum, e antes de restaurar você vê a diferença no número de linhas.',
          tag: 'Local',
        },
        {
          icon: 'document',
          title: 'Linha de comando',
          copy: 'status / sync / export. Sem perguntas, códigos de saída estáveis — dá para pendurar no Agendador de Tarefas ou no cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'MCP somente leitura',
          copy: 'Deixe uma IA consultar seus dados locais por conta própria. Transporte stdio: sem porta aberta, sem acesso à rede.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Escolha o caminho que combina com você.',
      lead: 'Do login web oficial simples a uma entrega manual totalmente auditável. O estado da conexão e as causas de erro sempre aparecem por extenso.',
      items: [
        { icon: 'browser-login', title: 'Login web oficial', copy: 'Autorize dentro do fluxo oficial. As credenciais ficam na sua máquina.', tag: 'Recomendado' },
        { icon: 'document', title: 'Importar HAR', copy: 'Para depuração e usuários avançados: reutilize uma requisição autorizada que você já capturou.', tag: 'Avançado' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'Digite você mesmo o appToken e o id de usuário, à vista de tudo.', tag: 'Na mão' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Os dados do seu wearable não deveriam virar ativo de nuvem de outra pessoa.',
      lead: 'Banco local, identificadores mascarados e origens isoladas são o padrão. Quando você quiser uma IA no loop, você escolhe o que sai e onde aterrissa.',
      points: [
        { icon: 'database', label: 'Armazenamento SQLite local' },
        { icon: 'profile', label: 'IDs de conta mascarados por padrão' },
        { icon: 'cloud-output', label: 'Exportação só quando você dispara' },
      ],
      vault: 'Não existe backend do ZeppBridge retransmitindo seus dados de saúde.',
    },
    footer: {
      tagline: 'Ponte de dados Amazfit de código aberto · Windows e Mac (Apple Silicon)',
      disclaimer: 'Projeto independente e não oficial de código aberto, sem afiliação ou endosso da Zepp Health, Huami ou Amazfit. Use apenas com contas e dados aos quais você tem direito de acesso.',
      download: 'Baixar',
    },
  },
  meta: {
    title: 'ZeppBridge · Ponte de dados local',
    description:
      'O ZeppBridge é uma ponte e visualizador local e de código aberto para dados de wearables Amazfit / Zepp. Roda na sua própria máquina Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Seus dados do Zepp, devolvidos por inteiro',
    ogDescription:
      'Conecte, organize e visualize os dados do seu wearable Amazfit na sua própria máquina. As origens ficam intactas e nada sai até você enviar.',
  },
};

export default pack;
