import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Je Zepp-gegevens op je eigen computer',
    description: 'ZeppBridge is een local-first, open-source brug voor Amazfit- en Zepp-gegevens, draaiend op je eigen computer met Windows, macOS of Linux.',
    ogTitle: 'ZeppBridge · Je Zepp-gegevens, terug in eigen hand',
    ogDescription: 'Synchroniseer, bekijk en orden je Amazfit-gegevens lokaal; met één klik klaar voor de AI.',
  },
  copy: {
    nav: { home: 'ZeppBridge-home', site: 'Sitenavigatie', connect: 'Verbinden', motion: 'Interface', handoff: 'Naar de AI', privacy: 'Privacy', star: 'GitHub', language: 'Interfacetaal' },
    downloads: {
      windows: { label: 'Downloaden voor Windows', hint: 'x64-installer', msi: 'Grootschalig uitrollen? Download de MSI' },
      macos: { label: 'Downloaden voor macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimenteel', note: 'deb, rpm, AppImage en Flatpak komen uit de CI, maar inloggen en de sleutelring zijn nog niet volledig getest op een echte Linux-desktop. Loop je vast, open dan een issue.' },
      status: { loading: 'Nieuwste installer opzoeken', ready: 'Klik om direct te downloaden', fallback: 'Directe link nu niet beschikbaar; klikken opent de GitHub-release' },
    },
    hero: {
      headlineLead: 'Je Zepp-gegevens,',
      headlineAccent: 'terug in eigen hand.',
      lead: 'Synchroniseer, bekijk en orden Amazfit-gegevens op je eigen computer; met één klik klaar voor de AI.',
      github: 'Bekijk op GitHub',
      starNudge: { title: 'Download gestart', copy: 'Helpt ZeppBridge je, zet dan een ster op GitHub zodat meer Amazfit-gebruikers het vinden.', action: 'Zet een ster', dismiss: 'Nu niet' },
    },
    demo: {
      label: 'Interactieve demo van het ZeppBridge-overzicht',
      sample: 'Voorbeeldgegevens',
      hint: 'Klik op een kaart',
      back: 'Terug',
      greeting: 'Overzicht',
      heart: { title: 'Hartslag', unit: 'bpm', detail: 'De hele dag per minuut. Zonder horloge om blijft de tijd leeg, nooit een 0 erbij gezet.' },
      steps: { title: 'Stappen vandaag', unit: 'stappen', detail: 'Stappen per uur komen uit de officiële Zepp-autorisatie; vergeleken alleen met je eigen eerdere records.' },
      sleep: { title: 'Afgelopen nacht', hours: 'u', minutes: 'min', detail: 'Diep, licht, REM en wakker op tijdvolgorde; de door Zepp gemeten REM-waarde gaat voor.' },
    },
    devicesLabel: 'Ondersteunde Amazfit-apparaten',
    connect: {
      heading: 'Drie manieren om te verbinden, kies de makkelijkste',
      lead: 'Begin met de officiële autorisatie en voeg Geavanceerde gegevens toe voor meer metrieken. Werkt geen van beide, vul dan handmatig in.',
      recommended: 'Aanbevolen',
      paths: [
        { icon: 'verified', title: 'Officiële Zepp-autorisatie', copy: 'Log in bij Zepp in je gewone browser, klik op toestaan en je bent verbonden.', detail: 'Accounts via Google, Xiaomi en Apple werken. Slaap, hartslag, stappen, trainingen, PAI en gewicht synchroniseren.' },
        { icon: 'zepp-cloud', title: 'Geavanceerde gegevens', copy: 'Vult HRV, bloedzuurstof, stress en gereedheid aan die de officiële API niet openstelt.', detail: 'Inloggen met e-mail of telefoonnummer; het token leeft alleen in de systeemopslag voor inloggegevens.' },
        { icon: 'manual-entry', title: 'Handmatige invoer', copy: 'De reserve voor als de eerste twee niet lukken.', detail: 'Zelf een token plakken; bedoeld voor wie de interface kent.' },
      ],
    },
    deck: {
      heading: 'Instellingen zijn geen eindeloos formulier maar een stapel kaarten',
      lead: 'Hou de muis erop en ze waaieren uit; klik er een om hem eruit te trekken.',
      hint: 'Hou erover om uit te waaieren, klik om eruit te trekken',
      close: 'Terugleggen',
      cards: [
        { icon: 'profile', title: 'Account en apparaten', copy: 'Officiële autorisatie en Geavanceerde gegevens krijgen elk een regel; je ziet meteen welk account verbonden is.' },
        { icon: 'auto-sync', title: 'Synchronisatie en updates', copy: 'Synchroniseert eenmaal bij het starten en daarna stil op het interval dat jij instelt.' },
        { icon: 'database', title: 'Archief en opslag', copy: 'Hoe lang wordt bewaard bepaal jij; snapshots zet je altijd terug.' },
        { icon: 'structured-data', title: 'Gegevensstatus', copy: 'Per stroom apart duidelijk: opgehaald, begrepen, weggeschreven.' },
        { icon: 'secure', title: 'Privacy en beveiliging', copy: 'De lokale alleen-lezen-interface staat standaard uit en bindt alleen aan 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Sleep de gegevens waarover je wilt vragen naar de AI',
      lead: 'Sleep een metriek en de buren wijken opzij; loslaten in het midden en hij gaat mee in het pakket voor de AI.',
      hint: 'Sleep een knoop naar het midden',
      center: 'Naar de AI',
      nodes: ['Hartslag', 'Slaap', 'HRV', 'Stappen', 'Trainingsbelasting', 'PAI', 'Gewicht', 'Stress'],
      picked: '{n} gekozen',
      reset: 'Opnieuw',
    },
    privacy: {
      heading: 'Je gegevens leven alleen op je computer',
      lead: 'ZeppBridge heeft geen eigen server die je gezondheidsgegevens bewaart.',
      points: [
        { icon: 'secure', title: 'Tokens in de systeemsleutelbos', copy: 'Standaard in Windows Credential Manager of de macOS-sleutelhanger, niet in de datamap.' },
        { icon: 'private', title: 'Geen telemetrie', copy: 'Meld geen gebruik en verzamelt geen gezondheidsgegevens.' },
        { icon: 'database', title: 'Duidelijke herkomst', copy: 'Elke record weet of hij uit de officiële autorisatie of Geavanceerde gegevens kwam.' },
        { icon: 'ai-ready', title: 'Jij bepaalt wat de AI ziet', copy: 'Wat je meestuurt, hoeveel en wanneer: jij beslist.' },
      ],
    },
    footer: {
      heading: 'Gratis, open source en meteen bruikbaar',
      tagline: 'Een local-first brug voor Amazfit- en Zepp-gegevens.',
      disclaimer: 'ZeppBridge is een onafhankelijk open-sourceproject, niet verbonden aan Zepp Health of Amazfit.',
      download: 'Downloaden',
    },
  },
};

export default pack;
