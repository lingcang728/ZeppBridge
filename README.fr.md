<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Vos données Zepp, rendues entre vos mains.</strong></p>
  <p>Consultez, archivez et exportez vos données de santé Amazfit sur votre propre machine Windows, macOS ou Linux.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#téléchargement-et-installation)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#téléchargement-et-installation)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.nl.md">Nederlands</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.pt-PT.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <strong>Français</strong></p>
</div>

> [!IMPORTANT]
> ZeppBridge est un projet open source indépendant et non officiel. Il n'est ni affilié à Zepp Health, Huami ou Amazfit, ni approuvé par elles. Utilisez-le uniquement avec des comptes et des données auxquels vous êtes légitimement autorisé à accéder.

> L'application est disponible en dix langues ; au premier lancement, elle suit la langue du système, et un sélecteur dans les paramètres permet de la changer. Cette page est une traduction de la [version originale en anglais](README.md) ; en cas de divergence, la version anglaise fait foi. Les guides détaillés liés ci-dessous ne sont pour l'instant disponibles qu'en anglais et en chinois.

## L'app Zepp ne fait-elle pas déjà ça ?

Si — mais seulement sur votre téléphone, seulement de la manière que l'app officielle a choisie, et sur le serveur de quelqu'un d'autre. ZeppBridge répond à quelques besoins précis :

- **Le voir sur un vrai écran.** Tendances long terme de la fréquence cardiaque, du sommeil, des entraînements, de la récupération, du stress et de la SpO₂, sur 7 jours / 1 mois / 6 mois.
- **Les données restent sur votre propre ordinateur.** Tout aboutit dans un seul fichier sur votre machine. Elles continuent de fonctionner hors ligne, malgré un changement de téléphone, une suppression de compte ou une refonte de l'app.
- **Vous pouvez rattraper l'historique d'avant son installation.** Mois par mois, avec pause et reprise, et honnête sur les mois où le cloud n'avait vraiment rien contre ceux qui n'ont simplement pas encore été récupérés.
- **Des sauvegardes qui se restaurent vraiment.** Des instantanés de toute la base avec sommes de contrôle et vérifications d'intégrité, plus un diff du nombre d'enregistrements avant restauration.
- **Exportez quand vous voulez.** JSON, CSV et GPX — à déposer dans Excel, Strava ou vos propres scripts.
- **Transmettez à une IA en une étape.** Choisissez une plage de dates et des types de données ; l'app les empaquette dans un format lisible par un modèle, retire les éléments identifiants et les copie dans le presse-papiers.
- **Utilisable sans ouvrir de fenêtre.** Livré avec une CLI non interactive (planifiable via le Planificateur de tâches ou cron) et un serveur MCP en lecture seule, pour qu'un modèle interroge vos données locales sans qu'elles quittent votre machine.

Une chose mérite d'être dite franchement : **il n'embellira pas vos données.**

Si vous ne portiez pas la montre ce jour-là, le graphique a un trou. Si votre montre n'a jamais mesuré quelque chose, l'interface affiche « non fourni » — jamais `0`. Pas de trace GPS, pas de carte. Pour des données de santé, une courbe lisse inventée est pire qu'un trou honnête.

Même chose pour le mot « complet » : l'interface ne déclare une **copie locale complète** que lorsque le registre de couverture montre que chaque bloc mensuel a abouti à une conclusion. Jusque-là, elle dit « une copie locale de la plage synchronisée avec succès ».

## Quels appareils sont pris en charge

**Si votre appareil se synchronise avec l'app Zepp, ça vaut le coup d'essayer.** ZeppBridge lit ce que votre compte détient dans le cloud ; il ne dialogue pas avec la montre et n'est donc lié à aucun modèle particulier.

Le catalogue embarqué reconnaît 52 produits Amazfit des familles **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio et Band** (montres, brassards, bracelets, bagues). Les appareils reconnus affichent le bon nom de modèle et l'image du produit ; les non reconnus se synchronisent quand même — ils affichent juste un nom générique, et vous pouvez identifier le vôtre à la main.

