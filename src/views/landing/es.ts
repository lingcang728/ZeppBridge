import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Español (es) landing pack.
 *
 * Same freedom as the English copy: rewritten to sound natural, not translated
 * word for word. Product terms (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI,
 * Apple Silicon, AI-ready) stay untranslated. Decorative overlines stay in
 * English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'Inicio de ZeppBridge',
      site: 'Navegación del sitio',
      features: 'Qué lee',
      local: 'Salidas locales',
      connect: 'Conexión',
      privacy: 'Privacidad',
      star: 'Estrella en GitHub',
      language: 'Idioma',
    },
    downloads: {
      windows: { label: 'Descargar para Windows', hint: 'Recomendado · Instalador EXE x64', msi: 'Despliegue gestionado: descargar MSI' },
      macos: { label: 'Descargar para macOS', hint: 'Apple Silicon · Instalador DMG' },
      linux: {
        label: 'Linux',
        previewBadge: 'Vista previa',
        note: 'deb / rpm / AppImage / Flatpak se compilan en CI, pero nadie ha completado todavía el inicio de sesión y el llavero (Secret Service / KWallet) en un escritorio Linux real. Pruébalo si quieres — y abre un issue cuando algo falle. Es justo lo que necesita ahora.',
      },
      status: {
        loading: 'Buscando la última versión en GitHub…',
        ready: 'Descarga directa, sin pasar por GitHub',
        fallback: 'Los enlaces directos no están disponibles ahora; se abrirá la página de Release',
      },
    },
    hero: {
      headlineLead: 'Tus datos de Zepp,',
      headlineAccent: 'devueltos enteros.',
      lead: 'ZeppBridge conecta, organiza y visualiza los datos de tu wearable Amazfit en tu propio equipo Windows, Mac o Linux. Cada campo conserva su origen: léelo tú mismo o entrégaselo a una IA en tus términos.',
      starNudge: {
        title: 'Tu descarga ha comenzado',
        copy: 'Si ZeppBridge se gana un sitio en tu equipo, una estrella en GitHub ayuda a que más usuarios de Amazfit lo encuentren.',
        action: 'Dar una estrella en GitHub',
        dismiss: 'Quizá más tarde',
      },
      trust: [
        { icon: 'secure', label: 'Local primero' },
        { icon: 'private', label: 'Privado por defecto' },
        { icon: 'structured-data', label: 'Datos estructurados' },
      ],
      stageLabel: 'Dispositivos Amazfit actuales alimentando ZeppBridge y saliendo como datos estructurados',
      coreCaption: 'Decodificar · Organizar · Visualizar',
      outputs: [
        { title: 'Registros estructurados', copy: 'Origen y marcas de tiempo intactos' },
        { title: 'AI-ready', copy: 'Solo sale cuando tú lo dices' },
      ],
      status: { title: 'Canal local listo', copy: 'Nada pasa por un servidor de ZeppBridge' },
    },
    principlesLabel: 'Principios del producto',
    principles: [
      { icon: 'secure', title: 'Seguro', copy: 'Se queda en tu equipo' },
      { icon: 'private', title: 'Privado', copy: 'Nada se sube, nada se filtra' },
      { icon: 'database', title: 'Procedencia', copy: 'Los orígenes nunca se mezclan' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Estructura clara, lista cuando la pides' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'De las cifras de hoy a cada sesión.',
      lead: 'La interfaz solo muestra los campos que realmente recibió. Lo que falta se marca como ausente: nada de números inventados para rellenar un panel.',
      items: [
        { icon: 'heart-rate', title: 'Frecuencia cardiaca continua', copy: 'Marcas de tiempo y origen conservados: ves la curva real.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Estructura del sueño', copy: 'Fases de sueño profundo, ligero, REM y vigilia, analizadas en local.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Detalle de entrenamiento', copy: 'Ruta, ritmo, cadencia, altitud y carga de entrenamiento.', tone: 'green' },
        { icon: 'vo2-max', title: 'Métricas de recuperación', copy: 'VO₂ Max, HRV y recuperación, mostrados según su origen.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'No hace falta abrirlo.',
      lead: 'La app de escritorio, la línea de comandos, MCP y la API local de solo lectura comparten un mismo núcleo: unidades, zonas horarias, orígenes y valores ausentes cuentan una sola historia. Lo que falta, falta: ninguna salida rellena el hueco con un cero.',
      items: [
        {
          icon: 'structured-data',
          title: 'Historial completo y snapshots',
          copy: 'Recupera el historial de la nube mes a mes con un libro de cuentas por bloque. Los snapshots de toda la base van con suma de verificación, y antes de restaurar ves la diferencia en número de filas.',
          tag: 'Local',
        },
        {
          icon: 'document',
          title: 'Línea de comandos',
          copy: 'status / sync / export. Sin preguntas, códigos de salida estables: listo para el Programador de tareas o cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'MCP de solo lectura',
          copy: 'Deja que una IA consulte tus datos locales directamente. Transporte stdio: no abre puertos ni toca la red.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Elige la vía que te convenga.',
      lead: 'Desde el inicio de sesión web oficial hasta una entrega manual totalmente auditable. El estado de la conexión y las causas de error siempre quedan claros.',
      items: [
        { icon: 'browser-login', title: 'Inicio de sesión web oficial', copy: 'Autoriza dentro del flujo oficial. Las credenciales se quedan en tu equipo.', tag: 'Recomendado' },
        { icon: 'document', title: 'Importar HAR', copy: 'Para depuración y usuarios avanzados: reutiliza una solicitud autorizada que ya hayas capturado.', tag: 'Avanzado' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'Escribe tú mismo el appToken y el id de usuario, a la vista.', tag: 'Manual' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Tus datos de wearable no deberían ser el activo en la nube de otro.',
      lead: 'Base de datos local, identificadores enmascarados y orígenes aislados son la configuración por defecto. Cuando quieras involucrar a una IA, tú decides qué sale y dónde aterriza.',
      points: [
        { icon: 'database', label: 'Almacenamiento SQLite local' },
        { icon: 'profile', label: 'IDs de cuenta enmascarados por defecto' },
        { icon: 'cloud-output', label: 'La exportación solo ocurre si la provocas' },
      ],
      vault: 'No hay ningún backend de ZeppBridge retransmitiendo tus datos de salud.',
    },
    footer: {
      tagline: 'Puente de datos Amazfit de código abierto · Windows y Mac (Apple Silicon)',
      disclaimer: 'Un proyecto independiente y no oficial de código abierto, sin afiliación ni respaldo de Zepp Health, Huami o Amazfit. Úsalo solo con cuentas y datos a los que tengas derecho de acceso.',
      download: 'Descargar',
    },
  },
  meta: {
    title: 'ZeppBridge · Puente de datos local',
    description:
      'ZeppBridge es un puente y visor local y de código abierto para datos de wearables Amazfit / Zepp. Funciona en tu propio equipo Windows, Mac o Linux.',
    ogTitle: 'ZeppBridge · Tus datos de Zepp, devueltos enteros',
    ogDescription:
      'Conecta, organiza y visualiza los datos de tu wearable Amazfit en tu propio equipo. Los orígenes se conservan y nada sale hasta que tú lo envías.',
  },
};

export default pack;
