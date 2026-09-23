<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Je Zepp-data, terug in eigen hand.</strong></p>
  <p>Bekijk, archiveer en exporteer je Amazfit-gezondheidsgegevens op je eigen Windows-, macOS- of Linux-machine.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#downloaden-en-installeren)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#downloaden-en-installeren)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <strong>Nederlands</strong> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.pt-PT.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <a href="README.fr.md">Français</a></p>
</div>

> [!IMPORTANT]
> ZeppBridge is een onafhankelijk, onofficieel open-sourceproject. Het is niet gelieerd aan of onderschreven door Zepp Health, Huami of Amazfit. Gebruik het alleen met accounts en data waar je zelf toegang toe mag hebben.

> De app is beschikbaar in tien talen; bij de eerste start volgt hij je systeemtaal en in Instellingen zit een schakelaar. Deze pagina is een vertaling van de [Engelse bronversie](README.md) — bij afwijkingen geldt de Engelse versie. De hieronder gelinkte uitgebreide handleidingen zijn voorlopig alleen in het Engels en Chinees beschikbaar.

## Zit dit niet al in de Zepp-app?

Jawel — maar alleen op je telefoon, alleen zoals de officiële app het wil tonen, en het leeft op de server van iemand anders. ZeppBridge lost een paar concrete dingen op:

- **Bekijk het op een echt scherm.** Langetermijntrends voor hartslag, slaap, trainingen, herstel, stress en SpO₂, over 7 dagen / 1 maand / 6 maanden.
- **De data staat op je eigen computer.** Alles belandt in één bestand op je machine. Het blijft offline werken, door telefoonwissels, accountverwijderingen en app-herontwerpen heen.
- **Je kunt geschiedenis van vóór de installatie terughalen.** Maand voor maand, pauzeerbaar en hervatbaar, en eerlijk over welke maanden de cloud echt niets had en welke gewoon nog niet zijn opgehaald.
- **Back-ups die ook echt terugzetten.** Snapshots van de hele database met checksums en integriteitscontroles, plus een diff van het aantal records vóór het terugzetten.
- **Exporteer wanneer je wilt.** JSON, CSV en GPX — zo in Excel, Strava of je eigen scripts.
- **Geef het in één stap aan een AI.** Kies een datumbereik en gegevenstypen; de app pakt het in een voor modellen leesbare vorm, stript identificerende details en kopieert het naar je klembord.
- **Bruikbaar zonder een venster te openen.** Wordt meegeleverd met een niet-interactieve CLI (te plannen via Taakbeheer of cron) en een read-only MCP-server, zodat een model je lokale data kan bevragen zonder dat die je machine verlaat.

Eén ding verdient het om ruit te worden gezegd: **de app maakt je data niet mooier dan het is.**

Droeg je het horloge die dag niet, dan heeft de grafiek een gat. Heeft je horloge iets nooit gemeten, dan staat er "niet verstrekt" in de interface — nooit `0`. Geen GPS-track betekent geen kaart. Bij gezondheidsdata is een verzonnen gladde lijn erger dan een eerlijk gat.

Hetzelfde geldt voor het woord "compleet": de interface claimt pas een **volledige lokale kopie** als het dekkingsregister laat zien dat elk maandblok een conclusie heeft bereikt. Tot dan staat er "een lokale kopie van het bereik dat succesvol is gesynchroniseerd".

## Welke apparaten worden ondersteund

**Als je apparaat synchroniseert met de Zepp-app, is het het proberen waard.** ZeppBridge leest wat je account in de cloud heeft; hij praat niet met het horloge en is dus niet aan specifieke modellen gebonden.

De meegeleverde catalogus herkent 52 Amazfit-producten uit de families **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio en Band** (horloges, bandjes, armbanden, ringen). Herkende apparaten tonen de juiste modelnaam en een productafbeelding; niet-herkende synchroniseren gewoon — ze tonen alleen een generieke naam, en je kunt de jouwe met de hand toewijzen.

Welke meetwaarden je daadwerkelijk krijgt, hangt af van wat je horloge meet. Na het verbinden zet de instellingenpagina dat voor jouw account stuk voor stuk op een rij.

