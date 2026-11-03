/** Nederlandse P4-landingspagina-teksten. Identieke structuur als zh / en in p4Copy.ts. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Ontwerp', title: 'Liefde op het eerste gezicht.', lead: 'Navigatie van glas, kaarten die transformeren in pagina’s en dagen die je openvouwt als een kaartspel.', points: [
      { id: 'glass', title: 'Glas', text: 'Houd ingedrukt en sleep langzaam over de navigatie, tik om te wisselen. De breking volgt je vinger.', scene: 'glass' },
      { id: 'morph', title: 'Transformatie', text: 'Een kaart vouwt open tot een pagina en keert bij teruggaan netjes terug. Eén ding scherp, de rest vervaagt.', scene: 'morph' },
      { id: 'poker', title: 'Kaarttafel', text: 'Blader door dagkaarten, spreid hele weken en maanden uit. Bewaar de mooiste momenten in de verzameldoos.', scene: 'poker' },
      { id: 'theme', title: 'Dag en nacht', text: 'Licht en donker thema. Eén tik en de nacht valt in.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Verbinding', title: 'Je gegevens uit de cloud, terug op je bureau.', lead: 'Koppel je Zepp-account en je records synchroniseren naar deze computer. Kies een frequentie en laat automatische synchronisatie het werk doen.', points: [
      { id: 'account', title: 'Officiële login', text: 'Log in bij Zepp in je systeembrowser; accounts via Google, Apple, Xiaomi of Facebook werken ook. Controleer de autorisatiestatus wanneer je maar wilt.', scene: 'account' },
      { id: 'sync', title: 'Automatische synchronisatie', text: 'Uit, 15, 30 of 60 minuten. Jij slaapt, je gegevens synchroniseren.', scene: 'sync' },
      { id: 'devices', title: 'Herkent je horloge', text: 'Modellen worden automatisch herkend. Klopt het niet, wijs dan zelf het juiste model aan.', scene: 'devices' },
      { id: 'local', title: 'Blijft op deze computer', text: 'Gezondheidsrecords van Zepp blijven lokaal en passeren nooit onze servers. Jij bepaalt wat er naar AI gaat.', scene: 'local' },
    ] },
    { id: 'records', name: 'Inzicht', title: 'Tientallen meetwaarden in één oogopslag.', lead: 'Alle trends op één pagina zodat je direct ziet hoe je lichaam ervoor staat. Open een meetwaarde voor de volledige geschiedenis.', points: [
      { id: 'overview', title: 'Jouw volgorde', text: 'Slaap of training eerst: de startpagina volgt wat jij belangrijk vindt. Scroll en open de details.', scene: 'overview' },
      { id: 'normal', title: 'Jouw normale bereik', text: 'De lijn onder elke meetwaarde is je eigen gebruikelijke bereik, niet dat van iemand anders. Tik op “?” om te zien waar het vandaan komt.', scene: 'normal' },
      { id: 'workouts', title: 'Elke loop heeft een echo', text: 'Vergelijk elke training met eerdere runs van vergelijkbare afstand: hartslag, tempo en route.', scene: 'workouts' },
      { id: 'gaps', title: 'Niets verzonnen', text: 'Geen meting betekent een leeg vak. Geen neppe nullen, herhaalde waarden of vage schattingen.', scene: 'gaps' },
    ] },
    { id: 'journal', name: 'Archief', title: 'Elke sessie telt.', lead: 'Jaarringen, je logboek, hoe elke workout voelde en brieven van de maker, allemaal bewaard op deze computer.', points: [
      { id: 'rings', title: 'Jaarringen', text: 'Eén ring per jaar. De weken waarin je meer trainde groeien breder.', scene: 'rings' },
      { id: 'journal', title: 'Logboek', text: 'Persoonlijke records, aftellen naar wedstrijden en een medaillemuur. Hardloopschoenen herinneren je eraan wanneer ze hun afstand hebben bereikt.', scene: 'journal' },
      { id: 'feel', title: 'Na de workout', text: 'Beoordeel de sessie, geef aan waar het pijn doet en noteer welke schoenen je droeg.', scene: 'feel' },
      { id: 'import', title: 'Importeren en opruimen', text: 'Importeer GPX-, FIT- en Strava-bestanden. Selecteer er meerdere om het type te wijzigen of ze tegelijk te verbergen.', scene: 'import' },
      { id: 'letters', title: 'Brievenbus', text: 'Een brief van de maker bij elke release. Antwoord en de maker leest en schrijft terug. Plus elke week een brief over je gegevens.', scene: 'letters' },
    ] },
    { id: 'ai', name: 'Naar AI', title: 'Gebruik je vertrouwde abonnementen. Zonder meerkosten.', lead: 'Kies de gewenste dagen: je gegevens worden één bestand. Geef het aan je favoriete AI, praat verder en haal het trainingsplan terug.', points: [
      { id: 'providers', title: 'Zeven modellen', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao en Grok. Gebruik je bestaande accounts en bundels.', scene: 'ai' },
      { id: 'prompt', title: 'Vraag wat je wilt', text: 'Pas de standaardsuggestie aan of schrijf je eigen vraag.', scene: 'prompt' },
      { id: 'events', title: 'Context telt', text: 'Noteer een verkoudheid, reis of drukke werkweek zodat de AI pieken en dalen begrijpt.', scene: 'events' },
      { id: 'autopaste', title: 'Volautomatisch · Windows', text: 'Plakt en verstuurt voor je na controle van het actieve venster. Standaard uitgeschakeld.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Trainingsplan', title: 'Finishen op je pc. Trainen met je horloge.', lead: 'Deel je gevoel met de AI en die plant je week. Terugplakken, finetunen tot het klopt en direct naar je horloge sturen.', points: [
      { id: 'receive', title: 'Plakken in één klik', text: 'Van gesprek naar concept: kopieer terug en je weekplan staat klaar.', scene: 'receive' },
      { id: 'edit', title: 'Jouw schema', text: 'Sleep om twee dagen te wisselen, open elke dag en pas duur en intensiteit stap voor stap aan. Houd ingedrukt om het naar het horloge te sturen.', scene: 'plan-edit' },
      { id: 'templates', title: 'Sjablonen en import', text: 'Sla op als sjabloon om opnieuw te trainen. Ondersteunt ook .zwo- en workout-.fit-bestanden.', scene: 'templates' },
      { id: 'easy', title: 'Vermoeide dag', text: 'Staan er intervallen op het menu maar is je herstel laag? Wissel met één tik naar een rustige training. Jij bevestigt voor verzending.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Slaap', text: 'Van de fases van één nacht tot de afgelopen zeven dagen. Open en ontdek.' },
    workouts: { title: 'Trainingen', text: 'Bekijk de hele sessie en zie het verschil met eerdere trainingen.' },
  },
  settings: {
    title: 'Instellingen',
    lead: 'Blader één voor één door de grote kaarten; de kleine stapelen netjes op als een portefeuille. Account, synchronisatie, weergave en beheer binnen handbereik.',
    summaryTitle: 'Alle details wonen in Instellingen.',
    summaryLead: 'Vijftien veelgebruikte instellingen netjes in één stapel kaarten.',
    items: [
      { id: 'sync', title: 'Automatische synchronisatie', text: 'Uit, 15, 30 of 60 minuten. Eén instelling volstaat.', icon: 'auto-sync' },
      { id: 'retention', title: 'Tien jaar, hier bewaard', text: 'Haal tot tien jaar geschiedenis naar deze computer en bewaar die. Hij verdwijnt niet samen met het venster van de cloud.', icon: 'database' },
      { id: 'data', title: 'Gegevensbereik', text: 'Wat wel en niet gesynchroniseerd kan worden, glashelder op een rij.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Lokale tools zoals Claude Code en Codex vragen direct data op. Plannen publiceren vereist toestemming.', icon: 'structured-data' },
      { id: 'formats', title: 'Vier formaten', text: 'JSON · CSV · GPX, plus FIT op de trainingspagina.', icon: 'document' },
      { id: 'units', title: 'Eenheden', text: 'Kilometers of mijlen. Afstand en tempo wisselen samen.', icon: 'settings' },
      { id: 'time', title: 'Tijdweergave', text: 'Volgens je regio, of kies 12- of 24-uursnotatie.', icon: 'auto-sync' },
      { id: 'date', title: 'Datumnotatie', text: 'Dag, maand en jaar in de volgorde die je gewend bent.', icon: 'document' },
      { id: 'scale', title: 'Interfaceschaal', text: 'Maak het hele venster groter of kleiner naar wens.', icon: 'overview' },
      { id: 'backup', title: 'Momentopname en herstel', text: 'Maak back-ups van de database en herstel wanneer gewenst.', icon: 'database' },
      { id: 'api', title: 'Lokale API', text: 'Alleen gebonden aan 127.0.0.1. Alleen-lezen, beveiligd met token.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacy en beveiliging', text: 'Inloggegevens beschermd door het besturingssysteem. Tokens komen nooit in logs.', icon: 'browser-login' },
      { id: 'filename', title: 'Bestandsnamen', text: 'Bepaal zelf hoe geëxporteerde AI-bestanden heten.', icon: 'document' },
      { id: 'folder', title: 'Altijd mee te nemen', text: 'Je gegevens staan in een map op deze computer, en alles wat je hier hebt geschreven — beoordelingen, plannen, AI-taken — exporteer je naar één JSON-bestand.', icon: 'database' },
      { id: 'language', title: 'Dertien talen', text: 'Vereenvoudigd en traditioneel Chinees, Engels, Spaans en meer. Wissel wanneer je maar wilt.', icon: 'profile' },
    ],
  },
  nav: [
    { label: 'Maak kennis met ZeppBridge', links: [{ id: 'motion', label: 'Ontwerp' }, { id: 'connection', label: 'Verbinding' }, { id: 'records', label: 'Inzicht' }, { id: 'journal', label: 'Archief' }] },
    { label: 'Van data naar actie', links: [{ id: 'ai', label: 'Naar AI' }, { id: 'ai-plan', label: 'Trainingsplan' }, { id: 'record-sleep', label: 'Slaap en training' }] },
    { label: 'Op jouw manier', links: [{ id: 'connect', label: 'Instellingen' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'Lokale API' }] },
  ],
  demoPrompt: 'Volgende week woensdag geen tijd. Bewaar één intervalsessie, plan de rest rustig.',
};

export default pack;
