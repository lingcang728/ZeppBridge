import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Do pulso para o teu computador, do computador para a IA',
    description: 'O ZeppBridge traz os teus dados Amazfit e Zepp da nuvem Zepp para o teu próprio computador e deixa-os prontos num ficheiro para a tua IA. Gratuito e de código aberto.',
    ogTitle: 'ZeppBridge · Do pulso para a secretária. Da secretária para a IA.',
    ogDescription: 'Sincroniza e consulta localmente a frequência cardíaca, o sono e os treinos, e entrega-os com um clique à IA que já usas.',
  },
  copy: {
    nav: {
      home: 'Início do ZeppBridge',
      site: 'Navegação do site',
      demo: 'Demonstração',
      ai: 'Para a IA',
      privacy: 'Privacidade',
      download: 'Transferir',
      github: 'GitHub',
      language: 'Idioma',
      toDark: 'Mudar para escuro',
      toLight: 'Mudar para claro',
    },
    downloads: {
      windows: { label: 'Transferir para Windows', hint: 'Instalador x64', msi: 'MSI para instalações geridas' },
      macos: { label: 'Transferir para macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'A CI gera deb, rpm, AppImage e Flatpak, mas ninguém testou ainda o início de sessão e o porta-chaves de ponta a ponta num ambiente de trabalho Linux real. Algum problema? Abre uma issue.',
      },
      status: {
        loading: 'A procurar o instalador mais recente',
        ready: 'Clica para transferir diretamente',
        fallback: 'Abre o GitHub Releases, onde escolhes o instalador',
      },
    },
    sample: 'Exemplo',
    hero: {
      eyebrow: 'Grátis · Código aberto · Os teus dados ficam no teu computador',
      titleLead: 'O que o teu relógio regista,',
      titleAccent: 'fica no teu computador.',
      lead: 'O ZeppBridge traz da nuvem Zepp a frequência cardíaca, o sono e os treinos que o teu Amazfit regista e guarda-os no teu próprio computador num arquivo que consegues ler e levar contigo. Quando quiseres perguntar algo a uma IA, escolhes um período e entregas um único ficheiro.',
      github: 'Ver o código-fonte no GitHub',
      meta: 'Gratuito · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimental',
      devices: 'Dispositivos Amazfit que já reconhece',
      stage: {
        hint: 'Clica e experimenta',
        note: 'À direita está o ZeppBridge a sério, com dados de exemplo.',
        loading: 'A abrir a aplicação…',
        exit: 'Sair da demonstração',
        unavailable: 'Este navegador não consegue abrir a demonstração. Descarrega a aplicação para a ver.',
      },
      starNudge: {
        title: 'A transferência começou',
        copy: 'Se o ZeppBridge te for útil, uma estrela no GitHub ajuda outras pessoas com Amazfit a encontrá-lo.',
        action: 'Dar uma estrela',
        dismiss: 'Mais tarde',
      },
    },
    beats: [
      {
        kicker: '01 · Sincronizar',
        title: 'Traz para o teu computador o que o teu pulso regista',
        body: 'Inicia sessão com a tua própria conta Zepp e a frequência cardíaca, o sono e os treinos ficam guardados dia a dia numa base de dados neste equipamento. Fácil de ler, fácil de levar e disponível mesmo sem rede.',
      },
      {
        kicker: '02 · Sem inventar',
        title: 'O que não foi medido não foi medido',
        body: 'Olha para o gráfico à direita: ontem à tarde há um espaço em branco, porque o relógio não estava no pulso. O ZeppBridge não preenche com 0 nem desenha uma linha inventada. Os dias em falta aparecem como tracinhos cinzentos à volta de cada bloco de dados.',
      },
      {
        kicker: '03 · Para a IA',
        title: 'Queres perguntar algo a uma IA? Escolhe primeiro o que ela vai ver',
        body: 'O que está dentro do círculo é entregue, o que está fora não é, e os tracinhos à volta de cada ponto mostram em que dias há dados. Carrega no botão de envio e o .md já embalado fica pronto para o arrastares para a conversa.',
      },
      {
        kicker: '04 · Plano',
        title: 'Um treino planeado pela IA, enviado ao relógio só depois de o conferires',
        body: 'Cola de volta a resposta inteira da IA: vês dia a dia o que muda, com o intervalo de frequência cardíaca de cada passo desenhado num gráfico. As formas de escrever que ainda não foram verificadas no teu relógio ficam assinaladas. Só depois de confirmares é que segue para a Zepp, e podes desfazer quando quiseres.',
      },
      {
        kicker: '05 · Tu decides',
        title: 'As opções de que precisas estão lá, e nada além disso',
        body: 'As definições são uma pilha de cartões: abre um e arrasta o cabeçalho para o lado para passares ao seguinte. Durante quanto tempo os dados ficam guardados, com que frequência se sincroniza e se a interface local fica ligada, quem decide és tu.',
      },
    ],
    flap: {
      tiles: [
        { value: '1 096', label: 'noites de sono' },
        { value: '742', label: 'treinos com percurso' },
        { value: '1,5M', label: 'minutos de frequência cardíaca' },
        { value: '9,8M', label: 'passos' },
      ],
    },
    handoff: {
      chat: 'Conversa com a IA',
      you: 'Tu',
      file: 'ZeppBridge últimos 14 dias.md',
      prompt: 'Dormi pior esta semana do que na anterior? O que pode explicar isso?',
      answer: 'Um pouco pior: menos 38 minutos em média, sobretudo de sono profundo. Na terça e na quinta treinaste à noite, e nessas noites o teu coração demorou mais a abrandar. Experimenta treinar à tarde durante uma semana.',
      note: 'Sem IA incorporada e sem conta adicional. O que sai, quanto e quando só acontece quando clicas.',
      close: 'Fechar',
    },
    privacy: {
      heading: 'Os teus dados de saúde vivem em dois sítios',
      lead: 'Na nuvem Zepp e no teu próprio computador. Não há um terceiro.',
      nodes: { watch: 'Relógio', cloud: 'Nuvem Zepp', computer: 'O teu computador', server: 'Servidor ZeppBridge', none: 'não existe' },
      points: [
        {
          title: 'Tokens no cofre do sistema',
          copy: 'Guardados no Gestor de Credenciais do Windows ou no Porta-chaves do macOS, nunca na pasta de dados.',
        },
        {
          title: 'Sem telemetria',
          copy: 'Sem medição de utilização e sem recolha de dados de saúde.',
        },
        {
          title: 'Origem clara',
          copy: 'Cada registo sabe se veio da autorização oficial ou dos dados avançados.',
        },
      ],
    },
    connect: {
      heading: 'Três maneiras de ligar. Escolhe a mais fácil.',
      lead: 'Começa pela autorização oficial. Junta os dados avançados quando quiseres mais métricas.',
      recommended: 'Recomendado',
      paths: [
        {
          title: 'Autorização oficial Zepp',
          copy: 'Inicia sessão no Zepp no teu navegador habitual e autoriza.',
          detail: 'Funcionam contas Google, Xiaomi e Apple. Sincronizam o sono, a frequência cardíaca, os passos, os treinos, o PAI e o peso.',
        },
        {
          title: 'Dados avançados',
          copy: 'Acrescenta VFC, oxigénio no sangue, stress e prontidão, que a API oficial não oferece.',
          detail: 'Inicia sessão com e-mail ou telemóvel. O token fica só no cofre do teu sistema.',
        },
        {
          title: 'Introdução manual',
          copy: 'O recurso quando as outras duas não funcionam.',
          detail: 'Colas tu um token. Pensado para quem conhece a API.',
        },
      ],
      note: 'O que sincroniza depende do que a tua conta guarda na nuvem Zepp. As métricas que vês dependem do teu dispositivo e da forma como te ligas.',
    },
    final: {
      heading: 'Instala-o e vê do que o teu relógio se lembra',
      lead: 'Gratuito, de código aberto, sem registo.',
      facts: {
        channel: 'Canal estável, instaladores no GitHub Releases',
        systems: 'Windows 10 / 11 (x64) e macOS (Apple Silicon). Linux é experimental.',
        ai: 'Não precisas de outra conta. Para perguntar a uma IA usas a que já tens.',
        windows: 'Windows: o instalador ainda não está assinado. Se vires "Editor desconhecido", escolhe "Mais informações" e depois "Executar mesmo assim".',
        macos: 'macOS: uma versão sem assinatura, por isso a primeira abertura é bloqueada. Os passos para a permitir estão no readme do GitHub.',
      },
    },
    footer: {
      tagline: 'Uma ponte local para os dados Amazfit e Zepp.',
      disclaimer: 'O ZeppBridge é um projeto independente de código aberto, sem ligação à Zepp Health nem à Amazfit.',
      source: 'Código-fonte',
    },
  },
};

export default pack;
