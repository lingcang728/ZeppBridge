<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Deine Zepp-Daten, zurück in deiner Hand.</strong></p>
  <p>Sieh dir deine Amazfit-Gesundheitsdaten an, archiviere und exportiere sie auf deinem eigenen Windows-, macOS- oder Linux-Rechner.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#download-und-installation)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#download-und-installation)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.nl.md">Nederlands</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.pt-PT.md">Português</a> · <strong>Deutsch</strong> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <a href="README.fr.md">Français</a></p>
</div>

> [!IMPORTANT]
> ZeppBridge ist ein unabhängiges, inoffizielles Open-Source-Projekt. Es steht in keiner Verbindung zu Zepp Health, Huami oder Amazfit und wird von diesen nicht unterstützt. Verwende es nur mit Konten und Daten, auf die du zugriffsberechtigt bist.

> Die App gibt es in zehn Sprachen; beim ersten Start folgt sie deiner Systemsprache, und in den Einstellungen gibt es einen Umschalter. Diese Seite ist eine Übersetzung der [englischen Originalfassung](README.md) — bei Abweichungen gilt die englische Fassung. Die verlinkten Detail-Guides unten liegen bislang nur auf Englisch und Chinesisch vor.

## Gibt es das nicht schon in der Zepp-App?

Doch — aber nur auf dem Handy, nur so, wie die offizielle App es zeigen will, und auf einem fremden Server. ZeppBridge löst ein paar konkrete Probleme:

- **Auf einem richtigen Bildschirm ansehen.** Langzeittrends für Herzfrequenz, Schlaf, Training, Erholung, Stress und SpO₂ — über 7 Tage / 1 Monat / 6 Monate.
- **Die Daten liegen auf deinem eigenen Rechner.** Alles landet in einer Datei auf deiner Maschine. Sie funktioniert weiter offline, über Handywechsel, Kontolöschungen und App-Neugestaltungen hinweg.
- **Du kannst den Verlauf von vor der Installation nachladen.** Monat für Monat, pausierbar und fortsetzbar — und ehrlich darüber, für welche Monate die Cloud wirklich nichts hatte und welche schlicht noch nicht abgerufen wurden.
- **Backups, die tatsächlich funktionieren.** Vollständige Datenbank-Schnappschüsse mit Prüfsummen und Integritätsprüfung, sowie ein Vergleich der Datensatzanzahl, bevor du wiederherstellst.
- **Export, wann immer du willst.** JSON, CSV und GPX — direkt in Excel, Strava oder eigene Skripte.
- **In einem Schritt an eine KI übergeben.** Zeitraum und Datentypen wählen; die App verpackt alles in einer für Modelle lesbaren Form, entfernt identifizierende Details und kopiert es in die Zwischenablage.
- **Nutzbar, ohne ein Fenster zu öffnen.** Mit nicht-interaktiver CLI (planbar über Task Scheduler oder cron) und einem schreibgeschützten MCP-Server, damit ein Modell deine lokalen Daten abfragen kann, ohne dass sie deinen Rechner verlassen.

Eines sei klar gesagt: **Die App beschönigt deine Daten nicht.**

Hast du die Uhr an einem Tag nicht getragen, hat der Chart an dieser Stelle eine Lücke. Hat deine Uhr etwas nie gemessen, steht im Interface „nicht angegeben" — niemals `0`. Kein GPS-Track bedeutet keine Karte. Bei Gesundheitsdaten ist eine erfundene, glatte Kurve schlimmer als eine ehrliche Lücke.

Dasselbe gilt für das Wort „vollständig": Das Interface behauptet eine **vollständige lokale Kopie** erst, wenn das Abdeckungsprotokoll zeigt, dass jeder Monatsabschnitt einen Abschluss erreicht hat. Bis dahin steht dort „eine lokale Kopie des erfolgreich synchronisierten Zeitraums".

## Welche Geräte werden unterstützt

**Wenn dein Gerät mit der Zepp-App synchronisiert, lohnt sich ein Versuch.** ZeppBridge liest, was dein Konto in der Cloud gespeichert hat; es spricht nicht direkt mit der Uhr und ist daher nicht an bestimmte Modelle gebunden.

