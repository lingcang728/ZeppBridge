/** Brazilian Portuguese P4 copy. Same shape as zh in ../p4Copy.ts; only the strings differ. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    {
      id: 'motion',
      name: 'Design',
      title: 'Amor à primeira vista.',
      lead: 'Navegação em vidro, cartões que viram páginas e dias que você folheia como um baralho.',
      points: [
        { id: 'glass', title: 'Vidro', text: 'Pressione e arraste suavemente pela navegação; toque para alternar. A refração acompanha seu toque.', scene: 'glass' },
        { id: 'morph', title: 'Metamorfose', text: 'Um cartão se abre em página inteira e retorna ao seu lugar ao voltar. O essencial em destaque, o resto recua.', scene: 'morph' },
        { id: 'poker', title: 'Baralho', text: 'Passe pelos cartões diários, abra semanas ou meses inteiros. Guarde os melhores momentos na caixa de memórias.', scene: 'poker' },
        { id: 'theme', title: 'Dia e noite', text: 'Temas claro e escuro. Um toque e a noite cai na tela.', scene: 'theme' },
      ],
    },
    {
      id: 'connection',
      name: 'Conexão',
      title: 'Seus dados da nuvem, de volta na sua mesa.',
      lead: 'Conecte sua conta Zepp e sincronize seus registros com este computador. Escolha o intervalo e deixe a sincronização automática cuidar do resto.',
      points: [
        { id: 'account', title: 'Login oficial', text: 'Entre no Zepp pelo navegador padrão, inclusive com contas de terceiros. Status de autorização disponível a qualquer momento.', scene: 'account' },
        { id: 'sync', title: 'Sincronização automática', text: 'Desativado, 15, 30 ou 60 minutos. Você descansa; seus dados sincronizam.', scene: 'sync' },
        { id: 'devices', title: 'Reconhece seu relógio', text: 'Identificação automática do modelo. E se errar, você mesmo seleciona o correto.', scene: 'devices' },
        { id: 'local', title: 'Fica neste computador', text: 'Registros sincronizados do Zepp ficam salvos neste computador e nunca passam pelos nossos servidores. Você escolhe o que enviar à IA.', scene: 'local' },
      ],
    },
    {
      id: 'records',
      name: 'Clareza',
      title: 'Dezenas de métricas em um relance.',
      lead: 'Todas as tendências em uma só tela para entender seu corpo na hora. Abra qualquer métrica para ver o histórico completo.',
      points: [
        { id: 'overview', title: 'Na sua ordem', text: 'Sono ou treinos primeiro: a tela inicial segue suas prioridades. Navegue e abra os detalhes.', scene: 'overview' },
        { id: 'hourly', title: 'Hora a hora', text: 'Passos, distância e calorias acompanhados hora a hora ao longo do dia.', scene: 'hourly' },
        { id: 'workouts', title: 'Cada corrida ecoa', text: 'Compare com treinos anteriores de distância parecida: frequência cardíaca, ritmo e trajeto no mapa.', scene: 'workouts' },
        { id: 'gaps', title: 'Nada inventado', text: 'Se não foi medido, fica em branco. Sem zeros falsos, valores repetidos ou estimativas aproximadas.', scene: 'gaps' },
      ],
    },
    {
      id: 'ai',
      name: 'Enviar à IA',
      title: 'Use as assinaturas que você já tem. Sem custos extras.',
      lead: 'Selecione os dias: seus registros viram um só arquivo. Envie para sua IA de costume, converse e traga o esboço de volta.',
      points: [
        { id: 'providers', title: 'Sete modelos à escolha', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao e Grok. Use suas contas e limites habituais.', scene: 'ai' },
        { id: 'prompt', title: 'Pergunte como quiser', text: 'Edite a pergunta sugerida ou crie a sua do zero.', scene: 'prompt' },
        { id: 'events', title: 'Contexto faz diferença', text: 'Anote um resfriado, uma viagem ou uma semana corrida para a IA entender melhor suas oscilações.', scene: 'events' },
        { id: 'autopaste', title: 'Automático · Windows', text: 'Cola e envia por você conferindo o estado da janela em cada etapa. Desativado por padrão.', scene: 'autopaste' },
      ],
    },
    {
      id: 'ai-plan',
      name: 'Plano de treino',
      title: 'Finalize no computador. Treine com o relógio.',
      lead: 'Conte como está se sentindo para a IA planejar sua semana. Cole de volta, ajuste até ficar perfeito e envie direto para o pulso.',
      points: [
        { id: 'receive', title: 'Cole com um clique', text: 'Da conversa ao esboço: copie de volta e seu plano semanal está pronto.', scene: 'receive' },
        { id: 'edit', title: 'Seu plano', text: 'Arraste para inverter dois dias, abra cada sessão e ajuste duração e intensidade passo a passo.', scene: 'plan-edit' },
        { id: 'templates', title: 'Modelos e importação', text: 'Salve como modelo para repetir o treino. Compatível com arquivos .zwo e treinos em .fit.', scene: 'templates' },
        { id: 'easy', title: 'Cansaço hoje', text: 'Se havia tiros planejados mas a recuperação está baixa, mude para uma rodagem leve com um toque. Você confirma antes do envio.', scene: 'easy' },
      ],
    },
  ],
  records: {
    sleep: { title: 'Sono', text: 'Das fases de uma só noite até os últimos sete dias. Abra e explore.' },
    workouts: { title: 'Treinos', text: 'Veja o treino por completo e compare com as sessões anteriores.' },
  },
  settings: {
    title: 'Ajustes',
    lead: 'Folheie os cartões grandes um a um; os pequenos se organizam como uma carteira. Conta, sincronização, exibição e dados na ponta dos dedos.',
    summaryTitle: 'Os detalhes vivem nos Ajustes.',
    summaryLead: 'Catorze configurações diárias, organizadas em uma única pilha.',
    items: [
      { id: 'sync', title: 'Sincronização automática', text: 'Desativado, 15, 30 ou 60 minutos. Basta escolher.', icon: 'auto-sync' },
      { id: 'retention', title: 'Tempo de retenção', text: 'O histórico da nuvem fica salvo neste computador. Você decide quanto tempo guardar.', icon: 'database' },
      { id: 'data', title: 'Cobertura de dados', text: 'O que pode e o que não pode ser sincronizado, com total transparência.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Ferramentas locais como Claude Code e Codex consultam diretamente. Publicar planos exige permissão.', icon: 'structured-data' },
      { id: 'formats', title: 'Quatro formatos', text: 'JSON · CSV · GPX, além de FIT na página de treinos.', icon: 'document' },
      { id: 'units', title: 'Unidades', text: 'Quilômetros ou milhas. Distância e ritmo mudam juntos.', icon: 'settings' },
      { id: 'time', title: 'Horário', text: 'Conforme sua região, ou formato de 12h ou 24h.', icon: 'auto-sync' },
      { id: 'date', title: 'Formato de data', text: 'Dia, mês e ano na ordem com que você já está acostumado.', icon: 'document' },
      { id: 'scale', title: 'Escala da interface', text: 'Aumente ou diminua a janela conforme sua preferência.', icon: 'overview' },
      { id: 'backup', title: 'Instantâneos e restauração', text: 'Guarde cópias de segurança do banco de dados e restaure quando precisar.', icon: 'database' },
      { id: 'api', title: 'API local', text: 'Vinculada apenas a 127.0.0.1. Somente leitura, protegida por token.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacidade e segurança', text: 'Credenciais protegidas pelo sistema operacional. Tokens nunca vão para os logs.', icon: 'browser-login' },
      { id: 'filename', title: 'Nomes de arquivo', text: 'Defina como nomear os arquivos gerados para a IA.', icon: 'document' },
      { id: 'folder', title: 'Pasta de dados', text: 'Veja onde os dados ficam guardados neste computador para backups e migrações.', icon: 'database' },
    ],
  },
  nav: [
    {
      label: 'Conheça o ZeppBridge',
      links: [
        { id: 'motion', label: 'Design' },
        { id: 'connection', label: 'Conexão' },
        { id: 'records', label: 'Clareza' },
      ],
    },
    {
      label: 'Dos dados à ação',
      links: [
        { id: 'ai', label: 'Enviar à IA' },
        { id: 'ai-plan', label: 'Plano de treino' },
        { id: 'record-sleep', label: 'Sono e treinos' },
      ],
    },
    {
      label: 'Do seu jeito',
      links: [
        { id: 'connect', label: 'Ajustes' },
        { id: 'set-mcp', label: 'MCP' },
        { id: 'set-api', label: 'API local' },
      ],
    },
  ],
  demoPrompt: 'Na próxima quarta estou sem tempo. Mantenha um treino de tiros e o restante leve.',
};

export default pack;
