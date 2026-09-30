import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Passerelle de données locale',
    description: 'ZeppBridge est une passerelle open source et locale pour tes données Amazfit et Zepp, visualisées sur ta propre machine.',
    ogTitle: 'ZeppBridge · Tes données Zepp, de retour entre tes mains',
    ogDescription: 'Connecte, organise et visualise tes données Amazfit sous Windows, macOS et Linux. La provenance reste intacte, l’IA ne reçoit que ce que tu lui envoies.',
  },
  copy: {
    nav: { home: 'Accueil ZeppBridge', site: 'Navigation du site', connect: 'Connexion', motion: 'Interface', handoff: 'Vers l’IA', privacy: 'Confidentialité', star: 'GitHub', language: 'Langue' },
    downloads: {
      windows: { label: 'Télécharger pour Windows', hint: 'Installateur x64', msi: 'Déploiement en masse : télécharger le MSI' },
      macos: { label: 'Télécharger pour macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Expérimental', note: 'deb, rpm, AppImage et Flatpak sont compilés par la CI, mais personne n’a encore validé la connexion et le trousseau de bout en bout sur un vrai bureau Linux. Un problème ? Ouvre une issue.' },
      status: { loading: 'Lecture du dernier installateur', ready: 'Clique pour télécharger directement', fallback: 'Lien direct indisponible : le clic ouvrira la page GitHub Release' },
    },
    hero: {
      headlineLead: 'Tes données Zepp,',
      headlineAccent: 'de retour entre tes mains.',
      lead: 'Synchronise, consulte et organise tes données Amazfit sur ton propre ordinateur. Un clic pour les emballer vers une IA.',
      github: 'Voir sur GitHub',
      starNudge: { title: 'Téléchargement lancé', copy: 'Si ZeppBridge te sert, une étoile sur GitHub aide d’autres utilisateurs Amazfit à le trouver.', action: 'Mettre une étoile', dismiss: 'Pas maintenant' },
    },
    demo: {
      label: 'Démo interactive de l’aperçu ZeppBridge',
      sample: 'Données d’exemple',
      hint: 'Clique sur une carte pour essayer',
      back: 'Retour',
      greeting: 'Aperçu',
      heart: { title: 'Fréquence cardiaque', unit: 'bpm', detail: 'Minute par minute, toute la journée. Les minutes sans montre au poignet restent vides : pas de 0 en remplissage.' },
      steps: { title: 'Pas aujourd’hui', unit: 'pas', detail: 'Pas par heure issus de l’autorisation officielle Zepp, comparés à ton seul historique.' },
      sleep: { title: 'Nuit dernière', hours: 'h', minutes: 'min', detail: 'Profond, léger, paradoxal et éveil étalés dans le temps. Le paradoxal mesuré par l’officiel a la priorité.' },
    },
    devicesLabel: 'Appareils Amazfit compatibles',
    connect: {
      heading: 'Trois façons de te connecter, choisis la plus pratique',
      lead: 'Commence par l’autorisation officielle, puis ajoute les « Données avancées » pour plus de métriques. Si aucune des deux ne marche, il reste la saisie manuelle.',
      recommended: 'Recommandé',
      paths: [
        { icon: 'verified', title: 'Autorisation officielle Zepp', copy: 'Connecte-toi à Zepp dans ton navigateur habituel : un clic sur « accepter » et c’est fait.', detail: 'Comptes Google, Xiaomi et Apple pris en charge. Sommeil, fréquence cardiaque, pas, séances, PAI et poids se synchronisent.' },
        { icon: 'zepp-cloud', title: 'Données avancées', copy: 'Ajoute VFC, SpO₂, stress et préparation que l’officiel n’ouvre pas.', detail: 'Connexion par e-mail ou téléphone. Le jeton vit uniquement dans le magasin d’identifiants système.' },
        { icon: 'manual-entry', title: 'Saisie manuelle', copy: 'Solution de secours quand les deux autres ne conviennent pas.', detail: 'Colle ton jeton toi-même. Pour les utilisateurs à l’aise avec les API.' },
      ],
    },
    deck: {
      heading: 'Tes réglages : pas un long formulaire, une pile de cartes',
      lead: 'Survole-les, elles s’ouvrent en éventail. Clique sur l’une pour la sortir.',
      hint: 'Survoler pour déployer, cliquer pour sortir',
      close: 'La remettre',
      cards: [
        { icon: 'profile', title: 'Compte et appareils', copy: 'Autorisation officielle et « Données avancées » ont chacune leur ligne : le compte connecté se voit d’un coup d’œil.' },
        { icon: 'auto-sync', title: 'Synchronisation et mises à jour', copy: 'Une synchro au démarrage, puis en silence à l’intervalle que tu as réglé.' },
        { icon: 'database', title: 'Archives et stockage', copy: 'La durée de conservation t’appartient, les instantanés se restaurent à tout moment.' },
        { icon: 'structured-data', title: 'Santé des données', copy: 'Chaque flux dit séparément s’il a été récupéré, compris et écrit.' },
        { icon: 'secure', title: 'Confidentialité et sécurité', copy: 'L’API locale en lecture seule est coupée par défaut et n’écoute que 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Glisse vers l’IA les données que tu veux lui demander',
      lead: 'Glisse une métrique, les nœuds voisins s’écartent. Lâche-la au centre, elle rejoint le paquet remis à l’IA.',
      hint: 'Glisse un nœud au centre',
      center: 'Vers l’IA',
      nodes: ['Fréquence cardiaque', 'Sommeil', 'VFC', 'Pas', 'Charge d’entraînement', 'PAI', 'Poids', 'Stress'],
      picked: '{n} sélectionnés',
      reset: 'Recommencer',
    },
    privacy: {
      heading: 'Tes données ne vivent que sur ton ordinateur',
      lead: 'ZeppBridge n’a pas de serveur qui stocke tes données de santé.',
      points: [
        { icon: 'secure', title: 'Jetons dans le magasin d’identifiants système', copy: 'Par défaut dans le Gestionnaire d’identification Windows ou le Trousseau macOS, jamais dans le dossier de données.' },
        { icon: 'private', title: 'Aucune télémétrie', copy: 'Aucun envoi d’usage, aucune donnée de santé collectée.' },
        { icon: 'database', title: 'Provenance claire', copy: 'Chaque enregistrement sait s’il vient de l’autorisation officielle ou des « Données avancées ».' },
        { icon: 'ai-ready', title: 'Tu décides ce que l’IA reçoit', copy: 'Quoi inclure, combien et quand : tout t’appartient.' },
      ],
    },
    footer: {
      heading: 'Gratuit, open source, prêt à l’emploi',
      tagline: 'La passerelle locale entre tes données Amazfit et Zepp.',
      disclaimer: 'ZeppBridge est un projet open source indépendant, sans lien avec Zepp Health ou Amazfit.',
      download: 'Télécharger',
    },
  },
};

export default pack;
