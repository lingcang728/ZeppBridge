import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Tes données Zepp sur ton ordinateur',
    description: 'ZeppBridge est un pont local et open source pour les données Amazfit et Zepp. Il tourne sur ton propre Windows, Mac ou Linux.',
    ogTitle: 'ZeppBridge · Tes données Zepp, de retour entre tes mains',
    ogDescription: 'Synchronise, consulte et organise tes données Amazfit sur ton ordinateur. Transmets-les à une IA en un clic.',
  },
  copy: {
    nav: { home: 'Accueil ZeppBridge', site: 'Navigation du site', connect: 'Connexion', motion: 'Interface', handoff: 'Vers l’IA', privacy: 'Confidentialité', star: 'GitHub', language: 'Langue' },
    downloads: {
      windows: { label: 'Télécharger pour Windows', hint: 'Installateur x64', msi: 'Déploiement en masse : télécharger le MSI' },
      macos: { label: 'Télécharger pour macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Expérimental', note: 'Les paquets deb, rpm, AppImage et Flatpak sortent de la CI, mais personne n’a encore testé la connexion et le trousseau de bout en bout sur un vrai bureau Linux. En cas de souci, ouvre une issue.' },
      status: { loading: 'Recherche du dernier installateur', ready: 'Clique pour télécharger', fallback: 'Pas de lien direct pour l’instant, la page GitHub va s’ouvrir' },
    },
    hero: {
      headlineLead: 'Tes données Zepp,',
      headlineAccent: 'de retour entre tes mains.',
      lead: 'Synchronise, consulte et organise tes données Amazfit sur ton ordinateur. Transmets-les à une IA en un clic.',
      github: 'Voir sur GitHub',
      starNudge: { title: 'Le téléchargement a commencé', copy: 'Si ZeppBridge t’est utile, une étoile sur GitHub aide d’autres utilisateurs Amazfit à le trouver.', action: 'Ajouter une étoile', dismiss: 'Plus tard' },
    },
    demo: {
      label: 'Démo interactive de la vue d’ensemble de ZeppBridge',
      sample: 'Données d’exemple',
      hint: 'Touche une carte',
      back: 'Retour',
      greeting: 'Vue d’ensemble',
      heart: { title: 'Fréquence cardiaque', unit: 'bpm', detail: 'Minute par minute, toute la journée. Les minutes sans montre restent vides au lieu de devenir des zéros.' },
      steps: { title: 'Pas du jour', unit: 'pas', detail: 'Les pas par heure viennent de l’autorisation officielle Zepp et ne sont comparés qu’à ton propre historique.' },
      sleep: { title: 'La nuit dernière', hours: 'h', minutes: 'min', detail: 'Profond, léger, paradoxal et éveil dans l’ordre. Le sommeil paradoxal mesuré par Zepp prime.' },
    },
    devicesLabel: 'Appareils Amazfit pris en charge',
    connect: {
      heading: 'Trois façons de se connecter. Prends la plus simple.',
      lead: 'Commence par l’autorisation officielle et ajoute les données avancées pour plus de mesures. Si rien ne marche, il reste la saisie manuelle.',
      recommended: 'Recommandé',
      paths: [
        { icon: 'verified', title: 'Autorisation officielle Zepp', copy: 'Connecte-toi à Zepp dans ton navigateur habituel et accepte.', detail: 'Les comptes Google, Xiaomi et Apple fonctionnent. Sommeil, fréquence cardiaque, pas, entraînements, PAI et poids se synchronisent.' },
        { icon: 'zepp-cloud', title: 'Données avancées', copy: 'Ajoute la VFC, l’oxygène sanguin, le stress et la disponibilité, absents de l’API officielle.', detail: 'Connexion par e-mail ou téléphone. Le jeton reste uniquement dans le gestionnaire d’identifiants du système.' },
        { icon: 'manual-entry', title: 'Saisie manuelle', copy: 'Une solution de repli quand les deux autres ne sont pas possibles.', detail: 'Colle toi-même un jeton. Pour celles et ceux qui connaissent l’API.' },
      ],
    },
    deck: {
      heading: 'Les réglages en paquet de cartes, pas en mur de formulaires',
      lead: 'Survole-les et elles s’ouvrent en éventail. Clique sur une pour la sortir.',
      hint: 'Survoler pour déployer, cliquer pour sortir',
      close: 'Remettre',
      cards: [
        { icon: 'profile', title: 'Compte et appareils', copy: 'L’autorisation officielle et les données avancées ont chacune leur ligne : tu sais toujours quel compte est connecté.' },
        { icon: 'auto-sync', title: 'Synchronisation et mises à jour', copy: 'Synchronise au lancement, puis discrètement au rythme que tu choisis.' },
        { icon: 'database', title: 'Archives et stockage', copy: 'Tu décides combien de temps garder les données. Les instantanés se restaurent à tout moment.' },
        { icon: 'structured-data', title: 'Santé des données', copy: 'Chaque flux a-t-il été récupéré, compris et écrit ? Tout est détaillé séparément.' },
        { icon: 'secure', title: 'Confidentialité et sécurité', copy: 'L’API locale en lecture seule est désactivée par défaut et n’écoute que sur 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Glisse vers l’IA ce que tu veux lui demander',
      lead: 'Glisse une mesure et ses voisines s’écartent. Lâche-la au centre et elle rejoint le paquet que tu confies à l’IA.',
      hint: 'Glisse un nœud au centre',
      center: 'Vers l’IA',
      nodes: ['Cœur', 'Sommeil', 'VFC', 'Pas', 'Charge', 'PAI', 'Poids', 'Stress'],
      picked: '{n} choisis',
      reset: 'Recommencer',
    },
    privacy: {
      heading: 'Tes données restent sur ton ordinateur',
      lead: 'ZeppBridge n’a pas de serveur à lui qui conserve tes données de santé.',
      points: [
        { icon: 'secure', title: 'Jetons dans le trousseau système', copy: 'Par défaut dans le gestionnaire d’identifiants Windows ou le trousseau macOS, pas dans le dossier de données.' },
        { icon: 'private', title: 'Aucune télémétrie', copy: 'Pas de rapports d’usage. Aucune donnée de santé collectée.' },
        { icon: 'database', title: 'Origine claire', copy: 'Chaque enregistrement sait s’il vient de l’autorisation officielle ou des données avancées.' },
        { icon: 'ai-ready', title: 'Tu choisis ce que voit l’IA', copy: 'Quoi, combien et quand. C’est toi qui décides.' },
      ],
    },
    footer: {
      heading: 'Gratuit, open source, prêt à installer',
      tagline: 'Un pont local pour les données Amazfit et Zepp.',
      disclaimer: 'ZeppBridge est un projet open source indépendant, sans lien avec Zepp Health ni Amazfit.',
      download: 'Télécharger',
    },
  },
};

export default pack;
