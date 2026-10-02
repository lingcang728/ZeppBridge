import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Du poignet à ton ordinateur, de ton ordinateur à l’IA',
    description: 'ZeppBridge ramène tes données Amazfit et Zepp du cloud Zepp vers ton propre ordinateur et te les prépare en un seul fichier pour ton IA. Gratuit et open source.',
    ogTitle: 'ZeppBridge · Du poignet au bureau. Du bureau à l’IA.',
    ogDescription: 'Synchronise et consulte en local ta fréquence cardiaque, ton sommeil et tes séances, puis confie-les en un clic à l’IA que tu utilises déjà.',
  },
  copy: {
    nav: {
      home: 'Accueil ZeppBridge',
      site: 'Navigation du site',
      demo: 'Démo',
      ai: 'Pour l’IA',
      privacy: 'Confidentialité',
      download: 'Télécharger',
      github: 'GitHub',
      language: 'Langue',
      toDark: 'Passer en sombre',
      toLight: 'Passer en clair',
    },
    downloads: {
      windows: {
        label: 'Télécharger pour Windows',
        hint: 'Installeur x64',
        msi: 'MSI pour les installations gérées',
      },
      macos: { label: 'Télécharger pour macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Expérimental',
        note: 'La CI produit deb, rpm, AppImage et Flatpak, mais personne n’a encore testé de bout en bout la connexion et le trousseau sur un vrai bureau Linux. Un souci ? Ouvre une issue.',
      },
      status: {
        loading: 'Recherche du dernier installeur',
        ready: 'Clique pour télécharger directement',
        fallback: 'Ouvre GitHub Releases, où tu choisis l’installeur',
      },
    },
    sample: 'Exemple',
    hero: {
      eyebrow: 'Gratuit · Open source · Tes données restent sur ton ordinateur',
      titleLead: 'Ce que ta montre enregistre,',
      titleAccent: 'est sur ton ordinateur.',
      lead: 'ZeppBridge récupère du cloud Zepp la fréquence cardiaque, le sommeil et les séances que ton Amazfit enregistre, et les range sur ton propre ordinateur dans une archive lisible que tu peux emporter. Quand tu veux interroger une IA, tu choisis la période et tu lui transmets un seul fichier.',
      github: 'Lire le code sur GitHub',
      meta: 'Gratuit · Windows 10 / 11 · macOS (Apple Silicon) · Linux expérimental',
      devices: 'Les montres Amazfit qu’il connaît déjà',
      stage: {
        hint: 'Clique pour essayer',
        note: 'À droite, c’est le vrai ZeppBridge, avec des données d’exemple.',
        loading: 'Ouverture de l’application…',
        exit: 'Quitter la démo',
        unavailable: 'Ce navigateur ne peut pas ouvrir la démo. Télécharge l’application pour la voir.',
      },
      starNudge: {
        title: 'Ton téléchargement a commencé',
        copy: 'Si ZeppBridge t’aide, une étoile sur GitHub aide d’autres personnes équipées d’Amazfit à le trouver.',
        action: 'Mettre une étoile',
        dismiss: 'Plus tard',
      },
    },
    beats: [
      {
        kicker: '01 · Synchroniser',
        title: 'Ramène sur ton ordinateur ce que ton poignet enregistre',
        body: 'Connecte-toi avec ton propre compte Zepp : fréquence cardiaque, sommeil et séances sont rangés jour après jour dans une base de données sur cette machine. Lisible, transportable, et toujours là sans réseau.',
      },
      {
        kicker: '02 · Honnête',
        title: 'Pas mesuré veut dire pas mesuré',
        body: 'Regarde le graphique à droite : hier après-midi, il y a un trou, car la montre n’était pas au poignet. ZeppBridge n’invente pas de 0 et ne trace aucune ligne fictive. Les jours manquants apparaissent en petits traits gris autour de chaque bloc de données.',
      },
      {
        kicker: '03 · Passer à l’IA',
        title: 'Une question pour l’IA ? Choisis d’abord ce qu’elle verra',
        body: 'Ce qui est dans le cercle est transmis, ce qui est dehors ne l’est pas, et les petits traits autour de chaque nœud montrent quels jours ont des données. Appuie sur le bouton d’envoi : le .md est prêt, il ne reste qu’à le glisser dans la conversation.',
      },
      {
        kicker: '04 · Plan',
        title: 'Un entraînement planifié par l’IA, envoyé à ta montre seulement après ton accord',
        body: 'Recolle toute la réponse de l’IA : tu vois jour par jour ce qui change, avec la plage de fréquence cardiaque de chaque étape tracée en graphique. Les écritures pas encore vérifiées sur ta montre sont signalées. Rien ne part vers Zepp avant ta confirmation, et tu peux annuler à tout moment.',
      },
      {
        kicker: '05 · À toi de décider',
        title: 'Les réglages utiles sont là, rien de superflu',
        body: 'Les réglages forment une pile de cartes : ouvres-en une, puis fais glisser son en-tête sur le côté pour passer à la suivante. La durée de conservation, la fréquence de synchronisation et l’interface locale, c’est toi qui décides.',
      },
    ],
    flap: {
      tiles: [
        { value: '1 096', label: 'nuits de sommeil' },
        { value: '742', label: 'séances avec tracé' },
        { value: '1,5M', label: 'minutes de fréquence cardiaque' },
        { value: '9,8M', label: 'pas' },
      ],
    },
    handoff: {
      chat: 'Discussion avec l’IA',
      you: 'Toi',
      file: 'ZeppBridge 14 derniers jours.md',
      prompt: 'Ai-je moins bien dormi cette semaine que la précédente ? Pourquoi, à ton avis ?',
      answer: 'Un peu moins bien : 38 minutes de moins en moyenne, surtout en sommeil profond. Mardi et jeudi, tu t’es entraîné le soir, et ces nuits-là ton cœur a mis plus de temps à ralentir. Essaie une semaine en t’entraînant l’après-midi.',
      note: 'Pas d’IA intégrée, pas de compte en plus. Ce qui part, combien et quand, ça n’arrive que quand tu cliques.',
      close: 'Fermer',
    },
    privacy: {
      heading: 'Tes données de santé vivent à deux endroits',
      lead: 'Le cloud Zepp et ton propre ordinateur. Il n’y en a pas de troisième.',
      nodes: { watch: 'Montre', cloud: 'Cloud Zepp', computer: 'Ton ordinateur', server: 'Serveur ZeppBridge', none: 'n’existe pas' },
      points: [
        {
          title: 'Jetons dans le coffre du système',
          copy: 'Rangés dans le Gestionnaire d’identification de Windows ou le trousseau macOS, jamais dans le dossier de données.',
        },
        {
          title: 'Aucune télémétrie',
          copy: 'Aucun suivi d’usage, aucune donnée de santé collectée.',
        },
        {
          title: 'Origine claire',
          copy: 'Chaque relevé sait s’il vient de l’autorisation officielle ou des données avancées.',
        },
      ],
    },
    connect: {
      heading: 'Trois façons de te connecter. Prends la plus simple.',
      lead: 'Commence par l’autorisation officielle. Ajoute les données avancées quand tu veux plus de mesures.',
      recommended: 'Recommandé',
      paths: [
        {
          title: 'Autorisation officielle Zepp',
          copy: 'Connecte-toi à Zepp dans ton navigateur habituel et accepte.',
          detail: 'Les comptes Google, Xiaomi et Apple fonctionnent. Sommeil, fréquence cardiaque, pas, séances, PAI et poids se synchronisent.',
        },
        {
          title: 'Données avancées',
          copy: 'Ajoute la VFC, l’oxygène sanguin, le stress et la disponibilité, que l’API officielle ne propose pas.',
          detail: 'Connexion par e-mail ou téléphone. Le jeton reste uniquement dans le coffre de ton système.',
        },
        {
          title: 'Saisie manuelle',
          copy: 'Le recours quand les deux autres ne marchent pas.',
          detail: 'Tu colles toi-même un jeton. Pour celles et ceux qui connaissent l’API.',
        },
      ],
      note: 'Ce qui se synchronise dépend de ce que ton compte contient dans le cloud Zepp. Les mesures que tu vois dépendent de ton appareil et de ta façon de te connecter.',
    },
    final: {
      heading: 'Installe-le et découvre ce dont ta montre se souvient',
      lead: 'Gratuit, open source, sans inscription.',
      facts: {
        channel: 'Canal stable, installeurs sur GitHub Releases',
        systems: 'Windows 10 / 11 (x64) et macOS (Apple Silicon). Linux est expérimental.',
        ai: 'Aucun compte en plus. Pour les questions à une IA, tu utilises celle que tu as déjà.',
        windows: 'Windows : l’installeur n’est pas encore signé. Si tu vois "Éditeur inconnu", choisis "Informations complémentaires" puis "Exécuter quand même".',
        macos: 'macOS : une version non signée, le premier lancement est donc bloqué. Les étapes pour l’autoriser sont dans le readme GitHub.',
      },
    },
    footer: {
      tagline: 'Un pont local pour les données Amazfit et Zepp.',
      disclaimer: 'ZeppBridge est un projet open source indépendant, sans lien avec Zepp Health ni Amazfit.',
      source: 'Code source',
    },
  },
};

export default pack;
