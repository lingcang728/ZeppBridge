import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Van je pols naar je computer, van je computer naar AI',
    description: 'ZeppBridge haalt je Amazfit- en Zepp-gegevens uit de Zepp-cloud naar je eigen computer en zet ze klaar in één bestand voor je AI. Gratis en open source.',
    ogTitle: 'ZeppBridge · Van pols naar bureau. Van bureau naar AI.',
    ogDescription: 'Synchroniseer en bekijk je hartslag, slaap en trainingen lokaal, en geef ze met één klik aan de AI die je al gebruikt.',
  },
  copy: {
    nav: {
      home: 'ZeppBridge home',
      site: 'Sitenavigatie',
      demo: 'Demonstratie',
      ai: 'Naar AI',
      privacy: 'Privacy',
      download: 'Downloaden',
      github: 'GitHub',
      language: 'Taal',
      toDark: 'Naar donker',
      toLight: 'Naar licht',
    },
    downloads: {
      windows: {
        label: 'Downloaden voor Windows',
        hint: 'x64-installatieprogramma',
        msi: 'MSI voor beheerde installaties',
      },
      macos: { label: 'Downloaden voor macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimenteel',
        note: 'De CI bouwt deb, rpm, AppImage en Flatpak, maar niemand heeft inloggen en de sleutelbos al volledig getest op een echte Linux-desktop. Loop je ergens tegenaan? Open een issue.',
      },
      status: {
        loading: 'Nieuwste installatieprogramma zoeken',
        ready: 'Klik om direct te downloaden',
        fallback: 'Opent GitHub Releases, daar kies je het pakket',
      },
    },
    sample: 'Voorbeeld',
    hero: {
      eyebrow: 'Gratis · Open source · Je gegevens blijven op je computer',
      titleLead: 'Wat je horloge vastlegt,',
      titleAccent: 'staat op je eigen computer.',
      lead: 'ZeppBridge haalt de hartslag, slaap en trainingen die je Amazfit vastlegt uit de Zepp-cloud naar je eigen computer en bewaart ze als archief dat je kunt lezen en meenemen. Wil je iets aan een AI vragen, dan kies je een periode en geef je één bestand door.',
      github: 'Bekijk de broncode op GitHub',
      meta: 'Gratis · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimenteel',
      devices: 'Amazfit-apparaten die het al kent',
      stage: {
        hint: 'Klik en probeer het uit',
        note: 'Rechts zie je het echte ZeppBridge, met voorbeeldgegevens.',
        loading: 'App wordt geopend…',
        exit: 'Demo verlaten',
        unavailable: 'Deze browser kan de demo niet openen. Download de app om het te zien.',
      },
      starNudge: {
        title: 'Je download is gestart',
        copy: 'Heb je iets aan ZeppBridge? Een ster op GitHub helpt andere Amazfit-gebruikers het te vinden.',
        action: 'Ster geven',
        dismiss: 'Later',
      },
    },
    beats: [
      {
        kicker: '01 · Synchroniseren',
        title: 'Haal naar je eigen computer wat je pols vastlegt',
        body: 'Log in met je eigen Zepp-account en hartslag, slaap en trainingen worden dag na dag opgeslagen in een database op dit apparaat. Leesbaar, meeneembaar en ook zonder netwerk beschikbaar.',
      },
      {
        kicker: '02 · Eerlijk',
        title: 'Niet gemeten betekent niet gemeten',
        body: 'Kijk naar de grafiek rechts: gistermiddag is een gat, want het horloge zat niet om je pols. ZeppBridge vult geen 0 in en tekent geen verzonnen lijn. Ontbrekende dagen verschijnen als grijze streepjes rond elk gegevensblok.',
      },
      {
        kicker: '03 · Naar de AI',
        title: 'Wil je iets aan een AI vragen? Kies eerst wat hij te zien krijgt',
        body: 'Wat binnen de cirkel valt wordt doorgegeven, wat erbuiten valt niet, en de streepjes rond elk punt laten zien op welke dagen er gegevens zijn. Druk op de verzendknop en het ingepakte .md-bestand staat klaar om in de chat te slepen.',
      },
      {
        kicker: '04 · Plan',
        title: 'Een trainingsplan van de AI dat pas naar je horloge gaat nadat jij het hebt gecontroleerd',
        body: 'Plak het hele antwoord van de AI terug: je ziet dag voor dag wat er verandert, met het hartslagbereik van elke stap als grafiek. Schrijfwijzen die nog niet op je horloge zijn gecontroleerd, worden gemarkeerd. Pas na jouw bevestiging gaat het naar Zepp en je kunt het altijd ongedaan maken.',
      },
      {
        kicker: '05 · Jij bepaalt',
        title: 'De schakelaars die je nodig hebt zijn er, en niets meer',
        body: 'Instellingen zijn een stapel kaarten: open er een en sleep de kop opzij om naar de volgende te bladeren. Hoe lang gegevens bewaard blijven, hoe vaak er wordt gesynchroniseerd en of de lokale interface aan staat, bepaal jij.',
      },
    ],
    flap: {
      tiles: [
        { value: '1.096', label: 'nachten slaap' },
        { value: '742', label: 'trainingen met route' },
        { value: '1,5M', label: 'minuten hartslag' },
        { value: '9,8M', label: 'stappen' },
      ],
    },
    handoff: {
      chat: 'AI-chat',
      you: 'Jij',
      file: 'ZeppBridge laatste 14 dagen.md',
      prompt: 'Heb ik deze week slechter geslapen dan vorige week? Waar kan dat aan liggen?',
      answer: 'Iets slechter: gemiddeld 38 minuten minder, vooral diepe slaap. Op dinsdag en donderdag trainde je \'s avonds, en die nachten zakte je hartslag trager. Probeer een week lang \'s middags te trainen.',
      note: 'Geen ingebouwde AI en geen extra account. Wat eruit gaat, hoeveel en wanneer gebeurt pas als jij klikt.',
      close: 'Sluiten',
    },
    privacy: {
      heading: 'Je gezondheidsgegevens staan op twee plekken',
      lead: 'In de Zepp-cloud en op je eigen computer. Een derde is er niet.',
      nodes: { watch: 'Horloge', cloud: 'Zepp-cloud', computer: 'Je computer', server: 'ZeppBridge-server', none: 'bestaat niet' },
      points: [
        {
          title: 'Tokens in de systeemkluis',
          copy: 'In Windows Referentiebeheer of de macOS-sleutelhanger, nooit in de gegevensmap.',
        },
        {
          title: 'Geen telemetrie',
          copy: 'Geen gebruiksmeting en geen gezondheidsgegevens verzameld.',
        },
        {
          title: 'Duidelijke herkomst',
          copy: 'Elke meting weet of die uit de officiële autorisatie of uit de uitgebreide gegevens komt.',
        },
      ],
    },
    connect: {
      heading: 'Drie manieren om te verbinden. Kies de makkelijkste.',
      lead: 'Begin met de officiële autorisatie. Voeg uitgebreide gegevens toe als je meer meetwaarden wilt.',
      recommended: 'Aanbevolen',
      paths: [
        {
          title: 'Officiële Zepp-autorisatie',
          copy: 'Log in bij Zepp in je gewone browser en geef toestemming.',
          detail: 'Google-, Xiaomi- en Apple-accounts werken. Slaap, hartslag, stappen, trainingen, PAI en gewicht worden gesynchroniseerd.',
        },
        {
          title: 'Uitgebreide gegevens',
          copy: 'Voegt HRV, bloedzuurstof, stress en paraatheid toe, die de officiële API niet biedt.',
          detail: 'Inloggen met e-mail of telefoonnummer. Het token staat alleen in je systeemkluis.',
        },
        {
          title: 'Handmatig invoeren',
          copy: 'De terugval als de andere twee niet lukken.',
          detail: 'Je plakt zelf een token. Bedoeld voor wie de API kent.',
        },
      ],
      note: 'Wat er synchroniseert, hangt af van wat je account in de Zepp-cloud heeft. Welke meetwaarden je ziet, hangt af van je apparaat en hoe je verbindt.',
    },
    final: {
      heading: 'Installeer het en zie wat je horloge nog weet',
      lead: 'Gratis, open source, zonder account.',
      facts: {
        channel: 'Stabiel kanaal, installatieprogramma\'s via GitHub Releases',
        systems: 'Windows 10 / 11 (x64) en macOS (Apple Silicon). Linux is experimenteel.',
        ai: 'Geen extra account nodig. Voor AI-vragen gebruik je de AI die je al hebt.',
        windows: 'Windows: het installatieprogramma is nog niet ondertekend. Zie je "Onbekende uitgever", kies dan "Meer informatie" en daarna "Toch uitvoeren".',
        macos: 'macOS: een niet-ondertekende build, dus de eerste start wordt geblokkeerd. Hoe je hem toestaat, staat in de readme op GitHub.',
      },
    },
    footer: {
      tagline: 'Een lokale brug voor Amazfit- en Zepp-gegevens.',
      disclaimer: 'ZeppBridge is een onafhankelijk opensourceproject en niet verbonden aan Zepp Health of Amazfit.',
      source: 'Broncode',
    },
  },
};

export default pack;