Der mitgelieferte Katalog erkennt 52 Amazfit-Produkte aus den Familien **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio und Band** (Uhren, Bänder, Armbänder, Ringe). Erkannte Geräte zeigen den korrekten Modellnamen und ein Produktbild; unbekannte Geräte synchronisieren trotzdem — sie zeigen nur einen generischen Namen, und du kannst dein Modell von Hand zuordnen.

Welche Messwerte du tatsächlich bekommst, hängt davon ab, was deine Uhr misst. Nach dem Verbinden listet die Einstellungsseite das für dein Konto einzeln auf.

## Download und Installation

Den aktuellen Build gibt es unter [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. `ZeppBridge_<version>_x64-setup.exe` (oder `.msi`) herunterladen und ausführen.
2. Es gibt noch kein Codesignatur-Zertifikat, daher warnt Windows möglicherweise vor einem unbekannten Herausgeber. Wähle **Weitere Informationen → Trotzdem ausführen**.
3. Spätere Versionen installieren sich darüber; deine Daten bleiben unangetastet.

**macOS (Apple Silicon)**

> **Dies ist ein unsignierter Build.** Es gibt kein Apple-Developer-ID-Zertifikat
> und keine Notarisierung, daher verweigert macOS das Öffnen, bis du die
> Quarantäne-Markierung selbst entfernst. Die folgenden Schritte sind ein
> bewusster Workaround, keine Lösung — siehe
> [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. `ZeppBridge_<version>_aarch64.dmg` herunterladen und `ZeppBridge.app` in den Programme-Ordner ziehen.
2. Der erste Start schlägt fehl. Welche Meldung erscheint, hängt von deiner macOS-Version ab:
   - **„nicht verifizierter Entwickler"** → **Rechtsklick auf die App → Öffnen → Öffnen.**
   - **„ZeppBridge ist beschädigt und kann nicht geöffnet werden"** → Rechtsklick hilft
     hier *nicht*. Führe stattdessen dies im Terminal aus und öffne die App danach
     ganz normal:

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   Die App ist nicht wirklich beschädigt. Diese Meldung zeigt Gatekeeper bei jedem
   heruntergeladenen Paket, das nicht notariell beglaubigt ist. Führe einen solchen
   Befehl nur für Software aus, der du vertraust — bei dieser hier kannst du jede
   Zeile auf GitHub nachlesen und sie selbst bauen.
3. macOS-Builds sind über CI abgedeckt (Kompilieren, Clippy, Tests) sowie einen
   Smoke-Test eines Mitwirkenden auf Apple Silicon. Der Maintainer besitzt keinen
   Mac und kann Sync- oder Schlüsselbund-Verhalten nicht selbst überprüfen. Wenn
   dir das wichtig ist, bevorzuge Windows.

Warum das vorerst so bleibt: Die Notarisierung selbst braucht keinen Mac — CI läuft
bereits auf macOS-Runnern und könnte dort signieren und notarisieren. Was fehlt, ist
eine Mitgliedschaft im Apple Developer Program (99 USD/Jahr), die das Projekt nicht
gekauft hat. Ändert sich das, entfällt dieser Abschnitt.

**Linux (x86_64)**

> **Baut, aber noch niemand hat es ausprobiert.** CI kompiliert, führt die Tests aus
> und baut bei jedem Push die Pakete. Was *nicht* passiert ist: ein vollständiger
> Anmelde-und-Sync-Durchlauf auf einem echten Linux-Desktop — inklusive der Frage,
> ob das Token korrekt im Schlüsselbund landet. Betrachte das als einen Build, den
> du mit testen hilfst, nicht als fertiges Release.

Flatpak, `.deb`, `.rpm` und ein AppImage werden auf der Release-Seite veröffentlicht.
Nichts ist signiert; Downloads gegen `SHA256SUMS.txt` prüfen.

```bash
sudo apt install ./ZeppBridge_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<version>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<version>_x86_64.flatpak  # überall
```

Der [Linux-Guide](docs/guides/linux.md) (Englisch) beschreibt, wohin die Daten
gehen, wie das Token ohne Schlüsselbund gespeichert wird, und wie man aus dem
Quellcode baut.

Es gibt ausserdem ein [Headless-Container-Image](docs/guides/docker.md)
(Englisch) mit nur CLI und MCP-Server, um eine Bibliothek auf einem NAS oder
Server synchron zu halten. Anmelden kann es nicht — dafür braucht es einmalig
die Desktop-App.

**Nicht unterstützt**: Intel-Macs, Mobilgeräte.

### Was auf welcher Plattform verifiziert ist

Dieselbe App, dieselbe Oberfläche, dieselben Funktionen auf allen drei Plattformen —
was sich unterscheidet, ist, wie viel davon tatsächlich schon jemand geprüft hat.
Hier nachzufragen ist besser als zu raten.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Oberfläche und Funktionen | identisch | identisch | identisch |
| In CI gebaut | ja | ja | ja |
| Automatisierte Tests in CI | ja | ja | ja |
| Installer öffnet ohne Workaround | ja (Warnung „unbekannter Herausgeber") | **nein** — siehe Hinweis zum unsignierten Build oben | ja |
| Anmeldung, Sync, Export | vom Maintainer bei jedem Release verifiziert | nur Smoke-Test eines Mitwirkenden | **noch niemand** |
| Anmeldeinformationsspeicher | Credential Manager, verifiziert | Schlüsselbund, nicht unabhängig verifiziert | Secret Service, **noch niemand** |
| Auto-Update | verifiziert | gebaut, nicht unabhängig verifiziert | entfällt — eigene Paketverwaltung |

Der Maintainer entwickelt unter Windows und besitzt weder einen Mac noch nutzt er
Linux auf dem Desktop. Nichts davon bedeutet, dass macOS oder Linux kaputt sind —
es beschreibt nur, wer was geprüft hat. Nutzt du eines der beiden und etwas
funktioniert nicht wie erwartet, ist eine Meldung wirklich hilfreich.

**Ab 1.0.0 werden Schema und Upgrade-Pfad der lokalen Datenbank langfristig
gepflegt**: Jede Migration erstellt zuerst automatisch ein Backup, und
Schnappschüsse können überprüft und wiederhergestellt werden. Deine Daten
bleiben lokal — aber die Schnappschüsse liegen auf derselben Festplatte wie
die Datenbank, also **kopiere bei Sorge vor einem Laufwerksausfall selbst
eines an einen anderen Ort.**

## Erste Verbindung

1. ZeppBridge öffnen und in der Seitenleiste zu **Einstellungen** gehen.
2. Auf Verbinden klicken. Die **offizielle Zepp-Anmeldeseite** öffnet sich in
   einem eigenen Fenster; dort mit den üblichen Zugangsdaten anmelden.
3. Sobald „verbunden" angezeigt wird, schliesst sich das Fenster, und die App
   führt die erste Synchronisierung aus. Das dauert etwa 40 Sekunden.

Sowohl Festland-China- als auch internationale Konten funktionieren; die App
erkennt selbst, zu welchem Regionalserver das Konto gehört.

Die erste Synchronisierung holt 30 Tage, damit schnell etwas auf dem Bildschirm
erscheint, und läuft danach im Hintergrund weiter, bis 180 Tage vorliegen. Der
Fortschritt ist sichtbar und lässt sich jederzeit anhalten. Spätere
Synchronisierungen sind inkrementell.

Jeder „letzte N Tage"-Wähler in der App — auf den Trainings- und
Körperstatus-Seiten sowie auf der Exportseite — liest deine **lokale**
Bibliothek, nicht die Cloud. Wählst du einen Zeitraum, der weiter zurückreicht
als das, was auf diesem Rechner liegt, sagt die App das und bietet an, den Rest
nachzuladen. Eine leere Stelle in einem Chart bedeutet *noch nicht abgerufen*,
nie *du hast damals nichts aufgezeichnet*.

Für einen Verlauf älter als 180 Tage: **Langzeitarchiv und vollständiger
Verlauf** in den Einstellungen verwenden — 1/2/3 Jahre oder einen eigenen
Startpunkt wählen, und es wird Monat für Monat abgerufen. Du kannst jederzeit
anhalten und später weitermachen. Vor dem Start schätzt die App den
Speicherbedarf anhand der tatsächlichen Rate, mit der deine eigenen Daten
anwachsen — nicht anhand einer fest einprogrammierten Konstante.

Überschreitet der Zeitraum dein lokales Aufbewahrungsfenster, verlangt die App
zuerst die Aktivierung der Langzeitarchivierung — sonst würde der gerade
abgerufene Verlauf nach der nächsten erfolgreichen Synchronisierung wieder
bereinigt.

Hängt die Anmeldung fest? Der [Verbindungs-Guide](docs/guides/connection.md)
(Englisch) beschreibt Fehlerbehebung und zwei Ausweichmethoden.

## Was du bekommst

**Trends**

| Seite | Was sie zeigt |
| --- | --- |
| **Übersicht** | Herzfrequenz der letzten Stunden, heutige Schritte, Schlafstruktur der letzten Nacht, diese Woche im Vergleich zu deinen eigenen letzten 28 Tagen, sowie Einstiegspunkte zu Körper- und Trainingsstatus. Jede Karte lässt sich öffnen |
| **Herzfrequenz** | Die vollständige 24-Stunden-Kurve, plus tägliche Trends für Ruheherzfrequenz und HRV nach zwei Definitionen |
| **Tagesaktivität** | Tägliche Trends für Schritte, Distanz, aktive Kalorien und aktive Minuten |
| **Körperstatus** | Erholung, Stress, SpO₂, HRV, Atemfrequenz und Ruheherzfrequenz im Zeitverlauf |
| **Trainingsstatus** | VO₂max, Trainingsbelastung, Laktatschwelle, PAI, und ob das jüngste Trainingsvolumen hoch oder niedrig ist |
| **Letzte Einträge** | Jede Schlafaufzeichnung und jedes Training, jeweils im Detail zu öffnen |
| **Trainingsdetail** | Distanz, Tempo, Herzfrequenz, Kilometersplits, GPS-Track; beim Laufen zusätzlich Leistung und Laufform |
| **Geräte** | Woher das Modell eines Geräts stammt (Katalogtreffer oder eigene Zuordnung), Firmware, letzte Daten — jederzeit neu zuordenbar |
| **Datenzustand** (Einstellungen → Erweitert und Wartung) | Abruf-/Verarbeitungs-/Schreibstatus je Datenstrom — ob eine Lücke „nicht synchronisiert" oder „nie gemessen" bedeutet |

Ein Messwert ohne Daten steht nicht als „—" da; er erscheint einfach nicht.
Und eine Kurve bricht überall dort ab, wo mehr als 15 Minuten ohne Messwert
vergangen sind, statt eine gerade Linie zwischen den beiden Enden zu ziehen.

**Trainingsauswertung und Wochenbericht**

Nach einem Training vergleicht die App es mit deiner eigenen Historie: jüngste
Läufe in derselben Distanzklasse, und wie sich Tempo, Herzfrequenz und
Trainingsbelastung unterscheiden — zusammen mit der Anzahl der Vergleichswerte,
auf denen das beruht, und wie sicher die Aussage ist. **Der Massstab bist du
selbst, nicht ein Bevölkerungsdurchschnitt.** Reichen die Vergleichswerte
nicht aus, wird das gesagt, statt die Messlatte zu senken, um trotzdem einen
Satz zu produzieren. Das sind Fakten und Belege; die Interpretation bleibt
einer KI überlassen.

**An eine KI übergeben**

Mehrere Prompt-Vorlagen sind eingebaut (Leistungszusammenfassung,
Trainingsauswertung, Erholungsbewertung, Schlafanalyse). Vorlage und Zeitraum
wählen — die App verpackt die Daten, entfernt Gerätekennungen und genaue
Standorte, kopiert alles in die Zwischenablage und öffnet die gewählte
KI-Seite.

Eine Trainingsdetailseite hat einen eigenen „An KI übergeben"-Button, der auf
**genau dieses eine Training** beschränkt ist: das Training selbst und die
währenddessen aufgezeichneten Einzelmesswerte. Tagesweise Datensätze wie Schlaf
oder Schrittzahlen gehen nicht mit.

Pakete über 2 MB werden stattdessen als Datei auf den Desktop geschrieben,
bereit zum Hineinziehen in die Unterhaltung.

**Exportdateien**

- **JSON** — vollständig strukturierte Daten, für Skripte oder Modelle
- **CSV** — tabellarische Zusammenfassung für Tabellenkalkulationen
- **GPX** — Standard-Tracks für Strava, Garmin und andere

Was ein Export enthält: Trainingszusammenfassungen (Typ, Start und Ende,
Distanz, Kalorien, durchschnittliche und maximale Herzfrequenz,
Trainingsbelastung), tägliche Messwerte (Schritte, Ruheherzfrequenz, HRV,
SpO2, Stress, Atemfrequenz, PAI, VO2max) und Schlafphasen mit ihrem
Phasenverlauf. **Vollständig** statt **Zusammenfassung** ergänzt zusätzlich
Sekunden-für-Sekunde-Trainingsreihen und einzelne Herzfrequenzmessungen.

`.fit` ist ein eigenes Exportformat, eine Datei pro Training, geschrieben in
einen selbst gewählten Ordner. Es enthält die Sekunden-für-Sekunde-Reihen, die
ZeppBridge aus Zepps Trainingsdetail dekodiert hat: GPS-Track, Herzfrequenz,
Geschwindigkeit, Höhe, Laufleistung, Bodenkontaktzeit und vertikale
Oszillation, dazu Kilometer-Runden und Pausenereignisse. Nie gemessene Felder
fehlen einfach — nichts wird aufgefüllt, damit die Datei vollständig wirkt.
Kadenz ist bewusst weggelassen: ihre Einheit lässt sich mit keinem
Zusammenfassungsfeld, das wir besitzen, in Einklang bringen, und eine falsche
Einheit würde stillschweigend doppelt so hoch angezeigt.

Was ein Export nicht enthält: `.tcx`, Kontodetails, Tokens oder
Geräteseriennummern. GPS-Tracks erscheinen in GPX und FIT, und nur bei
Trainings, die tatsächlich einen Track mitführen.

**Wird mit der Zeit nicht schwerer**

Rohe Cloud-Nutzlasten sind das Grösste in der lokalen Datenbank. ZeppBridge
speichert sie komprimiert — alles neu Synchronisierte kommt bereits komprimiert
an, und der erste Start nach einem Update komprimiert die vorhandenen im
Hintergrund nach und gibt den Speicherplatz frei, mit Fortschrittsanzeige oben
im Fenster, die nach Abschluss verschwindet.

Vor dem Ersetzen einer Nutzlast wird sie erneut dekomprimiert und Byte für
Byte verglichen; nicht Übereinstimmendes wird übersprungen: Die Rohdaten sind
die einzige Grundlage für ein erneutes lokales Parsen, daher ist Nichtkomprimieren
immer besser als falsches Komprimieren. Eine gemessene 211-MB-Datenbank kam
dabei auf 55 MB.

**Einfach laufen lassen**

Beim Schliessen des Fensters bleibt die App im Tray und synchronisiert
weiterhin selbstständig. Soll sie nicht mehr laufen, per Rechtsklick auf das
Tray-Symbol beenden.

**Ohne Fenster**

Jedes Release enthält zusätzlich `zeppbridge-tools-<version>-<platform>.zip`
mit zwei Programmen:

- `zeppbridge-cli` — nicht-interaktiv: `status`, `sync`, `export`. Exit-Codes
  sind ein stabiler Vertrag, daher lässt sie sich sauber per Task Scheduler
  oder cron planen.
- `zeppbridge-mcp` — schreibgeschützter MCP-Server über stdio. Keine Ports,
  kein Netzwerk. Lässt ein Modell deine lokalen Daten abfragen, ohne dass sie
  deinen Rechner verlassen.

Siehe [CLI und MCP](docs/reference/cli-and-mcp.md) (Englisch) für Nutzung und
Konfigurationsbeispiele. Der MCP-Abschnitt in den Einstellungen bietet ausserdem
einen Textblock zum Einfügen bei einer KI, die dich durch die Konfiguration für
deinen Rechner führen kann.

**Lokales schreibgeschütztes REST**

In den Einstellungen lässt sich ein schreibgeschützter, nur an `127.0.0.1`
gebundener Endpunkt für eigene Skripte aktivieren. Standardmässig aus, benötigt
nach Aktivierung ein Token, gibt keine Zugangsdaten zurück und lauscht nie im
lokalen Netzwerk.

## Was sich geändert hat

Änderungen pro Version stehen in [CHANGELOG.md](CHANGELOG.md). Findet
Einstellungen → Software-Update → Nach Updates suchen eine neue Version, zeigt
sie auch direkt die Release-Notizen und den Fortschritt beim Herunterladen.

## Häufige Fragen

**Muss mein Computer eingeschaltet bleiben?**
Nein. Jeder Start holt den verpassten Zeitraum nach.

**Kann ich auf die Zepp-Handy-App verzichten?**
Nein. Die Kette lautet: Uhr → Zepp-App auf dem Handy → Zepp-Cloud →
ZeppBridge. Die Uhr braucht die Handy-App weiterhin zum Hochladen. Gelegentlich
öffnen genügt.

**Könnte das mein Konto sperren?**
ZeppBridge verwendet deine eigenen Zugangsdaten und **stellt ausschliesslich
Leseanfragen** — es gibt im gesamten Projekt keine einzige Schreibanfrage, das
lässt sich durchsuchen (grep). Verhaltensmässig entspricht das dem Öffnen der
offiziellen App, um die eigenen Daten anzusehen. Es bleibt trotzdem eine
inoffizielle Nutzung, und wir können keine Garantien im Namen von Zepp geben.

**Ein Messwert kam leer zurück.**
Zuerst prüfen, ob die Uhr das überhaupt gemessen hat. Manche Messwerte
(Laktatschwelle, VO₂max) aktualisieren sich nur nach bestimmten Trainings,
ein paar Mal im Jahr. Die Einstellungsseite meldet das für jeden einzeln für
dein Konto — dabei gilt: **„nicht abgerufen" ist nicht dasselbe wie „deine Uhr
unterstützt das nicht"**: Zepps API liefert eine leere Antwort sowohl für
tatsächlich nicht existierende Daten als auch für Datenstrom-Namen, die nie
gültig waren — Leere allein beweist also nichts.

**Wo liegen meine Daten?**
- **Windows**: ein `data`-Ordner neben dem Installationsverzeichnis (nicht
  `%APPDATA%`). Einstellungen → Erweitert hat einen Button zum Öffnen.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux**: `~/.local/share/zeppbridge/data` (Flatpak:
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Ein AppImage oder ein
  entpacktes Tarball hält `data/` neben der ausführbaren Datei — siehe
  [Linux-Guide](docs/guides/linux.md) (Englisch).

**Die App startet nicht — es erscheint kein Fenster.**
Der Reihe nach zwei Stellen prüfen:

1. **Der Fehlerdialog.** Seit v2.1.2 zeigt ein Startfehler einen Dialog, der
   den genauen Ordner und den Betriebssystemfehler nennt, statt still
   abzubrechen. Frühere Versionen beendeten sich wortlos, was wie „das
   Tray-Symbol ist da, aber Klick auf Öffnen tut nichts" aussah — dieses
   Symbol war der Rest eines bereits beendeten Prozesses.
2. **Das Log.** `logs/zeppbridge.log` im Datenordner (siehe vorherige Frage),
   plus `logs/startup-error.log`, wenn der letzte Start schon vor dem Fenster
   scheiterte. Hänge beide an eine Fehlermeldung an; sie enthalten Pfade und
   Versionsnummern, keine Kontodaten.

Der häufigste Grund unter Windows ist ein Datenordner, in den die App nicht
schreiben kann — das `.msi` installiert nach `Program Files`, wo ein
Standardbenutzer keine Schreibrechte hat. Seit v2.1.2 weicht die App dann auf
`%APPDATA%\zeppbridge\ZeppBridge\data` aus (ausser dort liegt bereits eine
Datenbank im blockierten Ordner — dann sagt sie das, statt still mit einer
leeren zu starten). Alternativ lässt sich der Pfad über die Umgebungsvariable
`ZEPPBRIDGE_DATA_DIR` frei wählen.

**Sind meine Daten nach der Deinstallation noch da?**
Ja. Die Deinstallation lässt den `data`-Ordner, Backups, das
Abdeckungsprotokoll und die Einstellungen unangetastet. Manuell löschen, wenn
du sie loswerden willst.

**Kann ich die Datenbank sichern und wiederherstellen?**
Ja. In den Einstellungen lässt sich jederzeit ein Schnappschuss der ganzen
Datenbank erstellen, jeweils mit SHA-256 und Integritätsprüfung.
Wiederherstellungen werden in eine Warteschlange gestellt und beim nächsten
Start ausgeführt — dem einzigen Moment, in dem sich die Datei atomar
austauschen lässt — und der Warteschritt zeigt zuerst einen Vergleich der
Datensatzanzahl. Siehe [Backup und Wiederherstellung](docs/guides/backup-and-restore.md)
(Englisch).

**Ich habe mehr als eine Uhr — vermischen sich die Daten?**
Nein. Jeder Datensatz trägt vermerkt, von welchem Gerät er stammt, und das
Interface hält sie getrennt.

**Wird irgendetwas an eure Server gesendet?**
Gesundheitsdaten, Trainingsdetails und Zugangsdaten verlassen deinen Rechner
nie. Nur wenn du ausdrücklich „Fehlerbericht senden" bestätigst, sendet die App
App-/Parser-Versionen, Betriebssystem, unbedenkliche Modell-Hinweise und
Feldstrukturen für unbekannte Produkte, die Firmware-Version, unbekannte
Trainingscodes mit Anzahl sowie den numerischen Fehlercode der letzten
Anfrage, die die Zepp-Cloud abgelehnt hat (die Nummer, welcher Datenstrom und
wann — nie Text, den die Cloud zurückgab). Niemals gesendet werden Konten,
Tokens, Seriennummern, Gerätekennungen, GPS, Gesundheitswerte, Rohantworten
oder lokale Pfade. Es gibt keine automatische Telemetrie und kein
Hintergrund-Absturzmeldewesen.

## Datenschutz

- **Zugangsdaten** liegen im Anmeldeinformationsspeicher des Betriebssystems
  (Windows Credential Manager / macOS-Schlüsselbund / Linux Secret Service).
  Lässt sich dein macOS-Schlüsselbund nicht entsperren, kannst du ausdrücklich
  eine private Klartextdatei wählen — siehe den
  [macOS-Guide zur Anmeldeinformationsspeicherung](docs/guides/macos-credentials.md)
  (Englisch). Linux unterstützt ausserdem Datei- und
  Umgebungsvariablen-Speicher; siehe den [Linux-Guide](docs/guides/linux.md)
  (Englisch). Dateispeicher schützt schwächer als der Systemspeicher und wird
  nie nur deshalb aktiviert, weil dieser ausfällt.
- **Gesundheitsdaten** liegen unverschlüsselt als Datenbankdatei auf dem
  Rechner. Bei einem gemeinsam genutzten Rechner separate
  Betriebssystem-Konten verwenden.
- **KI-Pakete werden zuerst anonymisiert**: Gerätekennungen, MAC-Adressen und
  genaue GPS-Positionen werden entfernt, und die Datei listet auf, was
  entfernt wurde. Genaue Tracks sind nur enthalten, wenn ausdrücklich
  zugestimmt wird.
- **Karten werden lokal gerendert.** Es gehen keine Anfragen an
  Drittanbieter-Kartendienste.
- **Fehlerberichte benötigen ausdrückliche Bestätigung**, verwenden eine feste
  Positivliste, werden lokal erstellt, benötigen kein GitHub-Konto und werden
  nie automatisch als Issue veröffentlicht.
- Die Synchronisierung kontaktiert Zepps Server — die App ist also nicht
  vollständig offline nutzbar.

Siehe [Sicherheit und Datenschutz](docs/reference/security-and-privacy.md)
(Englisch). Sicherheitsprobleme bitte über GitHubs private
Sicherheitslücken-Meldung berichten, nicht über ein öffentliches Issue.

## Für Entwickler

Tauri 2 + Vue 3 + Rust. Der Kern liegt im Crate `zeppbridge-core`; die
Desktop-App, CLI, der MCP-Server und der lokale REST-Endpunkt sind alle
dünne Adapter darüber — SQL, Einheitenumrechnung und Regeln für fehlende Werte
werden nirgends dupliziert.

```bash
npm ci
npm run tauri dev
```

- [Development](docs/development/development.md) (Englisch) — Build-Gates,
  Befehlsverträge, lokale REST-API, Abnahmereihenfolge
- [Architecture](docs/reference/architecture.md) (Englisch) — Produktgrenzen,
  Zepp-API-Mapping, Liste verifiziert vs. unverifiziert
- [CLI und MCP](docs/reference/cli-and-mcp.md) (Englisch) — Exit-Code-Vertrag,
  schreibgeschützte Tools, Planungsbeispiele
- [Backup und Wiederherstellung](docs/guides/backup-and-restore.md)
  (Englisch) — Schnappschüsse, Wiederherstellungsablauf, Abdeckungsprotokoll
- [Linux](docs/guides/linux.md) (Englisch) — Flatpak, deb/rpm/AppImage,
  Datenorte, Anmeldeinformationsspeicher
- [macOS-Anmeldeinformationsspeicherung](docs/guides/macos-credentials.md)
  (Englisch) — Dateispeicher, wenn der Anmeldeschlüsselbund nicht verfügbar ist
- [Docker](docs/guides/docker.md) (Englisch) — Headless-CLI/MCP-Image,
  Planung, reproduzierbare Builds
- [UI-Richtlinien](docs/development/ui-guidelines.md) (Englisch) —
  Design-Tokens, Seitenstruktur, Komponenten

Die verlinkte Detail-Dokumentation liegt auf Englisch und vereinfachtem
Chinesisch vor; jede Seite verlinkt auf ihr Gegenstück. Issues und PRs sind in
jeder der zehn Sprachen willkommen. Bevor du etwas änderst, lies die Liste
„unverified" im Architektur-Dokument — dieses Projekt hat einen expliziten
Standard dafür, was als gesicherte Tatsache gilt.

## Danksagungen

Zepps API ist undokumentiert; ob ein Datenstrom überhaupt existiert, lässt
sich nur von Leuten wissen, die es bereits zum Laufen gebracht haben. Das
API-Mapping stützt sich auf:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) —
  Aufteilung der Event-Oberfläche und Feldwerte
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — eine unabhängige
  Nachbildung derselben APIs, nützlich zur Gegenprüfung
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)
  (Apache-2.0) — Dekodierung der Trainingsdetails

Keines davon ist mitgeliefert; ZeppBridge stützt sich auf die von ihnen
dokumentierten API-Fakten.

## Lizenz

[MIT-Lizenz](LICENSE).

Die Distribution enthält Drittanbieter-Assets, aufgeführt in
[NOTICE](NOTICE): MiSans (Xiaomi, Namensnennung erforderlich — vermerkt auf
der Einstellungsseite), Inter (SIL OFL 1.1), und der oben genannte
Dekodierungsalgorithmus (Apache-2.0).

Zepp, Amazfit und verwandte Marken gehören ihren jeweiligen Eigentümern.
