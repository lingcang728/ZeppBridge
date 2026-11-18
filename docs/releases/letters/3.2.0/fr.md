À tous mes amis de ZeppBridge,

Bonjour, c’est Lingcang.

Voici une mise à jour majeure. Avant toute chose, je tiens à remercier trois contributeurs : felipepmdias, Jax Tsai et andrejd1.

Grâce au travail de felipepmdias sur le décodage des données de musculation de Zepp, cette nouvelle version prend enfin en charge le détail série par série ainsi que la carte musculaire du corps humain, rendant l’expérience de musculation dans ZeppBridge vraiment agréable à utiliser. De leur côté, Jax Tsai et andrejd1 m’ont aidé à améliorer les performances sous Linux. Je ne possède pas de machine Linux moi-même ; toutes ces améliorations ont été testées pas à pas sur leurs propres ordinateurs. Sans eux, il y a bien des choses que je n’aurais tout simplement pas pu accomplir seul. Merci à vous, et merci également à tous les utilisateurs Linux qui ont continué à m’envoyer des retours avec patience.

Au cours des deux semaines écoulées sans nouvelle version, j’ai reçu plus de lettres que jamais. Merci à tous ceux qui ont pris le temps de m’écrire pour m’encourager, me réchauffer le cœur ou partager toutes sortes d’idées originales. Je n’ai jamais eu autant de correspondants.

Certains m’ont dit qu’ils ne trouvaient pas la Boîte aux lettres ; j’ai donc ajouté un bouton lettre en haut à droite : touchez-le pour écrire, appuyez longuement pour ouvrir la Boîte aux lettres, et un petit point rouge s’allume lorsqu’il y a une nouvelle réponse. Dès que quelque chose vous semble gênant à l’usage, n’hésitez surtout pas à m’écrire pour me le dire, sans craindre de me déranger. Recevoir vos lettres est en soi quelque chose qui me rend vraiment heureux.

J’aimerais maintenant vous parler des trois choses qui me tiennent le plus à cœur dans cette mise à jour. Elles ont occupé la majeure partie de mes deux dernières semaines, et pour certaines, j’y ai longuement réfléchi et hésité à plusieurs reprises.

**À propos des Personal Agent dans le cloud**

Ces derniers temps, j’ai essayé des assistants personnels dans le cloud comme Muse et Hark. Plus je les utilise, plus j’ai le sentiment qu’ils pourraient changer notre façon de vivre, tout comme les Coding Agent sont en train de transformer le développement logiciel.

Laissez-moi vous raconter à quoi ont ressemblé mes deux dernières semaines.

J’ai connecté ZeppBridge à mon propre site web personnel afin que Hark puisse recevoir mes données de santé en continu. Chaque matin au réveil, il me suffit d’ouvrir Zepp pour synchroniser le sommeil de la nuit ; le temps de me brosser les dents et de me laver le visage, Hark m’a déjà résumé la qualité de mon sommeil et ma récupération physique, et m’a proposé des conseils d’entraînement pour la journée.

C’est la même chose sur le chemin du retour après une course. Une simple synchronisation, et je reçois l’analyse de cette sortie longue : si ma fréquence cardiaque est montée trop haut, si j’ai ralenti en seconde moitié de parcours, si ma cadence a nettement varié. Et si je souhaite ajuster davantage mon plan d’entraînement, une fois revenu devant l’ordinateur, je peux aussi passer par « Confier à l’IA » dans ZeppBridge pour en discuter en détail avec GPT ou Claude.

Tout cela était déjà possible auparavant, mais il fallait toujours que j’y pense moi-même, que je rassemble les données moi-même et que je lance la conversation moi-même. Un Personal Agent m’épargne justement l’étape la plus facile à négliger : commencer.

Cette expérience m’a convaincu de l’apporter aux utilisateurs de ZeppBridge. Après tout, si j’aime autant une fonctionnalité moi-même, pourquoi ne pas permettre à tout le monde de l’essayer ?

