Do wszystkich przyjaciół korzystających z ZeppBridge,

Cześć, z tej strony Lingcang.

Tym razem przygotowałem dużą aktualizację. Na samym początku chciałbym podziękować trójce współtwórców: felipepmdias, Jax Tsai oraz andrejd1.

Dzięki pracy, jaką felipepmdias włożył w rozszyfrowanie danych treningu siłowego Zepp, nowa wersja wreszcie obsługuje szczegółowy podział na serie oraz mapę mięśni, dzięki czemu trening siłowy w ZeppBridge stał się naprawdę użyteczny. Z kolei Jax Tsai i andrejd1 pomogli mi poprawić wydajność na Linuksie. Sam nie mam komputera z Linuksem, więc każde z tych ulepszeń testowali krok po kroku na własnych maszynach. Bez nich wielu rzeczy nie byłbym w stanie zrobić sam. Dziękuję Wam — a także wszystkim użytkownikom Linuksa, którzy cierpliwie przesyłali swoje uwagi.

W ciągu ostatnich dwóch tygodni bez nowej wersji dostałem więcej listów niż kiedykolwiek wcześniej. Dziękuję wszystkim, którzy napisali, żeby dodać mi otuchy, sprawić mi radość albo podzielić się najróżniejszymi pomysłami. Nigdy wcześniej nie miałem tylu przyjaciół do korespondencji.

Niektórzy z Was wspominali, że nie mogą znaleźć opcji „Skrzynka na listy”, dlatego dodałem w prawym górnym rogu przycisk listu: jedno kliknięcie pozwala napisać wiadomość, przytrzymanie otwiera skrzynkę, a gdy pojawi się nowa odpowiedź, zapala się mała czerwona kropka. Jeśli podczas korzystania z aplikacji cokolwiek wyda Ci się niewygodne, po prostu do mnie napisz — nie martw się, że przeszkadzasz. Sama możliwość czytania Waszych listów sprawia mi ogromną radość.

Chciałbym teraz opowiedzieć o trzech rzeczach z tej aktualizacji, na których najbardziej mi zależało. Zajęły mi większość ostatnich dwóch tygodni, a nad częścią z nich długo myślałem i wahałem się nie jeden raz.

**O chmurowych Personal Agentach**

Ostatnio testowałem chmurowych asystentów osobistych takich jak Muse i Hark. Im dłużej z nich korzystam, tym bardziej czuję, że mogą zmienić nasz styl życia — tak samo, jak Coding Agent zmienia dziś tworzenie oprogramowania.

Opowiem Wam, jak wyglądały moje ostatnie dwa tygodnie.

Połączyłem ZeppBridge z własną stroną internetową, żeby Hark mógł na bieżąco pobierać moje dane zdrowotne. Każdego ranka po przebudzeniu wystarczy, że otworzę Zepp i zsynchronizuję nocny sen. Zanim umyję zęby i twarz, Hark zdąży już podsumować jakość mojego snu i regenerację organizmu, a do tego zaproponuje trening na dany dzień.

Tak samo jest w drodze powrotnej z biegania. Wystarczy zsynchronizować dane, a od razu dostaję analizę dopiero co ukończonego długiego wybiegania: czy tętno nie było za wysokie, czy w drugiej połowie nie zwolniłem i czy kadencja wyraźnie się zmieniła. Jeśli chcę jeszcze dokładniej skorygować plan treningowy, po powrocie do komputera mogę użyć funkcji „Wyślij do AI” w ZeppBridge i spokojnie omówić wszystko z GPT albo Claude.

Wszystko to było możliwe już wcześniej, ale zawsze wymagało ode mnie, żebym o tym pamiętał, sam zebrał dane i sam zaczął rozmowę. Personal Agent zdejmuje z głowy ten krok, który najłatwiej pominąć: sam początek.

To doświadczenie przekonało mnie, żeby udostępnić tę funkcję użytkownikom ZeppBridge. Skoro sam ją tak bardzo polubiłem, dlaczego nie dać jej wypróbować każdemu?

