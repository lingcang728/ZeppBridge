A todos os amigos do ZeppBridge,

Olá, daqui é o Lingcang.

Esta é uma grande atualização. Antes de mais, quero agradecer a três colaboradores: felipepmdias, Jax Tsai e andrejd1.

Graças ao trabalho do felipepmdias na descodificação dos dados de treino de força da Zepp, a nova versão inclui finalmente o detalhe série a série e um mapa muscular do corpo humano, tornando o treino de força no ZeppBridge verdadeiramente útil. Já o Jax Tsai e o andrejd1 ajudaram-me a melhorar o desempenho no Linux. Não tenho nenhum computador com Linux, pelo que cada uma destas melhorias foi testada pouco a pouco nas máquinas deles. Sem eles, há muita coisa que eu simplesmente não conseguiria fazer sozinho. Obrigado a vocês, e obrigado também a todos os utilizadores de Linux que continuaram a enviar feedback com tanta paciência.

Nestas duas semanas sem uma nova versão, recebi mais cartas do que nunca. Obrigado a todos os que me escreveram para me incentivar, aquecer o coração ou partilhar todo o tipo de ideias brilhantes. Nunca tive tantos correspondentes.

Algumas pessoas disseram-me que não encontravam a Caixa de correio, por isso adicionei um botão de carta no canto superior direito: toca uma vez para escrever, mantém premido para abrir a Caixa de correio, e um pequeno ponto vermelho acende-se quando houver uma nova resposta. Sempre que sentires que algo na aplicação não está bem, escreve-me à vontade, sem receio de incomodar. Receber as vossas cartas é algo que me deixa genuinamente feliz.

A seguir, gostaria de falar sobre as três coisas que mais me importaram nesta atualização. Ocuparam grande parte das minhas últimas duas semanas, e sobre algumas delas refleti longamente e hesitei várias vezes.

**Sobre os Personal Agents na nuvem**

Ultimamente tenho experimentado assistentes pessoais na nuvem como o Muse e o Hark. Quanto mais os uso, mais sinto que têm potencial para mudar a forma como vivemos, tal como os Coding Agents estão a transformar o desenvolvimento de software.

Deixa-me partilhar como foram as minhas últimas duas semanas.

Liguei o ZeppBridge ao meu próprio site pessoal para que o Hark possa receber continuamente os meus dados de saúde. Todas as manhãs, ao acordar, só preciso de abrir o Zepp para sincronizar o sono da noite anterior; quando acabo de lavar os dentes e a cara, o Hark já resumiu a qualidade do meu sono e a recuperação física, e sugeriu o treino para o dia.

No caminho de regresso a casa depois de uma corrida, acontece o mesmo. Basta sincronizar os dados para receber uma análise da corrida longa que acabei de fazer: se a frequência cardíaca subiu demasiado, se perdi ritmo na segunda metade, se a cadência mudou de forma notória. Se quiser ajustar ainda mais o plano de treino, ao chegar ao computador posso usar o «Enviar à IA» do ZeppBridge e conversar em detalhe com o GPT ou o Claude.

Já era possível fazer tudo isto antes, mas exigia sempre que eu me lembrasse, reunisse os dados por conta própria e iniciasse a conversa. Um Personal Agent poupa-me o passo mais fácil de ignorar: começar.

Essa experiência convenceu-me a trazer esta funcionalidade aos utilizadores do ZeppBridge. Afinal, se eu próprio gosto tanto dela, por que não deixar que todos a experimentem?

Ainda assim, hesitei durante bastante tempo. Desde o primeiro dia, o ZeppBridge comprometeu-se a manter o armazenamento local de dados como princípio central, e permitir que um assistente na nuvem leia continuamente os teus dados de saúde exige, naturalmente, um cuidado redobrado.

Por isso, esta funcionalidade vem desativada por predefinição. Enquanto não a ativares por iniciativa própria, o ZeppBridge nunca enviará através dela os teus dados para qualquer serviço externo, e a forma como usas a aplicação hoje não mudará em nada.

Mesmo que decidas ativá-la, terás de preparar o teu próprio site, configurar chaves de acesso que possas rodar e fazer o emparelhamento com o teu assistente pessoal. Talvez não seja para toda a gente, mas se tiveres vontade de experimentar, recomendo vivamente.

Acredito cada vez mais que este tipo de assistentes pessoais — capazes de cuidar de ti proativamente, compreender-te e ajudar no momento certo — fará parte da nossa vida quotidiana no futuro.

**Trazer o Stage Manager para os detalhes do treino**

Este era um problema que me incomodava desde a versão 3.0.0.

Redesenhei os cartões de quase todos os ecrãs, exceto a página de detalhes do treino, que foi ficando para trás. Os utilizadores mais antigos talvez se lembrem de que mantinha praticamente o aspeto da 1.0.0: cartões em posições e tamanhos fixos, sem liberdade para os ajustar ou combinar.

Foi então que, nestas últimas duas semanas, ao experimentar o iPadOS 27, abri por acaso o Stage Manager e tive uma ideia.