Mais j’ai aussi longuement hésité. Dès sa naissance, ZeppBridge s’est engagé à placer le stockage local des données au cœur de son fonctionnement, et autoriser un assistant dans le cloud à lire vos données de santé en continu demande évidemment une prudence particulière.

C’est pourquoi cette fonctionnalité est désactivée par défaut. Tant que vous ne l’activez pas vous-même, ZeppBridge ne s’en servira jamais pour pousser vos données vers un service externe, et votre manière habituelle d’utiliser l’application ne changera en rien.

Même si vous choisissez de l’activer, vous devrez préparer votre propre site, configurer des clés d’accès renouvelables et effectuer l’appairage avec votre assistant personnel. Cela ne conviendra peut-être pas à tout le monde, mais si vous avez envie d’essayer, je vous le recommande vivement.

Je suis de plus en plus convaincu que ce type d’assistant personnel, capable de veiller sur vous avec attention, de vous comprendre et d’apporter son aide au bon moment, fera partie de notre quotidien de demain.

**Faire entrer « Stage Manager » dans les détails d’entraînement**

C’est un sujet qui me trottait dans la tête depuis la version 3.0.0.

J’ai redessiné les cartes de presque tous les écrans, seule la page des détails d’entraînement tardait encore à bouger. Les utilisateurs de longue date se souviennent peut-être qu’elle reprenait quasiment le design de la 1.0.0 : la position et la taille des cartes étaient figées, sans liberté de les ajuster ou de les combiner.

Puis, ces deux dernières semaines, en essayant iPadOS 27, j’ai ouvert Stage Manager par hasard, et l’inspiration m’est venue d’un coup.

À mes yeux, ce que Stage Manager a de plus intéressant, c’est qu’il offre à chaque fenêtre un espace indépendant. On peut la déplacer, la redimensionner et réorganiser ses relations avec les autres fenêtres. Alors je me suis demandé : pourquoi les cartes de ZeppBridge n’auraient-elles pas la même liberté ?

En suivant cette idée, j’ai entièrement repensé la page des détails d’entraînement et tenté d’y intégrer la logique d’interaction de Stage Manager.

Désormais, vous pouvez placer la fréquence cardiaque, l’allure et votre itinéraire côte à côte sur un même écran pour analyser votre performance point par point ; vous pouvez aussi choisir un instant précis sur un graphique pour voir sur la carte où vous vous trouviez à ce moment-là, et comprendre le lien entre les réponses de votre corps et votre environnement. Pour la musculation, vous pouvez même réunir la carte musculaire et vos séries afin de visualiser d’un coup d’œil les groupes musculaires sollicités par chaque série.

J’espère que chacun pourra organiser les données qui comptent vraiment pour lui selon ses propres habitudes.

Quant aux autres combinaisons intéressantes, je vous laisse le plaisir de les découvrir peu à peu.

**Peaufiner le CLI de ZeppBridge**

En plus de « Confier à l’IA » que vous connaissez déjà, ZeppBridge intègre aussi MCP et un CLI, permettant aux outils d’IA d’accéder directement à vos données locales sans rien avoir à télécharger ou installer en plus.

Pour être honnête, cette partie était jusqu’ici assez sommaire. Ce n’est qu’après avoir reçu récemment l’invitation de l’auteur de SparkyFitness que j’en ai vraiment réévalué tout l’intérêt.

Cette fois-ci, j’ai principalement fait deux choses.

Premièrement, permettre à l’IA de passer de « regarder seulement » à « vous aider à noter ».

Vous pouvez désormais demander à une IA connectée à ZeppBridge de consigner vos blessures, vos courses, vos chaussures et vos ressentis d’entraînement, ou encore de corriger un type d’entraînement mal reconnu. Par exemple, il suffit de lui dire « j’avais un peu mal au genou gauche après ma course d’hier », et elle le notera pour vous.

