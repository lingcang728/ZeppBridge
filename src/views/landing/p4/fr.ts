/** Version française de la page d’accueil P4. Structure identique à zh / en dans p4Copy.ts. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Design', title: 'Coup de foudre au premier regard.', lead: 'Une navigation en verre, des cartes qui se métamorphosent en pages et des journées que l’on parcourt comme un jeu de cartes.', points: [
      { id: 'glass', title: 'Verre', text: 'Maintenez et glissez lentement le long de la barre de navigation, puis touchez pour changer. Les reflets suivent votre doigt.', scene: 'glass' },
      { id: 'morph', title: 'Métamorphose', text: 'Une carte s’ouvre en pleine page et reprend sa place au retour. L’essentiel en lumière, le reste s’efface.', scene: 'morph' },
      { id: 'poker', title: 'Tapis de cartes', text: 'Feuilletez les cartes quotidiennes, déployez des semaines ou des mois entiers. Conservez les meilleurs moments dans la boîte de souvenirs.', scene: 'poker' },
      { id: 'theme', title: 'Jour et nuit', text: 'Thèmes sombre et clair. Un geste, et la nuit s’installe.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Connexion', title: 'Vos données du cloud, de retour sur votre bureau.', lead: 'Connectez votre compte Zepp et synchronisez vos enregistrements sur cet ordinateur. Choisissez une fréquence, la synchronisation automatique fait le reste.', points: [
      { id: 'account', title: 'Connexion officielle', text: 'Connectez-vous à Zepp dans votre navigateur par défaut, y compris via des comptes tiers. État de l’autorisation consultable à tout instant.', scene: 'account' },
      { id: 'sync', title: 'Synchronisation automatique', text: 'Désactivé, 15, 30 ou 60 minutes. Vous dormez, tout se synchronise en silence.', scene: 'sync' },
      { id: 'devices', title: 'Reconnaît vos montres', text: 'Identification automatique du modèle. En cas de doute, désignez le vôtre manuellement.', scene: 'devices' },
      { id: 'local', title: 'Reste sur cet ordinateur', text: 'Vos données de santé restent stockées sur cet ordinateur et ne transitent jamais par nos serveurs. Vous choisissez ce qui est transmis à l’IA.', scene: 'local' },
    ] },
    { id: 'records', name: 'Comprendre', title: 'Des dizaines d’indicateurs, en un clin d’œil.', lead: 'Toutes vos tendances sur une seule page pour évaluer votre condition physique. Ouvrez un indicateur pour explorer l’historique complet.', points: [
      { id: 'overview', title: 'À votre guise', text: 'Sommeil ou entraînements en priorité : l’accueil s’adapte à ce qui compte pour vous. Parcourez puis ouvrez les détails.', scene: 'overview' },
      { id: 'hourly', title: 'Heure par heure', text: 'Pas, distance et calories mesurés heure par heure tout au long de la journée.', scene: 'hourly' },
      { id: 'workouts', title: 'Chaque course a son écho', text: 'Comparez votre séance à vos sorties passées de distance comparable : fréquence cardiaque, allure et tracé GPS.', scene: 'workouts' },
      { id: 'gaps', title: 'Rien d’inventé', text: 'Sans mesure, l’espace reste vide. Pas de zéros artificiels, de valeurs répétées ni d’estimations approximatives.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'Envoyer à l’IA', title: 'Profitez de vos abonnements existants. Sans surcoût.', lead: 'Sélectionnez les jours : vos relevés sont rassemblés en un seul fichier. Confiez-le à votre IA préférée, échangez, puis rapportez votre premier brouillon.', points: [
      { id: 'providers', title: 'Sept modèles au choix', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao et Grok. Utilisez vos comptes et quotas habituels.', scene: 'ai' },
      { id: 'prompt', title: 'Posez vos propres questions', text: 'Modifiez la question suggérée ou rédigez la vôtre en toute liberté.', scene: 'prompt' },
      { id: 'events', title: 'Le contexte compte', text: 'Notez un rhume, un voyage ou une semaine intense : l’IA comprend mieux les fluctuations de votre forme.', scene: 'events' },
      { id: 'autopaste', title: 'Automatique · Windows', text: 'Colle et envoie à votre place en vérifiant la fenêtre à chaque étape. Désactivé par défaut.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Plan d’entraînement', title: 'Finalisé sur ordinateur. Prêt sur votre montre.', lead: 'Partagez votre forme avec l’IA pour planifier la semaine. Collez le résultat, ajustez chaque séance, puis transférez directement vers votre montre.', points: [
      { id: 'receive', title: 'Collé en un clic', text: 'De la conversation au brouillon : copiez et votre semaine d’entraînement prend forme.', scene: 'receive' },
      { id: 'edit', title: 'Votre plan, vos règles', text: 'Glissez pour permuter deux journées, ouvrez chaque séance pour ajuster durées et intensités. Survolez pour voir les détails.', scene: 'plan-edit' },
      { id: 'templates', title: 'Modèles et import', text: 'Enregistrez vos séances préférées en modèles. Compatible avec les fichiers .zwo et les entraînements .fit.', scene: 'templates' },
      { id: 'easy', title: 'Fatigue du jour', text: 'Si des fractionnés sont prévus mais que votre récupération est faible, passez en footing souple en un clic. Vous validez avant l’envoi.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sommeil', text: 'Des phases d’une seule nuit à l’évolution des sept derniers jours. Ouvrez et explorez.' },
    workouts: { title: 'Séances', text: 'Visualisez la séance dans son ensemble et comparez-la à vos précédentes sorties.' },
  },
  settings: {
    title: 'Réglages',
    lead: 'Parcourez les grandes cartes une à une ; les petites se regroupent en portefeuille. Compte, synchronisation, affichage et gestion des données à portée de main.',
    summaryTitle: 'Tous les détails sont dans les Réglages.',
    summaryLead: 'Quatorze réglages du quotidien, réunis en une seule pile de cartes.',
    items: [
      { id: 'sync', title: 'Synchronisation automatique', text: 'Désactivé, 15, 30 ou 60 minutes. Choisissez votre rythme.', icon: 'auto-sync' },
      { id: 'retention', title: 'Durée de conservation', text: 'L’historique disponible dans le cloud est rapatrié ici. Vous décidez combien de temps le garder.', icon: 'database' },
      { id: 'data', title: 'Couverture des données', text: 'Ce qui peut être synchronisé et ce qui ne l’est pas, en toute transparence.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Les outils locaux comme Claude Code et Codex interrogent directement. La publication de plans nécessite votre accord.', icon: 'structured-data' },
      { id: 'formats', title: 'Quatre formats', text: 'JSON · CSV · GPX, ainsi que FIT sur la page des séances.', icon: 'document' },
      { id: 'units', title: 'Unités', text: 'Kilomètres ou miles. Distance et allure basculent ensemble.', icon: 'settings' },
      { id: 'time', title: 'Heure', text: 'Selon votre région, ou format 12 h / 24 h.', icon: 'auto-sync' },
      { id: 'date', title: 'Format de date', text: 'Ordre du jour, du mois et de l’année selon vos habitudes.', icon: 'document' },
      { id: 'scale', title: 'Échelle de l’interface', text: 'Agrandissez ou réduisez la fenêtre selon vos préférences.', icon: 'overview' },
      { id: 'backup', title: 'Sauvegarde et restauration', text: 'Créez des instantanés de la base de données et restaurez-les en cas de besoin.', icon: 'database' },
      { id: 'api', title: 'API locale', text: 'Reliée exclusivement à 127.0.0.1. Accès en lecture seule, sécurisé par jeton.', icon: 'structured-data' },
      { id: 'privacy', title: 'Confidentialité et sécurité', text: 'Identifiants protégés par le système. Les jetons ne figurent jamais dans les journaux.', icon: 'browser-login' },
      { id: 'filename', title: 'Nom des fichiers', text: 'Définissez la nomenclature des fichiers exportés vers l’IA.', icon: 'document' },
      { id: 'folder', title: 'Dossier de données', text: 'Localisez vos données sur cet ordinateur pour vos sauvegardes et migrations.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'Découvrir ZeppBridge', links: [{ id: 'motion', label: 'Design' }, { id: 'connection', label: 'Connexion' }, { id: 'records', label: 'Comprendre' }] },
    { label: 'Des relevés à l’action', links: [{ id: 'ai', label: 'Envoyer à l’IA' }, { id: 'ai-plan', label: 'Plan d’entraînement' }, { id: 'record-sleep', label: 'Sommeil et séances' }] },
    { label: 'À votre rythme', links: [{ id: 'connect', label: 'Réglages' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'API locale' }] },
  ],
  demoPrompt: 'Pas disponible mercredi prochain. Garde une séance de fractionné et prévois le reste en endurance fondamentale.',
};

export default pack;
