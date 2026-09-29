import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Je Zepp-gegevens op je eigen computer',
    description: 'ZeppBridge is een lokale, open-source brug voor Amazfit- en Zepp-gegevens. Draait op je eigen Windows, Mac of Linux.',
    ogTitle: 'ZeppBridge · Je Zepp-gegevens, terug in eigen hand',
    ogDescription: 'Synchroniseer, bekijk en orden je Amazfit-gegevens op je eigen computer. Geef ze met één klik aan een AI.',
  },
  copy: {
    nav: { home: 'ZeppBridge home', site: 'Sitenavigatie', connect: 'Verbinden', motion: 'Interface', handoff: 'Naar de AI', privacy: 'Privacy', star: 'GitHub', language: 'Taal' },
    downloads: {
      windows: { label: 'Downloaden voor Windows', hint: 'x64-installer', msi: 'Grootschalig uitrollen: download de MSI' },
      macos: { label: 'Downloaden voor macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimenteel', note: 'deb, rpm, AppImage en Flatpak komen uit de CI, maar nog niemand heeft inloggen en de sleutelbos volledig getest op een echte Linux-desktop. Loop je ergens tegenaan, open dan een issue.' },
      status: { loading: 'Nieuwste installer opzoeken', ready: 'Klik om direct te downloaden', fallback: 'Nu geen directe link, de release op GitHub wordt geopend' },
    },
    hero: {
      headlineLead: 'Je Zepp-gegevens,',
      headlineAccent: 'terug in eigen hand.',
      lead: 'Synchroniseer, bekijk en orden je Amazfit-gegevens op je eigen computer. Geef ze met één klik aan een AI.',
      github: 'Bekijk op GitHub',
      starNudge: { title: 'De download is gestart', copy: 'Heb je iets aan ZeppBridge? Een ster op GitHub helpt andere Amazfit-gebruikers het te vinden.', action: 'Geef een ster', dismiss: 'Nu niet' },
    },
    demo: {
      label: 'Interactieve demo van het ZeppBridge-overzicht',
      sample: 'Voorbeeldgegevens',
      hint: 'Tik op een kaart',
      back: 'Terug',
      greeting: 'Overzicht',
      heart: { title: 'Hartslag', unit: 'bpm', detail: 'Per minuut, de hele dag. Minuten zonder horloge blijven leeg in plaats van nul te worden.' },
      steps: { title: 'Stappen vandaag', unit: 'stappen', detail: 'Stappen per uur komen uit de officiële Zepp-autorisatie en worden alleen met je eigen geschiedenis vergeleken.' },
      sleep: { title: 'Afgelopen nacht', hours: 'u', minutes: 'min', detail: 'Diep, licht, REM en wakker op volgorde. De door Zepp gemeten REM gaat voor.' },
    },
    devicesLabel: 'Ondersteunde Amazfit-apparaten',
    connect: {
      heading: 'Drie manieren om te verbinden. Kies de makkelijkste.',
      lead: 'Begin met de officiële autorisatie en voeg geavanceerde gegevens toe voor meer waarden. Werkt geen van beide, dan is er handmatige invoer.',
      recommended: 'Aanbevolen',
      paths: [
        { icon: 'verified', title: 'Officiële Zepp-autorisatie', copy: 'Log in bij Zepp in je gewone browser en keur goed.', detail: 'Google-, Xiaomi- en Apple-accounts werken. Slaap, hartslag, stappen, trainingen, PAI en gewicht worden gesynchroniseerd.' },
        { icon: 'zepp-cloud', title: 'Geavanceerde gegevens', copy: 'Voegt HRV, zuurstofsaturatie, stress en paraatheid toe die de officiële API niet biedt.', detail: 'Inloggen met e-mail of telefoon. Het token staat alleen in de referentiekluis van het systeem.' },
        { icon: 'manual-entry', title: 'Handmatige invoer', copy: 'Een terugvaloptie als de andere twee niet lukken.', detail: 'Plak zelf een token. Bedoeld voor wie de API kent.' },
      ],
    },
    deck: {
      heading: 'Instellingen als een stapel kaarten, niet als een muur van formulieren',
      lead: 'Beweeg eroverheen en ze waaieren uit. Klik er een aan om hem eruit te trekken.',
      hint: 'Beweeg erover om uit te waaieren, klik om te openen',
      close: 'Terugleggen',
      cards: [
        { icon: 'profile', title: 'Account en apparaten', copy: 'Officiële autorisatie en geavanceerde gegevens hebben elk een eigen rij, zodat je altijd ziet welk account verbonden is.' },
        { icon: 'auto-sync', title: 'Synchronisatie en updates', copy: 'Synchroniseert bij het opstarten en daarna stil volgens jouw schema.' },
        { icon: 'database', title: 'Archief en opslag', copy: 'Jij bepaalt hoe lang gegevens blijven. Snapshots zet je altijd terug.' },
        { icon: 'structured-data', title: 'Gegevensgezondheid', copy: 'Of elke stroom is opgehaald, begrepen en weggeschreven, apart getoond.' },
        { icon: 'secure', title: 'Privacy en beveiliging', copy: 'De lokale alleen-lezen-API staat standaard uit en luistert alleen op 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Sleep naar de AI waar je naar wilt vragen',
      lead: 'Sleep een waarde en de buren schuiven opzij. Laat hem in het midden los en hij gaat mee in het pakket voor de AI.',
      hint: 'Sleep een knooppunt naar het midden',
      center: 'Naar de AI',
      nodes: ['Hartslag', 'Slaap', 'HRV', 'Stappen', 'Belasting', 'PAI', 'Gewicht', 'Stress'],
      picked: '{n} gekozen',
      reset: 'Opnieuw',
    },
    privacy: {
      heading: 'Je gegevens blijven op je computer',
      lead: 'ZeppBridge heeft geen eigen server die je gezondheidsgegevens bewaart.',
      points: [
        { icon: 'secure', title: 'Tokens in de systeemsleutelbos', copy: 'Standaard in Windows Referentiebeheer of de macOS-sleutelhanger, niet in de gegevensmap.' },
        { icon: 'private', title: 'Geen telemetrie', copy: 'Geen gebruiksrapporten. Er worden geen gezondheidsgegevens verzameld.' },
        { icon: 'database', title: 'Duidelijke herkomst', copy: 'Elk record weet of het uit de officiële autorisatie of uit de geavanceerde gegevens komt.' },
        { icon: 'ai-ready', title: 'Jij bepaalt wat de AI ziet', copy: 'Wat, hoeveel en wanneer. Helemaal aan jou.' },
      ],
    },
    footer: {
      heading: 'Gratis, open source, klaar om te installeren',
      tagline: 'Een lokale brug voor Amazfit- en Zepp-gegevens.',
      disclaimer: 'ZeppBridge is een onafhankelijk open-sourceproject, niet verbonden aan Zepp Health of Amazfit.',
      download: 'Downloaden',
    },
  },
};

export default pack;
