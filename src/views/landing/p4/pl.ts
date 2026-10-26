import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Wygląd', title: 'Miłość od pierwszego wejrzenia.', lead: 'Szklana nawigacja, karty płynnie przekształcające się w strony i dni, które tasujesz niczym talię kart.', points: [
      { id: 'glass', title: 'Szkło', text: 'Przytrzymaj i powoli przeciągnij po nawigacji, a następnie stuknij, aby przełączyć. Krawędzie załamują światło i podążają za Twoim palcem.', scene: 'glass' },
      { id: 'morph', title: 'Płynne przejścia', text: 'Karta rozwija się w pełną stronę i wraca na swoje miejsce po powrocie. Jeden element w centrum uwagi, cała reszta schodzi na dalszy plan.', scene: 'morph' },
      { id: 'poker', title: 'Stół z kartami', text: 'Przeglądaj karty dni, a potem rozłóż wachlarz całego miesiąca i tygodnia. Najlepsze zachowaj w skrytce.', scene: 'poker' },
      { id: 'theme', title: 'Dzień i noc', text: 'Motyw ciemny i jasny. Jedno stuknięcie i zapada noc.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Połączenie', title: 'Twoje dane wracają z chmury na biurko.', lead: 'Połącz konto Zepp, a Twoje zapisy zsynchronizują się z tym komputerem. Wybierz częstotliwość i pozwól działać automatycznej synchronizacji.', points: [
      { id: 'account', title: 'Oficjalne logowanie', text: 'Zaloguj się do Zepp w przeglądarce systemowej. Konta innych dostawców również działają. Sprawdzaj stan autoryzacji w dowolnym momencie.', scene: 'account' },
      { id: 'sync', title: 'Automatyczna synchronizacja', text: 'Wyłączona, co 15, 30 lub 60 minut. Ty śpisz, aplikacja synchronizuje.', scene: 'sync' },
      { id: 'devices', title: 'Rozpoznaje Twój zegarek', text: 'Modele są rozpoznawane automatycznie. Jeśli któryś się nie zgadza, wskaż właściwy.', scene: 'devices' },
      { id: 'local', title: 'Zostaje na tym komputerze', text: 'Dane zdrowotne pobrane z Zepp są zapisywane na tym komputerze i nigdy nie przechodzą przez nasze serwery. To Ty decydujesz, co trafi do AI.', scene: 'local' },
    ] },
    { id: 'records', name: 'Zrozumienie', title: 'Dziesiątki wskaźników na jednym ekranie.', lead: 'Wszystkie trendy na jednej stronie, dzięki czemu od razu widzisz, w jakiej formie jest Twoje ciało. Otwórz wskaźnik, aby przejrzeć pełną historię.', points: [
      { id: 'overview', title: 'W Twojej kolejności', text: 'Najpierw sen czy trening: strona główna dopasowuje się do tego, co dla Ciebie najważniejsze. Przewiń i otwórz szczegóły.', scene: 'overview' },
      { id: 'hourly', title: 'Godzina po godzinie', text: 'Kroki, dystans i kalorie podsumowane dla każdej godziny dnia.', scene: 'hourly' },
      { id: 'workouts', title: 'Każdy bieg ma swoje echo', text: 'Porównaj bieżący trening ze swoimi wcześniejszymi biegami na podobnym dystansie, sprawdzając tętno, tempo i trasę.', scene: 'workouts' },
      { id: 'gaps', title: 'Zero zmyślonych danych', text: 'Jeśli coś nie zostało zmierzone, pozostaje puste. Bez dopisywania zer, wcześniejszych odczytów ani szacunków.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'Przekaż do AI', title: 'Wykorzystaj subskrypcję, którą już opłacasz.', lead: 'Wybierz dni, a Twoje dane połączą się w jeden plik. Przekaż go sztucznej inteligencji, z której korzystasz na co dzień, poprowadź rozmowę i przenieś wersję roboczą z powrotem.', points: [
      { id: 'providers', title: 'Siedem modeli do wyboru', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao i Grok. Wykorzystaj własne konto i dostępny limit.', scene: 'ai' },
      { id: 'prompt', title: 'Pytaj po swojemu', text: 'Edytuj gotowe pytanie lub napisz własne od podstaw.', scene: 'prompt' },
      { id: 'events', title: 'Kontekst ma znaczenie', text: 'Zanotuj przeziębienie, podróż lub intensywny tydzień w pracy, aby AI lepiej rozumiała wahania formy.', scene: 'events' },
      { id: 'autopaste', title: 'Pełna automatyzacja · Windows', text: 'Po włączeniu aplikacja sama wkleja i wysyła treść, weryfikując stan strony przed każdym krokiem. Domyślnie wyłączona.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Plan treningowy', title: 'Dopracuj na komputerze. Trenuj z zegarkiem na ręku.', lead: 'Opisz sztucznej inteligencji swoje samopoczucie, a ułoży plan na cały tydzień. Wklej go z powrotem, dopasuj szczegóły i wyślij na zegarek.', points: [
      { id: 'receive', title: 'Wklej z powrotem', text: 'Z rozmowy prosto do wersji roboczej: skopiuj odpowiedź, a otrzymasz gotowy tygodniowy plan.', scene: 'receive' },
      { id: 'edit', title: 'Twój własny plan', text: 'Przeciągnij, aby zamienić dwa dni miejscami, otwórz dowolny dzień i zmień czas trwania oraz intensywność każdego etapu. Najedź kursorem, by poznać szczegóły.', scene: 'plan-edit' },
      { id: 'templates', title: 'Szablony i import', text: 'Zapisz plan jako szablon na przyszłość. Możesz także importować pliki treningowe .zwo oraz .fit.', scene: 'templates' },
      { id: 'easy', title: 'Gorszy dzień', text: 'Gdy zaplanowano interwały, a gotowość do wysiłku jest niższa niż zwykle, zmień trening na regeneracyjny jednym stuknięciem. Przed wysłaniem zatwierdzasz każdą zmianę.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sen', text: 'Od faz pojedynczej nocy po trendy z ostatnich siedmiu dni. Otwórz i przewiń w dół.' },
    workouts: { title: 'Treningi', text: 'Zobacz pełny obraz całej sesji i sprawdź, czym różni się od poprzednich.' },
  },
  settings: {
    title: 'Ustawienia',
    lead: 'Przeglądaj duże karty pojedynczo; małe układają się w podręczny wizytownik. Konto, synchronizacja, wyświetlanie i dane dostępne za jednym dotknięciem.',
    summaryTitle: 'Wszystkie szczegóły znajdziesz w Ustawieniach.',
    summaryLead: 'Czternaście codziennych opcji zebranych w jednym stosie kart.',
    items: [
      { id: 'sync', title: 'Automatyczna synchronizacja', text: 'Wyłączona, co 15, 30 lub 60 minut. Wybierz odpowiednią.', icon: 'auto-sync' },
      { id: 'retention', title: 'Dziesięć lat, na tym komputerze', text: 'Pobierz do dziesięciu lat historii na ten komputer i zachowaj je. Twoje dane nie znikną wraz z oknem retencji w chmurze.', icon: 'database' },
      { id: 'data', title: 'Pokrycie danych', text: 'Co można zsynchronizować, a czego nie — wszystko widać jak na dłoni.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Narzędzia lokalne, takie jak Claude Code czy Codex, mogą odpytywać bazę bezpośrednio. Wysyłanie planów wymaga osobnej zgody.', icon: 'structured-data' },
      { id: 'formats', title: 'Cztery formaty', text: 'JSON · CSV · GPX, a na stronie treningu także FIT.', icon: 'document' },
      { id: 'units', title: 'Jednostki', text: 'Kilometry lub mile. Dystans i tempo przełączają się wspólnie.', icon: 'settings' },
      { id: 'time', title: 'Format czasu', text: 'Zgodnie z Twoim regionem lub w formacie 12- albo 24-godzinnym.', icon: 'auto-sync' },
      { id: 'date', title: 'Format daty', text: 'Dzień, miesiąc i rok w kolejności, do której jesteś przyzwyczajony.', icon: 'document' },
      { id: 'scale', title: 'Skala interfejsu', text: 'Powiększ lub pomniejsz całe okno programu.', icon: 'overview' },
      { id: 'backup', title: 'Migawki i przywracanie', text: 'Twórz migawki bazy danych i przywracaj je w razie potrzeby.', icon: 'database' },
      { id: 'api', title: 'Lokalne API', text: 'Powiązane z 127.0.0.1. Wyłącznie do odczytu, wymaga tokena.', icon: 'structured-data' },
      { id: 'privacy', title: 'Prywatność i bezpieczeństwo', text: 'Poświadczenia chroni system operacyjny. Tokeny nigdy nie trafiają do dzienników zdarzeń.', icon: 'browser-login' },
      { id: 'filename', title: 'Nazwy plików', text: 'Sam decydujesz, jak mają się nazywać pliki przygotowywane dla AI.', icon: 'document' },
      { id: 'folder', title: 'Zabierz wszystko ze sobą', text: 'Twoje dane znajdują się w folderze na tym komputerze, a wszystko, co tutaj zapisano — oceny, plany czy zadania AI — wyeksportujesz do jednego pliku JSON.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'Poznaj ZeppBridge', links: [{ id: 'motion', label: 'Wygląd' }, { id: 'connection', label: 'Połączenie' }, { id: 'records', label: 'Zrozumienie' }] },
    { label: 'Od danych do działania', links: [{ id: 'ai', label: 'Przekaż do AI' }, { id: 'ai-plan', label: 'Plan treningowy' }, { id: 'record-sleep', label: 'Sen i treningi' }] },
    { label: 'Po Twojemu', links: [{ id: 'connect', label: 'Ustawienia' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'Lokalne API' }] },
  ],
  demoPrompt: 'W przyszłą środę nie mam czasu. Zostaw jeden trening interwałowy, a resztę zaplanuj jako spokojne bieganie.',
};

export default pack;
