/** Textos da página de destino P4 em português europeu (pt-PT). Estrutura idêntica à de zh / en em p4Copy.ts. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Design', title: 'Amor à primeira vista.', lead: 'Navegação em vidro, cartões que se transformam em páginas e dias que folheias como um baralho.', points: [
      { id: 'glass', title: 'Vidro', text: 'Prime e arrasta suavemente pela barra de navegação; toca para mudar. A refração acompanha a ponta do teu dedo.', scene: 'glass' },
      { id: 'morph', title: 'Metamorfose', text: 'Um cartão abre-se numa página inteira e volta ao seu lugar ao regressares. O essencial em foco, tudo o resto recua.', scene: 'morph' },
      { id: 'poker', title: 'Baralho', text: 'Percorre os cartões diários, desdobra semanas ou meses inteiros. Guarda os melhores momentos na caixa de memórias.', scene: 'poker' },
      { id: 'theme', title: 'Dia e noite', text: 'Temas claro e escuro. Um toque e a noite envolve o ecrã.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Ligação', title: 'Os teus registos da nuvem, de volta à tua secretária.', lead: 'Liga a tua conta Zepp e sincroniza os teus dados com este computador. Define a frequência e deixa a sincronização automática tratar do resto.', points: [
      { id: 'account', title: 'Sessão oficial', text: 'Inicia sessão no Zepp através do teu navegador habitual, inclusive com contas de terceiros. Estado da autorização consultável a qualquer momento.', scene: 'account' },
      { id: 'sync', title: 'Sincronização automática', text: 'Desativado, 15, 30 ou 60 minutos. Tu descansas; os teus dados sincronizam.', scene: 'sync' },
      { id: 'devices', title: 'Reconhece o teu relógio', text: 'Identificação automática do modelo. E se falhar, indicas tu mesmo o modelo certo.', scene: 'devices' },
      { id: 'local', title: 'Fica neste computador', text: 'Os registos de saúde do Zepp ficam guardados neste computador e nunca passam pelos nossos servidores. Tu escolhes o que envias à IA.', scene: 'local' },
    ] },
    { id: 'records', name: 'Compreender', title: 'Dezenas de métricas num relance.', lead: 'Todas as tendências numa só página para avaliares a tua condição física. Abre qualquer métrica para veres o histórico completo.', points: [
      { id: 'overview', title: 'À tua maneira', text: 'Sono ou treinos primeiro: a página inicial adapta-se às tuas prioridades. Percorre e abre os detalhes.', scene: 'overview' },
      { id: 'hourly', title: 'Hora a hora', text: 'Passos, distância e calorias acompanhados hora a hora ao longo do dia.', scene: 'hourly' },
      { id: 'workouts', title: 'Cada corrida deixa o seu eco', text: 'Compara cada treino com sessões anteriores de distância semelhante: frequência cardíaca, ritmo e percurso no mapa.', scene: 'workouts' },
      { id: 'gaps', title: 'Nada inventado', text: 'Se não foi medido, fica em branco. Sem zeros artificiais, valores repetidos ou estimativas infundadas.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'Enviar à IA', title: 'Aproveita as tuas subscrições atuais. Sem custos adicionais.', lead: 'Seleciona os dias: os teus registos transformam-se num único ficheiro. Partilha-o com a tua IA habitual, continua a conversa e traz o primeiro rascunho de volta.', points: [
      { id: 'providers', title: 'Sete modelos à escolha', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao e Grok. Utiliza as tuas contas e limites habituais.', scene: 'ai' },
      { id: 'prompt', title: 'Pergunta o que quiseres', text: 'Altera a pergunta sugerida ou escreve a tua própria pergunta de raiz.', scene: 'prompt' },
      { id: 'events', title: 'O contexto conta', text: 'Regista uma constipação, uma viagem ou uma semana intensa para a IA compreender melhor as oscilações.', scene: 'events' },
      { id: 'autopaste', title: 'Automático · Windows', text: 'Cola e envia por ti verificando a janela a cada passo. Desativado por predefinição.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Plano de treino', title: 'Finaliza no computador. Treina com o teu relógio.', lead: 'Partilha como te sentes com a IA para estruturar a tua semana. Cola de volta, ajusta ao teu gosto e envia diretamente para o pulso.', points: [
      { id: 'receive', title: 'Cola num clique', text: 'Da conversa ao rascunho: copia de volta e tens o teu plano semanal pronto.', scene: 'receive' },
      { id: 'edit', title: 'O teu plano', text: 'Arrasta para trocar dois dias, abre qualquer sessão e ajusta a duração e a intensidade passo a passo.', scene: 'plan-edit' },
      { id: 'templates', title: 'Modelos e importação', text: 'Guarda como modelo para repetires o treino. Compatível com ficheiros .zwo e treinos em .fit.', scene: 'templates' },
      { id: 'easy', title: 'Cansaço hoje', text: 'Se tinhas séries planeadas mas a recuperação foi fraca, muda para treino ligeiro num toque. Confirmas antes do envio.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sono', text: 'Das fases de uma só noite até aos últimos sete dias. Abre e explora.' },
    workouts: { title: 'Treinos', text: 'Vê o treino em detalhe e compara com as sessões anteriores.' },
  },
  settings: {
    title: 'Definições',
    lead: 'Percorre os cartões grandes um a um; os pequenos juntam-se como numa carteira. Conta, sincronização, ecrã e gestão de dados ao alcance de um toque.',
    summaryTitle: 'Todos os pormenores estão nas Definições.',
    summaryLead: 'Catorze opções do dia a dia, reunidas numa única pilha de cartões.',
    items: [
      { id: 'sync', title: 'Sincronização automática', text: 'Desativado, 15, 30 ou 60 minutos. Basta escolheres.', icon: 'auto-sync' },
      { id: 'retention', title: 'Tempo de retenção', text: 'O histórico da nuvem fica guardado neste computador. Tu decides durante quanto tempo o manténs.', icon: 'database' },
      { id: 'data', title: 'Cobertura de dados', text: 'O que pode e o que não pode ser sincronizado, com total transparência.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Ferramentas locais como o Claude Code e o Codex consultam diretamente. A publicação de planos requer a tua autorização.', icon: 'structured-data' },
      { id: 'formats', title: 'Quatro formatos', text: 'JSON · CSV · GPX, além de FIT na página de treinos.', icon: 'document' },
      { id: 'units', title: 'Unidades', text: 'Quilómetros ou milhas. Distância e ritmo mudam em simultâneo.', icon: 'settings' },
      { id: 'time', title: 'Hora', text: 'Consoante a tua região, ou formato de 12h ou 24h.', icon: 'auto-sync' },
      { id: 'date', title: 'Formato da data', text: 'Dia, mês e ano pela ordem a que estás habituado.', icon: 'document' },
      { id: 'scale', title: 'Escala da interface', text: 'Aumenta ou diminui o tamanho da janela conforme preferires.', icon: 'overview' },
      { id: 'backup', title: 'Instantâneos e restauro', text: 'Guarda cópias da base de dados e restaura quando for necessário.', icon: 'database' },
      { id: 'api', title: 'API local', text: 'Ligada exclusivamente a 127.0.0.1. Apenas de leitura, protegida por token.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacidade e segurança', text: 'Credenciais protegidas pelo sistema. Os tokens nunca são gravados nos registos de eventos.', icon: 'browser-login' },
      { id: 'filename', title: 'Nomes de ficheiros', text: 'Tu decides o nome dos ficheiros preparados para a IA.', icon: 'document' },
      { id: 'folder', title: 'Pasta de dados', text: 'Consulta onde os dados ficam guardados neste computador para cópias e migrações.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'Conhecer o ZeppBridge', links: [{ id: 'motion', label: 'Design' }, { id: 'connection', label: 'Ligação' }, { id: 'records', label: 'Compreender' }] },
    { label: 'Dos registos à ação', links: [{ id: 'ai', label: 'Enviar à IA' }, { id: 'ai-plan', label: 'Plano de treino' }, { id: 'record-sleep', label: 'Sono e treinos' }] },
    { label: 'À tua maneira', links: [{ id: 'connect', label: 'Definições' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'API local' }] },
  ],
  demoPrompt: 'Na próxima quarta-feira não posso. Mantém uma sessão de séries e o resto treino ligeiro.',
};

export default pack;
