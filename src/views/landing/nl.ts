import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Nederlands (nl) landing pack.
 *
 * Same freedom as the English copy: rewritten to sound natural, not translated
 * word for word. Product terms (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI,
 * Apple Silicon, AI-ready) stay untranslated. Decorative overlines stay in
 * English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'ZeppBridge-startpagina',
      site: 'Sitenavigatie',
      features: 'Wat het uitleest',
      local: 'Lokale uitgangen',
      connect: 'Verbinden',
      privacy: 'Privacy',
      star: 'Star op GitHub',
      language: 'Taal',
    },
    downloads: {
      windows: { label: 'Download voor Windows', hint: 'Aanbevolen · x64 EXE-installatieprogramma', msi: 'Beheerde uitrol: download MSI' },
      macos: { label: 'Download voor macOS', hint: 'Apple Silicon · DMG-installatieprogramma' },
      linux: {
        label: 'Linux',
        previewBadge: 'Preview',
        note: 'deb / rpm / AppImage / Flatpak bouwen allemaal in CI, maar niemand heeft inloggen plus sleutelring (Secret Service / KWallet) op een echte Linux-desktop nog helemaal werkend gehad. Probeer het gerust — en open een issue als iets breekt. Dat is precies wat het nu nodig heeft.',
      },
      status: {
        loading: 'De nieuwste GitHub-release wordt opgehaald…',
        ready: 'Downloadt direct — geen GitHub-pagina ertussen',
        fallback: 'Directe links zijn tijdelijk niet beschikbaar; de Release-pagina opent in plaats daarvan',
      },
    },
    hero: {
      headlineLead: 'Je Zepp-data,',
      headlineAccent: 'compleet terug in je handen.',
      lead: 'ZeppBridge verbindt, ordent en visualiseert je Amazfit-wearabledata op je eigen Windows-, Mac- of Linux-machine. Elk veld behoudt zijn bron, dus je leest het zelf — of je geeft het aan een AI op jouw voorwaarden.',
      starNudge: {
        title: 'Je download is gestart',
        copy: 'Verdient ZeppBridge een plek op je machine, dan helpt een GitHub Star meer Amazfit-gebruikers het te vinden.',
        action: 'Geef ZeppBridge een Star op GitHub',
        dismiss: 'Misschien later',
      },
      trust: [
        { icon: 'secure', label: 'Local-first' },
        { icon: 'private', label: 'Standaard privé' },
        { icon: 'structured-data', label: 'Gestructureerde data' },
      ],
      stageLabel: 'Huidige Amazfit-apparaten die ZeppBridge voeden en er als gestructureerde data uitkomen',
      coreCaption: 'Decoderen · Ordenen · Visualiseren',
      outputs: [
        { title: 'Gestructureerde records', copy: 'Bron en timestamps behouden' },
        { title: 'AI-ready', copy: 'Het gaat eruit als jij dat zegt' },
      ],
      status: { title: 'Lokale pipeline gereed', copy: 'Niets loopt via een ZeppBridge-server' },
    },
    principlesLabel: 'Productprincipes',
    principles: [
      { icon: 'secure', title: 'Veilig', copy: 'Blijft op je machine' },
      { icon: 'private', title: 'Privé', copy: 'Niets geüpload, niets gelekt' },
      { icon: 'database', title: 'Herkomst', copy: 'Bronnen lopen nooit door elkaar' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Helder gestructureerd, gebruikt op verzoek' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'Van de cijfers van vandaag tot elke sessie.',
      lead: 'De interface toont alleen velden die echt zijn binnengekomen. Wat ontbreekt wordt als ontbrekend gemarkeerd — geen verzonnen getallen om een dashboard vol te maken.',
      items: [
        { icon: 'heart-rate', title: 'Continue hartslag', copy: 'Timestamps en bron behouden, dus je ziet de echte curve.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Slaapstructuur', copy: 'Diepe, lichte, REM- en waakfasen, lokaal ontleed.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Trainingsdetail', copy: 'Route, tempo, cadans, hoogte en trainingsbelasting.', tone: 'green' },
        { icon: 'vo2-max', title: 'Herstelmetrieken', copy: 'VO₂ Max, HRV en herstelcijfers, per bron getoond.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Je hoeft het niet eens te openen.',
      lead: 'De desktop-app, de commandoregel, MCP en de read-only lokale API delen één kern — eenheden, tijdzones, bronnen en ontbrekende waarden hebben dus maar één verhaal. Ontbrekend is ontbrekend: geen uitgang vult het gat met een nul.',
      items: [
        {
          icon: 'structured-data',
          title: 'Volledige historie & snapshots',
          copy: 'Haal cloudhistorie maand per maand terug, met een grootboek per brok. Snapshots van de hele database zijn checksummed en vóór het herstellen zie je het verschil in aantal rijen.',
          tag: 'Lokaal',
        },
        {
          icon: 'document',
          title: 'Commandoregel',
          copy: 'status / sync / export. Geen prompts, stabiele exitcodes — veilig aan Task Scheduler of cron te hangen.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'Read-only MCP',
          copy: 'Laat een AI zelf je lokale data bevragen. stdio-transport: geen poort om op te luisteren, geen netwerktoegang.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Kies de weg naar binnen die bij je past.',
      lead: 'Van een gewone officiële weblogin tot een volledig auditbare handmatige overdracht. Verbindingsstatus en foutoorzaken worden altijd letterlijk vermeld.',
      items: [
        { icon: 'browser-login', title: 'Officiële weblogin', copy: 'Autoriseer binnen de officiële flow. Credentials blijven op je machine.', tag: 'Aanbevolen' },
        { icon: 'document', title: 'HAR-import', copy: 'Voor debugging en gevorderden: hergebruik een geautoriseerd request dat je al hebt opgenomen.', tag: 'Gevorderd' },
        { icon: 'manual-entry', title: 'Handmatige invoer', copy: 'Voer zelf de appToken en user-id in, volledig zichtbaar.', tag: 'Hands-on' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Je wearable-data hoort geen cloudbezit van iemand anders te worden.',
      lead: 'Een lokale database, gemaskeerde identifiers en geïsoleerde bronnen zijn de standaard. Wil je een AI erbij, dan kies jij wat eruit gaat en waar het landt.',
      points: [
        { icon: 'database', label: 'Lokale SQLite-opslag' },
        { icon: 'profile', label: 'Account-ids standaard gemaskeerd' },
        { icon: 'cloud-output', label: 'Export alleen als jij het start' },
      ],
      vault: 'Er is geen ZeppBridge-backend die je gezondheidsdata doorgeeft.',
    },
    footer: {
      tagline: 'Open-source Amazfit-databrug · Windows en Mac (Apple Silicon)',
      disclaimer: 'Een onafhankelijk, niet-officieel open-sourceproject, niet gelieerd aan of ondersteund door Zepp Health, Huami of Amazfit. Alleen voor gebruik met accounts en data waar je zelf toegang toe hebt.',
      download: 'Download',
    },
  },
  meta: {
    title: 'ZeppBridge · Lokale databrug',
    description:
      'ZeppBridge is een local-first, open-source brug en viewer voor Amazfit / Zepp wearable-data. Draait op je eigen Windows-, Mac- of Linux-machine.',
    ogTitle: 'ZeppBridge · Je Zepp-data, compleet teruggegeven',
    ogDescription:
      'Verbind, orden en visualiseer Amazfit-wearabledata op je eigen machine. Bronnen blijven intact en niets vertrekt tot jij het verstuurt.',
  },
};

export default pack;
