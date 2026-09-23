import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Français (fr) landing pack.
 *
 * French typography: « » quotes with narrow spaces, typographic apostrophe ’,
 * non-breaking space before double punctuation where practical in plain text.
 * Product terms (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI, Apple
 * Silicon, AI-ready) stay untranslated. Decorative overlines stay in English,
 * matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'Accueil ZeppBridge',
      site: 'Navigation du site',
      features: 'Ce qu’il lit',
      local: 'Sorties locales',
      connect: 'Connexion',
      privacy: 'Confidentialité',
      star: 'Étoile sur GitHub',
      language: 'Langue',
    },
    downloads: {
      windows: { label: 'Télécharger pour Windows', hint: 'Recommandé · Installeur EXE x64', msi: 'Déploiement géré : télécharger le MSI' },
      macos: { label: 'Télécharger pour macOS', hint: 'Apple Silicon · Installeur DMG' },
      linux: {
        label: 'Linux',
        previewBadge: 'Aperçu',
        note: 'deb / rpm / AppImage / Flatpak se compilent tous en CI, mais personne n’a encore mené à bout la connexion plus le trousseau (Secret Service / KWallet) sur un vrai bureau Linux. Essayez si vous voulez — et ouvrez un ticket quand quelque chose casse. C’est exactement ce dont il a besoin en ce moment.',
      },
      status: {
        loading: 'Recherche de la dernière version sur GitHub…',
        ready: 'Téléchargement direct — sans page GitHub entre deux',
        fallback: 'Les liens directs sont momentanément indisponibles ; la page Release s’ouvrira à la place',
      },
    },
    hero: {
      headlineLead: 'Vos données Zepp,',
      headlineAccent: 'rendues en intégralité.',
      lead: 'ZeppBridge connecte, organise et visualise les données de votre wearable Amazfit sur votre propre machine Windows, Mac ou Linux. Chaque champ garde sa source : lisez-les vous-même, ou confiez-les à une IA selon vos conditions.',
      starNudge: {
        title: 'Votre téléchargement a commencé',
        copy: 'Si ZeppBridge mérite une place sur votre machine, une étoile sur GitHub aide d’autres utilisateurs Amazfit à le trouver.',
        action: 'Mettre une étoile sur GitHub',
        dismiss: 'Peut-être plus tard',
      },
      trust: [
        { icon: 'secure', label: 'Local d’abord' },
        { icon: 'private', label: 'Privé par défaut' },
        { icon: 'structured-data', label: 'Données structurées' },
      ],
      stageLabel: 'Les appareils Amazfit actuels alimentent ZeppBridge et ressortent en données structurées',
      coreCaption: 'Décoder · Organiser · Visualiser',
      outputs: [
        { title: 'Enregistrements structurés', copy: 'Source et horodatage conservés' },
        { title: 'AI-ready', copy: 'Elles ne sortent que si vous le dites' },
      ],
      status: { title: 'Pipeline local prêt', copy: 'Rien ne transite par un serveur ZeppBridge' },
    },
    principlesLabel: 'Principes du produit',
    principles: [
      { icon: 'secure', title: 'Sécurisé', copy: 'Reste sur votre machine' },
      { icon: 'private', title: 'Privé', copy: 'Rien d’envoyé, rien de divulgué' },
      { icon: 'database', title: 'Provenance', copy: 'Les sources ne se mélangent jamais' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Structure claire, utilisée sur demande' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'Des chiffres du jour à chaque séance.',
      lead: 'L’interface n’affiche que les champs réellement reçus. Ce qui manque est marqué comme absent — pas de chiffres inventés pour remplir un tableau de bord.',
      items: [
        { icon: 'heart-rate', title: 'Fréquence cardiaque continue', copy: 'Horodatage et source conservés : vous voyez la vraie courbe.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Structure du sommeil', copy: 'Sommeil profond, léger, paradoxal et éveil, analysés en local.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Détail des séances', copy: 'Trace, allure, cadence, altitude et charge d’entraînement.', tone: 'green' },
        { icon: 'vo2-max', title: 'Métriques de récupération', copy: 'VO₂ Max, HRV et récupération, présentées par source.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Pas besoin de l’ouvrir.',
      lead: 'L’application bureau, la ligne de commande, MCP et l’API locale en lecture seule partagent le même noyau — unités, fuseaux horaires, sources et valeurs absentes n’ont qu’une seule version. Absent reste absent : aucune sortie ne bouche le trou avec un zéro.',
      items: [
        {
          icon: 'structured-data',
          title: 'Historique complet et snapshots',
          copy: 'Rapatriez l’historique cloud mois par mois, avec un registre par bloc. Les snapshots de toute la base sont vérifiés par somme de contrôle, et avant de restaurer vous voyez l’écart en nombre de lignes.',
          tag: 'Local',
        },
        {
          icon: 'document',
          title: 'Ligne de commande',
          copy: 'status / sync / export. Aucune invite, codes de sortie stables — prêt pour le Planificateur de tâches ou cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'MCP en lecture seule',
          copy: 'Laissez une IA interroger vos données locales elle-même. Transport stdio : aucun port ouvert, aucun accès réseau.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Choisissez la voie qui vous convient.',
      lead: 'De la simple connexion web officielle à la passation manuelle entièrement auditable. L’état de la connexion et les causes d’échec sont toujours écrits noir sur blanc.',
      items: [
        { icon: 'browser-login', title: 'Connexion web officielle', copy: 'Autorisez dans le flux officiel. Les identifiants restent sur votre machine.', tag: 'Recommandé' },
        { icon: 'document', title: 'Import HAR', copy: 'Pour le débogage et les utilisateurs avancés : réutilisez une requête autorisée déjà capturée.', tag: 'Avancé' },
        { icon: 'manual-entry', title: 'Saisie manuelle', copy: 'Entrez vous-même l’appToken et l’identifiant utilisateur, en toute transparence.', tag: 'Manuel' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Les données de votre wearable ne devraient pas devenir l’actif cloud de quelqu’un d’autre.',
      lead: 'Base locale, identifiants masqués et sources isolées : c’est le défaut. Quand vous voulez une IA dans la boucle, vous choisissez ce qui sort et où ça atterrit.',
      points: [
        { icon: 'database', label: 'Stockage SQLite local' },
        { icon: 'profile', label: 'Identifiants de compte masqués par défaut' },
        { icon: 'cloud-output', label: 'Export uniquement quand vous le déclenchez' },
      ],
      vault: 'Il n’existe aucun backend ZeppBridge qui relaierait vos données de santé.',
    },
    footer: {
      tagline: 'Pont de données Amazfit open source · Windows et Mac (Apple Silicon)',
      disclaimer: 'Un projet open source indépendant et non officiel, sans affiliation ni aval de Zepp Health, Huami ou Amazfit. À utiliser uniquement avec des comptes et des données auxquels vous avez droit d’accès.',
      download: 'Télécharger',
    },
  },
  meta: {
    title: 'ZeppBridge · Pont de données local',
    description:
      'ZeppBridge est un pont et un visualiseur local-first et open source pour les données de wearables Amazfit / Zepp. Il tourne sur votre propre machine Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Vos données Zepp, rendues en intégralité',
    ogDescription:
      'Connectez, organisez et visualisez les données de votre wearable Amazfit sur votre propre machine. Les sources restent intactes et rien ne part tant que vous ne l’envoyez pas.',
  },
};

export default pack;
