import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Do pulso para o seu computador, do computador para a IA',
    description: 'O ZeppBridge traz seus dados do Amazfit e do Zepp da nuvem do Zepp para o seu próprio computador e deixa tudo pronto em um arquivo para a sua IA. Grátis e de código aberto.',
    ogTitle: 'ZeppBridge · Do pulso para a mesa. Da mesa para a IA.',
    ogDescription: 'Sincronize e veja localmente frequência cardíaca, sono e treinos, e entregue tudo com um clique à IA que você já usa.',
  },
  copy: {
    nav: {
      home: 'Início do ZeppBridge',
      site: 'Navegação do site',
      demo: 'Demonstração',
      ai: 'Para a IA',
      privacy: 'Privacidade',
      download: 'Baixar',
      github: 'GitHub',
      language: 'Idioma',
      toDark: 'Mudar para escuro',
      toLight: 'Mudar para claro',
    },
    downloads: {
      windows: { label: 'Baixar para Windows', hint: 'Instalador x64', msi: 'MSI para instalações gerenciadas' },
      macos: { label: 'Baixar para macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'A CI gera deb, rpm, AppImage e Flatpak, mas ninguém testou ainda o login e o chaveiro de ponta a ponta em um desktop Linux de verdade. Algum problema? Abra uma issue.',
      },
      status: {
        loading: 'Procurando o instalador mais recente',
        ready: 'Clique para baixar direto',
        fallback: 'Abre o GitHub Releases, onde você escolhe o instalador',
      },
    },
    sample: 'Exemplo',
    hero: {
      eyebrow: 'Grátis · Código aberto · Seus dados ficam no seu computador',
      titleLead: 'O que o seu relógio registra,',
      titleAccent: 'fica no seu computador.',
      lead: 'O ZeppBridge traz da nuvem da Zepp para o seu próprio computador a frequência cardíaca, o sono e os treinos que o seu Amazfit registra, num arquivo local que você consegue ler e levar com você. Quando quiser perguntar algo a uma IA, você escolhe o período e entrega um único arquivo.',
      github: 'Ver o código no GitHub',
      meta: 'Grátis · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimental',
      devices: 'Aparelhos Amazfit que ele já reconhece',
      stage: {
        hint: 'Clique para experimentar',
        note: 'À direita está o ZeppBridge de verdade, com dados de exemplo.',
        loading: 'Abrindo o app…',
        exit: 'Sair da demonstração',
        unavailable: 'Este navegador não consegue abrir a demonstração. Baixe o app para ver.',
      },
      starNudge: {
        title: 'Seu download começou',
        copy: 'Se o ZeppBridge ajuda você, uma estrela no GitHub ajuda outras pessoas com Amazfit a encontrá-lo.',
        action: 'Dar uma estrela',
        dismiss: 'Depois',
      },
    },
    beats: [
      {
        kicker: '01 · Sincronizar',
        title: 'Traga para o seu computador o que o seu pulso registra',
        body: 'Entre com a sua própria conta Zepp e a frequência cardíaca, o sono e os treinos são guardados dia a dia num banco de dados nesta máquina. Fácil de ler, fácil de levar e disponível mesmo sem internet.',
      },
      {
        kicker: '02 · Sem fingir',
        title: 'Não medido significa não medido',
        body: 'Olhe o gráfico à direita: ontem à tarde há um espaço em branco, porque o relógio não estava no pulso. O ZeppBridge não preenche com 0 nem desenha uma linha inventada. Os dias que faltam aparecem como tracinhos cinza em volta de cada bloco de dados.',
      },
      {
        kicker: '03 · Para a IA',
        title: 'Quer perguntar algo a uma IA? Escolha primeiro o que ela vai ver',
        body: 'O que está dentro do círculo é entregue, o que está fora não é, e os tracinhos em volta de cada ponto mostram em quais dias há dados. Aperte o botão de envio e o .md já empacotado fica pronto para arrastar para a conversa.',
      },
      {
        kicker: '04 · Plano',
        title: 'Um treino planejado pela IA, enviado ao relógio só depois que você conferir',
        body: 'Cole de volta a resposta inteira da IA: você vê dia a dia o que muda, com a faixa de frequência cardíaca de cada etapa desenhada num gráfico. Formas de escrever que ainda não foram verificadas no seu relógio ficam marcadas. Só depois da sua confirmação o plano vai para a Zepp, e você pode desfazer quando quiser.',
      },
      {
        kicker: '05 · Você decide',
        title: 'As opções de que você precisa estão aí, e nada além disso',
        body: 'As configurações são uma pilha de cartões: abra um e arraste o cabeçalho para o lado para passar ao próximo. Quanto tempo os dados ficam guardados, com que frequência sincroniza e se a interface local fica ligada, quem decide é você.',
      },
    ],
    flap: {
      tiles: [
        { value: '1.096', label: 'noites de sono' },
        { value: '742', label: 'treinos com trajeto' },
        { value: '1,5M', label: 'minutos de frequência cardíaca' },
        { value: '9,8M', label: 'passos' },
      ],
    },
    handoff: {
      chat: 'Conversa com a IA',
      you: 'Você',
      file: 'ZeppBridge últimos 14 dias.md',
      prompt: 'Eu dormi pior esta semana do que na anterior? O que pode explicar isso?',
      answer: 'Um pouco pior: 38 minutos a menos em média, principalmente de sono profundo. Na terça e na quinta você treinou à noite, e nessas noites seu coração demorou mais para desacelerar. Tente treinar à tarde por uma semana.',
      note: 'Sem IA embutida e sem conta extra. O que vai, quanto e quando só acontece quando você clica.',
      close: 'Fechar',
    },
    privacy: {
      heading: 'Seus dados de saúde vivem em dois lugares',
      lead: 'Na nuvem do Zepp e no seu próprio computador. Não existe um terceiro.',
      nodes: { watch: 'Relógio', cloud: 'Nuvem do Zepp', computer: 'Seu computador', server: 'Servidor do ZeppBridge', none: 'não existe' },
      points: [
        {
          title: 'Tokens no cofre do sistema',
          copy: 'Guardados no Gerenciador de Credenciais do Windows ou nas Chaves do macOS, nunca na pasta de dados.',
        },
        { title: 'Sem telemetria', copy: 'Nada de rastrear o uso e nenhum dado de saúde coletado.' },
        {
          title: 'Origem clara',
          copy: 'Cada registro sabe se veio da autorização oficial ou dos dados avançados.',
        },
      ],
    },
    connect: {
      heading: 'Três jeitos de conectar. Escolha o mais fácil.',
      lead: 'Comece pela autorização oficial. Adicione os dados avançados quando quiser mais métricas.',
      recommended: 'Recomendado',
      paths: [
        {
          title: 'Autorização oficial do Zepp',
          copy: 'Entre no Zepp pelo seu navegador de sempre e autorize.',
          detail: 'Contas Google, Xiaomi e Apple funcionam. Sono, frequência cardíaca, passos, treinos, PAI e peso são sincronizados.',
        },
        {
          title: 'Dados avançados',
          copy: 'Adiciona HRV, oxigênio no sangue, estresse e prontidão, que a API oficial não oferece.',
          detail: 'Entre com e-mail ou telefone. O token fica só no cofre do seu sistema.',
        },
        {
          title: 'Entrada manual',
          copy: 'O plano B quando os outros dois não funcionam.',
          detail: 'Você mesmo cola um token. Pensado para quem conhece a API.',
        },
      ],
      note: 'O que sincroniza depende do que a sua conta guarda na nuvem do Zepp. As métricas que você vê dependem do seu aparelho e do jeito que você conecta.',
    },
    final: {
      heading: 'Instale e veja do que o seu relógio se lembra',
      lead: 'Grátis, código aberto, sem cadastro.',
      facts: {
        channel: 'Canal estável, instaladores no GitHub Releases',
        systems: 'Windows 10 / 11 (x64) e macOS (Apple Silicon). Linux é experimental.',
        ai: 'Não precisa de outra conta. Para perguntar a uma IA você usa a que já tem.',
        windows: 'Windows: o instalador ainda não é assinado. Se aparecer "Editor desconhecido", escolha "Mais informações" e depois "Executar assim mesmo".',
        macos: 'macOS: uma versão sem assinatura, então a primeira abertura é bloqueada. Os passos para liberar estão no readme do GitHub.',
      },
    },
    footer: {
      tagline: 'Uma ponte local para os dados do Amazfit e do Zepp.',
      disclaimer: 'O ZeppBridge é um projeto independente de código aberto, sem vínculo com a Zepp Health nem com a Amazfit.',
      source: 'Código-fonte',
    },
  },
};

export default pack;
