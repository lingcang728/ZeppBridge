<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Os teus dados do Zepp, de volta para ti.</strong></p>
  <p>Vê, arquiva e exporta os teus registos de saúde do Amazfit no teu próprio computador Windows, macOS ou Linux.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#transferir-e-instalar)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#transferir-e-instalar)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.nl.md">Nederlands</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <strong>Português</strong> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <a href="README.fr.md">Français</a></p>
  <p><em>Esta página é uma tradução; em caso de divergência, prevalece a <a href="README.md">versão em inglês</a>.</em></p>
</div>

> [!IMPORTANT]
> O ZeppBridge é um projeto de código aberto independente e não oficial. Não é afiliado nem endossado pela Zepp Health, Huami ou Amazfit. Utiliza-o apenas com contas e dados a que tens legitimamente acesso.

> A aplicação segue o idioma do sistema no primeiro arranque, e as Definições têm um seletor de idioma. Esta página é mantida em par com a [versão em inglês](README.md), e nada aqui é descrito de forma mais generosa do que está implementado.

## Isto já não existe na app Zepp?

Existe — mas só no teu telemóvel, só da forma que a app oficial escolhe mostrar, e os dados vivem no servidor de outra pessoa. O ZeppBridge resolve alguns pontos concretos:

- **Ver num ecrã a sério.** Tendências de longo prazo de frequência cardíaca, sono, treinos, recuperação, stress e SpO₂, por 7 dias / 1 mês / 6 meses.
- **Os dados ficam no teu próprio computador.** Tudo vai parar a um único ficheiro na tua máquina. Continua a funcionar offline, ao trocar de telemóvel, ao apagar a conta ou quando a app mudar de visual.
- **Dá para repor o histórico de antes de instalares.** Mês a mês, com pausa e retoma, e honesto sobre que meses a nuvem realmente não tinha nada e quais simplesmente ainda não foram obtidos.
- **Backups que realmente restauram.** Snapshots da base de dados inteira com checksums e verificação de integridade, e um diff de contagem de registos mostrado antes de restaurares.
- **Exporta quando quiseres.** JSON, CSV e GPX — mete-os no Excel, no Strava ou nos teus próprios scripts.
- **Entrega a uma IA num passo.** Escolhe o período e os tipos de dados; a app empacota num formato legível para modelos, remove dados de identificação e copia para a área de transferência.
- **Utilizável sem abrir janela.** Traz um CLI não interativo (agendável pelo Agendador de Tarefas ou pelo cron) e um servidor MCP só de leitura, para um modelo consultar os teus dados locais sem que os dados saiam da tua máquina.

Há uma coisa que vale a pena dizer com todas as letras: **ele não vai embelezar os teus dados.**

Se não usaste o relógio nesse dia, o gráfico tem um buraco. Se o teu relógio nunca mediu algo, a interface diz "não fornecido" — nunca `0`. Sem trilho GPS, sem mapa. Em dados de saúde, uma curva lisa inventada é pior que uma lacuna honesta.

O mesmo vale para a palavra "completo": a interface só declara uma **cópia local completa** quando o registo de cobertura mostra que cada bloco mensal chegou a uma conclusão. Até lá, ela diz "uma cópia local do intervalo que sincronizou com sucesso".

## Que dispositivos são suportados

**Se o teu dispositivo sincroniza com a app Zepp, vale a pena tentar.** O ZeppBridge lê o que a tua conta guarda na nuvem; não fala com o relógio, por isso não depende de modelos específicos.

O catálogo embutido reconhece 52 produtos Amazfit das famílias **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio e Band** (relógios, pulseiras, braceletes e anéis). Dispositivos reconhecidos mostram o nome correto do modelo e a imagem do produto; os não reconhecidos continuam a sincronizar — aparecem só com um nome genérico, e podes identificar o teu à mão.

Que métricas realmente recebes depende do que o teu relógio mede. Depois de ligares, a página de definições lista isso para a tua conta, item a item.

## Transferir e instalar

