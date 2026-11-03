import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    "title": "ZeppBridge · Twoje dane z zegarka. Twoje własne archiwum.",
    "description": "Przechowuj tętno, sen i treningi z Amazfit / Zepp w lokalnym archiwum zdrowotnym. Wypróbuj wersję demonstracyjną v3 na danych syntetycznych lub pobierz oficjalne stabilne wydanie. Bezpłatne i otwartoźródłowe.",
    "ogTitle": "ZeppBridge · Twoje dane z zegarka. Twoje własne archiwum.",
    "ogDescription": "Przechowuj tętno, sen i treningi z Amazfit / Zepp w lokalnym archiwum zdrowotnym. Wypróbuj wersję demonstracyjną v3 na danych syntetycznych lub pobierz oficjalne stabilne wydanie. Bezpłatne i otwartoźródłowe."
  },
  copy: {
    "nav": {
      "home": "Strona główna ZeppBridge",
      "site": "Nawigacja witryny",
      "demo": "Wersja demonstracyjna",
      "ai": "Przekazywanie do AI",
      "privacy": "Prywatność",
      "download": "Pobierz stabilne wydanie",
      "github": "GitHub",
      "language": "Język",
      "toDark": "Przełącz na ciemny",
      "toLight": "Przełącz na jasny",
      "connect": "Połącz",
      "faq": "Często zadawane pytania"
    },
    "downloads": {
      "windows": {
        "label": "Pobierz dla systemu Windows",
        "hint": "Instalator x64",
        "msi": "Pakiet MSI do wdrożeń zarządzanych"
      },
      "macos": {
        "label": "Pobierz dla systemu macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Eksperymentalne",
        "note": "Pakiety deb, rpm, AppImage oraz Flatpak są budowane w CI, ale nikt jeszcze nie przetestował logowania i bazy kluczy od początku do końca na rzeczywistym pulpicie Linuksa. Zauważyłeś problem? Otwórz zgłoszenie."
      },
      "status": {
        "loading": "Wyszukiwanie najnowszego instalatora",
        "ready": "Kliknij, aby pobrać bezpośrednio",
        "fallback": "Otwiera stronę wydań na GitHubie, gdzie możesz wybrać instalator"
      }
    },
    "sample": "Wersja próbna",
    "hero": {
      "eyebrow": "Bezpłatne · Otwartoźródłowe · Lokalne archiwum zdrowotne",
      "titleLead": "Historia z Twojego zegarka.",
      "titleAccent": "Twój własny komputer.",
      "lead": "Przechowuj tętno, sen i treningi z Amazfit z chmury Zepp na własnym komputerze. Przeglądaj historię, zachowaj luki pomiarowe i eksportuj wybrane dane.",
      "github": "Zobacz kod źródłowy na GitHubie",
      "meta": "Bezpłatne · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Urządzenia Amazfit — dostępne wskaźniki zależą od modelu",
      "stage": {
        "hint": "Otwórz wersję demonstracyjną",
        "note": "Prawdziwa aplikacja z danymi syntetycznymi. Nie łączy się z Twoim kontem.",
        "loading": "Uruchamianie aplikacji…",
        "exit": "Opuść wersję demonstracyjną",
        "unavailable": "Wersja demonstracyjna jest niedostępna w tej przeglądarce. Zapoznaj się z poniższymi sekcjami lub przejrzyj kod źródłowy."
      },
      "demo": "Zobacz wersję próbną",
      "edition": "ZeppBridge 3 · Syntetyczne dane demonstracyjne. Pobierz najnowsze stabilne wydanie, aby korzystać z własnych danych."
    },
    "handoff": {
      "chat": "Czat AI",
      "you": "Ty",
      "file": "ZeppBridge ostatnie 14 dni.md",
      "prompt": "Uporządkuj zapisy w tej syntetycznej próbce. Wymień ich źródła, daty i brakujące pola bez formułowania ocen medycznych.",
      "answer": "Przykładowy plik porządkuje zapisy snu i treningów według dat. Okresy bez pomiarów pozostają puste. Przed porównaniem zakresów sprawdź, czy ich źródła i pokrycie danych są zgodne; te zapisy nie wyjaśniają przyczyn zmian.",
      "note": "Syntetyczna rozmowa przykładowa. Ta strona nie przesyła żadnego pliku ani nie łączy się z żadną sztuczną inteligencją. W codziennym użytkowaniu to Ty decydujesz, czy wysłać dane do zewnętrznej usługi.",
      "close": "Zamknij"
    },
    "privacy": {
      "kicker": "Dane i prywatność",
      "heading": "Twoje archiwum jest lokalne. Ścieżki przepływu danych są przejrzyste.",
      "lead": "Standardowa synchronizacja pobiera dane zdrowotne z Zepp bezpośrednio na Twój komputer. Korzystanie z zewnętrznej sztucznej inteligencji to osobny krok, na który decydujesz się świadomie.",
      "nodes": {
        "watch": "Zegarek i aplikacja Zepp",
        "cloud": "Chmura Zepp",
        "computer": "Lokalne archiwum zdrowotne",
        "export": "Wybrana zewnętrzna AI"
      },
      "flowNote": "Zegarek przesyła dane przez aplikację Zepp na telefonie, zanim ZeppBridge rozpocznie synchronizację. Witryna nie przechowuje Twojego archiwum zdrowotnego.",
      "exportNote": "Opcjonalny eksport · Samodzielnie przejrzyj i wyślij",
      "services": {
        "title": "Usługi witryny o ściśle ograniczonych rolach",
        "copy": "Oficjalne wywołania zwrotne autoryzacji i odświeżanie tokenów korzystają z usług witryny; sprawdzanie aktualizacji odczytuje informacje o wydaniach. Raporty o problemach przesyłają ograniczone dane diagnostyczne wyłącznie po Twoim potwierdzeniu i bez odczytów zdrowotnych."
      },
      "docs": "Przeczytaj pełny opis granic przetwarzania danych",
      "points": [
        {
          "title": "Domyślny bezpieczny magazyn poświadczeń systemu operacyjnego",
          "copy": "Poświadczenia są domyślnie przechowywane w bezpiecznym magazynie systemu operacyjnego. Niektóre platformy oferują opcjonalne przechowywanie w pliku o innym poziomie ochrony."
        },
        {
          "title": "Lokalne nie oznacza zaszyfrowane",
          "copy": "Baza danych zdrowotnych jest domyślnie niezaszyfrowana. Na współdzielonym komputerze korzystaj z osobnych kont użytkowników i chroń swoje kopie zapasowe."
        },
        {
          "title": "To Ty inicjujesz eksport",
          "copy": "Pakiety dla AI są przygotowywane i anonimizowane lokalnie. Po ich wysłaniu zastosowanie mają zasady prywatności odbiorcy. Zwykłe eksporty i pełne kopie zapasowe zawierają różne informacje."
        }
      ]
    },
    "connect": {
      "kicker": "Połącz swoje dane",
      "heading": "Zacznij od oficjalnej autoryzacji",
      "lead": "Jedna codzienna ścieżka. Zaawansowane metody połączenia sprawdzaj tylko wtedy, gdy potrzebujesz dodatkowych wskaźników.",
      "recommended": "Zalecany start",
      "advanced": "Zaawansowane alternatywy",
      "edition": "Oto aktualne metody połączenia w v3. Sprawdź informacje o wydaniu, aby poznać punkty wejścia i możliwości wersji stabilnej.",
      "docs": "Przeczytaj poradnik łączenia",
      "paths": [
        {
          "title": "Oficjalna autoryzacja Zepp",
          "copy": "Otwórz stronę autoryzacji Zepp we własnej przeglądarce i zaloguj się zwykłą metodą.",
          "detail": "Odczytuje oficjalnie udostępniane dane o śnie, tętnie, krokach, treningach, PAI i wadze, zależnie od zapisów zgromadzonych na Twoim koncie."
        },
        {
          "title": "Zaawansowane połączenie danych",
          "copy": "Wybierz tę ścieżkę, aby uzyskać dostęp do HRV, natlenienia krwi (SpO₂), stresu lub gotowości do wysiłku.",
          "detail": "Wymaga logowania adresem e-mail lub numerem telefonu. Zapewnia inne pola danych; nie każde urządzenie mierzy lub zwraca wszystkie z nich."
        },
        {
          "title": "Ręczne poświadczenia",
          "copy": "Dla użytkowników zaznajomionych z API, którzy uzyskali dane uwierzytelniające legalną drogą pod własną kontrolą.",
          "detail": "Wprowadź token, identyfikator użytkownika i adres regionalny. Nigdy nie importuj tokena z nieznanego źródła ani nie udostępniaj go publicznie."
        }
      ],
      "note": "Twoje urządzenie, zapisy w chmurze i wybrana ścieżka połączenia decydują o dostępnych polach. Pusta odpowiedź nie oznacza, że urządzenie nie jest obsługiwane. Są to alternatywne metody, a nie trzy wymagane kroki."
    },
    "final": {
      "kicker": "Pobieranie · Publiczne wydanie stabilne",
      "heading": "Zachowaj kopię na własnym komputerze",
      "lead": "Bezpłatne i otwartoźródłowe. Synchronizacja korzysta z Twojego istniejącego konta Zepp; nie ma osobnego konta ZeppBridge.",
      "docs": "Instalacja i uwagi do wydania",
      "facts": {
        "channel": "Pliki do pobrania zawierają najnowsze stabilne wydanie ZeppBridge 3. Wersja demonstracyjna korzysta z danych syntetycznych; zobacz informacje o wydaniu, aby poznać zmiany w poszczególnych wersjach.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Przeglądanie i eksportowanie nie wymagają sztucznej inteligencji. Zewnętrzna AI korzysta z usługi i konta, które sam wybierzesz.",
        "windows": "Instalatory dla systemu Windows nie posiadają jeszcze zaufanego podpisu cyfrowego. Mogą pojawić się ostrzeżenia filtra SmartScreen lub o nieznanym wydawcy. Przed instalacją zweryfikuj oficjalne źródło wydania.",
        "macos": "Kompilacje dla systemu macOS są niepodpisane i nienotaryzowane. Pierwsze uruchomienie może zostać zablokowane; postępuj zgodnie z instrukcjami instalacji projektu."
      }
    },
    "footer": {
      "tagline": "Lokalny pomost dla danych Amazfit i Zepp.",
      "disclaimer": "ZeppBridge to niezależny projekt otwartoźródłowy uczestniczący w programie Zepp Developer Partner, a nie oficjalny produkt Zepp. Znaki towarowe Zepp i Amazfit należą do ich właścicieli.",
      "source": "Kod źródłowy"
    },
    "faq": {
      "heading": "Kilka ważnych kwestii na początek",
      "lead": "Sześć najczęstszych pytań. Dokumentacja projektu opisuje szczegółowe ustawienia oraz różnice między wersjami.",
      "docs": "Dokumentacja projektu",
      "items": [
        {
          "question": "Jakich kont potrzebuję?",
          "answer": "Synchronizacja wymaga Twojego dotychczasowego konta Zepp oraz aplikacji Zepp na telefonie. Nie ma osobnego konta ZeppBridge. Strona demonstracyjna nie wymaga logowania."
        },
        {
          "question": "Czy aplikacja obsługuje moje urządzenie i wskaźniki?",
          "answer": "Dane pochodzą z Twojego konta w chmurze Zepp. Dostępne pola zależą od tego, co zmierzyło urządzenie, co zapisała chmura i jakiej metody połączenia użyto. Żaden model nie gwarantuje wszystkich wskaźników."
        },
        {
          "question": "Czy mogę korzystać z aplikacji offline?",
          "answer": "Wcześniej zapisane dane można przeglądać i eksportować offline. Logowanie, nowe synchronizacje i sprawdzanie aktualizacji wymagają połączenia z siecią. Zegarek nadal przesyła dane przez aplikację Zepp."
        },
        {
          "question": "Czy pusty wykres oznacza zero?",
          "answer": "Nie. Brak pomiaru, brak synchronizacji i brak zdekodowania to różne stany. Brakujące wartości nigdy nie są zastępowane zerem, wcześniejszym odczytem ani szacunkiem."
        },
        {
          "question": "Czy muszę korzystać ze sztucznej inteligencji?",
          "answer": "Nie. Eksporty są przygotowywane lokalnie. Zewnętrzna AI otrzymuje dane tylko wtedy, gdy sam je wkleisz lub prześlesz. Przed wysłaniem sprawdź zakres danych, anonimizację i zasady prywatności usługi."
        },
        {
          "question": "Czy pobrana wersja będzie wyglądać tak jak demo?",
          "answer": "Wersja demonstracyjna przedstawia ZeppBridge 3 na danych syntetycznych. Pobrane pliki zawierają najnowsze stabilne wydanie. Przed wysłaniem planu sprawdź historię wydań i zgodność ze swoim zegarkiem."
        }
      ]
    },
    "rebuild": {
      "featuresHeading": "Zobacz swój czas w zgromadzonych zapisach.",
      "featuresLead": "Sen, tętno, treningi i plany. Zobacz, jak łączą się poszczególne elementy Twojego archiwum.",
      "demoHeading": "Wypróbuj przed pobraniem",
      "demoLead": "Prawdziwy interfejs V3 z danymi syntetycznymi. Bez logowania, bez dostępu do Twoich prywatnych danych.",
      "mobileHint": "To jest aplikacja komputerowa. Na telefonie otwórz ją na pełnym ekranie; do pełnej interakcji użyj komputera.",
      "fullscreen": "Otwórz demonstrację komputerową na pełnym ekranie",
      "retry": "Uruchom demo ponownie",
      "play": "Odtwórz demo",
      "pause": "Wstrzymaj demo",
      "mediaNote": "V3 · Dane syntetyczne · Nagrano w trybie ciemnym",
      "moreConnections": "Więcej sposobów połączenia",
      "partner": "Program partnerski Zepp Developer Partner",
      "disclaimer": "ZeppBridge to niezależny projekt otwartoźródłowy uczestniczący w programie Zepp Developer Partner, a nie oficjalny produkt Zepp. Znaki towarowe Zepp i Amazfit należą do ich właścicieli.",
      "docsHeading": "Dobry punkt wyjścia.",
      "guide": "Przewodnik konfiguracji i użytkowania",
      "versions": "Wersje i uwagi do wydania",
      "community": "Kod źródłowy i społeczność",
      "privacyDoc": "Dane i prywatność",
      "star": "Uważasz projekt za przydatny? Gwiazdka na GitHubie pomoże innym go odnaleźć.",
      "dismiss": "Zamknij",
      "nav": [
        "Funkcje",
        "Dane i prywatność",
        "Wypróbuj aplikację",
        "Poradnik"
      ],
      "title": [
        "Historia z Twojego zegarka.",
        "Twój własny komputer."
      ],
      "stories": [
        {
          "eyebrow": "Lokalne archiwum",
          "title": "Zapewnij swoim danym lokalną kopię",
          "body": "Połącz własne konto Zepp i przechowuj dane o tętnie, śnie i treningach z chmury na swoim komputerze. Zsynchronizowane dane można przeglądać w trybie offline.",
          "bullets": [
            "Zsynchronizowane dane dostępne offline",
            "Sprawdzaj źródła i pokrycie danych"
          ]
        },
        {
          "eyebrow": "Historia snu",
          "title": "Zapewnij każdej nocy miejsce w historii",
          "body": "Przeglądaj historię snu i sprawdzaj czas trwania oraz fazy każdej nocy. Noce bez zegarka pozostają puste; dane nie zastępują diagnozy medycznej.",
          "bullets": [
            "Historia i fazy snu noc po nocy",
            "Noce bez pomiaru pozostają puste"
          ]
        },
        {
          "eyebrow": "Tętno i luki pomiarowe",
          "title": "Brak pomiaru, brak wartości",
          "body": "Brakujące próbki pozostają puste. Nigdy nie są zastępowane zerem, poprzednią wartością ani szacunkiem. Brak synchronizacji to co innego niż brak pomiaru.",
          "bullets": [
            "Luki pozostają na wykresie",
            "Brakujące odczyty nie są wypełniane zerem"
          ]
        },
        {
          "eyebrow": "Treningi i aktywność",
          "title": "Zachowaj historię każdego treningu",
          "body": "Przeglądaj treningi, szczegóły i trendy formy. Dostępne wskaźniki zależą od urządzenia i zsynchronizowanych danych; sprawdź pokrycie przed porównaniem.",
          "bullets": [
            "Szczegóły treningu i trendy formy",
            "Wykorzystaj już dostępne zapisy"
          ]
        },
        {
          "eyebrow": "Przekazywanie do AI",
          "title": "Wybierz zakres, a potem odbiorcę",
          "body": "W wersji demonstracyjnej v3 wybierz dane oraz zakres dat i sprawdź przygotowany plik. Pakiet powstaje lokalnie; zewnętrzna AI otrzymuje go dopiero po wysłaniu treści.",
          "bullets": [
            "Wybieraj daty i zakres danych",
            "Przejrzyj przed samodzielnym wysłaniem"
          ]
        },
        {
          "eyebrow": "Przegląd planu",
          "title": "Sprawdź przed kolejnym krokiem",
          "body": "Importuj i weryfikuj plany treningowe w ZeppBridge 3. Przesłanie planu do zegarka zależy od obsługi przez dane urządzenie i weryfikacji zgodności.",
          "bullets": [
            "Widok tygodniowy i przegląd dzienny",
            "Przesłanie zależy od weryfikacji urządzenia"
          ]
        },
        {
          "eyebrow": "Ustawienia archiwum",
          "title": "Określ rytm swojego archiwum",
          "body": "Dostosuj synchronizację, czas przechowywania i interfejsy lokalne. Opcje mogą się różnić w zależności od wersji; sprawdź ich przeznaczenie przed włączeniem.",
          "bullets": [
            "Kontrola synchronizacji i przechowywania",
            "Samodzielnie włączaj interfejsy lokalne"
          ]
        }
      ],
      "learnFeatures": "Poznaj funkcje",
      "languageFallback": "Nie udało się załadować tego języka. Wyświetlono wersję angielską; wybierz język ponownie, aby spróbować jeszcze raz."
    }
  },
};

export default pack;