## Downloaden en installeren

Haal de nieuwste build op via [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Download `ZeppBridge_<version>_x64-setup.exe` (of `.msi`) en voer het uit.
2. Er is nog geen code-ondertekeningscertificaat, dus Windows kan waarschuwen voor een onbekende uitgever. Kies **Meer informatie → Toch uitvoeren**.
3. Latere versies installeren er overheen; je data blijft onaangeroerd.

**macOS (Apple Silicon)**

> **Dit is een ongetekende build.** Er is geen Apple Developer ID-certificaat
> en geen notarisatie, dus macOS weigert het te openen tot je zelf de
> quarantainemarkering verwijdert. De stappen hieronder zijn een bewuste
> workaround, geen oplossing — zie
> [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. Download `ZeppBridge_<version>_aarch64.dmg` en sleep `ZeppBridge.app` naar Programma's.
2. De eerste start mislukt. Welke melding je krijgt hangt af van je macOS-versie:
   - **"unidentified developer"** → **rechtermuisklik op de app → Open → Open.**
   - **"ZeppBridge is beschadigd en kan niet worden geopend"** → rechtermuisklik
     helpt hier *niet*. Voer dit uit in Terminal en open daarna de app zoals
     normaal:

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   De app is niet echt beschadigd. Dat is wat Gatekeeper zegt over elk
   gedownload pakket dat niet genotariseerd is. Voer zo'n commando alleen uit
   voor software die je bewust vertrouwt — van deze kun je elke regel op GitHub
   lezen en hem zelf bouwen.
3. macOS-builds zijn gedekt door CI (compileren, clippy, tests) plus één
   smoke test van een bijdrager op Apple Silicon. De maintainer bezit geen Mac
   en kan sync- of keychain-gedrag niet zelf verifiëren. Als dat voor je
   belangrijk is, kies dan Windows.

Waarom het voorlopig zo blijft: notarisatie zelf vereist geen Mac — CI draait
al op macOS-runners en zou daar kunnen tekenen en notariseren. Wat ontbreekt is
een Apple Developer Program-lidmaatschap (99 USD/jaar), dat het project niet
heeft aangeschaft. Verandert dat, dan verdwijnt deze sectie.

**Linux (x86_64)**

> **Het compileert, maar niemand heeft het nog echt gedraaid.** CI compileert,
> draait de tests en bouwt bij elke push de pakketten. Wat *niet* is gebeurd is
> een volledige inlog-en-sync-cyclus op een echte Linux-desktop — inclusief de
> vraag of het token correct in je keyring belandt. Beschouw dit als een build
> die je mee helpt testen, niet als een afgeronde release.

Flatpak, `.deb`, `.rpm` en een AppImage worden op de releasepagina
gepubliceerd. Niets is getekend; controleer downloads tegen `SHA256SUMS.txt`.

```bash
sudo apt install ./ZeppBridge_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<version>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<version>_x86_64.flatpak  # overal
```

De [Linux-gids](docs/guides/linux.md) (Engels) beschrijft waar de data heen
gaat, hoe het token wordt opgeslagen als er geen keyring is, en hoe je vanuit
broncode bouwt.

Er is ook een [headless containerimage](docs/guides/docker.md) (Engels) met
alleen de CLI en de MCP-server, om een bibliotheek op een NAS of server
gesynchroniseerd te houden. Inloggen kan het niet — daarvoor is eenmalig de
desktopapp nodig.

**Niet ondersteund**: Intel-Macs, mobiel.

### Wat is op welk platform geverifieerd

Dezelfde app, dezelfde interface, dezelfde functies op alle drie — wat verschilt
is hoeveel ervan iemand daadwerkelijk heeft gecontroleerd. Hier vragen is beter
dan gokken.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Interface en functies | identiek | identiek | identiek |
| Gebouwd in CI | ja | ja | ja |
| Geautomatiseerde tests in CI | ja | ja | ja |
| Installer opent zonder workaround | ja (waarschuwing "onbekende uitgever") | **nee** — zie de noot over de ongetekende build hierboven | ja |
| Inloggen, synchroniseren, exporteren | door de maintainer geverifieerd bij elke release | alleen smoke test van een bijdrager | **nog niemand** |
| Referentieopslag | Credential Manager, geverifieerd | Keychain, niet onafhankelijk geverifieerd | Secret Service, **nog niemand** |
| Auto-update | geverifieerd | gebouwd, niet onafhankelijk geverifieerd | n.v.t. — je pakketbeheerder |

De maintainer ontwikkelt op Windows en heeft geen Mac en gebruikt geen Linux op
de desktop. Niets hiervan zegt dat macOS of Linux stuk is — het beschrijft wie
wat heeft gecontroleerd. Gebruik je een van beide en doet iets raars, dan is
een melding echt nuttig.

**Vanaf 1.0.0 worden het schema en het upgradepad van de lokale database
behandeld als iets om langdurig te onderhouden**: elke migratie maakt eerst een
automatische back-up, en snapshots kunnen worden geverifieerd en teruggezet. Je
data blijft lokaal — maar de snapshots staan op dezelfde schijf als de
database, dus **als je je zorgen maakt over een diskcrash, kopieer er dan zelf
een naar elders.**

## Eerste verbinding

1. Open ZeppBridge en ga naar **Instellingen** in de zijbalk.
2. Klik op verbinden. De **officiële Zepp-inlogpagina** opent in een eigen
   venster; log in met je gebruikelijke gegevens.
3. Zodra "verbonden" verschijnt, sluit het venster en voert de app de eerste
   synchronisatie uit. Geef het ongeveer 40 seconden.

Accounts uit zowel het Chinese vasteland als internationale accounts werken;
de app detecteert zelf bij welke regionale server je hoort.

De eerste synchronisatie haalt 30 dagen op zodat er snel iets op het scherm
staat, en gaat daarna op de achtergrond door tot 180 dagen binnen zijn. De
voortgang is zichtbaar en je kunt op elk moment stoppen. Latere syncs zijn
incrementeel.

Elke "laatste N dagen"-kiezer in de app — op de trainings- en
lichaamsschermen, en op de exportpagina — leest je **lokale** bibliotheek,
niet de cloud. Kies je een bereik dat verder terugreikt dan wat deze machine
heeft, dan zegt de app dat en biedt aan de rest op te halen. Een leeg stuk in
een grafiek betekent *nog niet opgehaald*, nooit *je hebt toen niets
vastgelegd*.

Voor geschiedenis ouder dan 180 dagen gebruik je **Langetermijnarchief en
volledige geschiedenis** in Instellingen: kies 1/2/3 jaar of een eigen
startpunt, en hij haalt maand voor maand op. Je kunt op elk moment stoppen en
later verdergaan. Vooraf schat hij het schijfgebruik op basis van het echte
tempo waarin jouw eigen data groeit — niet vanuit een vast ingebakken getal.

Overschrijdt het bereik je lokale retentievenster, dan eist de app eerst dat
je langetermijnarchivering inschakelt; anders wordt de net opgehaalde
geschiedenis na de volgende geslaagde sync weer opgeruimd.

Loop je vast bij het inloggen? Zie de [verbindingsgids](docs/guides/connection.md)
(Engels) voor probleemoplossing en twee alternatieve methoden.

## Wat je krijgt

**Trends**

| Pagina | Wat hij toont |
| --- | --- |
| **Overzicht** | Hartslag van de afgelopen uren, stappen van vandaag, slaapstructuur van afgelopen nacht, deze week tegen je eigen vorige 28 dagen, en ingangen naar lichaams- en trainingsstatus. Elke kaart opent |
| **Hartslag** | De volledige 24-uurscurve, plus dagelijkse trends voor rusthartslag en HRV onder twee definities |
| **Dagelijkse activiteit** | Dagelijkse trends voor stappen, afstand, actieve calorieën en actieve minuten |
| **Lichaamsstatus** | Herstel, stress, SpO₂, HRV, ademhalingsfrequentie en rusthartslag in de tijd |
| **Trainingsstatus** | VO₂max, trainingsbelasting, lactaatdrempel, PAI, en of het recente trainingsvolume hoog of laag is |
| **Recente records** | Elke slaapsessie en elke training, elk in detail te openen |
| **Trainingsdetail** | Afstand, tempo, hartslag, splits per kilometer, GPS-track; hardlopen toont ook vermogen en loopstijl |
| **Apparaten** | Waar het model van elk apparaat vandaan komt (catalogusmatch of eigen toewijzing), firmware, meest recente data — op elk moment opnieuw toe te wijzen |
| **Datastatus** (Instellingen → Geavanceerd en onderhoud) | Ophaal-/parse-/schrijfstatus per stroom — of een gat "niet gesynchroniseerd" of "nooit gemeten" betekent |

Een meetwaarde zonder data blijft niet "—" tonen; hij verschijnt gewoon niet.
En een curve breekt overal waar meer dan 15 minuten zonder meting is verstreken,
in plaats van een rechte lijn tussen de twee uiteinden te trekken.

**Analyse na de training en weekrapport**

Na een training vergelijkt de app die met je eigen historie: recente runs in
dezelfde afstandsband, en hoe tempo, hartslag en trainingsbelasting verschillen
— plus op hoeveel samples dat berust en hoe zeker dat is. **De maatstaf ben
jij, geen populatienorm.** Bij te weinig samples zegt hij dat, in plaats van de
lat te verlagen om toch een zin te produceren. Dit zijn feiten en bewijs; de
interpretatie is aan een AI.

**Geef het aan een AI**

Er zijn meerdere ingebouwde promptsjablonen (prestatiesamenvatting,
trainingsanalyse, herstelbeoordeling, slaapanalyse). Kies een sjabloon en een
bereik, en de app pakt de data in, stript apparaatidentifiers en precieze
locaties, kopieert het naar het klembord en opent de AI-site die je koos.

De detailpagina van een training heeft een eigen "aan AI geven"-knop, beperkt
tot **precies die ene training**: de training zelf en de punt-voor-punt
meetwaarden die tijdens de training zijn vastgelegd. Dagrecords zoals slaap en
stappentelling gaan niet mee.

Pakketten groter dan 2 MB worden in plaats daarvan naar een bestand op je
bureaublad geschreven, klaar om het gesprek in te slepen.

**Exportbestanden**

- **JSON** — volledig gestructureerde data, voor scripts of modellen
- **CSV** — tabelsamenvatting voor spreadsheets
- **GPX** — standaardtracks voor Strava, Garmin en anderen

Wat een export bevat: trainingssamenvattingen (type, begin en einde, afstand,
calorieën, gemiddelde en piekhartslag, trainingsbelasting), dagelijkse
meetwaarden (stappen, rusthartslag, HRV, SpO2, stress, ademhalingsfrequentie,
PAI, VO2max) en slaapsessies met hun fasetijdlijn. Kies **Volledig** in plaats
van **Samenvatting** om per-seconde trainingsreeksen en individuele
hartslagmetingen mee te nemen.

`.fit` is een eigen exportformaat, één bestand per training, geschreven naar
een map die je zelf kiest. Het bevat de per-seconde reeksen die ZeppBridge uit
Zepps trainingsdetail heeft gedecodeerd: GPS-track, hartslag, snelheid, hoogte,
loopvermogen, grondcontacttijd en verticale oscillatie, plus ronden per
kilometer en pauzegebeurtenissen. Velden die nooit zijn gemeten ontbreken
simpelweg — er wordt niets opgevuld om het bestand er compleet uit te laten
zien. Cadans is bewust weggelaten: de eenheid ervan valt niet te rijmen met
welk samenvattingsveld we ook hebben, en een verkeerde eenheid zou stilletjes
twee keer te hoog uitlezen.

Wat een export niet bevat: `.tcx`, accountgegevens, tokens of
apparaatserienummers. GPS-tracks verschijnen in GPX en FIT, en alleen bij
trainingen die daadwerkelijk een track dragen.

**Het wordt niet zwaarder na verloop van tijd**

Ruwe cloud-payloads zijn het grootste in de lokale database. ZeppBridge slaat
ze gecomprimeerd op — alles wat nieuw synchroniseert arriveert gecomprimeerd,
en de eerste start na een update comprimeert de bestaande op de achtergrond en
geeft de schijfruimte vrij, met een voortgangsbalk bovenin het venster die
verdwijnt als het klaar is.

Voor het vervangen van een payload decomprimeert hij die weer en vergelijkt
byte voor byte; wat niet overeenkomt wordt overgeslagen: de ruwe payload is de
enige basis om lokaal opnieuw te parsen, dus niet comprimeren is altijd beter
dan verkeerd comprimeren. Een gemeten database van 211 MB kwam uit op 55 MB.

**Laat het maar draaien**

Het venster sluiten laat de app in de systeembalk, nog steeds zelfstandig
synchroniserend. Wil je niet dat hij draait, rechtermuisklik op het
systeembalkicoon en afsluiten.

**Zonder venster**

Elke release levert ook `zeppbridge-tools-<version>-<platform>.zip` met twee
programma's:

- `zeppbridge-cli` — niet-interactief: `status`, `sync`, `export`. Exitcodes
  zijn een stabiel contract, dus hij laat zich netjes plannen onder Taakbeheer
  of cron.
- `zeppbridge-mcp` — read-only MCP-server over stdio. Geen poorten, geen
  netwerk. Laat een model je lokale data bevragen zonder dat die je machine
  verlaat.

Zie [CLI en MCP](docs/reference/cli-and-mcp.md) (Engels) voor gebruik en
configuratie­voorbeelden. De MCP-sectie in Instellingen biedt ook een
tekstblok dat je zo aan een AI kunt plakken, zodat die je door de configuratie
voor jouw machine kan loodsen.

**Lokale read-only REST**

Instellingen kan een read-only endpoint inschakelen dat alleen aan `127.0.0.1`
bindt, voor je eigen scripts. Standaard uit, vereist na inschakelen een token,
geeft geen inloggegevens terug en luistert nooit op het lokale netwerk.

## Wat is er veranderd

Wijzigingen per versie staan in [CHANGELOG.md](CHANGELOG.md). Wanneer
Instellingen → Software-update → Controleren op updates een nieuwe versie
vindt, toont hij ook meteen de release-notes en rapporteert hij voortgang
tijdens het downloaden.

## Veelgestelde vragen

**Moet mijn computer aan blijven?**
Nee. Elke start haalt de gemiste periode in.

**Kan ik de Zepp-telefoonapp vaarwel zeggen?**
Nee. De keten is: horloge → Zepp-app op je telefoon → Zepp-cloud → ZeppBridge.
Je horloge heeft de telefoonapp nog nodig om te uploaden. Open hem af en toe.

**Kan dit mijn account laten blokkeren?**
ZeppBridge gebruikt je eigen inloggegevens en **stuurt uitsluitend
leesverzoeken** — er zit nergens in het project ook maar één schrijfverzoek;
je kunt er met grep naar zoeken. Gedragsmatig is het hetzelfde als de
officiële app openen om naar je data te kijken. Het blijft een onofficieel
gebruik, en wij kunnen namens Zepp geen garanties geven.

**Een meetwaarde kwam leeg terug.**
Controleer eerst of je horloge het überhaupt heeft gemeten. Sommige meetwaarden
(lactaatdrempel, VO₂max) worden alleen bijgewerkt na specifieke trainingen,
een paar keer per jaar. De instellingenpagina rapporteert ze stuk voor stuk
voor jouw account — let op: **"niet opgehaald" is niet hetzelfde als "je
horloge ondersteunt het niet"**: Zepps API geeft een leeg antwoord zowel voor
data die niet bestaat als voor stroomnamen die nooit geldig waren, dus leegte
alleen bewijst niets.

**Waar staat mijn data?**
- **Windows**: een `data`-map naast de installatiemap (niet `%APPDATA%`).
  Instellingen → Geavanceerd heeft een knop om hem te openen.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux**: `~/.local/share/zeppbridge/data` (Flatpak:
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Een AppImage of een
  uitgepakte tarball houdt `data/` naast het uitvoerbare bestand — zie de
  [Linux-gids](docs/guides/linux.md) (Engels).

**De app start niet — er verschijnt nooit een venster.**
Twee dingen om te bekijken, in deze volgorde:

1. **De foutdialoog.** Vanaf v2.1.2 toont een startfout een dialoog die de
   exacte map en de OS-fout noemt, in plaats van stilletjes af te sluiten.
   Eerdere versies sloten af zonder een woord, wat eruitzag als "het
   systeembalkicoon staat er, maar klikken op Openen doet niets" — dat icoon
   was een restant van een proces dat al weg was.
2. **Het log.** `logs/zeppbridge.log` in de datamap (zie de vorige vraag), plus
   `logs/startup-error.log` als de laatste start faalde voordat het venster er
   was. Voeg ze toe aan een bugmelding; ze bevatten paden en versienummers,
   geen accountdata.

De meest voorkomende oorzaak op Windows is een datamap waarin de app niet kan
schrijven — de `.msi` installeert in `Program Files`, waar een standaard-
gebruiker geen schrijfrechten heeft. Vanaf v2.1.2 valt de app dan terug op
`%APPDATA%\zeppbridge\ZeppBridge\data` (tenzij er al een database in de
geblokkeerde map staat — dan zegt hij dat, in plaats van stilletjes met een
lege te starten). Je kunt hem ook overal naartoe wijzen met de
omgevingsvariabele `ZEPPBRIDGE_DATA_DIR`.

**Is mijn data er nog na deïnstallatie?**
Ja. Deïnstalleren laat de `data`-map, back-ups, het dekkingsregister en je
instellingen met rust. Verwijder hem handmatig als je hem kwijt wilt.

**Kan ik de database back-uppen en terugzetten?**
Ja. Instellingen kan op elk moment een snapshot van de hele database maken,
elk met een SHA-256 en een integriteitscontrole. Terugzetten wordt in een
wachtrij gezet en uitgevoerd bij de volgende start — het enige moment waarop
een bestand atomair vervangen kan worden — en de wachtrijstap toont eerst een
diff van het aantal records. Zie [back-up en terugzetten](docs/guides/backup-and-restore.md)
(Engels).

**Ik heb meer dan één horloge — raken de gegevens vermengd?**
Nee. Elk record draagt bij welk apparaat het vandaan kwam, en de interface
houdt ze uit elkaar.

**Wordt er iets naar jullie servers gestuurd?**
Gezondheidsdata, trainingsdetails en inloggegevens verlaten je machine nooit.
Alleen als je uitdrukkelijk "een foutrapport indienen" bevestigt, stuurt de app
app-/parserversies, besturingssysteem, veilige modelhints en veldstructuur voor
niet-herkende producten, firmwareversie, onbekende trainingscodes met
aantallen, en de numerieke foutcode van het meest recente verzoek dat de
Zepp-cloud weigerde (het nummer, welke datastroom en wanneer — nooit tekst die
de cloud terugstuurde). Hij stuurt nooit accounts, tokens, serienummers,
apparaat-ID's, GPS, gezondheidswaarden, ruwe antwoorden of lokale paden. Er is
geen automatische telemetrie en geen crashrapportage op de achtergrond.

## Privacy

- **Inloggegevens** gebruiken standaard de referentieopslag van het OS
  (Windows Credential Manager / macOS Keychain / Linux Secret Service). Kan je
  macOS-keychain niet worden ontgrendeld, dan kun je expliciet een privé-
  platte-tekstbestand kiezen; zie de
  [gids voor macOS-referentieopslag](docs/guides/macos-credentials.md)
  (Engels). Linux ondersteunt ook bestands- en omgevingsvariabeleopslag; zie de
  [Linux-gids](docs/guides/linux.md) (Engels). Bestandsopslag beschermt minder
  dan de systeemopslag en wordt nooit ingeschakeld alleen omdat die faalt.
- **Gezondheidsdata** is een onversleuteld databasebestand op je computer.
  Deel je de machine, gebruik dan aparte OS-accounts.
- **AI-pakketten worden eerst geanonimiseerd**: apparaatidentifiers,
  MAC-adressen en precieze GPS worden gestript, en het bestand somt op wat er
  is verwijderd. Precieze tracks worden alleen meegenomen als je daar zelf voor
  kiest.
- **Kaarten renderen lokaal.** Er gaan geen verzoeken naar kaartdiensten van
  derden.
- **Foutrapporten vereisen expliciete bevestiging**, gebruiken een vaste
  toelatingslijst, worden lokaal gebouwd, vereisen geen GitHub-account en
  worden nooit automatisch als issue gepubliceerd.
- Synchroniseren raakt Zepps servers, dus dit is geen volledig offline
  applicatie.

Zie [beveiliging en privacy](docs/reference/security-and-privacy.md) (Engels).
Meld beveiligingsproblemen via GitHubs privé-kanaal voor kwetsbaarheden, niet
in een publieke issue.

## Voor ontwikkelaars

Tauri 2 + Vue 3 + Rust. De kern leeft in de `zeppbridge-core`-crate; de
desktopapp, CLI, MCP-server en lokale REST-endpoint zijn allemaal dunne
adapters eroverheen — SQL, eenheidconversie en regels voor ontbrekende waarden
worden nooit gedupliceerd.

```bash
npm ci
npm run tauri dev
```

- [Development](docs/development/development.md) (Engels) — build-gates,
  commandcontracten, lokale REST-API, acceptatievolgorde
- [Architecture](docs/reference/architecture.md) (Engels) — productgrenzen,
  Zepp-API-mapping, lijst geverifieerd vs ongeverifieerd
- [CLI en MCP](docs/reference/cli-and-mcp.md) (Engels) — exitcode-contract,
  read-only tools, planvoorbeelden
- [Back-up en terugzetten](docs/guides/backup-and-restore.md) (Engels) —
  snapshots, terugzetflow, dekkingsregister
- [Linux](docs/guides/linux.md) (Engels) — Flatpak, deb/rpm/AppImage,
  datalocaties, referentieopslag
- [macOS-referentieopslag](docs/guides/macos-credentials.md) (Engels) —
  bestandsopslag gebruiken als de login-keychain niet beschikbaar is
- [Docker](docs/guides/docker.md) (Engels) — headless CLI/MCP-image, planning,
  reproduceerbare builds
- [UI-richtlijnen](docs/development/ui-guidelines.md) (Engels) — designtokens,
  paginastructuur, componenten

De gelinkte documentatie is beschikbaar in het Engels en vereenvoudigd Chinees;
elke pagina linkt naar zijn tegenhanger. Issues en PR's zijn welkom in elk van
de tien talen. Lees voor je iets wijzigt de "unverified"-lijst in het
architectuurdocument — dit project heeft een expliciete standaard voor wat als
vastgesteld feit geldt.

## Met dank aan

Zepps API is niet gedocumenteerd; of een datastroom überhaupt bestaat is alleen
te weten via mensen die het al aan de praat hebben. De API-mapping steunt op:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) —
  indeling van het eventoppervlak en veldwaarden
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — een onafhankelijke
  reproductie van dezelfde API's, nuttig als kruisvalidatie
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)
  (Apache-2.0) — decodering van trainingsdetails

Geen van hen wordt meegeleverd; ZeppBridge steunt op de API-feiten die zij
hebben vastgelegd.

## Licentie

[MIT-licentie](LICENSE).

De distributie bevat materiaal van derden, met naamsvermelding in
[NOTICE](NOTICE): MiSans (Xiaomi, naamsvermelding vereist — vermeld op de
instellingenpagina), Inter (SIL OFL 1.1), en het hierboven genoemde
decodeeralgoritme (Apache-2.0).

Zepp, Amazfit en verwante merken behoren toe aan hun respectievelijke
eigenaren.
