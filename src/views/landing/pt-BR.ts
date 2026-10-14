import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  "meta": {
    "title": "ZeppBridge · O relógio registra. O arquivo é seu.",
    "description": "Guarde localmente os dados Amazfit e Zepp. Explore o exemplo sintético v3 ou obtenha a versão pública estável. Gratuito e de código aberto.",
    "ogTitle": "ZeppBridge · O relógio registra. O arquivo é seu.",
    "ogDescription": "Guarde localmente os dados Amazfit e Zepp. Explore o exemplo sintético v3 ou obtenha a versão pública estável. Gratuito e de código aberto."
  },
  "copy": {
    "nav": {
      "home": "Início do ZeppBridge",
      "site": "Navegação do site",
      "demo": "Demonstração",
      "ai": "Para a IA",
      "privacy": "Privacidade",
      "download": "Versão pública",
      "github": "GitHub",
      "language": "Idioma",
      "toDark": "Mudar para escuro",
      "toLight": "Mudar para claro",
      "connect": "Conectar",
      "faq": "Perguntas frequentes"
    },
    "downloads": {
      "windows": {
        "label": "Baixar para Windows",
        "hint": "Instalador x64",
        "msi": "MSI para instalações gerenciadas"
      },
      "macos": {
        "label": "Baixar para macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Experimental",
        "note": "A CI gera deb, rpm, AppImage e Flatpak, mas ninguém testou ainda o login e o chaveiro de ponta a ponta em um desktop Linux de verdade. Algum problema? Abra uma issue."
      },
      "status": {
        "loading": "Procurando o instalador mais recente",
        "ready": "Clique para baixar direto",
        "fallback": "Abre o GitHub Releases, onde você escolhe o instalador"
      }
    },
    "sample": "Exemplo",
    "hero": {
      "eyebrow": "Gratuito · Código aberto · Arquivo local de saúde",
      "titleLead": "Seus dados de saúde.",
      "titleAccent": "No seu computador.",
      "lead": "Guarde no seu computador os dados Amazfit de frequência cardíaca, sono e treinos da nuvem Zepp. Consulte o histórico, preserve as lacunas e exporte o que escolher.",
      "github": "Ver o código no GitHub",
      "meta": "Grátis · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Dispositivos Amazfit; as métricas variam por modelo",
      "stage": {
        "hint": "Abrir o exemplo",
        "note": "A aplicação real com dados sintéticos, sem ligar a sua conta.",
        "loading": "Abrindo o app…",
        "exit": "Sair da demonstração",
        "unavailable": "A demonstração está indisponível. Pode ler as secções ou consultar o código."
      },
      "demo": "Ver o exemplo",
      "edition": "v3 em desenvolvimento · Dados sintéticos. A download oferece a versão pública estável; a interface e as funções podem diferir."
    },
    "handoff": {
      "chat": "Conversa com a IA",
      "you": "Você",
      "file": "ZeppBridge últimos 14 dias.md",
      "prompt": "Organiza este exemplo sintético. Lista fontes, datas e campos ausentes sem fazer juízos de saúde.",
      "answer": "O arquivo organiza sono e treinos por data. Os períodos não medidos ficam vazios. Verifique fontes e cobertura antes de comparar; os registros não explicam as causas de uma mudança.",
      "note": "Conversa sintética. Esta página não envia arquivos nem liga a uma IA. Na uso real, decide se entrega conteúdo a um serviço externo.",
      "close": "Fechar"
    },
    "privacy": {
      "kicker": "Dados e privacidade",
      "heading": "O arquivo é local. Os caminhos são claros.",
      "lead": "A sincronização lê registros Zepp para o seu computador. Uma IA externa é outro caminho que escolhe explicitamente.",
      "nodes": {
        "watch": "Relógio e app Zepp",
        "cloud": "Nuvem Zepp",
        "computer": "Arquivo local de saúde",
        "export": "A IA externa que escolher"
      },
      "flowNote": "O relógio carrega dados através da app móvel Zepp. O site não guarda o arquivo de saúde.",
      "exportNote": "Exportação opcional · Reveja e envie",
      "services": {
        "title": "Serviços web com funções limitadas",
        "copy": "A autorização oficial e a renovação de tokens usam serviços web. As atualizações consultam versões. Os relatórios voluntários enviam diagnóstico limitado após confirmação, sem leituras de saúde."
      },
      "docs": "Ler os limites de dados",
      "points": [
        {
          "title": "Credenciais no cofre do sistema",
          "copy": "Por padrão, usa-se o cofre do sistema. Algumas plataformas permitem escolher um arquivo com proteção diferente."
        },
        {
          "title": "Local não significa criptografado",
          "copy": "A base de saúde não é criptografada por padrão. Use contas de sistema separadas e proteja as backups."
        },
        {
          "title": "A exportação parte de si",
          "copy": "Os pacotes de IA são preparados e expurgados localmente. Depois do envio, aplicam-se as regras do destinatário. Exportações normais e cópias completas diferem."
        }
      ]
    },
    "connect": {
      "kicker": "Conectar seus registros",
      "heading": "Comece pela autorização oficial",
      "lead": "Um caminho habitual. As ligações avançadas acrescentam outros campos.",
      "recommended": "Início recomendado",
      "advanced": "Alternativas avançadas",
      "edition": "Estes caminhos são da v3 atual. Consulte as notas da versão pública estável para conhecer os seus acessos e funções.",
      "docs": "Guia de conexão",
      "paths": [
        {
          "title": "Autorização oficial Zepp",
          "copy": "Abra a página de autorização Zepp no seu navegador com o acesso habitual.",
          "detail": "Lê sono, frequência cardíaca, passos, treinos, PAI e peso disponíveis na sua conta."
        },
        {
          "title": "Ligação de dados avançados",
          "copy": "Acrescente-a para HRV, oxigênio no sangue, estresse ou prontidão.",
          "detail": "Acesso por e-mail ou telefone. Os campos diferem; nem todos os dispositivos os medem ou devolvem."
        },
        {
          "title": "Credenciais manuais",
          "copy": "Para quem conhece a API e obteve credenciais por uma via legítima sob o seu controlo.",
          "detail": "Introduza token, ID de usuário e endereço regional. Não importe tokens desconhecidos nem os publique."
        }
      ],
      "note": "Os campos dependem do dispositivo, da nuvem e da ligação. Uma resposta vazia não prova falta de suporte. São alternativas, não três passos obrigatórios."
    },
    "final": {
      "kicker": "Download · Versão pública estável",
      "heading": "Guarde uma cópia no seu computador",
      "lead": "Gratuito e de código aberto. Usa a sua conta Zepp; não exige outra conta ZeppBridge.",
      "docs": "Instalação e notas da versão",
      "facts": {
        "channel": "A download é a versão pública estável. O exemplo sintético é a v3 em desenvolvimento; a interface e as funções podem diferir.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Consultar e exportar não exige IA. Escolhe o serviço externo e a conta.",
        "windows": "Windows: os instaladores ainda não têm assinatura de confiança. Pode aparecer um aviso de editor desconhecido ou SmartScreen. Verifique a origem oficial.",
        "macos": "macOS: versões sem assinatura nem notarização. O primeiro arranque pode ser bloqueado; siga as instruções do projeto."
      }
    },
    "footer": {
      "tagline": "Uma ponte local para os dados do Amazfit e do Zepp.",
      "disclaimer": "ZeppBridge é um projeto independente de código aberto que participa do programa Zepp Developer Partner, não um produto oficial da Zepp. As marcas Zepp e Amazfit pertencem aos seus titulares.",
      "source": "Código-fonte"
    },
    "faq": {
      "heading": "Antes de começar",
      "lead": "Seis perguntas comuns. A documentação detalha configurações e diferenças entre versões.",
      "docs": "Documentação do projeto",
      "items": [
        {
          "question": "De que contas preciso?",
          "answer": "A sincronização requer a sua conta Zepp e a app móvel Zepp. Não há conta adicional ZeppBridge. O exemplo não exige acesso."
        },
        {
          "question": "O meu dispositivo e as métricas são suportados?",
          "answer": "Os campos dependem do que foi medido, do que a Zepp guardou e da ligação. Não se garante que todos os modelos tenham todas as métricas."
        },
        {
          "question": "Posso usar sem conexão?",
          "answer": "Pode consultar e exportar registros guardados. Iniciar sessão, sincronizar e procurar atualizações exige rede. O relógio continua a usar a app Zepp."
        },
        {
          "question": "Uma lacuna significa zero?",
          "answer": "Não. Sem amostra, não sincronizado e não descodificado são estados distintos. Não se preenchem com zero, uma leitura anterior ou uma estimativa."
        },
        {
          "question": "Tenho de usar IA?",
          "answer": "Não. A exportação é preparada localmente. A IA só recebe conteúdo quando o cola ou carrega. Verifique o âmbito, as remoções e a privacidade."
        },
        {
          "question": "A versão baixada coincide com o exemplo?",
          "answer": "O exemplo é a v3 em desenvolvimento com dados sintéticos. A download é estável. Revisão de planos e nova interface podem ainda não ser públicas; consulte as notas."
        }
      ]
    },
    "rebuild": {
      "featuresHeading": "Seu tempo, nos registros que você guarda.",
      "featuresLead": "Sono, frequência cardíaca, exercícios e planos. Explore cada parte do seu arquivo.",
      "demoHeading": "Experimente antes de baixar",
      "demoLead": "A interface V3 real com exemplos sintéticos. Sem login nem acesso a dados pessoais.",
      "mobileHint": "Este é um aplicativo para computador. No celular, veja em tela cheia; use um computador para interagir.",
      "fullscreen": "Ver a demonstração em tela cheia",
      "retry": "Tentar carregar novamente",
      "play": "Reproduzir demonstração",
      "pause": "Pausar demonstração",
      "mediaNote": "V3 · Exemplo sintético · Gravado no modo escuro",
      "moreConnections": "Outras formas de conexão",
      "partner": "Programa Zepp Developer Partner",
      "disclaimer": "ZeppBridge é um projeto independente de código aberto que participa do programa Zepp Developer Partner, não um produto oficial da Zepp. As marcas Zepp e Amazfit pertencem aos seus titulares.",
      "docsHeading": "Comece por aqui.",
      "guide": "Instalação e guia",
      "versions": "Versões e notas de lançamento",
      "community": "Código e comunidade",
      "privacyDoc": "Dados e privacidade",
      "star": "O projeto foi útil? Uma estrela no GitHub ajuda outras pessoas a encontrá-lo.",
      "dismiss": "Fechar",
      "nav": [
        "Recursos",
        "Dados e privacidade",
        "Experimentar",
        "Guia"
      ],
      "title": [
        "Seus dados de saúde.",
        "No seu computador."
      ],
      "stories": [
        {
          "eyebrow": "Arquivo local",
          "title": "Uma cópia local dos seus registros",
          "body": "Ligue a sua conta Zepp e guarde os registros já existentes na nuvem. Os dados sincronizados podem ser consultados sem conexão.",
          "bullets": [
            "Dados sincronizados offline",
            "Confira fontes e cobertura"
          ]
        },
        {
          "eyebrow": "Histórico do sono",
          "title": "Um lugar para cada noite",
          "body": "Veja duração e fases do sono por noite. Noites sem medição continuam ausentes; os registros não substituem um diagnóstico médico.",
          "bullets": [
            "Histórico noturno e fases",
            "Noites ausentes não são preenchidas"
          ]
        },
        {
          "eyebrow": "Pulso e lacunas",
          "title": "Sem medição, sem valor",
          "body": "Não se preenchem amostras ausentes com zero, um valor anterior ou uma estimativa. Não sincronizado e não medido são estados diferentes.",
          "bullets": [
            "Lacunas ficam nas curvas",
            "Dados ausentes não viram zero"
          ]
        },
        {
          "eyebrow": "Exercícios e treino",
          "title": "Guarde o percurso dos seus treinos",
          "body": "Confira atividades, detalhes e tendências. As métricas dependem do dispositivo e dos dados sincronizados; verifique a cobertura antes de comparar.",
          "bullets": [
            "Detalhes e tendências de treino",
            "Use os registros disponíveis"
          ]
        },
        {
          "eyebrow": "Entrega à IA",
          "title": "Escolha o conteúdo e o destinatário",
          "body": "No exemplo v3 escolhe dados e datas e revê a exportação. Tudo é preparado localmente; uma IA externa só recebe conteúdo quando o envia.",
          "bullets": [
            "Escolha datas e dados",
            "Revise antes de enviar por conta própria"
          ]
        },
        {
          "eyebrow": "Revisão de planos",
          "title": "Reveja antes de avançar",
          "body": "A v3 em desenvolvimento demonstra a importação e revisão de planos. O envio ao relógio depende do dispositivo e da validação; não é uma promessa geral da versão estável.",
          "bullets": [
            "Visão semanal e revisão diária",
            "Envio depende do dispositivo validado"
          ]
        },
        {
          "eyebrow": "Configurações",
          "title": "Defina o ritmo do seu arquivo",
          "body": "Explore sincronização, retenção e interfaces locais. Os controles podem variar entre versões; confirme a sua função antes de os ativar.",
          "bullets": [
            "Sincronização e retenção",
            "Você ativa as interfaces locais"
          ]
        }
      ],
      "learnFeatures": "Conhecer os recursos",
      "languageFallback": "O idioma não carregou. O inglês é exibido; selecione o idioma novamente."
    }
  }
};

export default pack;
