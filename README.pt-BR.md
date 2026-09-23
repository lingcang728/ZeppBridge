<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Seus dados do Zepp, de volta para você.</strong></p>
  <p>Veja, arquive e exporte seus registros de saúde do Amazfit no seu próprio computador Windows, macOS ou Linux.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#baixar-e-instalar)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#baixar-e-instalar)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.nl.md">Nederlands</a> · <strong>Português (Brasil)</strong> · <a href="README.pt-PT.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <a href="README.fr.md">Français</a></p>
  <p><em>Esta página é uma tradução; em caso de divergência, a <a href="README.md">versão em inglês</a> é a referência.</em></p>
</div>

> [!IMPORTANT]
> O ZeppBridge é um projeto de código aberto independente e não oficial. Ele não é afiliado nem endossado pela Zepp Health, Huami ou Amazfit. Use-o apenas com contas e dados que você tem direito de acessar.

> O aplicativo segue o idioma do sistema na primeira inicialização, e as Configurações têm um seletor de idioma. Esta página é mantida em par com a [versão em inglês](README.md), e nada aqui é descrito de forma mais generosa do que está implementado.

## Isso já não existe no app Zepp?

Existe — mas só no seu celular, só do jeito que o app oficial escolhe mostrar, e os dados moram no servidor de outra pessoa. O ZeppBridge resolve alguns pontos específicos:

- **Ver numa tela de verdade.** Tendências de longo prazo de frequência cardíaca, sono, treinos, recuperação, estresse e SpO₂, por 7 dias / 1 mês / 6 meses.
- **Os dados ficam no seu próprio computador.** Tudo cai num único arquivo na sua máquina. Continua funcionando offline, ao trocar de celular, ao apagar a conta ou quando o app mudar de cara.
- **Dá para recuperar o histórico de antes de você instalar.** Mês a mês, com pausa e retomada, e honesto sobre quais meses a nuvem realmente não tinha nada e quais simplesmente ainda não foram buscados.
- **Backups que realmente restauram.** Snapshots do banco de dados inteiro com checksums e verificação de integridade, e um diff de contagem de registros mostrado antes de restaurar.
- **Exporte quando quiser.** JSON, CSV e GPX — jogue no Excel, no Strava ou nos seus próprios scripts.
- **Entregue a uma IA em um passo.** Escolha o período e os tipos de dados; o app empacota num formato legível para modelos, remove dados de identificação e copia para a área de transferência.
- **Usável sem abrir janela.** Vem com um CLI não interativo (agendável pelo Agendador de Tarefas ou pelo cron) e um servidor MCP somente leitura, para um modelo consultar seus dados locais sem que os dados saiam da sua máquina.

Uma coisa vale dizer com todas as letras: **ele não vai embelezar seus dados.**

Se você não usou o relógio naquele dia, o gráfico tem um buraco. Se o seu relógio nunca mediu algo, a interface diz "não fornecido" — nunca `0`. Sem trilha GPS, sem mapa. Em dados de saúde, uma curva lisa inventada é pior que uma lacuna honesta.

O mesmo vale para a palavra "completo": a interface só declara uma **cópia local completa** quando o livro de cobertura mostra que cada bloco mensal chegou a uma conclusão. Até lá, ela diz "uma cópia local do intervalo que sincronizou com sucesso".

## Quais dispositivos são compatíveis

**Se o seu dispositivo sincroniza com o app Zepp, vale a pena tentar.** O ZeppBridge lê o que a sua conta guarda na nuvem; ele não conversa com o relógio, então não depende de modelos específicos.

O catálogo embutido reconhece 52 produtos Amazfit das famílias **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio e Band** (relógios, pulseiras, straps e anéis). Dispositivos reconhecidos mostram o nome correto do modelo e a imagem do produto; os não reconhecidos continuam sincronizando — só aparecem com um nome genérico, e você pode identificar o seu manualmente.

Quais métricas você realmente recebe depende do que o seu relógio mede. Depois de conectar, a página de configurações lista isso para a sua conta, item por item.

## Baixar e instalar

