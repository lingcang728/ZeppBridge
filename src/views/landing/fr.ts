import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Passerelle de données locale',
    description: 'ZeppBridge est un pont local et open source pour tes données Amazfit et Zepp, visualisées sur ta machine.',
    ogTitle: 'ZeppBridge · Tes données Zepp, de retour entre tes mains',
    ogDescription: 'Connecte, organise et visualise tes données Amazfit sous Windows, macOS ou Linux ; la provenance est conservée, et l’IA ne reçoit que ce que tu lui confies.',
  },
  copy: {
    nav: { home: 'Accueil ZeppBridge', site: 'Navigation du site', connect: 'Connexion', motion: 'Interface', handoff: 'Vers l’IA', privacy: 'Confidentialité', star: 'GitHub', language: 'Langue' },
    downloads: {
      windows: { label: 'Télécharger pour Windows', hint: 'Installateur x64', msi: 'Déploiement en masse : installateur MSI' },
      macos: { label: 'Télécharger pour macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Expérimental', note: 'deb, rpm, AppImage et Flatpak sont compilés par la CI, mais la connexion et le trousseau n’ont pas encore été validés sur un vrai bureau Linux. Un problème ? Ouvre une issue.' },
      status: { loading: 'Recherche du dernier installateur', ready: 'Cliquer pour télécharger', fallback: 'Lien direct indisponible, ouverture de la page GitHub Release' },
    },
    hero: {
      headlineLead: 'Tes données Zepp,',
      headlineAccent: 'de retour entre tes mains.',
      lead: 'Synchronise, explore et organise tes données Amazfit sur ton ordinateur. Un clic pour les confier à une IA.',
      github: 'Voir sur GitHub',
      starNudge: { title: 'Téléchargement lancé', copy: 'Si ZeppBridge t’est utile, une étoile sur GitHub aide d’autres utilisateurs Amazfit à le découvrir.', action: 'Mettre une étoile', dismiss: 'Pas maintenant' },
    },
    demo: {
      label: 'Démo interactive de l’aperçu ZeppBridge',
      sample: 'Exemple de données',
      hint: 'Clique sur une carte',
      back: 'Retour',
      greeting: 'Aperçu',
      heart: { title: 'Fréquence cardiaque', unit: 'bpm', detail: 'Minute par minute, toute la journée. Sans montre au poignet, les minutes restent vides, sans faux zéros.' },
      steps: { title: 'Pas aujourd’hui', unit: 'pas', detail: 'Pas par heure issus de l’autorisation officielle Zepp, comparés à ton seul historique.' },
      sleep: { title: 'Nuit dernière', hours: 'h', minutes: 'min', detail: 'Profond, léger, paradoxal et éveil dans l’ordre. Le sommeil paradoxal mesuré officiel a la priorité.' },
    },
    devicesLabel: 'Appareils Amazfit compatibles',
    connect: {
      heading: 'Trois façons de te connecter. Choisis la plus simple.',
      lead: 'Commence par l’autorisation officielle, puis ajoute les «\u00A0Données avancées\u00A0» pour plus de métriques. La saisie manuelle dépanne si besoin.',
      recommended: 'Recommandé',
      paths: [
        { icon: 'verified', title: 'Autorisation officielle Zepp', copy: 'Connecte-toi à Zepp dans ton navigateur habituel et valide.', detail: 'Comptes Google, Xiaomi et Apple pris en charge. Sommeil, fréquence cardiaque, pas, séances, PAI et poids se synchronisent.' },
        { icon: 'zepp-cloud', title: 'Données avancées', copy: 'Ajoute VFC, SpO₂, stress et préparation, absents de l’API officielle.', detail: 'Connexion par e-mail ou téléphone. Le jeton reste uniquement dans le trousseau système.' },
        { icon: 'manual-entry', title: 'Saisie manuelle', copy: 'Solution de secours quand les deux autres ne conviennent pas.', detail: 'Colle ton jeton toi-même. Pour les utilisateurs habitués aux API.' },
      ],
    },
    deck: {
      heading: 'Des réglages en jeu de cartes, pas en formulaires à rallonge',
      lead: 'Survole pour déployer l’éventail, clique pour tirer une carte.',
      hint: 'Survoler pour déployer, cliquer pour ouvrir',
      close: 'Replacer',
      cards: [
        { icon: 'profile', title: 'Compte et appareils', copy: 'Autorisation officielle et «\u00A0Données avancées\u00A0» sur deux lignes : on voit tout de suite quel compte est connecté.' },
        { icon: 'auto-sync', title: 'Synchronisation et mises à jour', copy: 'Une synchro au lancement, puis discrètement selon ton planning.' },
        { icon: 'database', title: 'Archives et stockage', copy: 'Tu choisis la durée de rétention. Les instantanés se restaurent à tout moment.' },
        { icon: 'structured-data', title: 'Santé des données', copy: 'Récupéré, décodé, enregistré : l’état de chaque flux est transparent.' },
        { icon: 'secure', title: 'Confidentialité et sécurité', copy: 'API locale en lecture seule désactivée par défaut, limitée à 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Glisse vers l’IA ce que tu veux lui demander',
      lead: 'Glisse une métrique, ses voisines s’écartent. Lâche au centre pour l’ajouter au paquet transmis à l’IA.',
      hint: 'Glisse un nœud au centre',
      center: 'Vers l’IA',
      nodes: ['Fréquence cardiaque', 'Sommeil', 'VFC', 'Pas', 'Charge d’entraînement', 'PAI', 'Poids', 'Stress'],
      picked: '{n} sélectionnés',
      reset: 'Réinitialiser',
    },
    privacy: {
      heading: 'Tes données restent sur ton ordinateur',
      lead: 'ZeppBridge n’a aucun serveur pour héberger tes données de santé.',
      points: [
        { icon: 'secure', title: 'Jetons dans le trousseau système', copy: 'Stockés dans le Gestionnaire d’identifiants Windows ou le Trousseau macOS, pas dans le dossier de données.' },
        { icon: 'private', title: 'Aucune télémétrie', copy: 'Aucun rapport d’usage, aucune donnée de santé collectée.' },
        { icon: 'database', title: 'Provenance claire', copy: 'Chaque mesure sait si elle provient de l’autorisation officielle ou des «\u00A0Données avancées\u00A0».' },
        { icon: 'ai-ready', title: 'Tu gardes la main face à l’IA', copy: 'Quoi transmettre, combien et quand : c’est toi qui décides.' },
      ],
    },
    footer: {
      heading: 'Gratuit, open source, prêt à installer',
      tagline: 'Passerelle locale pour tes données Amazfit et Zepp.',
      disclaimer: 'ZeppBridge est un projet open source indépendant, sans affiliation avec Zepp Health ou Amazfit.',
      download: 'Télécharger',
    },
  },
};

export default pack;
