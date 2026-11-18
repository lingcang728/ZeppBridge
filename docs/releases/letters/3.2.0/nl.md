Aan alle vrienden van ZeppBridge,

Hallo, ik ben Lingcang.

Dit is een grote update. Aan het begin van deze brief wil ik eerst drie bijdragers bedanken: felipepmdias, Jax Tsai en andrejd1.

Dankzij het werk van felipepmdias aan het ontcijferen van Zepps krachttrainingsgegevens ondersteunt de nieuwe versie eindelijk details per set en een spierkaart van het lichaam, waardoor krachttraining in ZeppBridge echt prettig werkt. Jax Tsai en andrejd1 hebben me geholpen de prestaties op Linux te verbeteren. Ik heb zelf geen Linux-apparaat, dus al deze verbeteringen zijn stukje bij beetje op hun eigen computers getest. Zonder hen had ik veel dingen niet in mijn eentje kunnen doen. Dank jullie wel, en ook dank aan alle Linux-gebruikers die geduldig feedback zijn blijven sturen.

In de twee weken zonder nieuwe release heb ik meer brieven ontvangen dan ooit tevoren. Dank aan iedereen die me schreef om me aan te moedigen, mijn hart te verwarmen of allerlei prachtige ideeën te delen. Ik heb nog nooit zoveel penvrienden gehad.

Sommigen zeiden dat ze de Brievenbus niet konden vinden, dus heb ik rechtsboven een brievenknop toegevoegd: tik erop om te schrijven, houd hem ingedrukt om de Brievenbus te openen, en er licht een klein rood stipje op wanneer er een nieuw antwoord is. Merk je tijdens het gebruik iets dat niet prettig aanvoelt, schrijf me dan gerust en wees niet bang dat je me stoort. Alleen al het ontvangen van jullie brieven maakt me oprecht blij.

Vervolgens wil ik het graag hebben over de drie dingen in deze update die me het meest bezighouden. Ze hebben het grootste deel van mijn afgelopen twee weken in beslag genomen, en over sommige aanpassingen heb ik lang nagedacht en keer op keer geaarzeld.

**Over cloud Personal Agents**

De laatste tijd heb ik cloud-persoonlijke assistenten zoals Muse en Hark uitgeprobeerd. Hoe meer ik ze gebruik, hoe sterker ik het gevoel krijg dat ze onze manier van leven kunnen veranderen, net zoals Coding Agents nu softwareontwikkeling veranderen.

Laat ik delen hoe mijn afgelopen twee weken eruitzagen.

Ik heb ZeppBridge gekoppeld aan mijn eigen persoonlijke website, zodat Hark voortdurend mijn gezondheidsgegevens kan ontvangen. Elke ochtend als ik opsta, hoef ik alleen maar Zepp te openen om de slaap van vannacht te synchroniseren. Tegen de tijd dat ik mijn tanden heb gepoetst en mijn gezicht heb gewassen, heeft Hark mijn slaapkwaliteit en herstel al samengevat en een trainingsadvies voor die dag gegeven.

Op weg naar huis na een rondje hardlopen gaat het net zo. Even synchroniseren, en ik krijg meteen een analyse van die lange duurloop: of mijn hartslag te hoog opliep, of ik in de tweede helft ben ingezakt en of mijn cadans merkbaar veranderde. Wil ik mijn trainingsschema verder bijsturen, dan kan ik thuis achter de computer via ‘Naar de AI’ in ZeppBridge rustig verder overleggen met GPT of Claude.

Dit kon allemaal eerder ook al, maar toen moest ik er zelf aan denken, zelf de gegevens bij elkaar zoeken en zelf het gesprek beginnen. Een Personal Agent neemt me juist de stap uit handen die je het makkelijkst overslaat: beginnen.

Die ervaring gaf de doorslag om het naar de gebruikers van ZeppBridge te brengen. Want als ik er zelf al zo blij van word, waarom zou ik het niet iedereen laten proberen?