Wahałem się jednak bardzo długo. Od samego początku ZeppBridge obiecywało stawiać na lokalne przechowywanie danych, a pozwolenie asystentowi w chmurze na stały odczyt danych zdrowotnych wymaga szczególnej ostrożności.

Dlatego ta funkcja jest domyślnie wyłączona. Dopóki sam jej nie uruchomisz, ZeppBridge nie wyśle przez nią żadnych Twoich danych na zewnątrz, a dotychczasowy sposób korzystania z aplikacji w niczym się nie zmieni.

Nawet jeśli zdecydujesz się ją włączyć, musisz przygotować własną witrynę, skonfigurować wymienialny klucz dostępu i sparować go ze swoim asystentem osobistym. Być może nie jest to rozwiązanie dla każdego, ale jeśli masz ochotę spróbować, gorąco je polecam.

Coraz mocniej wierzę, że tacy asystenci — którzy potrafią troszczyć się o nas z własnej inicjatywy, rozumieją nas i podsuwają pomoc we właściwym momencie — staną się częścią naszego codziennego życia.

**„Stage Manager” w szczegółach treningu**

To problem, który chodził za mną już od wersji 3.0.0.

Przeprojektowałem karty niemal na każdym ekranie, a jedynie strona szczegółów treningu wciąż czekała na swoją kolej. Starsi użytkownicy pewnie pamiętają, że w zasadzie pozostała w niej jeszcze konstrukcja z 1.0.0: karty miały stałe miejsca i rozmiary, bez możliwości swobodnego przestawiania czy łączenia.

Aż w ciągu ostatnich dwóch tygodni, testując iPadOS 27, przypadkiem włączyłem funkcję Stage Manager i nagle przyszło mi do głowy rozwiązanie.

Moim zdaniem najciekawsze w Stage Manager jest to, że daje każdemu oknu własną przestrzeń. Możesz je przesuwać, zmieniać jego rozmiar i na nowo układać relacje między nim a innymi oknami. Pomyślałem więc: dlaczego karty w ZeppBridge nie mogłyby mieć tej samej swobody?

Idąc tym tropem, przeprojektowałem całą stronę szczegółów treningu, starając się przenieść do niej logikę Stage Managera.

Teraz możesz ustawić tętno, tempo i trasę biegu obok siebie na jednym ekranie, analizując swój wysiłek punkt po punkcie. Możesz też wskazać dowolny moment na wykresie i zobaczyć na mapie, gdzie dokładnie wtedy byłeś, żeby lepiej zrozumieć związek między reakcją organizmu a terenem. W treningu siłowym możesz nawet zestawić mapę mięśni z listą serii i od razu zobaczyć, które partie mięśni pracowały w każdej serii.

Chciałbym, żeby każdy mógł ułożyć dokładnie te dane, na których najbardziej mu zależy, tak jak jest mu najwygodniej.

A odkrywanie kolejnych ciekawych układów zostawiam już Wam.

**Nowe podejście do ZeppBridge CLI**

Poza znaną Wam już funkcją „Wyślij do AI”, ZeppBridge ma wbudowane także MCP i CLI, dzięki którym narzędzia AI mogą bezpośrednio korzystać z lokalnych danych — bez pobierania i instalowania czegokolwiek dodatkowo.

Szczerze mówiąc, ta część była dotąd zrobiona dość pobieżnie. Dopiero niedawne zaproszenie od twórcy SparkyFitness sprawiło, że znów przyjrzałem się jej z należytą uwagą.

Tym razem skupiłem się na dwóch głównych rzeczach.

Po pierwsze, AI przeszło od „tylko podglądu” do „pomocy w prowadzeniu zapisków”.

Teraz możesz poprosić AI połączone z ZeppBridge o zapisanie kontuzji, zawodów, butów biegowych i odczuć po treningu, a także o poprawienie błędnie rozpoznanego typu aktywności. Wystarczy na przykład powiedzieć: „Po wczorajszym biegu trochę bolało mnie lewe kolano”, a AI zanotuje to za Ciebie.

