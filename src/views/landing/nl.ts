import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Je Zepp-gegevens op je eigen computer',
    description: 'ZeppBridge is een local-first, open-source brug voor Amazfit- en Zepp-gegevens. Draait op je eigen computer met Windows, macOS of Linux.',
    ogTitle: 'ZeppBridge · Je Zepp-gegevens, terug in eigen hand',
    ogDescription: 'Synchroniseer, bekijk en beheer je Amazfit-gegevens lokaal. Met één klik klaar voor AI.',
  },
  copy: {
    nav: { home: 'ZeppBridge home', site: 'Sitenavigatie', connect: 'Verbinden', motion: 'Interface', handoff: 'Naar de AI', privacy: 'Privacy', star: 'GitHub', language: 'Taal' },
    downloads: {
      windows: { label: 'Downloaden voor Windows', hint: 'x64-installer', msi: 'Grootschalig uitrollen? Download de MSI' },
      macos: { label: 'Downloaden voor macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimenteel', note: 'deb, rpm, AppImage en Flatpak komen uit de CI, maar inloggen en sleutelbosbeheer zijn nog niet op echte Linux-desktops getest. Loop je ergens tegenaan, open dan een issue.' },
      status: { loading: 'Nieuwste installer opzoeken…', ready: 'Klik om direct te downloaden', fallback: 'Geen directe link; de GitHub-release wordt geopend' },
    },
    hero: {
      headlineLead: 'Je Zepp-gegevens,',
      headlineAccent: 'terug in eigen hand.',
      lead: 'Synchroniseer, bekijk en beheer je Amazfit-gegevens op je eigen computer. Met één klik klaar voor AI.',
      github: 'Bekijk op GitHub',
      starNudge: { title: 'Download gestart', copy: 'Heb je iets aan ZeppBridge? Een ster op GitHub helpt andere Amazfit-gebruikers het te vinden.', action: 'Geef een ster', dismiss: 'Nu niet' },
    },
    demo: {
      label: 'Interactieve demo van het ZeppBridge-overzicht',
      sample: 'Voorbeeldgegevens',
      hint: 'Tik op een kaart',
      back: 'Terug',
      greeting: 'Overzicht',
      heart: { title: 'Hartslag', unit: 'bpm', detail: 'De hele dag per minuut. Zonder horloge om blijft de grafiek leeg, geen nullen.' },
      steps: { title: 'Stappen vandaag', unit: 'stappen', detail: 'Uurlijkse stappen via officiële Zepp-koppeling, alleen vergeleken met je eigen historie.' },
      sleep: { title: 'Afgelopen nacht', hours: 'u', minutes: 'min', detail: 'Diep, licht, REM en wakker op volgorde. Officiële REM-meting krijgt voorrang.' },
    },
    devicesLabel: 'Ondersteunde Amazfit-apparaten',
    connect: {
      heading: 'Drie manieren om te verbinden. Kies de makkelijkste.',
      lead: 'Begin met officiële autorisatie en voeg Geavanceerde gegevens toe voor extra metrieken. Handmatige invoer als vangnet.',
      recommended: 'Aanbevolen',
      paths: [
        { icon: 'verified', title: 'Officiële Zepp-autorisatie', copy: 'Log in bij Zepp in je gewone browser en keur goed.', detail: 'Werkt met Google, Xiaomi en Apple. Synchroniseert slaap, hartslag, stappen, trainingen, PAI en gewicht.' },
        { icon: 'zepp-cloud', title: 'Geavanceerde gegevens', copy: 'Voegt HRV, bloedzuurstof, stress en gereedheid toe die de officiële API mist.', detail: 'Inloggen met e-mail of telefoon. Tokens blijven veilig in het referentiebeheer van je systeem.' },
        { icon: 'manual-entry', title: 'Handmatige invoer', copy: 'Vangnet als de andere opties niet werken.', detail: 'Zelf een token plakken. Bedoeld voor wie bekend is met de API.' },
      ],
    },
    deck: {
      heading: 'Instellingen als stapel kaarten, geen eindeloos formulier',
      lead: 'Beweeg eroverheen om ze uit te waaieren. Klik op een kaart om hem te openen.',
      hint: 'Beweeg erover om uit te waaieren, klik om te openen',
      close: 'Terugleggen',
      cards: [
        { icon: 'profile', title: 'Account en apparaten', copy: 'Officiële autorisatie en Geavanceerde gegevens apart in beeld. Je ziet direct welk account verbonden is.' },
        { icon: 'auto-sync', title: 'Synchronisatie en updates', copy: 'Synchroniseert eenmaal bij het starten, daarna stil volgens jouw schema.' },
        { icon: 'database', title: 'Archief en opslag', copy: 'Jij bepaalt de bewaartermijn. Snapshots zet je op elk moment terug.' },
        { icon: 'structured-data', title: 'Gegevensstatus', copy: 'Per stroom direct helder of ophalen, verwerken en opslaan is gelukt.' },
        { icon: 'secure', title: 'Privacy en beveiliging', copy: 'Lokale alleen-lezen-API staat standaard uit en luistert uitsluitend op 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Sleep metrieken naar de AI',
      lead: 'Sleep een metriek en de buren maken plaats. Laat hem in het midden los voor het AI-pakket.',
      hint: 'Sleep een metriek naar het midden',
      center: 'Naar de AI',
      nodes: ['Hartslag', 'Slaap', 'HRV', 'Stappen', 'Trainingsbelasting', 'PAI', 'Gewicht', 'Stress'],
      picked: '{n} gekozen',
      reset: 'Opnieuw',
    },
    privacy: {
      heading: 'Je gegevens blijven op je eigen computer',
      lead: 'ZeppBridge gebruikt geen externe servers voor jouw gezondheidsgegevens.',
      points: [
        { icon: 'secure', title: 'Tokens in de systeemsleutelbos', copy: 'Standaard in Windows Referentiebeheer of de macOS-sleutelhanger, nooit in de datamap.' },
        { icon: 'private', title: 'Geen telemetrie', copy: 'Geen gebruiksstatistieken. Er worden geen gezondheidsgegevens verzameld.' },
        { icon: 'database', title: 'Duidelijke herkomst', copy: 'Elke meting weet of deze uit officiële autorisatie of Geavanceerde gegevens komt.' },
        { icon: 'ai-ready', title: 'Jij bepaalt wat de AI ziet', copy: 'Wat, hoeveel en wanneer. Volledig in jouw hand.' },
      ],
    },
    footer: {
      heading: 'Gratis, open source en direct klaar voor gebruik',
      tagline: 'Een lokale brug voor Amazfit- en Zepp-gegevens.',
      disclaimer: 'ZeppBridge is een onafhankelijk open-sourceproject, niet verbonden aan Zepp Health of Amazfit.',
      download: 'Downloaden',
    },
  },
};

export default pack;
