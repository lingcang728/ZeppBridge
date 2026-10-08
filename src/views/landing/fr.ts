import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  "meta": {
    "title": "ZeppBridge · Votre montre enregistre. Vos propres archives.",
    "description": "Conservez les données Amazfit et Zepp dans des archives locales. Découvrez l’exemple synthétique v3 ou téléchargez la version publique stable. Gratuit et à code ouvert.",
    "ogTitle": "ZeppBridge · Votre montre enregistre. Vos propres archives.",
    "ogDescription": "Conservez les données Amazfit et Zepp dans des archives locales. Découvrez l’exemple synthétique v3 ou téléchargez la version publique stable. Gratuit et à code ouvert."
  },
  "copy": {
    "nav": {
      "home": "Accueil ZeppBridge",
      "site": "Navigation du site",
      "demo": "Démo",
      "ai": "Pour l’IA",
      "privacy": "Confidentialité",
      "download": "Version publique",
      "github": "GitHub",
      "language": "Langue",
      "toDark": "Passer en sombre",
      "toLight": "Passer en clair",
      "connect": "Connexion",
      "faq": "Questions fréquentes"
    },
    "downloads": {
      "windows": {
        "label": "Télécharger pour Windows",
        "hint": "Installeur x64",
        "msi": "MSI pour les installations gérées"
      },
      "macos": {
        "label": "Télécharger pour macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Expérimental",
        "note": "La CI produit deb, rpm, AppImage et Flatpak, mais personne n’a encore testé de bout en bout la connexion et le trousseau sur un vrai bureau Linux. Un souci ? Ouvre une issue."
      },
      "status": {
        "loading": "Recherche du dernier installeur",
        "ready": "Clique pour télécharger directement",
        "fallback": "Ouvre GitHub Releases, où tu choisis l’installeur"
      }
    },
    "sample": "Exemple",
    "hero": {
      "eyebrow": "Gratuit · Code ouvert · Archives de santé locales",
      "titleLead": "Votre montre enregistre.",
      "titleAccent": "Vos propres archives.",
      "lead": "Conservez sur votre ordinateur le rythme cardiaque, le sommeil et les entraînements Amazfit provenant du cloud Zepp. Consultez votre historique, préservez les lacunes et exportez à votre choix.",
      "github": "Lire le code sur GitHub",
      "meta": "Gratuit · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Appareils Amazfit : les mesures varient selon le modèle",
      "stage": {
        "hint": "Ouvrir l’exemple",
        "note": "L’application réelle avec des données synthétiques, sans connexion à votre compte.",
        "loading": "Ouverture de l’application…",
        "exit": "Quitter la démo",
        "unavailable": "La démonstration est indisponible. Les explications et le code source restent accessibles."
      },
      "demo": "Voir l’exemple",
      "edition": "v3 en développement · Données synthétiques. Le téléchargement propose la version publique stable, dont l’interface et les fonctions peuvent différer."
    },
    "beats": [
      {
        "kicker": "01 · Synchroniser",
        "title": "Une copie locale de vos enregistrements",
        "body": "Connectez votre compte Zepp et conservez les données déjà présentes dans le cloud. Les enregistrements synchronisés restent consultables hors ligne."
      },
      {
        "kicker": "02 · Absences",
        "title": "Sans mesure, pas de valeur",
        "body": "Les données absentes ne sont jamais remplacées par zéro, une ancienne valeur ou une estimation. Non synchronisé et non mesuré sont des états différents."
      },
      {
        "kicker": "03 · Transfert",
        "title": "Choisissez le contenu, puis le destinataire",
        "body": "L’exemple v3 permet de choisir les dates et les données et de vérifier l’export. Il est préparé localement ; l’IA externe ne le reçoit que si vous l’envoyez."
      },
      {
        "kicker": "04 · Plans",
        "title": "Vérifiez avant de poursuivre",
        "body": "La v3 en développement montre l’import et la vérification de plans. Leur envoi à la montre dépend du matériel et des validations ; ce n’est pas une promesse générale de la version stable."
      },
      {
        "kicker": "05 · Réglages",
        "title": "Réglez le rythme de vos archives",
        "body": "Explorez synchronisation, conservation et interfaces locales. Les réglages varient selon les versions ; vérifiez leur rôle avant de les activer."
      }
    ],
    "flap": {
      "tiles": [
        {
          "value": "1 096",
          "label": "nuits de sommeil"
        },
        {
          "value": "742",
          "label": "séances avec tracé"
        },
        {
          "value": "1,5M",
          "label": "minutes de fréquence cardiaque"
        },
        {
          "value": "9,8M",
          "label": "pas"
        }
      ]
    },
    "handoff": {
      "chat": "Discussion avec l’IA",
      "you": "Toi",
      "file": "ZeppBridge 14 derniers jours.md",
      "prompt": "Organise cet exemple synthétique. Liste les sources, dates et champs absents sans jugement de santé.",
      "answer": "Le fichier classe sommeil et entraînements par date. Les périodes non mesurées restent vides. Vérifiez sources et couverture avant de comparer ; ces données n’expliquent pas la cause d’un changement.",
      "note": "Conversation synthétique. Cette page n’envoie aucun fichier et ne se connecte à aucune IA. En usage réel, vous choisissez si vous transmettez le contenu.",
      "close": "Fermer"
    },
    "privacy": {
      "kicker": "Données et confidentialité",
      "heading": "Vos archives sont locales. Leurs chemins sont clairs.",
      "lead": "La synchronisation lit les données Zepp et les conserve sur votre ordinateur. Une IA externe est un autre chemin, choisi explicitement.",
      "nodes": {
        "watch": "Montre et app Zepp",
        "cloud": "Cloud Zepp",
        "computer": "Archives de santé locales",
        "export": "L’IA externe choisie"
      },
      "flowNote": "La montre envoie d’abord les données via l’app mobile Zepp. Le site ne stocke pas vos archives de santé.",
      "exportNote": "Export facultatif · Vous vérifiez et envoyez",
      "services": {
        "title": "Des services web aux rôles limités",
        "copy": "L’autorisation officielle et le renouvellement des jetons utilisent le site. Les mises à jour consultent les versions. Les rapports volontaires envoient un diagnostic limité après confirmation, sans mesures de santé."
      },
      "docs": "Lire les limites complètes",
      "points": [
        {
          "title": "Identifiants dans le coffre système",
          "copy": "Le coffre du système est utilisé par défaut. Certaines plateformes permettent de choisir un fichier, avec une protection différente."
        },
        {
          "title": "Local ne signifie pas chiffré",
          "copy": "La base de santé n’est pas chiffrée par défaut. Séparez les comptes système sur un ordinateur partagé et protégez vos sauvegardes."
        },
        {
          "title": "Vous lancez l’export",
          "copy": "Les fichiers pour l’IA sont préparés et expurgés localement. Après envoi, les règles du destinataire s’appliquent. Exports ordinaires et sauvegardes complètes diffèrent."
        }
      ]
    },
    "connect": {
      "kicker": "Connecter vos enregistrements",
      "heading": "Commencez par l’autorisation officielle",
      "lead": "Un chemin habituel. Les connexions avancées ajoutent d’autres champs.",
      "recommended": "Point de départ conseillé",
      "advanced": "Autres chemins avancés",
      "edition": "Ces chemins concernent la v3 actuelle. Consultez les notes de la version publique stable pour ses accès et fonctions.",
      "docs": "Guide de connexion",
      "paths": [
        {
          "title": "Autorisation officielle Zepp",
          "copy": "Ouvrez la page d’autorisation Zepp dans votre navigateur avec votre connexion habituelle.",
          "detail": "Lit sommeil, rythme cardiaque, pas, entraînements, PAI et poids selon les données présentes dans votre compte."
        },
        {
          "title": "Connexion de données avancées",
          "copy": "À ajouter pour la HRV, l’oxygène sanguin, le stress ou la préparation.",
          "detail": "Connexion par e-mail ou téléphone. Les champs diffèrent ; tous les appareils ne les mesurent ou ne les renvoient pas."
        },
        {
          "title": "Identifiants manuels",
          "copy": "Pour les personnes connaissant l’API et disposant d’identifiants obtenus légitimement.",
          "detail": "Saisissez jeton, ID utilisateur et adresse régionale. N’importez jamais un jeton inconnu et ne le publiez pas."
        }
      ],
      "note": "Les champs dépendent du matériel, du cloud et de la connexion. Une réponse vide ne prouve pas une incompatibilité. Ce sont des alternatives, pas trois étapes obligatoires."
    },
    "final": {
      "kicker": "Télécharger · Version publique stable",
      "heading": "Gardez une copie sur votre ordinateur",
      "lead": "Gratuit et à code ouvert. Votre compte Zepp suffit ; aucun compte ZeppBridge supplémentaire.",
      "docs": "Installation et notes de version",
      "facts": {
        "channel": "Le téléchargement propose la version publique stable. La démonstration synthétique est la v3 en développement ; interface et fonctions peuvent différer.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Consulter et exporter ne nécessite pas d’IA. Vous choisissez le service externe et votre compte.",
        "windows": "Windows : les installateurs n’ont pas encore de signature reconnue. Un avertissement éditeur inconnu ou SmartScreen peut apparaître. Vérifiez la source officielle.",
        "macos": "macOS : versions non signées et non notariées. Le premier lancement peut être bloqué ; suivez les instructions du projet."
      }
    },
    "footer": {
      "tagline": "Un pont local pour les données Amazfit et Zepp.",
      "disclaimer": "ZeppBridge est un projet open source indépendant, sans lien avec Zepp Health ni Amazfit.",
      "source": "Code source"
    },
    "explore": {
      "kicker": "Explorer l’application",
      "title": "Commencez par un enregistrement",
      "lead": "Choisissez un chapitre de la v3 en développement. Les lacunes de l’exemple restent absentes.",
      "tabs": [
        "Synchroniser",
        "Données absentes",
        "Transfert à l’IA",
        "Vérifier un plan",
        "Réglages"
      ]
    },
    "faq": {
      "heading": "Avant de commencer",
      "lead": "Six questions courantes. La documentation précise les réglages et différences entre versions.",
      "docs": "Documentation du projet",
      "items": [
        {
          "question": "Quels comptes faut-il ?",
          "answer": "La synchronisation utilise votre compte Zepp et l’app mobile Zepp. Aucun compte ZeppBridge supplémentaire. L’exemple ne demande pas de connexion."
        },
        {
          "question": "Mon appareil et mes mesures sont-ils pris en charge ?",
          "answer": "Les champs dépendent des mesures du matériel, des données conservées par Zepp et de la connexion. Tous les modèles ne proposent pas toutes les mesures."
        },
        {
          "question": "Puis-je l’utiliser hors ligne ?",
          "answer": "Les données enregistrées sont consultables et exportables hors ligne. Connexion, nouvelles synchronisations et mises à jour demandent le réseau. La montre utilise toujours l’app Zepp."
        },
        {
          "question": "Une lacune signifie-t-elle zéro ?",
          "answer": "Non. Non mesuré, non synchronisé et non décodé sont différents. Les absences ne sont jamais remplacées par zéro, une ancienne mesure ou une estimation."
        },
        {
          "question": "Dois-je utiliser une IA ?",
          "answer": "Non. L’export est préparé localement. L’IA ne reçoit le contenu que si vous le collez ou l’envoyez. Vérifiez le périmètre, les suppressions et sa confidentialité."
        },
        {
          "question": "Le téléchargement ressemble-t-il à l’exemple ?",
          "answer": "L’exemple est la v3 en développement avec des données synthétiques. Le téléchargement est stable. Vérification des plans et nouvelle interface peuvent être inédites ; consultez les notes."
        }
      ]
    }
  }
};

export default pack;