Wiem, że pozwolenie AI na modyfikowanie własnych danych może budzić pewien niepokój, dlatego każdy wpis dodany przez AI pojawia się w Ustawieniach w sekcji „Ostatnie zmiany wprowadzone przez AI” i można go w dowolnej chwili cofnąć. AI nie ma uprawnień do usuwania danych. Jeśli wolisz, żeby odczytywało tylko wybrane przez Ciebie informacje, możesz włączyć opcję „Tylko udostępnione zadania”, co ograniczy dostęp wyłącznie do udostępnionych treści i całkowicie wyłączy możliwość zapisu.

Ponadto możesz poprosić AI bezpośrednio o synchronizację danych lub eksport plików. Do narzędzi łączonych jednym kliknięciem dołączyły także OpenCode, Grok Build oraz Factory. Jeśli brakuje tu Twojego ulubionego narzędzia, śmiało napisz do mnie list.

Po drugie, ZeppBridge może teraz dzielić się danymi z innymi aplikacjami hostowanymi samodzielnie.

SparkyFitness to otwartoźródłowa, self-hostowana aplikacja do śledzenia zdrowia. Współpraca przy tym projekcie uświadomiła mi, że ZeppBridge może stać się pomostem łączącym dane z Zepp z innymi aplikacjami zdrowotnymi.

W tym celu dodałem do CLI tryb ciągłej pracy. Możesz uruchomić go na domowym NAS-ie albo małym serwerze, aby inne aplikacje mogły pobierać dane o śnie, tętnie, treningach czy wadze.

Ta usługa działa wyłącznie w trybie tylko do odczytu i wymaga klucza dostępu, który możesz unieważnić w każdej chwili. Domyślnie nasłuchuje tylko na lokalnym komputerze, a trasy treningów również nie są domyślnie udostępniane. Usługa nigdy nie uruchamia się sama, więc jeśli jej nie potrzebujesz, możesz ją spokojnie zignorować.

Prace po stronie ZeppBridge są już zakończone, ale adaptacja po stronie SparkyFitness wymaga jeszcze trochę czasu, więc integracja między obiema aplikacjami nie jest na razie gotowa do użycia. Proszę o jeszcze chwilę cierpliwości.

Pisząc te słowa, znów zacząłem się zastanawiać, jak będzie wyglądać przyszłość ZeppBridge.

Być może tym, w czym nadal jestem najlepszy, jest odpowiadanie na Wasze potrzeby, rozwiązywanie drobnych, ale prawdziwych problemów i dorzucanie od czasu do czasu jakiejś nowej animacji, żeby korzystanie z programu sprawiało trochę więcej frajdy.

Ale czy moglibyśmy pójść jeszcze dalej i stworzyć coś, czego dziś nie potrafimy sobie nawet wyobrazić?

Nie wiem. Na razie udało mi się przenieść do tej aplikacji wiele pomysłów, które kiedyś istniały wyłącznie w mojej głowie. Na resztę pewnie potrzeba jeszcze czasu — i dalszego wsłuchiwania się w Wasze historie.

Oto ZeppBridge 3.2.0.

Zima w różnych zakątkach świata wygląda inaczej. Być może, kiedy czytasz ten list, za Twoim oknem właśnie prószy śnieg.

Dorastałem na południu Chin i rzadko kiedy widywałem śnieg. Kiedyś oglądałem zdjęcia japońskiego Aomori zrobione przez pewnego fotografa: gruba warstwa śniegu przykrywała domy, a wzdłuż dróg ciągnęły się wysokie śnieżne ściany. Taka zima wydaje mi się czymś niezwykle odległym.

Nigdy też nie widziałem prawdziwego kominka. Czasem wyobrażam sobie, że pewnego dnia usiądę przy ciepłym kominku, za oknem będzie gęsto padać śnieg, a ja będę miał pod ręką Wasze listy — i czytając je powoli, będę patrzył, jak Agent krok po kroku zamienia w rzeczywistość rzeczy, o których kiedyś mogłem tylko marzyć.

Chyba właśnie o takim życiu marzę.

Życzę Wam wszystkim dużo zdrowia i cudownej zimy!

— Lingcang