Les métriques que vous obtenez réellement dépendent de ce que votre montre mesure. Après connexion, la page des paramètres les liste pour votre compte, une par une.

## Téléchargement et installation

Récupérez la dernière version sur la page [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Téléchargez `ZeppBridge_<version>_x64-setup.exe` (ou `.msi`) et lancez-le.
2. Il n'y a pas encore de certificat de signature de code, donc Windows peut avertir d'un éditeur inconnu. Choisissez **Informations complémentaires → Exécuter quand même**.
3. Les versions suivantes s'installent par-dessus ; vos données ne sont pas touchées.

**macOS (Apple Silicon)**

> **Cette version n'est pas signée.** Il n'y a ni certificat Apple Developer ID
> ni notarisation, donc macOS refusera de l'ouvrir tant que vous n'aurez pas
> levé vous-même le drapeau de quarantaine. Les étapes ci-dessous sont un
> contournement assumé, pas un correctif — voir
> [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. Téléchargez `ZeppBridge_<version>_aarch64.dmg` et glissez `ZeppBridge.app` dans Applications.
2. Le premier lancement échouera. Le message dépend de votre version de macOS :
   - **« développeur non identifié »** → **clic droit sur l'app → Ouvrir → Ouvrir.**
   - **« ZeppBridge est endommagé et ne peut pas être ouvert »** → le clic droit
     *ne sert à rien*. Lancez ceci dans le Terminal, puis ouvrez l'app
     normalement :

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   L'app n'est pas réellement endommagée. C'est ce que Gatekeeper dit de tout
   paquet téléchargé non notarisé. N'exécutez une telle commande que pour un
   logiciel auquel vous avez décidé de faire confiance — celui-ci se lit ligne
   par ligne sur GitHub et se compile chez vous.
3. Les versions macOS sont couvertes par la CI (compilation, clippy, tests) et
   un smoke test d'un contributeur sur Apple Silicon. Le mainteneur n'a pas de
   Mac et ne peut pas vérifier lui-même la synchronisation ni le trousseau. Si
   cela compte pour vous, préférez Windows.

Pourquoi ça reste ainsi pour l'instant : la notarisation elle-même n'exige pas
de Mac — la CI tourne déjà sur des runners macOS et pourrait signer et notariser
là-bas. Ce qui manque, c'est un abonnement à l'Apple Developer Program
(99 USD/an), que le projet n'a pas souscrit. Si ça change, cette section
disparaît.

**Linux (x86_64)**

> **Ça compile, mais personne ne l'a encore vraiment fait tourner.** La CI
> compile, lance les tests et produit les paquets à chaque push. Ce qui *n'a
> pas* eu lieu, c'est un cycle complet de connexion et synchronisation sur un
> vrai bureau Linux — y compris la question de savoir si le jeton atterrit
> correctement dans votre trousseau. Considérez ceci comme une version que vous
> aidez à tester, pas comme une release aboutie.

Flatpak, `.deb`, `.rpm` et un AppImage sont publiés sur la page des releases.
Rien n'est signé ; vérifiez les téléchargements avec `SHA256SUMS.txt`.

```bash
sudo apt install ./ZeppBridge_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<version>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<version>_x86_64.flatpak  # partout
```

Le [guide Linux](docs/guides/linux.md) (en anglais) explique où vont les
données, comment le jeton est stocké quand il n'y a pas de trousseau, et
comment compiler depuis les sources.

Il existe aussi une [image de conteneur sans interface](docs/guides/docker.md)
(en anglais) avec juste la CLI et le serveur MCP, pour garder une bibliothèque
synchronisée sur un NAS ou un serveur. Elle ne peut pas se connecter — cela
demande toujours l'app de bureau une fois.

**Non pris en charge** : Macs Intel, mobile.

### Ce qui est vérifié sur chaque plateforme

Même app, même interface, mêmes fonctions sur les trois — ce qui diffère, c'est
la part que quelqu'un a réellement vérifiée. Demander ici vaut mieux que
deviner.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Interface et fonctions | identiques | identiques | identiques |
| Compilé en CI | oui | oui | oui |
| Tests automatisés en CI | oui | oui | oui |
| L'installateur s'ouvre sans contournement | oui (avertissement « éditeur inconnu ») | **non** — voir la note sur la version non signée ci-dessus | oui |
| Connexion, synchronisation, export | vérifié par le mainteneur à chaque release | seulement un smoke test de contributeur | **personne encore** |
| Magasin d'identifiants | Credential Manager, vérifié | Trousseau, non vérifié indépendamment | Secret Service, **personne encore** |
| Mise à jour automatique | vérifié | compilé, non vérifié indépendamment | n/a — votre gestionnaire de paquets |

Le mainteneur développe sous Windows et n'a ni Mac ni Linux en desktop. Rien
ci-dessus n'affirme que macOS ou Linux est cassé — c'est un constat sur qui a
vérifié quoi. Si vous utilisez l'un des deux et que quelque chose dysfonctionne,
un signalement est vraiment utile.

**Depuis la 1.0.0, le schéma de la base locale et son chemin de mise à niveau
sont traités comme quelque chose à maintenir sur le long terme** : chaque
migration fait d'abord une sauvegarde automatique, et les instantanés peuvent
être vérifiés et restaurés. Vos données restent en local — mais les instantanés
vivent sur le même disque que la base, donc **si une panne de disque vous
inquiète, copiez-en un ailleurs vous-même.**

## Première connexion

1. Ouvrez ZeppBridge et allez dans **Paramètres** dans la barre latérale.
2. Cliquez sur connecter. La **page de connexion officielle de Zepp** s'ouvre
   dans sa propre fenêtre ; identifiez-vous avec vos identifiants habituels.
3. Quand « connecté » s'affiche, la fenêtre se ferme et l'app lance sa première
   synchronisation. Comptez environ 40 secondes.

Les comptes de Chine continentale comme les comptes internationaux fonctionnent ;
l'app détecte à quel serveur régional vous appartenez.

La première synchronisation récupère 30 jours pour qu'il y ait vite quelque
chose à l'écran, puis continue en arrière-plan jusqu'à atteindre 180 jours. La
progression est visible et vous pouvez l'arrêter à tout moment. Les
synchronisations suivantes sont incrémentales.

Chaque sélecteur « N derniers jours » de l'app — sur les écrans d'entraînement
et de forme, et sur la page d'export — lit votre bibliothèque **locale**, pas
le cloud. Si vous choisissez une plage qui remonte plus loin que ce que cette
machine détient, l'app le dit et propose de récupérer le reste. Un vide dans un
graphique signifie *pas encore récupéré*, jamais *vous n'aviez rien enregistré
alors*.

Pour un historique plus ancien que 180 jours, utilisez **Archive long terme et
historique complet** dans les paramètres : choisissez 1/2/3 ans ou un départ
personnalisé, et il récupère mois par mois. Vous pouvez arrêter à tout moment
et reprendre plus tard. Avant de démarrer, il estime l'occupation disque à
partir du rythme réel d'accumulation de vos propres données — pas d'une
constante codée en dur.

Si la plage dépasse votre fenêtre de rétention locale, l'app exige d'abord
d'activer l'archivage long terme ; sinon l'historique que vous venez de
récupérer serait nettoyé après la prochaine synchronisation réussie.

Coincé à la connexion ? Voir le [guide de connexion](docs/guides/connection.md)
(en anglais) pour le dépannage et deux méthodes de repli.

## Ce que vous obtenez

**Tendances**

| Page | Ce qu'elle montre |
| --- | --- |
| **Vue d'ensemble** | Fréquence cardiaque des dernières heures, pas d'aujourd'hui, structure du sommeil de la nuit, cette semaine comparée à vos propres 28 jours précédents, et accès au statut corporel et d'entraînement. Chaque carte s'ouvre |
| **Fréquence cardiaque** | La courbe complète sur 24 h, plus les tendances quotidiennes de la fréquence au repos et de la HRV selon deux définitions |
| **Activité quotidienne** | Tendances quotidiennes des pas, de la distance, des calories actives et des minutes actives |
| **Statut corporel** | Récupération, stress, SpO₂, HRV, fréquence respiratoire et fréquence au repos dans le temps |
| **Statut d'entraînement** | VO₂max, charge d'entraînement, seuil de lactate, PAI, et si le volume récent est haut ou bas |
| **Enregistrements récents** | Chaque session de sommeil et chaque entraînement, ouvrables en détail |
| **Détail d'entraînement** | Distance, allure, fréquence cardiaque, splits au kilomètre, trace GPS ; la course ajoute puissance et foulée |
| **Appareils** | D'où vient le modèle de chaque appareil (correspondance catalogue ou votre propre attribution), firmware, données les plus récentes — réattribuable à tout moment |
| **Santé des données** (Paramètres → Avancé et maintenance) | État de récupération / analyse / écriture par flux — si un trou signifie « pas synchronisé » ou « jamais mesuré » |

Une métrique sans données ne reste pas là à afficher « — » ; elle n'apparaît
tout simplement pas. Et une courbe se brise là où plus de 15 minutes se sont
écoulées sans échantillon, au lieu de tirer une ligne droite entre les deux
bouts.

**Analyse post-entraînement et rapport hebdomadaire**

Après un entraînement, l'app le compare à votre propre historique : courses
récentes dans la même bande de distance, et comment allure, fréquence cardiaque
et charge d'entraînement diffèrent — avec le nombre d'échantillons sur lesquels
ça repose et le degré de confiance. **La référence, c'est vous, pas une norme
de population.** Quand les échantillons manquent, elle le dit, plutôt que de
baisser la barre pour produire une phrase. Ce sont des faits et des preuves ;
l'interprétation est laissée à une IA.

**Transmettez à une IA**

Plusieurs modèles de prompt sont intégrés (résumé de performance, analyse
d'entraînement, évaluation de récupération, analyse de sommeil). Choisissez un
modèle et une plage, et l'app empaquette les données, retire les identifiants
d'appareil et les positions précises, les copie dans le presse-papiers et ouvre
le site d'IA choisi.

La page de détail d'un entraînement a son propre bouton « transmettre à l'IA »,
limité à **cet entraînement-là** : l'entraînement lui-même et les métriques
point par point enregistrées pendant. Les relevés quotidiens comme le sommeil
et les pas ne partent pas avec.

Les paquets de plus de 2 Mo sont écrits dans un fichier sur votre bureau, prêt
à être glissé dans la conversation.

**Fichiers d'export**

- **JSON** — données structurées complètes, pour scripts ou modèles
- **CSV** — résumé tabulaire pour tableurs
- **GPX** — traces standard pour Strava, Garmin et autres

Ce que contient un export : résumés d'entraînements (type, début et fin,
distance, calories, fréquence cardiaque moyenne et maximale, charge),
métriques quotidiennes (pas, fréquence au repos, HRV, SpO2, stress, fréquence
respiratoire, PAI, VO2max) et sessions de sommeil avec leur chronologie de
phases. Choisir **Complet** plutôt que **Résumé** ajoute les séries à la
seconde des entraînements et les relevés individuels de fréquence cardiaque.

`.fit` est un format d'export à part, un fichier par entraînement, écrit dans
le dossier de votre choix. Il embarque les séries à la seconde que ZeppBridge a
décodées du détail d'entraînement de Zepp : trace GPS, fréquence cardiaque,
vitesse, altitude, puissance de course, temps de contact au sol et oscillation
verticale, plus les tours au kilomètre et les événements de pause. Les champs
jamais mesurés sont simplement absents — rien n'est rembourré pour donner au
fichier l'air complet. La cadence est volontairement omise : son unité ne peut
être réconciliée avec aucun champ de synthèse en notre possession, et une
unité fausse se lirait silencieusement comme le double.

Ce qu'un export ne contient pas : `.tcx`, détails du compte, jetons ou numéros
de série d'appareils. Les traces GPS apparaissent en GPX et FIT, et seulement
pour les entraînements qui portent réellement une trace.

**Ça ne s'alourdit pas avec le temps**

Les charges brutes du cloud sont ce qui occupe le plus de place dans la base
locale. ZeppBridge les stocke compressées — tout ce qui est nouvellement
synchronisé arrive compressé, et le premier lancement après une mise à jour
compacte les existantes en arrière-plan et récupère l'espace disque, avec une
progression en haut de la fenêtre qui disparaît à la fin.

Avant de remplacer une charge, il la décompresse et compare octet par octet, en
sautant toute celle qui ne correspond pas : la charge brute est la seule base
pour réanalyser localement, donc ne pas compresser vaut toujours mieux que
compresser mal. Une base mesurée de 211 Mo est sortie à 55 Mo.

**Laissez-la tourner**

Fermer la fenêtre laisse l'app dans la zone de notification, toujours en train
de synchroniser. Si vous ne voulez pas qu'elle tourne, clic droit sur l'icône
de la zone et quitter.

**Sans fenêtre**

Chaque release embarque aussi `zeppbridge-tools-<version>-<platform>.zip` avec
deux programmes :

- `zeppbridge-cli` — non interactive : `status`, `sync`, `export`. Les codes de
  sortie sont un contrat stable, donc elle se planifie proprement sous le
  Planificateur de tâches ou cron.
- `zeppbridge-mcp` — serveur MCP en lecture seule sur stdio. Pas de ports, pas
  de réseau. Permet à un modèle d'interroger vos données locales sans qu'elles
  quittent votre machine.

Voir [CLI et MCP](docs/reference/cli-and-mcp.md) (en anglais) pour l'usage et
des exemples de configuration. La section MCP des paramètres propose aussi un
bloc de texte à coller tel quel à une IA, pour qu'elle vous guide dans la
configuration sur votre machine.

**REST local en lecture seule**

Les paramètres peuvent activer un endpoint en lecture seule lié uniquement à
`127.0.0.1`, pour vos propres scripts. Il est désactivé par défaut, exige un
jeton une fois activé, ne renvoie aucun identifiant et n'écoute jamais sur le
réseau local.

## Nouveautés

Les changements par version sont dans [CHANGELOG.md](CHANGELOG.md). Quand
Paramètres → Mise à jour logicielle → Rechercher des mises à jour trouve une
nouvelle version, il affiche aussi directement les notes de version et la
progression pendant le téléchargement.

## FAQ

**Mon ordinateur doit-il rester allumé ?**
Non. Chaque lancement rattrape la période manquée.

**Puis-je me passer de l'app Zepp sur le téléphone ?**
Non. La chaîne est : montre → app Zepp sur votre téléphone → cloud Zepp →
ZeppBridge. Votre montre a toujours besoin de l'app du téléphone pour envoyer
ses données. Ouvrez-la de temps en temps.

**Est-ce que ça peut faire bannir mon compte ?**
ZeppBridge utilise vos propres identifiants et **n'émet que des requêtes de
lecture** — il n'y a pas une seule requête d'écriture dans tout le projet ;
vous pouvez le vérifier avec grep. En comportement, c'est la même chose
qu'ouvrir l'app officielle pour regarder vos données. Cela reste un usage non
officiel, et nous ne pouvons pas donner de garantie au nom de Zepp.

**Une métrique est revenue vide.**
Vérifiez d'abord si votre montre l'a vraiment mesurée. Certaines métriques
(seuil de lactate, VO₂max) ne se mettent à jour qu'après des entraînements
précis, quelques fois par an. La page des paramètres le rapporte pour chacune
sur votre compte — attention : **« non récupérée » n'est pas la même chose que
« votre montre ne la gère pas »** : l'API de Zepp renvoie une réponse vide pour
les données qui n'existent pas *et* pour des noms de flux qui n'ont jamais été
valides, donc le vide à lui seul ne prouve rien.

**Où sont mes données ?**
- **Windows** : un dossier `data` à côté du répertoire d'installation (pas
  `%APPDATA%`). Paramètres → Avancé a un bouton pour l'ouvrir.
- **macOS** : `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux** : `~/.local/share/zeppbridge/data` (Flatpak :
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Un AppImage ou une
  archive décompressée garde `data/` à côté de l'exécutable — voir le
  [guide Linux](docs/guides/linux.md) (en anglais).

**L'app ne démarre pas — aucune fenêtre n'apparaît.**
Deux choses à regarder, dans cet ordre :

1. **La boîte de dialogue d'erreur.** Depuis la v2.1.2, un échec de démarrage
   affiche un dialogue nommant le dossier exact et l'erreur du système au lieu
   de quitter en silence. Les versions antérieures quittaient sans un mot, ce
   qui ressemblait à « l'icône de la zone de notification est là, mais cliquer
   sur Ouvrir ne fait rien » — cette icône était le reste d'un processus déjà
   terminé.
2. **Le journal.** `logs/zeppbridge.log` dans le dossier de données (voir la
   question précédente), plus `logs/startup-error.log` si le dernier lancement
   a échoué avant que la fenêtre existe. Joignez-les à un rapport de bug ; ils
   contiennent des chemins et des numéros de version, aucune donnée de compte.

La cause la plus fréquente sous Windows est un dossier de données dans lequel
l'app ne peut pas écrire — le `.msi` s'installe dans `Program Files`, où un
utilisateur standard n'a pas de droit d'écriture. Depuis la v2.1.2, l'app
bascule alors vers `%APPDATA%\zeppbridge\ZeppBridge\data` (sauf si une base se
trouve déjà dans le dossier bloqué — alors elle le dit au lieu de démarrer
discrètement sur une base vide). Vous pouvez aussi la pointer où vous voulez
avec la variable d'environnement `ZEPPBRIDGE_DATA_DIR`.

**Mes données sont-elles encore là après la désinstallation ?**
Oui. La désinstallation laisse le dossier `data`, les sauvegardes, le registre
de couverture et les paramètres intacts. Supprimez-le à la main si vous voulez
qu'il disparaisse.

**Puis-je sauvegarder et restaurer la base de données ?**
Oui. Les paramètres peuvent créer à tout moment un instantané de toute la base,
chacun avec un SHA-256 et une vérification d'intégrité. Les restaurations sont
mises en file et appliquées au prochain lancement — le seul moment où un
fichier peut être remplacé atomiquement — et l'étape de mise en file montre
d'abord un diff du nombre d'enregistrements. Voir
[sauvegarde et restauration](docs/guides/backup-and-restore.md) (en anglais).

**J'ai plus d'une montre — les données vont-elles se mélanger ?**
Non. Chaque enregistrement porte l'appareil dont il vient, et l'interface les
garde séparés.

**Quelque chose est-il envoyé à vos serveurs ?**
Les données de santé, les détails d'entraînements et les identifiants ne
quittent jamais votre machine. Seulement si vous confirmez explicitement
« envoyer un rapport d'erreur », l'app envoie les versions de l'app et de
l'analyseur, le système d'exploitation, des indices de modèle sûrs et la
structure des champs pour les produits non reconnus, la version du firmware,
les codes d'entraînement inconnus avec leur nombre, et le code d'erreur
numérique de la dernière requête rejetée par le cloud Zepp (le numéro, quel
flux de données, et quand — jamais le texte renvoyé par le cloud). Elle
n'envoie jamais de comptes, jetons, numéros de série, identifiants d'appareil,
GPS, valeurs de santé, réponses brutes ou chemins locaux. Il n'y a ni
télémétrie automatique ni rapport de crash en arrière-plan.

## Confidentialité

- **Les identifiants** utilisent par défaut le magasin d'identifiants du
  système (Windows Credential Manager / Trousseau macOS / Secret Service
  Linux). Si votre trousseau macOS ne peut pas être déverrouillé, vous pouvez
  choisir explicitement un fichier en clair privé ; voir le
  [guide de stockage des identifiants macOS](docs/guides/macos-credentials.md)
  (en anglais). Linux prend aussi en charge le stockage par fichier et
  variables d'environnement ; voir le [guide Linux](docs/guides/linux.md)
  (en anglais). Le stockage par fichier protège moins que le magasin système et
  n'est jamais activé simplement parce que celui-ci échoue.
- **Les données de santé** sont un fichier de base non chiffré sur votre
  ordinateur. Si vous partagez la machine, utilisez des comptes système
  distincts.
- **Les paquets pour IA sont d'abord anonymisés** : identifiants d'appareil,
  adresses MAC et GPS précis sont retirés, et le fichier liste ce qui a été
  supprimé. Les traces précises ne sont incluses que si vous l'acceptez.
- **Les cartes sont rendues localement.** Aucune requête ne part vers un
  service cartographique tiers.
- **Les rapports d'erreur exigent une confirmation explicite**, utilisent une
  liste blanche fixe, sont construits localement, ne demandent pas de compte
  GitHub et ne sont jamais publiés automatiquement en issues.
- Synchroniser contacte les serveurs de Zepp — ce n'est donc pas une
  application totalement hors ligne.

Voir [sécurité et confidentialité](docs/reference/security-and-privacy.md)
(en anglais). Signalez les problèmes de sécurité via le canal privé de
signalement de vulnérabilités de GitHub, pas dans une issue publique.

## Pour les développeurs

Tauri 2 + Vue 3 + Rust. Le cœur vit dans le crate `zeppbridge-core` ; l'app de
bureau, la CLI, le serveur MCP et l'endpoint REST local ne sont que de fines
adaptations par-dessus — SQL, conversion d'unités et règles de valeurs
manquantes ne sont jamais dupliqués.

```bash
npm ci
npm run tauri dev
```

- [Développement](docs/development/development.md) (en anglais) — portes de
  build, contrats de commandes, API REST locale, ordre d'acceptation
- [Architecture](docs/reference/architecture.md) (en anglais) — limites du
  produit, mapping de l'API Zepp, liste vérifié vs non vérifié
- [CLI et MCP](docs/reference/cli-and-mcp.md) (en anglais) — contrat des codes
  de sortie, outils en lecture seule, exemples de planification
- [Sauvegarde et restauration](docs/guides/backup-and-restore.md)
  (en anglais) — instantanés, flux de restauration, registre de couverture
- [Linux](docs/guides/linux.md) (en anglais) — Flatpak, deb/rpm/AppImage,
  emplacements des données, magasins d'identifiants
- [Identifiants macOS](docs/guides/macos-credentials.md) (en anglais) — stockage
  par fichier quand le trousseau de session n'est pas disponible
- [Docker](docs/guides/docker.md) (en anglais) — image CLI/MCP sans interface,
  planification, builds reproductibles
- [Guide UI](docs/development/ui-guidelines.md) (en anglais) — tokens de
  design, structure des pages, composants

La documentation liée est disponible en anglais et en chinois simplifié ;
chaque page renvoie à son pendant. Issues et PRs sont bienvenus dans chacune
des dix langues. Avant de modifier quoi que ce soit, lisez la liste
« unverified » du document d'architecture — ce projet a un standard explicite
pour ce qui compte comme un fait établi.

## Remerciements

L'API de Zepp n'est pas documentée ; savoir qu'un flux de données existe même
n'est possible que grâce à ceux qui l'ont déjà fait marcher. Le mapping de
l'API s'appuie sur :

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) —
  partition de la surface d'événements et valeurs de champs
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — une reproduction
  indépendante des mêmes APIs, utile en validation croisée
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)
  (Apache-2.0) — décodage du détail d'entraînement

Aucun n'est embarqué ; ZeppBridge s'appuie sur les faits d'API qu'ils ont
consignés.

## Licence

[Licence MIT](LICENSE).

La distribution contient des ressources tierces, attribuées dans
[NOTICE](NOTICE) : MiSans (Xiaomi, attribution requise — mentionné dans la page
des paramètres), Inter (SIL OFL 1.1), et l'algorithme de décodage cité plus haut
(Apache-2.0).

Zepp, Amazfit et les marques associées appartiennent à leurs propriétaires
respectifs.