Obtém a build mais recente em [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Transfere `ZeppBridge_<versão>_x64-setup.exe` (ou `.msi`) e executa-o.
2. Ainda não há certificado de assinatura de código, por isso o Windows pode avisar sobre um editor desconhecido. Escolhe **Mais informações → Executar mesmo assim**.
3. As versões seguintes instalam por cima; os teus dados não são tocados.

**macOS (Apple Silicon)**

> **Esta build não é assinada.** Não há certificado Apple Developer ID nem
> notarização, por isso o macOS vai recusar-se a abrir a app até limpares tu
> mesmo a flag de quarentena. Os passos abaixo são um contorno deliberado, não
> uma correção — vê [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. Transfere `ZeppBridge_<versão>_aarch64.dmg` e arrasta `ZeppBridge.app` para as Aplicações.
2. A primeira abertura vai falhar. A mensagem que aparece depende da tua versão do macOS:
   - **"programador não identificado"** → **Botão direito na app → Abrir → Abrir.**
   - **"O ZeppBridge está danificado e não pode ser aberto"** → o botão direito *não*
     resolve. Corre isto no Terminal e depois abre a app normalmente:

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   A app não está realmente danificada. É o que o Gatekeeper diz sobre
   qualquer pacote transferido que não foi notarizado. Só corre um comando assim
   em software em que decidiste confiar — podes ler cada linha deste projeto no
   GitHub e compilar tu mesmo.
3. As builds de macOS passam pela CI (compilação, clippy, testes) e por um
   teste de fumo feito por um contribuidor no Apple Silicon. O mantenedor não
   tem Mac e não consegue verificar por conta própria a sincronização ou o
   comportamento do keychain. Se isso te importa, prefere o Windows.

Porque é que fica assim por enquanto: a notarização em si não precisa de Mac — a CI
já corre em runners macOS e podia assinar e notarizar lá. O que falta
é uma assinatura do Apple Developer Program (99 USD/ano), que o projeto ainda
não comprou. Se isso mudar, esta secção desaparece.

**Linux (x86_64)**

> **Compila, mas ainda ninguém o correu.** A CI compila, corre os testes e
> gera os pacotes a cada push. O que *não* aconteceu é um ciclo completo
> de início de sessão e sincronização num desktop Linux a sério — incluindo se o
> token vai parar corretamente ao teu keyring. Trata isto como uma build que
> estás a ajudar a testar, não como um release.

Flatpak, `.deb`, `.rpm` e um AppImage são publicados na página de releases.
Nada é assinado; confere os downloads com o `SHA256SUMS.txt`.

```bash
sudo apt install ./ZeppBridge_<versão>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<versão>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<versão>_x86_64.flatpak  # qualquer distro
```

O [guia de Linux](docs/guides/linux.md) cobre para onde vão os dados, como o
token fica guardado quando não tens keyring, e como compilar a partir do
código-fonte.

Há também uma [imagem de contentor headless](docs/guides/docker.md) só com a
CLI e o servidor MCP, para manter uma biblioteca sincronizada num NAS ou num
servidor. Ela não consegue iniciar sessão — isso ainda precisa da app desktop uma vez.

**Não suportado**: Macs Intel, mobile.

### O que está verificado em cada plataforma

A mesma app, a mesma interface, as mesmas funções nos três — o que muda é o quanto
disso alguém realmente verificou. Perguntar aqui é melhor do que adivinhar.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Interface e funções | idênticas | idênticas | idênticas |
| Compila na CI | sim | sim | sim |
| Testes automatizados na CI | sim | sim | sim |
| Instalador abre sem truques | sim (aviso de editor desconhecido) | **não** — vê a nota da build não assinada acima | sim |
| Início de sessão, sincronização, exportação | verificado pelo mantenedor em cada release | só teste de fumo de contribuidor | **ainda ninguém** |
| Armazenamento de credenciais | Gestor de Credenciais, verificado | Keychain, não verificado de forma independente | Secret Service, **ainda ninguém** |
| Atualização automática | verificado | compilado, não verificado de forma independente | n/a — o teu gestor de pacotes |

O mantenedor desenvolve no Windows e não tem Mac nem usa Linux no
desktop. Nada acima é uma declaração de que macOS ou Linux esteja estragado — é
uma declaração sobre quem verificou o quê. Se usas um dos dois e algo se
comporta mal, um relato é genuinamente útil.

**A partir do 1.0.0, o esquema da base de dados local e o caminho de atualização passaram a ser tratados como algo a manter a longo prazo**: cada migração faz um backup automático primeiro, e os snapshots podem ser verificados e restaurados. Os teus dados ficam locais — mas os snapshots vivem no mesmo disco da base de dados, por isso **se te preocupa uma falha de disco, copia um para outro sítio por tua conta.**

## Primeira ligação

1. Abre o ZeppBridge e vai a **Definições** na barra lateral.
2. Clica em ligar. A **página oficial de início de sessão do Zepp** abre numa janela própria; entra com as tuas credenciais de sempre.
3. Quando aparecer "ligado", a janela fecha e a app corre a primeira sincronização. Dá-lhe uns 40 segundos.

Contas da China continental e internacionais funcionam; a app deteta a que servidor regional pertences.

A primeira sincronização obtém 30 dias para o ecrã ter algo depressa, e depois continua em segundo plano até chegar aos 180 dias. O progresso fica visível e podes parar a qualquer momento. As sincronizações seguintes são incrementais.

Todos os seletores de "últimos N dias" na app — nos ecrãs de treino e de corpo, e na página de exportação — leem a tua biblioteca **local**, não a nuvem. Se escolheres um intervalo que vai mais atrás do que esta máquina guarda, a app diz isso e oferece ir buscar o resto. Um trecho em branco no gráfico significa *ainda não obtido*, nunca *não gravaste nada nessa altura*.

Para histórico anterior a 180 dias, usa **Arquivo de longo prazo e histórico completo** nas Definições: escolhe 1/2/3 anos ou um início à tua medida, e ele obtém mês a mês. Podes parar em qualquer ponto e continuar depois. Antes de começar, estima o uso de disco a partir do ritmo real a que os teus próprios dados acumulam — não de uma constante fixa.

Se o intervalo passar da tua janela de retenção local, a app exige que ligues primeiro o arquivo de longo prazo; senão, o histórico que acabaste de obter seria limpo depois da próxima sincronização bem-sucedida.

Preso no início de sessão? Vê o [guia de ligação](docs/guides/connection.md) para diagnóstico e dois métodos alternativos.

## O que recebes

**Tendências**

| Página | O que mostra |
| --- | --- |
| **Visão geral** | Frequência cardíaca das últimas horas, passos de hoje, estrutura do sono da noite passada, esta semana contra os teus próprios 28 dias anteriores, e entradas para o estado corporal e de treino. Cada cartão abre |
| **Frequência cardíaca** | A curva completa de 24 horas, mais tendências por dia de frequência cardíaca em repouso e HRV em duas definições |
| **Atividade diária** | Tendências por dia de passos, distância, calorias ativas e minutos ativos |
| **Estado corporal** | Recuperação, stress, SpO₂, HRV, frequência respiratória e frequência cardíaca em repouso ao longo do tempo |
| **Estado de treino** | VO₂max, carga de treino, limiar de lactato, PAI, e se o volume recente está alto ou baixo |
| **Registos recentes** | Cada sessão de sono e cada treino, todos a abrir em detalhe |
| **Detalhe do treino** | Distância, ritmo, frequência cardíaca, parciais por quilómetro, trilho GPS; a corrida também mostra potência e forma |
| **Dispositivos** | De onde veio o modelo de cada dispositivo (catálogo ou a tua própria identificação), firmware, dados mais recentes — podes reatribuir a qualquer momento |
| **Saúde dos dados** (Definições → Avançado e manutenção) | Estado de obtenção / interpretação / escrita de cada fluxo — se uma lacuna significa "não sincronizado" ou "nunca foi medido" |

Uma métrica sem dados não fica ali a mostrar "—"; simplesmente não aparece.
E uma curva quebra onde passaram mais de 15 minutos sem amostra, em vez
de desenhar uma linha reta entre as duas pontas.

**Insight pós-treino e relatório semanal**

Depois de um treino, a app compara-o com o teu próprio histórico: corridas recentes na mesma faixa de distância, e como ritmo, frequência cardíaca e carga de treino diferem — junto com em quantas amostras isso assenta e o nível de confiança. **A linha de base és tu, não uma norma populacional.** Quando não há amostras suficientes, ela diz isso, em vez de baixar a fasquia para produzir uma frase. São factos e evidências; a interpretação fica para uma IA.

**Entregar à IA**

Vários modelos de prompt vêm embutidos (resumo de desempenho, insight de treino, avaliação de recuperação, análise de sono). Escolhe um modelo e um intervalo, e a app empacota os dados, remove identificadores de dispositivo e localizações precisas, copia para a área de transferência e abre o site de IA que escolheste.

A página de detalhe de um treino tem o seu próprio botão "entregar à IA", com âmbito de
**só aquele treino**: o treino em si e as métricas ponto a ponto registadas enquanto ele
decorria. Registos ao nível do dia, como sono e passos, não vão com ele.

Pacotes acima de 2 MB são escritos num ficheiro no teu ambiente de trabalho, prontos
para arrastar para a conversa.

**Exportar ficheiros**

- **JSON** — dados estruturados completos, para scripts ou modelos
- **CSV** — tabela-resumo para folhas de cálculo
- **GPX** — trilhos padrão para Strava, Garmin e outros

O que uma exportação contém: resumos de treino (tipo, início e fim, distância,
calorias, frequência cardíaca média e de pico, carga de treino), métricas diárias
(passos, frequência cardíaca em repouso, HRV, SpO2, stress, frequência
respiratória, PAI, VO2max) e sessões de sono com a linha do tempo de fases.
Escolher **Completo** em vez de **Resumo** adiciona as séries de treino
ao segundo e as leituras individuais de frequência cardíaca.

`.fit` é um formato de exportação à parte, um ficheiro por treino, escrito numa
pasta que escolhes. Leva as séries ao segundo que o ZeppBridge
descodificou do detalhe de treino do Zepp: trilho GPS, frequência cardíaca,
velocidade, altitude, potência de corrida, tempo de contacto com o solo e
oscilação vertical, mais parciais por quilómetro e eventos de pausa. Campos que
nunca foram medidos ficam simplesmente ausentes — nada é preenchido para o
ficheiro parecer completo. A cadência fica de fora de propósito: a unidade
dela não reconcilia com nenhum campo de resumo que tenhamos, e uma unidade
errada leria silenciosamente o dobro.

O que uma exportação não contém: `.tcx`, dados da conta, tokens ou números de
série do dispositivo. Trilhos GPS aparecem em GPX e FIT, e só para treinos que
realmente trazem trilho.

**Não fica mais pesado com o tempo**

Os payloads brutos da nuvem são o que mais ocupa espaço na base de dados local. O
ZeppBridge guarda-os compactados — tudo o que é sincronizado de novo já chega
compactado, e o primeiro arranque depois de uma atualização compacta os
existentes em segundo plano e recupera o espaço em disco, com progresso no topo
da janela que desaparece quando acaba.

Antes de substituir um payload, descompacta-o outra vez e compara byte a byte,
saltando qualquer um que não bata certo: o payload bruto é a única base para
reinterpretar localmente, por isso não compactar é sempre melhor que compactar
mal. Uma base medida de 211 MB saiu com 55 MB.

**Deixa-o a correr**

Fechar a janela deixa a app na área de notificação, ainda a sincronizar sozinha. Se
não a quiseres a correr, faz botão direito no ícone da área de notificação e sai.

**Sem janela**

Cada release também traz `zeppbridge-tools-<versão>-<plataforma>.zip` com dois programas:

- `zeppbridge-cli` — não interativo: `status`, `sync`, `export`. Os códigos de saída são um contrato estável, por isso agenda bem no Agendador de Tarefas ou no cron.
- `zeppbridge-mcp` — servidor MCP só de leitura por stdio. Sem portas, sem rede. Deixa um modelo consultar os teus dados locais sem que os dados saiam da tua máquina.

Vê [CLI e MCP](docs/reference/cli-and-mcp.md) para uso e exemplos de
configuração. A secção MCP nas Definições também oferece um bloco de texto que
podes colar diretamente numa IA, para ela te guiar na configuração na tua máquina.

**REST local só de leitura**

As Definições podem ligar um endpoint só de leitura preso apenas a `127.0.0.1`, para os teus próprios scripts. Está desligado por omissão, exige um token quando ligado, não devolve credenciais e nunca escuta na rede local.

## O que mudou

As mudanças por versão estão no [CHANGELOG.md](CHANGELOG.md). Quando
Definições → Atualização de software → Procurar atualizações encontra uma
versão nova, a app também te mostra as notas de release diretamente e reporta o
progresso durante o download.

## Perguntas frequentes

**O meu computador precisa de ficar ligado?**
Não. Cada arranque recupera o período que perdeste.

**Posso deixar de usar a app Zepp no telemóvel?**
Não. A cadeia é: relógio → app Zepp no telemóvel → nuvem Zepp → ZeppBridge. O teu relógio ainda precisa da app do telemóvel para enviar. Abre-a de vez em quando.

**Isto pode fazer a minha conta ser banida?**
O ZeppBridge usa as tuas próprias credenciais e **só emite pedidos de leitura** — não existe um único pedido de escrita em todo o projeto; podes confirmar com grep. Em comportamento, é o mesmo que abrir a app oficial para olhar para os teus dados. Continua a ser um uso não oficial, e não podemos dar garantias em nome da Zepp.

**Uma métrica voltou vazia.**
Primeiro confirma se o teu relógio realmente a mediu. Algumas métricas (limiar de lactato, VO₂max) só atualizam depois de treinos específicos, algumas vezes por ano. A página de definições reporta cada uma para a tua conta — nota que **"não obtido" não é o mesmo que "o teu relógio não suporta"**: a API do Zepp devolve resposta vazia para dados que não existem *e* para nomes de fluxo que nunca foram válidos, por isso o vazio sozinho não prova nada.

**Onde estão os meus dados?**
- **Windows**: uma pasta `data` ao lado do diretório de instalação (não em `%APPDATA%`). Definições → Avançado tem um botão para a abrir.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux**: `~/.local/share/zeppbridge/data` (Flatpak:
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Um AppImage ou um
  tarball descompactado mantém o `data/` ao lado do executável — vê o
  [guia de Linux](docs/guides/linux.md).

**A app não arranca — a janela nunca aparece.**
Duas coisas para ver, por esta ordem:

1. **O diálogo de erro.** A partir do v2.1.2, uma falha de arranque mostra um
   diálogo que nomeia a pasta exata e o erro do sistema em vez de sair em silêncio.
   Versões anteriores saíam sem dizer nada, o que parecia "o ícone da área de
   notificação está lá mas clicar em Abrir não faz nada" — esse ícone era um resto
   de um processo que já tinha morrido.
2. **O log.** `logs/zeppbridge.log` dentro da pasta de dados (vê a pergunta
   anterior), mais `logs/startup-error.log` se o último arranque falhou antes
   de a janela existir. Anexa-os num relato de bug; contêm caminhos e números
   de versão, sem dados de conta.

A causa mais comum no Windows é uma pasta de dados onde a app não consegue
escrever — o `.msi` instala em `Program Files`, onde um utilizador padrão não tem
permissão de escrita. A partir do v2.1.2 a app recorre a
`%APPDATA%\zeppbridge\ZeppBridge\data` quando isso acontece (a menos que já
exista uma base de dados na pasta bloqueada; nesse caso ela diz isso em vez de
arrancar vazia em silêncio). Também podes apontar para qualquer sítio com a
variável de ambiente `ZEPPBRIDGE_DATA_DIR`.

**Os meus dados continuam lá depois de desinstalar?**
Sim. Desinstalar deixa a pasta `data`, os backups, o registo de cobertura e as definições intactos. Apaga manualmente se quiseres que desapareçam.

**Dá para fazer backup e restaurar a base de dados?**
Dá. As Definições podem criar um snapshot da base de dados inteira a qualquer momento, cada um com SHA-256 e verificação de integridade. Os restores entram numa fila e são aplicados no próximo arranque — o único momento em que um ficheiro pode ser trocado atomicamente — e o passo de fila mostra antes um diff de contagem de registos. Vê [backup e restore](docs/guides/backup-and-restore.md).

**Tenho mais de um relógio — os dados misturam-se?**
Não. Cada registo carrega de que dispositivo veio, e a interface mantém-nos
separados.

**Alguma coisa é enviada para os vossos servidores?**
Dados de saúde, detalhes de treino e credenciais nunca saem da tua máquina. Só se confirmares explicitamente "submeter um relatório de erro" é que a app envia versões da aplicação/parser, sistema operativo, dicas seguras de modelo e estrutura de campos de produtos não reconhecidos, versão de firmware, códigos de treino desconhecidos com contagens, e o código de erro numérico do pedido mais recente que a nuvem Zepp recusou (o número, que fluxo de dados e quando — nunca o texto que a nuvem devolveu). Nunca envia contas, tokens, números de série, IDs de dispositivo, GPS, valores de saúde, respostas brutas ou caminhos locais. Não há telemetria automática nem relatórios de crash em segundo plano.

## Privacidade

- **Credenciais** usam o armazenamento de credenciais do sistema por omissão (Gestor de Credenciais do Windows / Keychain do macOS / Secret Service do Linux). Se o teu keychain do macOS não puder ser desbloqueado, podes escolher explicitamente um ficheiro de texto privado; vê o [guia de armazenamento de credenciais no macOS](docs/guides/macos-credentials.md). O Linux também suporta armazenamento em ficheiro e variável de ambiente; vê o [guia de Linux](docs/guides/linux.md). O armazenamento em ficheiro protege menos que o do sistema e nunca é ativado só porque aquele falhou.
- **Dados de saúde** são um ficheiro de base de dados sem cifragem no teu computador. Se partilhas a máquina, usa contas de sistema separadas.
- **Pacotes para IA são desidentificados primeiro**: identificadores de dispositivo, endereços MAC e GPS preciso são removidos, e o ficheiro lista o que foi retirado. Trilhos precisos só entram se optares por isso.
- **Os mapas são renderizados localmente.** Nenhum pedido vai para serviços de mapa de terceiros.
- **Relatórios de erro exigem confirmação explícita**, usam uma lista de permissões fixa, são construídos localmente, não precisam de conta no GitHub e nunca são publicados automaticamente como issues.
- Sincronizar contacta os servidores da Zepp, por isso isto não é uma aplicação totalmente offline.

Vê [segurança e privacidade](docs/reference/security-and-privacy.md). Reporta problemas de segurança pelo canal privado de vulnerabilidades do GitHub, não numa issue pública.

## Para programadores

Tauri 2 + Vue 3 + Rust. O núcleo vive no crate `zeppbridge-core`; a app desktop, a CLI, o servidor MCP e o endpoint REST local são todos adaptadores finos sobre ele — SQL, conversão de unidades e regras de valor ausente nunca são duplicados.

```bash
npm ci
npm run tauri dev
```

- [Desenvolvimento](docs/development/development.md) — gates de build, contratos de command, REST local, ordem de aceitação
- [Arquitetura](docs/reference/architecture.md) — limites do produto, mapeamento da API do Zepp, lista de verificado vs. não verificado
- [CLI e MCP](docs/reference/cli-and-mcp.md) — contrato de códigos de saída, ferramentas só de leitura, exemplos de agendamento
- [Backup e restore](docs/guides/backup-and-restore.md) — snapshots, fluxo de restore, registo de cobertura
- [Linux](docs/guides/linux.md) — Flatpak, deb/rpm/AppImage, locais de dados, armazenamento de credenciais
- [Credenciais no macOS](docs/guides/macos-credentials.md) — usa armazenamento em ficheiro quando o keychain de início de sessão não está disponível
- [Docker](docs/guides/docker.md) — imagem CLI/MCP headless, agendamento, builds reproduzíveis
- [Guia de UI](docs/development/ui-guidelines.md) — tokens de design, estrutura de páginas, componentes

Issues e PRs são bem-vindos. Antes de mudares qualquer coisa, lê a lista de "não verificado" no documento de arquitetura — este projeto tem um padrão explícito para o que conta como facto estabelecido.

## Agradecimentos

A API do Zepp não é documentada; se um fluxo de dados sequer existe só se sabe por quem já o fez funcionar. O mapeamento da API apoia-se em:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) — divisão da superfície de eventos e valores de campos
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — uma reprodução independente das mesmas APIs, útil como validação cruzada
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor) (Apache-2.0) — descodificação do detalhe de treino

Nenhum deles é distribuído junto; o ZeppBridge apoia-se nos factos de API que eles registaram.

## Licença

[MIT License](LICENSE).

A distribuição inclui recursos de terceiros, atribuídos no [NOTICE](NOTICE): MiSans (Xiaomi, atribuição obrigatória — assinalada na página de definições), Inter (SIL OFL 1.1) e o algoritmo de descodificação creditado acima (Apache-2.0).

Zepp, Amazfit e as marcas relacionadas pertencem aos seus respetivos titulares.
