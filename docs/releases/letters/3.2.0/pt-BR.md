A todos os amigos do ZeppBridge,

Olá, aqui é o Lingcang.

Esta é uma grande atualização. Logo no início desta carta, quero agradecer a três contribuidores: felipepmdias, Jax Tsai e andrejd1.

Graças ao trabalho de felipepmdias na decodificação dos dados de treino de força da Zepp, a nova versão finalmente traz detalhes série por série e um mapa muscular do corpo, tornando a experiência de treino de força no ZeppBridge realmente útil. Já Jax Tsai e andrejd1 me ajudaram a melhorar o desempenho no Linux. Eu mesmo não tenho um aparelho com Linux, então todas essas melhorias foram testadas aos poucos nas máquinas deles. Sem eles, há muita coisa que eu simplesmente não conseguiria fazer sozinho. Obrigado a vocês, e obrigado também a todos os usuários de Linux que continuaram enviando feedback com tanta paciência.

Nestas duas semanas sem uma nova versão, recebi mais cartas do que nunca. Obrigado a todos que escreveram para me incentivar, aquecer meu coração ou compartilhar todo tipo de ideia incrível. Eu nunca tive tantos amigos por correspondência.

Algumas pessoas disseram que não encontravam a Caixa de cartas, então adicionei um botão de carta no canto superior direito: toque uma vez para escrever, pressione e segure para abrir a Caixa de cartas, e um pontinho vermelho acende quando houver uma nova resposta. Sempre que algo no aplicativo parecer desconfortável para você, por favor, escreva e me conte. Não precisa se preocupar em incomodar. Receber suas cartas já é, por si só, algo que me deixa muito feliz.

A seguir, quero conversar sobre as três coisas que mais me importam nesta atualização. Elas tomaram a maior parte das minhas últimas duas semanas, e sobre algumas delas eu pensei por muito tempo e hesitei várias vezes.

**Sobre Personal Agents na nuvem**

Ultimamente, tenho usado assistentes pessoais na nuvem como o Muse e o Hark. Quanto mais os uso, mais sinto que eles podem mudar a forma como vivemos, assim como o Coding Agent está mudando o desenvolvimento de software.

Deixe-me compartilhar um pouco de como foram as minhas últimas duas semanas.

Conectei o ZeppBridge ao meu próprio site pessoal para que o Hark pudesse receber meus dados de saúde continuamente. Toda manhã, ao acordar, só preciso abrir o Zepp para sincronizar o sono da noite anterior. Quando termino de escovar os dentes e lavar o rosto, o Hark já resumiu a qualidade do meu sono e a recuperação do meu corpo, além de sugerir o treino do dia.

Na volta para casa depois de uma corrida, é a mesma coisa. Basta sincronizar os dados e já recebo uma análise da corrida longa que acabei de fazer: se a frequência cardíaca subiu demais, se perdi ritmo na segunda metade, se a cadência mudou de forma perceptível. Se eu quiser ajustar ainda mais o plano de treino, ao chegar ao computador posso usar o “Enviar para IA” do ZeppBridge para conversar com calma com o GPT ou o Claude.

Eu já conseguia fazer tudo isso antes, mas sempre precisava lembrar de fazer, reunir os dados por conta própria e iniciar a conversa eu mesmo. O Personal Agent cuida justamente do passo mais fácil de deixar para depois: começar.

Essa experiência me convenceu a trazer isso para os usuários do ZeppBridge. Afinal, se até eu gostei tanto desse recurso, por que não deixar todo mundo experimentar também?

Mas eu também hesitei por muito tempo. Desde o início, o ZeppBridge prometeu manter o armazenamento local de dados como seu núcleo, e permitir que um assistente na nuvem leia seus dados de saúde continuamente exige, sem dúvida, um cuidado redobrado.

Por isso, esse recurso vem desativado por padrão. Enquanto você não o ativar por conta própria, o ZeppBridge nunca usará isso para enviar seus dados a nenhum serviço externo, e a forma como você usa o aplicativo hoje não mudará em nada.

Mesmo se escolher ativar, você precisará preparar seu próprio site, configurar uma chave de acesso que possa ser rotacionada e fazer o pareamento com o seu assistente pessoal. Talvez não seja para todo mundo, mas, se você tiver vontade de experimentar, eu recomendo muito.

Acredito cada vez mais que assistentes pessoais assim — capazes de cuidar de você de forma ativa, entender você e ajudar na hora certa — vão fazer parte do nosso dia a dia no futuro.

**Levando o “Organizador Visual” para os detalhes do treino**

Esse é um problema que me incomodava desde a versão 3.0.0.

Eu redesenhei os cartões de quase todas as telas, mas a página de detalhes do treino foi ficando para depois. Usuários antigos talvez se lembrem de que ela praticamente mantinha o visual da 1.0.0: os cartões ficavam em posições e tamanhos fixos, sem liberdade para ajustar ou combinar.

Até que, nestas últimas duas semanas, testando o iPadOS 27, abri por acaso o Organizador Visual e tive um estalo.

Para mim, o mais interessante do Organizador Visual é que ele dá a cada janela um espaço próprio. Você pode movê-la, redimensioná-la e reorganizar a relação dela com as outras janelas. Então pensei: por que os cartões do ZeppBridge não podem ter essa mesma liberdade?