Toch heb ik lang geaarzeld. Vanaf het begin heeft ZeppBridge beloofd dat lokale gegevensopslag centraal staat, en een cloudassistent doorlopend toegang geven tot je gezondheidsgegevens vraagt duidelijk om extra zorgvuldigheid.

Daarom staat deze functie standaard uit. Zolang je haar niet zelf inschakelt, zal ZeppBridge via deze weg nooit gegevens naar externe diensten sturen en verandert er niets aan hoe je de app nu gebruikt.

En zelfs als je ervoor kiest om haar aan te zetten, moet je je eigen site voorbereiden, een roteerbare toegangssleutel instellen en koppelen met je persoonlijke assistent. Het is misschien niet voor iedereen, maar als je het wilt proberen, raad ik het van harte aan.

Ik geloof er steeds meer in dat persoonlijke assistenten die proactief met je meedenken, je begrijpen en op het juiste moment helpen, onderdeel zullen worden van ons dagelijks leven.

**Stage Manager naar de workoutdetails brengen**

Dit hield me al bezig sinds 3.0.0.

Ik heb de kaarten op bijna elk scherm opnieuw ontworpen, maar de pagina met workoutdetails bleef maar liggen. Gebruikers van het eerste uur herinneren zich misschien nog dat die grotendeels op het ontwerp van 1.0.0 was blijven steken: vaste posities en vaste formaten, zonder vrijheid om kaarten aan te passen of te combineren.

Tot ik de afgelopen twee weken bij het uitproberen van iPadOS 27 toevallig Stage Manager opende en ineens een idee kreeg.

Wat ik het mooist vind aan Stage Manager, is dat het elk venster een eigen ruimte geeft. Je kunt het verplaatsen, schalen en de verhouding tot andere vensters opnieuw indelen. Dus dacht ik: waarom zouden de kaarten van ZeppBridge niet dezelfde vrijheid kunnen hebben?

Met dat idee heb ik de hele pagina voor workoutdetails opnieuw ontworpen en geprobeerd de interactie van Stage Manager erin te verwerken.

Nu kun je hartslag, tempo en je hardlooproute naast elkaar op één scherm zetten en je prestatie punt voor punt analyseren. Je kunt ook een moment in een grafiek aanwijzen en op de kaart zien waar je toen was, om te begrijpen hoe je lichamelijke prestatie samenhangt met de omgeving. Bij krachttraining kun je zelfs de spierkaart en je sets naast elkaar zetten en in één oogopslag zien welke spiergroepen elke set heeft aangesproken.

Ik hoop dat iedereen de gegevens die er echt toe doen op zijn eigen manier kan ordenen.

En welke leuke combinaties er verder nog mogelijk zijn, laat ik graag aan jullie om zelf te ontdekken.

**De ZeppBridge CLI opnieuw bijschaven**

Naast het bekende ‘Naar de AI’ heeft ZeppBridge eigenlijk ook al MCP en een CLI ingebouwd, zodat AI-tools rechtstreeks bij je lokale gegevens kunnen zonder dat je iets extra’s hoeft te downloaden of te installeren.

Eerlijk gezegd was dat deel vroeger nogal ruw afgewerkt. Pas toen ik onlangs een uitnodiging kreeg van de maker van SparkyFitness, keek ik er weer eens serieus naar wat het eigenlijk waard is.

Deze keer heb ik vooral twee dingen gedaan.

Ten eerste kan de AI nu van ‘alleen kijken’ naar ‘helpen bijhouden’ gaan.

Je kunt een aan ZeppBridge gekoppelde AI nu vragen om blessures, wedstrijden, hardloopschoenen en je trainingsgevoel vast te leggen, of om een verkeerd herkend sporttype te corrigeren. Je hoeft bijvoorbeeld alleen maar te zeggen: ‘Ik had gisteren na het hardlopen wat last van mijn linkerknie’, en de AI noteert het voor je.