Baixe a versão mais recente em [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Baixe `ZeppBridge_<versão>_x64-setup.exe` (ou `.msi`) e execute.
2. Ainda não há certificado de assinatura de código, então o Windows pode avisar sobre um editor desconhecido. Escolha **Mais informações → Executar assim mesmo**.
3. As versões seguintes instalam por cima; seus dados não são tocados.

**macOS (Apple Silicon)**

> **Este build não é assinado.** Não há certificado Apple Developer ID nem
> notarização, então o macOS vai se recusar a abrir o app até você mesmo limpar
> a flag de quarentena. Os passos abaixo são um contorno deliberado, não uma
> correção — veja [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. Baixe `ZeppBridge_<versão>_aarch64.dmg` e arraste `ZeppBridge.app` para a pasta Aplicativos.
2. A primeira abertura vai falhar. A mensagem que aparece depende da sua versão do macOS:
   - **"desenvolvedor não identificado"** → **Clique com o botão direito no app → Abrir → Abrir.**
   - **"ZeppBridge está danificado e não pode ser aberto"** → clicar com o botão direito *não*
     resolve. Rode isto no Terminal e depois abra o app normalmente:

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   O app não está realmente danificado. É isso que o Gatekeeper diz sobre
   qualquer pacote baixado que não foi notarizado. Só rode um comando assim em
   software que você decidiu confiar — você pode ler cada linha deste projeto no
   GitHub e compilar você mesmo.
3. Os builds de macOS passam pela CI (compilação, clippy, testes) e por um
   teste de fumaça feito por um contribuidor no Apple Silicon. O mantenedor não
   tem Mac e não consegue verificar por conta própria a sincronização ou o
   comportamento do keychain. Se isso importa para você, prefira o Windows.

Por que continua assim por enquanto: a notarização em si não precisa de Mac — a CI
já roda em runners macOS e poderia assinar e notarizar lá. O que falta
é uma assinatura do Apple Developer Program (99 USD/ano), que o projeto ainda
não comprou. Se isso mudar, esta seção desaparece.

**Linux (x86_64)**

> **Compila, mas ninguém rodou ainda.** A CI compila, roda os testes e
> gera os pacotes a cada push. O que *não* aconteceu é um ciclo completo
> de login e sincronização num desktop Linux de verdade — incluindo se o token
> vai parar certinho no seu keyring. Trate isto como um build que você está
> ajudando a testar, não como um release.

Flatpak, `.deb`, `.rpm` e um AppImage são publicados na página de releases.
Nada é assinado; confira os downloads com o `SHA256SUMS.txt`.

```bash
sudo apt install ./ZeppBridge_<versão>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<versão>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<versão>_x86_64.flatpak  # qualquer distro
```

O [guia de Linux](docs/guides/linux.md) cobre para onde os dados vão, como o
token fica guardado quando você não tem keyring, e como compilar a partir do
código-fonte.

Há também uma [imagem de container headless](docs/guides/docker.md) só com a
CLI e o servidor MCP, para manter uma biblioteca sincronizada num NAS ou num
servidor. Ela não consegue fazer login — isso ainda precisa do app desktop uma vez.

**Não suportado**: Macs Intel, mobile.

### O que está verificado em cada plataforma

Mesmo app, mesma interface, mesmas funções nos três — o que muda é o quanto
disso alguém realmente conferiu. Perguntar aqui é melhor do que adivinhar.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Interface e funções | idênticas | idênticas | idênticas |
| Compila na CI | sim | sim | sim |
| Testes automatizados na CI | sim | sim | sim |
| Instalador abre sem gambiarra | sim (aviso de editor desconhecido) | **não** — veja a nota do build não assinado acima | sim |
| Login, sincronização, exportação | verificado pelo mantenedor a cada release | só teste de fumaça de contribuidor | **ninguém ainda** |
| Armazenamento de credenciais | Gerenciador de Credenciais, verificado | Keychain, não verificado de forma independente | Secret Service, **ninguém ainda** |
| Atualização automática | verificado | compilado, não verificado de forma independente | n/a — seu gerenciador de pacotes |

O mantenedor desenvolve no Windows e não tem Mac nem usa Linux no
desktop. Nada acima é uma declaração de que macOS ou Linux esteja quebrado — é
uma declaração sobre quem verificou o quê. Se você usa um dos dois e algo se
comporta mal, um relato é genuinamente útil.

**A partir do 1.0.0, o schema do banco local e o caminho de upgrade passaram a ser tratados como algo a manter no longo prazo**: cada migração faz um backup automático antes, e os snapshots podem ser verificados e restaurados. Seus dados ficam locais — mas os snapshots moram no mesmo disco do banco de dados, então **se você se preocupa com falha de disco, copie um para outro lugar por conta própria.**

## Primeira conexão

1. Abra o ZeppBridge e vá em **Configurações** na barra lateral.
2. Clique em conectar. A **página oficial de login do Zepp** abre numa janela própria; entre com suas credenciais de sempre.
3. Quando aparecer "conectado", a janela fecha e o app roda a primeira sincronização. Dê uns 40 segundos.

Contas da China continental e internacionais funcionam; o app detecta a qual servidor regional você pertence.

A primeira sincronização busca 30 dias para a tela ter algo rápido, e depois continua em segundo plano até chegar a 180 dias. O progresso fica visível e dá para parar a qualquer momento. As sincronizações seguintes são incrementais.

Todo seletor de "últimos N dias" no app — nas telas de treino e de corpo, e na página de exportação — lê a sua biblioteca **local**, não a nuvem. Se você escolher um intervalo que vai mais longe do que esta máquina guarda, o app avisa e oferece buscar o resto. Um trecho em branco no gráfico significa *ainda não buscado*, nunca *você não gravou nada na época*.

Para histórico anterior a 180 dias, use **Arquivo de longo prazo e histórico completo** nas Configurações: escolha 1/2/3 anos ou um início personalizado, e ele busca mês a mês. Dá para parar em qualquer ponto e continuar depois. Antes de começar, ele estima o uso de disco a partir da taxa real em que os seus próprios dados acumulam — não de uma constante fixa.

Se o intervalo passar da sua janela de retenção local, o app exige que você ligue o arquivo de longo prazo primeiro; senão, o histórico que você acabou de buscar seria limpo depois da próxima sincronização bem-sucedida.

Travou no login? Veja o [guia de conexão](docs/guides/connection.md) para diagnóstico e dois métodos alternativos.

## O que você obtém

**Tendências**

| Página | O que ela mostra |
| --- | --- |
| **Visão geral** | Frequência cardíaca das últimas horas, passos de hoje, estrutura do sono da noite passada, esta semana contra os seus próprios 28 dias anteriores, e entradas para estado do corpo e de treino. Cada cartão abre |
| **Frequência cardíaca** | A curva completa de 24 horas, mais tendências por dia de frequência cardíaca em repouso e HRV em duas definições |
| **Atividade diária** | Tendências por dia de passos, distância, calorias ativas e minutos ativos |
| **Estado do corpo** | Recuperação, estresse, SpO₂, HRV, frequência respiratória e frequência cardíaca em repouso ao longo do tempo |
| **Estado de treino** | VO₂max, carga de treino, limiar de lactato, PAI, e se o volume recente está alto ou baixo |
| **Registros recentes** | Cada sessão de sono e cada treino, todos abrindo em detalhe |
| **Detalhe do treino** | Distância, ritmo, frequência cardíaca, parciais por quilômetro, trilha GPS; corrida também mostra potência e forma |
| **Dispositivos** | De onde veio o modelo de cada dispositivo (catálogo ou sua própria identificação), firmware, dados mais recentes — dá para reatribuir a qualquer momento |
| **Saúde dos dados** (Configurações → Avançado e manutenção) | Estado de busca / interpretação / escrita de cada fluxo — se uma lacuna significa "não sincronizado" ou "nunca foi medido" |

Uma métrica sem dados não fica lá mostrando "—"; ela simplesmente não aparece.
E uma curva quebra onde passaram mais de 15 minutos sem amostra, em vez
de desenhar uma linha reta entre as duas pontas.

**Insight pós-treino e relatório semanal**

Depois de um treino, o app o compara com o seu próprio histórico: corridas recentes na mesma faixa de distância, e como ritmo, frequência cardíaca e carga de treino diferem — junto com em quantas amostras isso se apoia e o nível de confiança. **A linha de base é você, não uma norma populacional.** Quando não há amostras suficientes, ele diz isso, em vez de baixar a régua para produzir uma frase. São fatos e evidências; a interpretação fica para uma IA.

**Enviar para IA**

Vários modelos de prompt vêm embutidos (resumo de desempenho, insight de treino, avaliação de recuperação, análise de sono). Escolha um modelo e um intervalo, e o app empacota os dados, remove identificadores de dispositivo e localizações precisas, copia para a área de transferência e abre o site de IA que você escolheu.

A página de detalhe de um treino tem o próprio botão "enviar para IA", com escopo de
**só aquele treino**: o treino em si e as métricas ponto a ponto registradas enquanto ele
acontecia. Registros por dia, como sono e passos, não vão junto.

Pacotes acima de 2 MB são gravados num arquivo na sua área de trabalho, prontos
para arrastar para a conversa.

**Exportar arquivos**

- **JSON** — dados estruturados completos, para scripts ou modelos
- **CSV** — tabela-resumo para planilhas
- **GPX** — trilhas padrão para Strava, Garmin e outros

O que uma exportação contém: resumos de treino (tipo, início e fim, distância,
calorias, frequência cardíaca média e de pico, carga de treino), métricas diárias
(passos, frequência cardíaca em repouso, HRV, SpO2, estresse, frequência
respiratória, PAI, VO2max) e sessões de sono com a linha do tempo de estágios.
Escolher **Completo** em vez de **Resumo** adiciona as séries de treino
segundo a segundo e as leituras individuais de frequência cardíaca.

`.fit` é um formato de exportação à parte, um arquivo por treino, gravado numa
pasta que você escolhe. Ele carrega as séries segundo a segundo que o ZeppBridge
decodificou do detalhe de treino do Zepp: trilha GPS, frequência cardíaca,
velocidade, altitude, potência de corrida, tempo de contato com o solo e
oscilação vertical, mais parciais por quilômetro e eventos de pausa. Campos que
nunca foram medidos simplesmente ficam ausentes — nada é preenchido para o
arquivo parecer completo. Cadência é deixada de fora de propósito: a unidade
dela não fecha com nenhum campo de resumo que temos, e uma unidade errada
leria silenciosamente o dobro.

O que uma exportação não contém: `.tcx`, dados da conta, tokens ou números de
série do dispositivo. Trilhas GPS aparecem em GPX e FIT, e só para treinos que
realmente têm trilha.

**Não fica mais pesado com o tempo**

Os payloads brutos da nuvem são o que mais ocupa espaço no banco local. O
ZeppBridge os guarda compactados — tudo que é sincronizado de novo já chega
compactado, e a primeira inicialização depois de uma atualização compacta os
existentes em segundo plano e recupera o espaço em disco, com progresso no topo
da janela que some quando termina.

Antes de substituir um payload, ele o descompacta de novo e compara byte a byte,
pulando qualquer um que não bata: o payload bruto é a única base para
reinterpretar localmente, então não compactar é sempre melhor que compactar
errado. Um banco medido de 211 MB saiu com 55 MB.

**Deixe rodando**

Fechar a janela deixa o app na bandeja, ainda sincronizando sozinho. Se você
não quiser ele rodando, clique com o botão direito no ícone da bandeja e saia.

**Sem janela**

Cada release também traz `zeppbridge-tools-<versão>-<plataforma>.zip` com dois programas:

- `zeppbridge-cli` — não interativo: `status`, `sync`, `export`. Os códigos de saída são um contrato estável, então ele agenda direitinho no Agendador de Tarefas ou no cron.
- `zeppbridge-mcp` — servidor MCP somente leitura por stdio. Sem portas, sem rede. Deixa um modelo consultar seus dados locais sem que os dados saiam da sua máquina.

Veja [CLI e MCP](docs/reference/cli-and-mcp.md) para uso e exemplos de
configuração. A seção MCP nas Configurações também oferece um bloco de texto que
você pode colar direto numa IA, para ela te guiar na configuração na sua máquina.

**REST local somente leitura**

As Configurações podem ligar um endpoint somente leitura preso só a `127.0.0.1`, para seus próprios scripts. Fica desligado por padrão, exige um token quando ligado, não devolve credenciais e nunca escuta na rede local.

## O que mudou

As mudanças por versão estão no [CHANGELOG.md](CHANGELOG.md). Quando
Configurações → Atualização de software → Verificar atualizações encontra uma
versão nova, o app também mostra as notas de release diretamente e reporta o
progresso durante o download.

## Perguntas frequentes

**Meu computador precisa ficar ligado?**
Não. Cada inicialização recupera o período que você perdeu.

**Posso parar de usar o app Zepp no celular?**
Não. A cadeia é: relógio → app Zepp no celular → nuvem Zepp → ZeppBridge. Seu relógio ainda precisa do app do celular para enviar. Abra-o de vez em quando.

**Isso pode fazer minha conta ser banida?**
O ZeppBridge usa suas próprias credenciais e **só emite requisições de leitura** — não existe uma única requisição de escrita em todo o projeto; você pode conferir com grep. No comportamento, é o mesmo que abrir o app oficial para olhar seus dados. Ainda é um uso não oficial, e não podemos dar garantias em nome do Zepp.

**Uma métrica voltou vazia.**
Primeiro confira se o seu relógio realmente a mediu. Algumas métricas (limiar de lactato, VO₂max) só atualizam depois de treinos específicos, algumas vezes por ano. A página de configurações reporta cada uma para a sua conta — note que **"não obtido" não é o mesmo que "seu relógio não suporta"**: a API do Zepp devolve resposta vazia para dados que não existem *e* para nomes de fluxo que nunca foram válidos, então o vazio sozinho não prova nada.

**Onde ficam meus dados?**
- **Windows**: uma pasta `data` ao lado do diretório de instalação (não em `%APPDATA%`). Configurações → Avançado tem um botão para abri-la.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux**: `~/.local/share/zeppbridge/data` (Flatpak:
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Um AppImage ou um
  tarball descompactado mantém o `data/` ao lado do executável — veja o
  [guia de Linux](docs/guides/linux.md).

**O app não abre — a janela nunca aparece.**
Duas coisas para olhar, nesta ordem:

1. **O diálogo de erro.** A partir do v2.1.2, uma falha de inicialização mostra um
   diálogo nomeando a pasta exata e o erro do sistema em vez de sair em silêncio.
   Versões anteriores saíam sem dizer nada, o que parecia "o ícone da bandeja está
   lá mas clicar em Abrir não faz nada" — aquele ícone era sobra de um processo
   que já tinha morrido.
2. **O log.** `logs/zeppbridge.log` dentro da pasta de dados (veja a pergunta
   anterior), mais `logs/startup-error.log` se a última inicialização falhou antes
   de a janela existir. Anexe-os num relato de bug; eles contêm caminhos e números
   de versão, sem dados de conta.

A causa mais comum no Windows é uma pasta de dados em que o app não consegue
escrever — o `.msi` instala em `Program Files`, onde um usuário padrão não tem
permissão de escrita. A partir do v2.1.2 o app cai para
`%APPDATA%\zeppbridge\ZeppBridge\data` quando isso acontece (a menos que já
exista um banco na pasta bloqueada; nesse caso ele avisa em vez de abrir vazio
em silêncio). Você também pode apontar para qualquer lugar com a variável de
ambiente `ZEPPBRIDGE_DATA_DIR`.

**Meus dados continuam lá depois de desinstalar?**
Sim. Desinstalar deixa a pasta `data`, os backups, o livro de cobertura e as configurações intactos. Apague manualmente se quiser que sumam.

**Dá para fazer backup e restaurar o banco de dados?**
Dá. As Configurações podem criar um snapshot do banco inteiro a qualquer momento, cada um com SHA-256 e verificação de integridade. Restaurações entram numa fila e são aplicadas na próxima inicialização — o único momento em que um arquivo pode ser trocado atomicamente — e a etapa de fila mostra antes um diff de contagem de registros. Veja [backup e restauração](docs/guides/backup-and-restore.md).

**Tenho mais de um relógio — os dados vão se misturar?**
Não. Cada registro carrega de qual dispositivo veio, e a interface os mantém
separados.

**Algo é enviado para os servidores de vocês?**
Dados de saúde, detalhes de treino e credenciais nunca saem da sua máquina. Só se você confirmar explicitamente "enviar um relatório de erro" o app manda versões do aplicativo/parser, sistema operacional, dicas seguras de modelo e estrutura de campos de produtos não reconhecidos, versão de firmware, códigos de treino desconhecidos com contagens, e o código de erro numérico da requisição mais recente que a nuvem Zepp recusou (o número, qual fluxo de dados e quando — nunca o texto que a nuvem devolveu). Ele nunca envia contas, tokens, números de série, IDs de dispositivo, GPS, valores de saúde, respostas brutas ou caminhos locais. Não há telemetria automática nem relatório de crash em segundo plano.

## Privacidade

- **Credenciais** usam o armazenamento de credenciais do sistema por padrão (Gerenciador de Credenciais do Windows / Keychain do macOS / Secret Service do Linux). Se o seu keychain do macOS não puder ser desbloqueado, você pode escolher explicitamente um arquivo de texto privado; veja o [guia de armazenamento de credenciais no macOS](docs/guides/macos-credentials.md). O Linux também aceita armazenamento em arquivo e variável de ambiente; veja o [guia de Linux](docs/guides/linux.md). O armazenamento em arquivo protege menos que o do sistema e nunca é ligado só porque aquele falhou.
- **Dados de saúde** são um arquivo de banco de dados sem criptografia no seu computador. Se você divide a máquina, use contas de sistema separadas.
- **Pacotes para IA são anonimizados primeiro**: identificadores de dispositivo, endereços MAC e GPS preciso são removidos, e o arquivo lista o que foi tirado. Trilhas precisas só entram se você optar por isso.
- **Os mapas são renderizados localmente.** Nenhuma requisição vai para serviços de mapa de terceiros.
- **Relatórios de erro exigem confirmação explícita**, usam uma lista de permissões fixa, são montados localmente, não precisam de conta no GitHub e nunca são publicados automaticamente como issues.
- Sincronizar contata os servidores do Zepp, então este não é um aplicativo totalmente offline.

Veja [segurança e privacidade](docs/reference/security-and-privacy.md). Reporte problemas de segurança pelo canal privado de vulnerabilidades do GitHub, não numa issue pública.

## Para desenvolvedores

Tauri 2 + Vue 3 + Rust. O núcleo mora no crate `zeppbridge-core`; o app desktop, a CLI, o servidor MCP e o endpoint REST local são todos adaptadores finos sobre ele — SQL, conversão de unidades e regras de valor ausente nunca são duplicados.

```bash
npm ci
npm run tauri dev
```

- [Desenvolvimento](docs/development/development.md) — portas de build, contratos de command, REST local, ordem de aceitação
- [Arquitetura](docs/reference/architecture.md) — limites do produto, mapeamento da API do Zepp, lista de verificado vs. não verificado
- [CLI e MCP](docs/reference/cli-and-mcp.md) — contrato de códigos de saída, ferramentas somente leitura, exemplos de agendamento
- [Backup e restauração](docs/guides/backup-and-restore.md) — snapshots, fluxo de restauração, livro de cobertura
- [Linux](docs/guides/linux.md) — Flatpak, deb/rpm/AppImage, locais de dados, armazenamento de credenciais
- [Credenciais no macOS](docs/guides/macos-credentials.md) — use armazenamento em arquivo quando o keychain de login não está disponível
- [Docker](docs/guides/docker.md) — imagem CLI/MCP headless, agendamento, builds reproduzíveis
- [Guia de UI](docs/development/ui-guidelines.md) — tokens de design, estrutura de páginas, componentes

Issues e PRs são bem-vindos. Antes de mudar qualquer coisa, leia a lista de "não verificado" no documento de arquitetura — este projeto tem um padrão explícito para o que conta como fato estabelecido.

## Agradecimentos

A API do Zepp não é documentada; se um fluxo de dados sequer existe só é possível saber por quem já o fez funcionar. O mapeamento da API se apoia em:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) — divisão da superfície de eventos e valores de campos
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — uma reprodução independente das mesmas APIs, útil como validação cruzada
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor) (Apache-2.0) — decodificação do detalhe de treino

Nenhum deles é distribuído junto; o ZeppBridge se apoia nos fatos de API que eles registraram.

## Licença

[MIT License](LICENSE).

A distribuição inclui recursos de terceiros, atribuídos no [NOTICE](NOTICE): MiSans (Xiaomi, atribuição obrigatória — indicada na página de configurações), Inter (SIL OFL 1.1) e o algoritmo de decodificação creditado acima (Apache-2.0).

Zepp, Amazfit e as marcas relacionadas pertencem aos seus respectivos detentores.