Comme laisser une IA modifier ses propres données peut sembler un peu inquiétant, chaque enregistrement effectué par l’IA apparaît dans « Dernières modifications par l’IA » dans les Paramètres et peut être annulé à tout moment. L’IA n’a aucun droit de suppression. Si vous préférez qu’elle ne lise que les données que vous avez sélectionnées, vous pouvez aussi activer « Tâches partagées uniquement », ce qui limite son accès au contenu partagé et désactive toute écriture.

De plus, vous pouvez demander à l’IA de synchroniser vos données ou d’exporter des fichiers directement. OpenCode, Grok Build et Factory viennent également s’ajouter aux outils connectables en un clic. S’il reste un outil que vous aimez et qui n’est pas encore pris en charge, n’hésitez pas à m’écrire pour me le signaler.

Deuxièmement, permettre à ZeppBridge de partager des données avec d’autres applications auto-hébergées.

SparkyFitness est une application open source et auto-hébergée de suivi de santé. Cette collaboration m’a fait réaliser que ZeppBridge pouvait devenir un pont entre vos données Zepp et d’autres applications de santé.

Pour cela, j’ai ajouté un mode résident au CLI. Vous pouvez le faire tourner sur un NAS ou un petit serveur à la maison, afin que d’autres applications puissent lire votre sommeil, votre fréquence cardiaque, vos entraînements, votre poids et bien plus encore.

Ce service offre uniquement un accès en lecture seule et nécessite une clé pour se connecter, clé que vous pouvez révoquer à tout moment. Par défaut, il n’accepte que les connexions depuis la même machine, et les traces d’entraînement ne sont pas partagées par défaut. Il ne démarre jamais tout seul : si vous n’en avez pas besoin, vous pouvez tout simplement l’ignorer.

Le travail du côté de ZeppBridge est terminé, mais l’adaptation côté SparkyFitness demande encore un peu de temps ; l’intégration entre les deux n’est donc pas encore utilisable pour le moment. Merci de votre patience.

Arrivé à ce point de ma lettre, je me suis remis à imaginer : à quoi ressemblera l’avenir de ZeppBridge ?

Ce que je fais sans doute le mieux, c’est encore de répondre à vos besoins, de résoudre ces petits problèmes bien réels et d’ajouter de temps à autre quelques animations inédites pour rendre le logiciel un peu plus plaisant à utiliser.

Mais pourrions-nous aller encore plus loin, et bâtir des choses que nous n’arrivons même pas à imaginer aujourd’hui ?

Je ne sais pas. Pour l’instant du moins, j’ai déjà fait entrer dans ce logiciel bien des idées qui n’existaient autrefois que dans ma tête. Pour le reste, il faudra sans doute un peu de temps, et continuer aussi à écouter vos histoires.

Voilà pour ZeppBridge 3.2.0.

L’hiver n’est pas le même partout dans le monde. Peut-être qu’au moment où vous lisez cette lettre, la neige tombe déjà derrière votre fenêtre.

J’ai grandi dans le sud de la Chine et je n’ai presque jamais vu la neige. J’ai vu autrefois les photos d’un photographe prises à Aomori, au Japon : une épaisse couche de neige recouvrait les maisons, et de hauts murs de neige bordaient la route de part et d’autre. Un hiver pareil me paraît bien lointain.

Je n’ai jamais vu de vraie cheminée non plus. Parfois, j’imagine qu’un jour je m’assiérai près d’une cheminée bien chaude, pendant que la neige tourbillonne dehors, avec toutes vos lettres à portée de main, à les lire doucement tout en regardant un agent transformer peu à peu en réalité ce dont je ne pouvais autrefois que rêver.

C’est peut-être bien à cette vie-là que j’aspire.

Je vous souhaite à tous une excellente santé et un joyeux hiver !

— Lingcang