Seguindo essa ideia, redesenhei toda a página de detalhes do treino, tentando trazer a forma de interagir do Organizador Visual para dentro dela.

Agora, você pode colocar frequência cardíaca, ritmo e o trajeto da corrida lado a lado na mesma tela e analisar seu desempenho ponto a ponto. Também pode escolher um instante no gráfico e ver no mapa onde você estava naquele momento, entendendo como o desempenho do seu corpo se relaciona com o ambiente ao redor. Para treinos de força, você pode até colocar o mapa muscular junto às séries e ver de imediato quais grupos musculares cada série trabalhou.

Espero que cada pessoa possa organizar os dados que realmente importam do jeito que preferir.

Quanto a outras combinações interessantes, deixo para vocês irem descobrindo aos poucos.

**Aperfeiçoando o ZeppBridge CLI**

Além do “Enviar para IA” que vocês já conhecem, o ZeppBridge também traz MCP e CLI integrados, permitindo que ferramentas de IA acessem seus dados locais diretamente, sem precisar baixar nem instalar nada à parte.

Para ser sincero, essa parte antes era bem simples e inacabada. Só depois de receber o convite do autor do SparkyFitness recentemente é que parei para repensar com calma o valor disso tudo.

Desta vez, fiz duas coisas principais.

Primeiro, a IA passou de “só poder olhar” para “poder ajudar você a registrar”.

Agora, você pode pedir para uma IA conectada ao ZeppBridge registrar lesões, provas, tênis e como você se sentiu no treino, ou corrigir um tipo de treino que foi reconhecido errado. Por exemplo, basta dizer a ela “meu joelho esquerdo doeu um pouco depois da corrida de ontem”, e ela anota isso para você.

Como deixar uma IA alterar seus próprios dados pode causar certa insegurança, todo registro feito pela IA aparece em “Alterações recentes da IA” nas Configurações, e você pode desfazer qualquer um deles a qualquer momento. A IA não tem permissão para excluir dados. Se preferir que ela leia apenas os dados que você escolheu, também pode ativar “Apenas tarefas compartilhadas”, restringindo o acesso ao conteúdo compartilhado e desativando qualquer escrita.

Além disso, você pode pedir para a IA sincronizar seus dados ou exportar arquivos diretamente. OpenCode, Grok Build e Factory também passaram a fazer parte das ferramentas que podem ser conectadas com um clique. Se ainda faltar alguma ferramenta de que você goste, escreva para mim me contando.

Segundo, o ZeppBridge agora pode compartilhar dados com outros aplicativos auto-hospedados.

O SparkyFitness é um aplicativo de registro de saúde de código aberto e auto-hospedado. Essa parceria me fez perceber que o ZeppBridge pode ser uma ponte entre os dados da Zepp e outros aplicativos de saúde.

Para isso, adicionei um modo residente ao CLI. Você pode deixá-lo rodando em um NAS ou em um pequeno servidor em casa, para que outros aplicativos leiam sono, frequência cardíaca, treinos, peso e outros dados.

Esse serviço oferece apenas acesso somente leitura, exige uma chave para conectar, e a chave pode ser revogada a qualquer momento. Por padrão, aceita apenas conexões da própria máquina, e os trajetos dos treinos não são liberados por padrão. Ele nunca inicia sozinho, então, se você não precisa disso, pode simplesmente ignorá-lo.

Por enquanto, a parte do ZeppBridge já está concluída; a adaptação do SparkyFitness ainda precisa de um pouco mais de tempo, então a integração entre os dois ainda não está pronta para uso direto. Peço um pouco de paciência a todos.

Chegando até aqui na carta, voltei a pensar: como será o futuro do ZeppBridge?

Talvez o que eu faça melhor continue sendo responder às necessidades de vocês, resolver problemas pequenos mas reais e, de vez em quando, criar alguma animação nova para deixar o uso do aplicativo um pouco mais divertido.

Mas será que podemos ir mais longe e construir coisas que hoje ainda nem conseguimos imaginar?

Eu não sei. Pelo menos por enquanto, já consegui colocar neste aplicativo muitas ideias que antes existiam apenas na minha cabeça. O resto talvez leve algum tempo, e também vai precisar que eu continue ouvindo as histórias de vocês.

Este é o ZeppBridge 3.2.0.

O inverno é diferente em cada parte do mundo. Talvez, quando você estiver lendo esta carta, a neve já esteja caindo lá fora da sua janela.

Eu cresci no sul da China e quase nunca vi neve. Certa vez, vi as fotos de um fotógrafo em Aomori, no Japão: uma camada espessa de neve cobrindo as casas e paredes altas de neve dos dois lados da estrada. Um inverno assim parece muito distante para mim.

Também nunca vi uma lareira de verdade. Às vezes fico imaginando um dia poder me sentar perto de uma lareira quentinha, com a neve caindo lá fora, as cartas de vocês ao meu lado, lendo-as devagar enquanto vejo um agente transformar em realidade, pouco a pouco, aquilo que eu antes só conseguia sonhar.

Talvez seja essa a vida que eu tanto desejo.

Desejo a todos muita saúde e um feliz inverno!

— Lingcang
