import type { FilmPack } from '../copy';

const pack: FilmPack = {
  captions: {
    tagline: { title: 'Tudo o que o teu pulso regista. É teu, de verdade.' },
    chapterLook: { title: 'Aspeto' },
    chapterConnect: { title: 'Ligar' },
    chapterRead: { title: 'Compreender' },
    chapterAi: { title: 'Enviar à IA' },
    chapterSettings: { title: 'Definições' },
    glass: { title: 'Fluidez ao primeiro olhar.', sub: 'Liquid Glass em cada barra que tocas.' },
    morph: { title: 'De onde vem, para onde volta.', sub: 'O cartão abre-se numa página e regressa ao seu lugar.' },
    focus: { title: 'Um só foco. Tudo o resto recua.', sub: 'Notas, eventos e cartões sobem ao centro.' },
    poker: { title: 'Folhear o tempo.', sub: 'Sete dias, um mês, seis meses: camada a camada.' },
    deck: { title: 'Foca-te num. Ou espalha-os todos.' },
    lines: { title: 'Lança à vontade. Volta sempre ao lugar.' },
    night: { title: 'Um toque. A noite cai em todo o lado.' },
    ash: { title: 'Num estalar de dedos. Outro idioma.', sub: 'Dez idiomas.' },
    cloud: { title: 'O que está na nuvem, está na tua secretária.', sub: 'Inicia sessão na Zepp e os teus registos sincronizam com este computador.' },
    autosync: { title: 'Tu dormes. Ele sincroniza.', sub: 'Desligado, 15, 30 ou 60 minutos.' },
    devices: { title: 'Cada relógio que usas, reconhecido.', sub: 'Detetado automaticamente; se falhar, corriges tu.' },
    local: { title: 'Os teus dados de saúde ficam no teu computador.', sub: 'Nunca passam pelos nossos servidores.' },
    metrics: { title: 'Dezenas de métricas, num relance.' },
    focusAreas: { title: 'Sono ou treino. O teu resumo, na tua ordem.' },
    hourly: { title: 'Passo a passo, hora a hora.' },
    workout: { title: 'Cada corrida tem o seu eco.', sub: 'Comparada com as tuas corridas de distância semelhante.' },
    blank: { title: 'Nenhum dado é inventado.' },
    events: { title: 'Cada oscilação tem uma razão.', sub: 'Regista uma constipação, febre ou uma viagem, para que a IA compreenda a tua vida.' },
    subscription: { title: 'A IA que já pagas. Nem mais um cêntimo.' },
    prompt: { title: 'Pergunta à tua maneira.' },
    coach: { title: 'Copia. Cola de volta.', sub: 'O treinador mais inteligente está ao teu alcance.' },
    plan: { title: 'O teu plano, a tua escolha.' },
    formats: { title: 'Quatro formatos. Um só clique.', sub: 'JSON · CSV · GPX · FIT' },
    mcp: {
      title: 'A tua IA local, diretamente à fonte.',
      sub: 'Com o MCP, ferramentas locais como o Claude Code e o Codex leem os teus dados; com a tua autorização, até publicam o plano de treino.',
    },
    display: { title: 'Quilómetros ou milhas. 12 ou 24 horas. O tamanho que quiseres.' },
    backup: {
      title: 'Snapshots para voltar atrás.',
      sub: 'Guarda a base de dados num só clique. Restaura quando precisares.',
    },
    api: {
      title: 'Uma API local que só responde a ti.',
      sub: 'Apenas em 127.0.0.1, só de leitura, token obrigatório.',
    },
    free: {
      title: 'Gratuito. Código aberto. Em todo o lado.',
      sub: 'Windows · macOS · Linux · Dez idiomas',
    },
    tryIt: { title: 'zeppbridge.com' },
    pile: { title: 'Empilha tudo. Arruma na caixa.' },
    planIntro: { title: 'O teu plano de treino, pela IA.' },
    tell: { title: 'Diz-lhe como te sentes.', sub: 'Os teus registos de sono e treino vão em anexo.' },
    summarize: { title: 'A IA lê os teus registos e planeia a semana.' },
    toWatch: { title: 'Finaliza no computador. Treina no relógio.' },
  },
  script: {
    prompt:
      'Tenho o joelho esquerdo um pouco dorido e dormi mal nas últimas duas noites. Prepara-me o treino da próxima semana, com intensidade ligeira.',
    answer:
      'Pelos registos em anexo: as duas últimas noites foram curtas e a tua frequência cardíaca de repouso está ligeiramente acima do normal. Com a dor no joelho, reduzimos o volume e deixamos de fora os sprints rápidos.\n\nA próxima semana fica assim: hoje descanso; amanhã começamos com 40 minutos de corrida fácil e, no dia a seguir, treino ligeiro de bicicleta; intercalamos ritmo, séries e treino longo em dias alternados, sempre com aquecimento e retorno à calma. O plano está pronto: volta a colocá-lo no ZeppBridge para reveres dia a dia e enviares para o relógio.',
    watchName: 'Corrida fácil',
    watchMeta: '40 min',
  },
};

export default pack;