Para mim, o mais interessante no Stage Manager é dar a cada janela o seu próprio espaço. Podes movê-la, redimensioná-la e reorganizar a sua relação com as restantes janelas. Pensei: porque não dar aos cartões do ZeppBridge essa mesma liberdade?

Seguindo essa ideia, redesenhei toda a página de detalhes do treino, tentando integrar nela a lógica de interação do Stage Manager.

Agora podes colocar a frequência cardíaca, o ritmo e o percurso da corrida lado a lado no mesmo ecrã, analisando o teu desempenho ponto a ponto. Podes também escolher um instante num gráfico e ver no mapa onde estavas nesse momento, percebendo a relação entre o rendimento do corpo e o ambiente em redor. No treino de força, podes até juntar o mapa muscular e as séries, vendo num relance que grupos musculares cada série trabalhou.

Espero que cada pessoa possa organizar os dados que realmente lhe interessam da forma que lhe for mais natural.

Quanto a outras combinações interessantes, deixo-as para ires descobrindo aos poucos.

**Aperfeiçoar a ZeppBridge CLI**

Além do já conhecido «Enviar à IA», o ZeppBridge também inclui um servidor MCP e uma CLI integrados, para que as ferramentas de IA possam aceder diretamente aos dados locais, sem precisar de descarregar nem instalar nada à parte.

Para ser honesto, esta parte estava bastante rudimentar. Foi só depois de receber recentemente o convite do autor do SparkyFitness que voltei a olhar com atenção para o seu verdadeiro potencial.

Desta vez fiz sobretudo duas coisas.

Primeiro, a IA passou de «só poder ver» para «poder ajudar-te a registar».

Agora podes pedir à IA ligada ao ZeppBridge que registe lesões, provas, sapatilhas e sensações de treino, ou que corrija um tipo de treino mal identificado. Por exemplo, basta dizeres-lhe «depois da corrida de ontem fiquei com uma dor ligeira no joelho esquerdo» e ela trata de o registar por ti.

Como deixar uma IA alterar os teus próprios dados pode parecer um pouco inquietante, todas as entradas escritas pela IA aparecem em «Alterações recentes da IA», nas Definições, e podem ser anuladas a qualquer momento. A IA não tem permissão para eliminar dados. Se preferires que ela leia apenas os dados que escolheste, podes também ativar «Apenas tarefas partilhadas», limitando o acesso ao que partilhaste e desativando por completo a escrita.

Além disso, podes pedir à IA para sincronizar dados ou exportar ficheiros diretamente. Às ligações com um clique juntaram-se agora o OpenCode, o Grok Build e o Factory. Se ainda faltar alguma ferramenta de que gostes, escreve-me a dizer.

Segundo, o ZeppBridge passou a poder partilhar dados com outras aplicações auto-hospedadas.

O SparkyFitness é uma aplicação de registo de saúde de código aberto e auto-hospedada. Esta colaboração fez-me perceber que o ZeppBridge pode tornar-se uma ponte entre os teus dados da Zepp e outras aplicações de saúde.

Para isso, adicionei um modo permanente à CLI. Podes executá-la num NAS ou num pequeno servidor lá em casa, para que outras aplicações leiam dados de sono, frequência cardíaca, treinos, peso e muito mais.

Este serviço oferece apenas acesso só de leitura, requer uma chave para ligar e essa chave pode ser revogada a qualquer momento. Por predefinição, aceita apenas ligações da própria máquina e não partilha percursos de treino. Nunca arranca sozinho; se não precisares dele, podes simplesmente ignorá-lo.

Do lado do ZeppBridge o trabalho está concluído; a adaptação do SparkyFitness ainda vai demorar algum tempo, pelo que a integração entre ambos ainda não pode ser usada diretamente. Agradeço a vossa paciência.

Ao escrever até aqui, dei por mim a pensar outra vez: como será o futuro do ZeppBridge?

Talvez o que faço melhor continue a ser responder às vossas necessidades, resolver aqueles problemas pequenos mas reais e, de vez em quando, criar uma animação nova para tornar a aplicação um pouco mais divertida de usar.

Mas será que conseguimos ir mais longe e construir coisas que hoje nem sequer conseguimos imaginar?

Não sei. Pelo menos por agora, já consegui pôr neste software muitas ideias que antes só existiam na minha cabeça. O resto talvez precise de algum tempo — e de continuar a ouvir as vossas histórias.

Este é o ZeppBridge 3.2.0.

O inverno é diferente em cada canto do mundo. Talvez, quando leres esta carta, já esteja a nevar lá fora junto à tua janela.

Cresci no sul da China e quase nunca vi neve. Uma vez vi fotografias de Aomori, no Japão, tiradas por um fotógrafo: neve espessa a cobrir as casas e altos muros de neve dos dois lados da estrada. Um inverno assim parece-me algo muito distante.

Também nunca vi uma lareira verdadeira. Às vezes imagino que um dia me vou sentar junto a uma lareira quentinha, com a neve a cair lá fora, as vossas cartas ao meu lado para as ir lendo devagar, enquanto observo um Agent a transformar, pouco a pouco, em realidade aquilo que antes eu só podia sonhar.

Talvez seja essa a vida que tanto desejo.

Desejo-vos a todos muita saúde e um feliz inverno!

— Lingcang