Omdat het misschien wat onwennig voelt om een AI je eigen gegevens te laten aanpassen, verschijnt elke door AI vastgelegde wijziging onder ‘Recente AI-wijzigingen’ in Instellingen en kun je alles op elk moment ongedaan maken. De AI heeft geen rechten om gegevens te verwijderen. Wil je liever dat de AI alleen de gegevens leest die jij zelf hebt uitgekozen, dan kun je ‘Alleen gedeelde taken’ inschakelen: dat beperkt de toegang tot gedeelde inhoud en schakelt schrijven volledig uit.

Daarnaast kun je de AI rechtstreeks gegevens laten synchroniseren en bestanden laten exporteren. Bij de tools die met één klik te verbinden zijn, zijn OpenCode, Grok Build en Factory toegevoegd. Is er nog een tool die je graag gebruikt en die nog niet wordt ondersteund, schrijf me dan gerust.

Ten tweede kan ZeppBridge nu gegevens delen met andere zelfgehoste apps.

SparkyFitness is een open-source, zelfgehoste app voor het bijhouden van gezondheid. Door deze samenwerking besefte ik dat ZeppBridge een brug kan slaan tussen Zepp-gegevens en andere gezondheidsapps.

Daarom heb ik een permanente modus aan de CLI toegevoegd. Je kunt die op je NAS of een thuisservertje draaien, zodat andere apps gegevens zoals slaap, hartslag, trainingen en gewicht kunnen uitlezen.

Deze dienst biedt uitsluitend alleen-lezen toegang, vereist een sleutel om te verbinden en die sleutel kun je altijd weer intrekken. Standaard accepteert hij alleen verbindingen vanaf dezelfde computer en worden trainingsroutes niet gedeeld. Hij start nooit uit zichzelf op; heb je dit niet nodig, dan kun je het gerust negeren.

Aan de kant van ZeppBridge is het werk nu af; SparkyFitness heeft nog wat tijd nodig voor de aansluiting, dus de koppeling tussen beide is nog niet direct te gebruiken. Nog even geduld alstublieft.

Nu ik dit zo opschrijf, begin ik me weer af te vragen: hoe ziet de toekomst van ZeppBridge eruit?

Misschien ligt mijn kracht nog steeds vooral in het beantwoorden van jullie wensen, het oplossen van kleine maar echte problemen, en zo nu en dan een nieuwe animatie toevoegen om de software net wat leuker te maken.

Maar zouden we verder kunnen gaan, en dingen bouwen die we ons vandaag nog niet eens kunnen voorstellen?

Ik weet het niet. Voor nu heb ik in elk geval veel ideeën die ooit alleen in mijn hoofd bestonden in deze app weten te brengen. De rest vraagt misschien nog wat tijd, en ook dat ik naar jullie verhalen blijf luisteren.

Dit is ZeppBridge 3.2.0.

De winter ziet er overal ter wereld anders uit. Misschien dwarrelt er buiten je raam al sneeuw terwijl je deze brief leest.

Ik ben opgegroeid in het zuiden van China en heb nauwelijks sneeuw gezien. Ooit zag ik foto’s van een fotograaf uit Aomori in Japan: dikke pakken sneeuw op de huizen, met hoge sneeuwmuren langs beide kanten van de weg. Zo’n winter voelt voor mij heel ver weg.

Een echte open haard heb ik ook nooit gezien. Soms stel ik me voor dat ik op een dag bij een warm haardvuur zit, met buiten wervelende sneeuw en jullie brieven naast me, rustig lezend terwijl ik toekijk hoe een Agent de dingen waar ik ooit alleen maar van kon dromen stukje bij beetje werkelijkheid maakt.

Misschien is dat wel het leven waarnaar ik verlang.

Ik wens jullie allemaal een goede gezondheid en een fijne winter!

— Lingcang
