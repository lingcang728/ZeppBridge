import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  "meta": {
    "title": "ZeppBridge · Je horloge legt vast. Je eigen archief.",
    "description": "Bewaar Amazfit- en Zepp-gegevens lokaal. Verken het synthetische v3-voorbeeld of download de publieke stabiele versie. Gratis en open source.",
    "ogTitle": "ZeppBridge · Je horloge legt vast. Je eigen archief.",
    "ogDescription": "Bewaar Amazfit- en Zepp-gegevens lokaal. Verken het synthetische v3-voorbeeld of download de publieke stabiele versie. Gratis en open source."
  },
  "copy": {
    "nav": {
      "home": "ZeppBridge home",
      "site": "Sitenavigatie",
      "demo": "Demonstratie",
      "ai": "Naar AI",
      "privacy": "Privacy",
      "download": "Publieke versie",
      "github": "GitHub",
      "language": "Taal",
      "toDark": "Naar donker",
      "toLight": "Naar licht",
      "connect": "Verbinden",
      "faq": "Veelgestelde vragen"
    },
    "downloads": {
      "windows": {
        "label": "Downloaden voor Windows",
        "hint": "x64-installatieprogramma",
        "msi": "MSI voor beheerde installaties"
      },
      "macos": {
        "label": "Downloaden voor macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Experimenteel",
        "note": "De CI bouwt deb, rpm, AppImage en Flatpak, maar niemand heeft inloggen en de sleutelbos al volledig getest op een echte Linux-desktop. Loop je ergens tegenaan? Open een issue."
      },
      "status": {
        "loading": "Nieuwste installatieprogramma zoeken",
        "ready": "Klik om direct te downloaden",
        "fallback": "Opent GitHub Releases, daar kies je het pakket"
      }
    },
    "sample": "Voorbeeld",
    "hero": {
      "eyebrow": "Gratis · Open source · Lokaal gezondheidsarchief",
      "titleLead": "Je gezondheidsgegevens.",
      "titleAccent": "Op je eigen computer.",
      "lead": "Bewaar Amazfit-hartslag, slaap en trainingen uit de Zepp-cloud op je computer. Bekijk je geschiedenis, behoud ontbrekende gegevens en exporteer wat je kiest.",
      "github": "Bekijk de broncode op GitHub",
      "meta": "Gratis · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Amazfit-apparaten; meetwaarden verschillen per model",
      "stage": {
        "hint": "Open het voorbeeld",
        "note": "De echte app met synthetische gegevens, zonder verbinding met je account.",
        "loading": "App wordt geopend…",
        "exit": "Demo verlaten",
        "unavailable": "De demo is niet beschikbaar. Je kunt de uitleg en broncode nog bekijken."
      },
      "demo": "Bekijk het voorbeeld",
      "edition": "v3 in ontwikkeling · Synthetische voorbeeldgegevens. De download biedt de publieke stabiele versie; interface en functies kunnen verschillen."
    },
    "handoff": {
      "chat": "AI-chat",
      "you": "Jij",
      "file": "ZeppBridge laatste 14 dagen.md",
      "prompt": "Orden dit synthetische voorbeeld. Noem bronnen, datums en ontbrekende velden zonder gezondheidsoordelen.",
      "answer": "Het bestand ordent slaap en trainingen per datum. Ongemeten perioden blijven leeg. Controleer bronnen en dekking vóór vergelijken; de gegevens verklaren geen oorzaak van veranderingen.",
      "note": "Synthetisch voorbeeldgesprek. Deze pagina verstuurt geen bestand en verbindt niet met AI. Bij echt gebruik bepaal jij of je inhoud deelt.",
      "close": "Sluiten"
    },
    "privacy": {
      "kicker": "Gegevens en privacy",
      "heading": "Je archief is lokaal. De routes zijn duidelijk.",
      "lead": "Normale synchronisatie leest Zepp-gegevens naar je computer. Externe AI is een aparte route die je bewust kiest.",
      "nodes": {
        "watch": "Horloge en Zepp-app",
        "cloud": "Zepp-cloud",
        "computer": "Lokaal gezondheidsarchief",
        "export": "Jouw gekozen externe AI"
      },
      "flowNote": "Je horloge uploadt via de Zepp-telefoonapp. De website bewaart het gezondheidsarchief niet.",
      "exportNote": "Optionele export · Zelf beoordelen en verzenden",
      "services": {
        "title": "Webdiensten met beperkte taken",
        "copy": "Officiële autorisatie en tokenvernieuwing gebruiken webdiensten. Updates lezen versiegegevens. Vrijwillige probleemrapporten sturen na bevestiging beperkte diagnostiek, zonder gezondheidswaarden."
      },
      "docs": "Lees de volledige gegevensgrenzen",
      "points": [
        {
          "title": "Inloggegevens in de systeemkluis",
          "copy": "Standaard wordt de kluis van je besturingssysteem gebruikt. Sommige platforms bieden expliciete bestandsopslag met andere bescherming."
        },
        {
          "title": "Lokaal betekent niet versleuteld",
          "copy": "De gezondheidsdatabase is standaard niet versleuteld. Gebruik aparte systeemaccounts en bescherm back-ups."
        },
        {
          "title": "Jij begint de export",
          "copy": "AI-pakketten worden lokaal voorbereid en opgeschoond. Na verzending gelden de regels van de ontvanger. Gewone exports en volledige back-ups bevatten andere informatie."
        }
      ]
    },
    "connect": {
      "kicker": "Verbind je registraties",
      "heading": "Begin met officiële autorisatie",
      "lead": "Eén dagelijkse route. Geavanceerde verbindingen voegen andere velden toe.",
      "recommended": "Aanbevolen start",
      "advanced": "Geavanceerde alternatieven",
      "edition": "Dit zijn de huidige v3-routes. Raadpleeg de release-notities van de publieke stabiele versie voor haar toegang en functies.",
      "docs": "Verbindingsgids",
      "paths": [
        {
          "title": "Officiële Zepp-autorisatie",
          "copy": "Open Zepps autorisatiepagina in je browser en meld je aan zoals gewoonlijk.",
          "detail": "Leest beschikbare slaap, hartslag, stappen, trainingen, PAI en gewicht uit je account."
        },
        {
          "title": "Geavanceerde gegevensverbinding",
          "copy": "Voeg deze toe voor HRV, bloedzuurstof, stress of gereedheid.",
          "detail": "Aanmelden via e-mail of telefoon. De velden verschillen; niet elk apparaat meet of levert ze allemaal."
        },
        {
          "title": "Handmatige inloggegevens",
          "copy": "Voor API-kenners met rechtmatig verkregen eigen inloggegevens.",
          "detail": "Voer token, gebruikers-ID en regionaal adres in. Importeer nooit onbekende tokens en deel ze niet openbaar."
        }
      ],
      "note": "Apparaat, cloudgegevens en verbinding bepalen beschikbare velden. Een leeg antwoord bewijst geen gebrek aan ondersteuning. Dit zijn alternatieven, geen drie verplichte stappen."
    },
    "final": {
      "kicker": "Download · Publieke stabiele versie",
      "heading": "Bewaar een kopie op je eigen computer",
      "lead": "Gratis en open source. Je Zepp-account volstaat; geen apart ZeppBridge-account.",
      "docs": "Installatie en release-notities",
      "facts": {
        "channel": "De download biedt de publieke stabiele versie. De synthetische demo is v3 in ontwikkeling; interface en functies kunnen afwijken.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Bekijken en exporteren vereisen geen AI. Externe dienst en account kies je zelf.",
        "windows": "Windows: nog geen vertrouwde codehandtekening. Een waarschuwing van onbekende uitgever of SmartScreen is mogelijk. Controleer de officiële bron.",
        "macos": "macOS: niet ondertekend of genotariseerd. De eerste start kan worden geblokkeerd; volg de projectinstructies."
      }
    },
    "footer": {
      "tagline": "Een lokale brug voor Amazfit- en Zepp-gegevens.",
      "disclaimer": "ZeppBridge is een onafhankelijk opensourceproject in het Zepp Developer Partner-programma, geen officieel Zepp-product. Zepp en Amazfit zijn merken van hun eigenaren.",
      "source": "Broncode"
    },
    "faq": {
      "heading": "Voordat je begint",
      "lead": "Zes veelgestelde vragen. Details en versieverschillen staan in de documentatie.",
      "docs": "Projectdocumentatie",
      "items": [
        {
          "question": "Welke accounts heb ik nodig?",
          "answer": "Synchronisatie vereist je Zepp-account en de Zepp-telefoonapp. Geen extra ZeppBridge-account. Het voorbeeld vraagt geen aanmelding."
        },
        {
          "question": "Worden mijn apparaat en metingen ondersteund?",
          "answer": "Velden hangen af van gemeten en bewaarde gegevens en de verbinding. Niet elk model wordt met alle meetwaarden beloofd."
        },
        {
          "question": "Kan ik het offline gebruiken?",
          "answer": "Opgeslagen registraties zijn offline te bekijken en te exporteren. Aanmelden, nieuwe synchronisatie en updates vereisen netwerk. Je horloge gebruikt nog de Zepp-app."
        },
        {
          "question": "Betekent een leeg stuk nul?",
          "answer": "Nee. Niet gemeten, niet gesynchroniseerd en niet gedecodeerd zijn verschillende toestanden. Ontbrekend wordt nooit met nul, oude waarden of schattingen gevuld."
        },
        {
          "question": "Moet ik AI gebruiken?",
          "answer": "Nee. Exports worden lokaal gemaakt. AI ontvangt inhoud pas wanneer je die plakt of uploadt. Controleer bereik, verwijderde velden en privacy."
        },
        {
          "question": "Is de download gelijk aan het voorbeeld?",
          "answer": "Het voorbeeld is v3 in ontwikkeling met synthetische gegevens. De download is stabiel. Planbeoordeling en de nieuwe interface kunnen nog niet publiek zijn; zie release-notities."
        }
      ]
    },
    "rebuild": {
      "featuresHeading": "Je tijd, in de gegevens die je bewaart.",
      "featuresLead": "Slaap, hartslag, sport en plannen. Bekijk je archief, onderdeel voor onderdeel.",
      "demoHeading": "Probeer het vóór je het downloadt",
      "demoLead": "De echte V3-interface met synthetische voorbeelden. Geen login of toegang tot persoonlijke gegevens.",
      "mobileHint": "Dit is een desktopapp. Bekijk op je telefoon het volledige scherm; gebruik een computer voor bediening.",
      "fullscreen": "Desktopdemo op volledig scherm bekijken",
      "retry": "Demo opnieuw laden",
      "play": "Demo afspelen",
      "pause": "Demo pauzeren",
      "mediaNote": "V3 · Synthetisch voorbeeld · Opgenomen in donker thema",
      "moreConnections": "Meer verbindingsmogelijkheden",
      "partner": "Zepp Developer Partner-programma",
      "disclaimer": "ZeppBridge is een onafhankelijk opensourceproject in het Zepp Developer Partner-programma, geen officieel Zepp-product. Zepp en Amazfit zijn merken van hun eigenaren.",
      "docsHeading": "Begin hier.",
      "guide": "Installatie en handleiding",
      "versions": "Versies en wijzigingslog",
      "community": "Broncode en community",
      "privacyDoc": "Gegevens en privacy",
      "star": "Is dit nuttig? Een ster op GitHub helpt anderen het te vinden.",
      "dismiss": "Sluiten",
      "nav": [
        "Functies",
        "Gegevens & privacy",
        "Proberen",
        "Handleiding"
      ],
      "title": [
        "Je gezondheidsgegevens.",
        "Op je eigen computer."
      ],
      "stories": [
        {
          "eyebrow": "Lokaal archief",
          "title": "Een lokale kopie van je registraties",
          "body": "Verbind je Zepp-account en bewaar bestaande cloudgegevens op je computer. Gesynchroniseerde registraties zijn offline te bekijken.",
          "bullets": [
            "Gesynchroniseerde gegevens offline",
            "Bronnen en dekking bekijken"
          ]
        },
        {
          "eyebrow": "Slaapgeschiedenis",
          "title": "Elke nacht een plek in je geschiedenis",
          "body": "Bekijk slaapduur en fasen per nacht. Niet gemeten nachten blijven ontbreken; gegevens vervangen geen medische diagnose.",
          "bullets": [
            "Nachten en slaapfasen",
            "Ontbrekende nachten blijven leeg"
          ]
        },
        {
          "eyebrow": "Hartslag & hiaten",
          "title": "Geen meting, geen waarde",
          "body": "Ontbrekende metingen worden nooit aangevuld met nul, een eerdere waarde of een schatting. Nog niet gesynchroniseerd is iets anders dan niet gemeten.",
          "bullets": [
            "Hiaten blijven in de curve",
            "Geen ontbrekende waarde als nul"
          ]
        },
        {
          "eyebrow": "Sport & training",
          "title": "Bewaar het verloop van je training",
          "body": "Bekijk activiteiten, details en trends. Meetwaarden hangen af van apparaat en gesynchroniseerde gegevens; controleer de dekking voor vergelijking.",
          "bullets": [
            "Details en trainingstrends",
            "Bestaande gegevens gebruiken"
          ]
        },
        {
          "eyebrow": "AI-overdracht",
          "title": "Kies de inhoud en de ontvanger",
          "body": "In het v3-voorbeeld selecteer je gegevens en datums en bekijk je de export. Die wordt lokaal gemaakt; externe AI krijgt hem pas wanneer jij de inhoud verstuurt.",
          "bullets": [
            "Datums en gegevens kiezen",
            "Zelf controleren voor verzending"
          ]
        },
        {
          "eyebrow": "Plancontrole",
          "title": "Bekijk het plan vóór de volgende stap",
          "body": "De v3 in ontwikkeling toont het importeren en beoordelen van trainingsplannen. Verzenden naar je horloge hangt af van apparaat en validatie; dit is geen algemene belofte voor de stabiele versie.",
          "bullets": [
            "Weekoverzicht en dagelijkse controle",
            "Overdracht na apparaatcontrole"
          ]
        },
        {
          "eyebrow": "Instellingen",
          "title": "Bepaal het ritme van je archief",
          "body": "Verken synchronisatie, bewaartermijnen en lokale interfaces. Instellingen kunnen per versie verschillen; controleer hun doel vóór inschakeling.",
          "bullets": [
            "Sync en bewaartermijn instellen",
            "Lokale interfaces zelf inschakelen"
          ]
        }
      ],
      "learnFeatures": "Ontdek functies",
      "languageFallback": "Deze taal kon niet worden geladen. Engels wordt getoond; kies de taal opnieuw."
    }
  }
};

export default pack;
