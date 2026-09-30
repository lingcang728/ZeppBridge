import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Puente local de datos',
    description: 'ZeppBridge es un puente y visor de datos para wearables Amazfit / Zepp, local-first y de código abierto.',
    ogTitle: 'ZeppBridge · Tus datos de Zepp, devueltos completos',
    ogDescription: 'Conecta, organiza y visualiza datos de wearables Amazfit en tu equipo con Windows, macOS o Linux; la procedencia queda intacta y solo pasa a la IA cuando tú quieras.',
  },
  copy: {
    nav: { home: 'Inicio de ZeppBridge', site: 'Navegación del sitio', connect: 'Conectar', motion: 'Interfaz', handoff: 'Pasar a la IA', privacy: 'Privacidad', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Descargar para Windows', hint: 'Instalador x64', msi: '¿Despliegue masivo? Descarga el MSI' },
      macos: { label: 'Descargar para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'deb, rpm, AppImage y Flatpak salen de CI, pero nadie ha completado de punta a punta el inicio de sesión y el llavero en un escritorio Linux real. ¿Un problema? Abre un issue.' },
      status: { loading: 'Buscando el instalador más reciente', ready: 'Clic para descargar directo', fallback: 'De momento sin enlace directo; el clic abre el GitHub Release' },
    },
    hero: {
      headlineLead: 'Tus datos de Zepp,',
      headlineAccent: 'de vuelta en tus manos.',
      lead: 'Sincroniza, mira y organiza tus datos de Amazfit en tu propio equipo, y empaquétalos para la IA con un clic.',
      github: 'Ver en GitHub',
      starNudge: { title: 'Descarga iniciada', copy: 'Si ZeppBridge te sirve, una estrella en GitHub ayuda a otros usuarios de Amazfit a encontrarlo.', action: 'Dar estrella en GitHub', dismiss: 'Ahora no' },
    },
    demo: {
      label: 'Demostración interactiva del resumen de ZeppBridge',
      sample: 'Datos de ejemplo',
      hint: 'Toca una tarjeta',
      back: 'Volver',
      greeting: 'Resumen',
      heart: { title: 'Frecuencia cardíaca', unit: 'lpm', detail: 'Minuto a minuto, todo el día. Los minutos sin reloj quedan vacíos, nunca con un 0 inventado.' },
      steps: { title: 'Pasos de hoy', unit: 'pasos', detail: 'Pasos por hora desde la autorización oficial de Zepp, comparados solo con tu propio historial.' },
      sleep: { title: 'Anoche', hours: 'h', minutes: 'min', detail: 'Profundo, ligero, REM y despierto en orden; se prefiere el REM medido oficial.' },
    },
    devicesLabel: 'Dispositivos Amazfit compatibles',
    connect: {
      heading: 'Tres formas de conectar. Elige la más fácil.',
      lead: 'Empieza con la autorización oficial y suma Datos avanzados si quieres más métricas. Si ninguna sirve, queda la entrada manual.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorización oficial de Zepp', copy: 'Inicia sesión en Zepp en tu navegador de siempre y aprueba.', detail: 'Funcionan cuentas de Google, Xiaomi y Apple. Sincroniza sueño, frecuencia cardíaca, pasos, entrenamientos, PAI y peso.' },
        { icon: 'zepp-cloud', title: 'Datos avanzados', copy: 'Añade HRV, oxígeno en sangre, estrés y recuperación que la API oficial no ofrece.', detail: 'Entra con correo o teléfono. El token vive solo en el almacén de credenciales del sistema.' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'El respaldo cuando las otras dos no funcionan.', detail: 'Pega el token tú mismo. Para quienes conocen la API.' },
      ],
    },
    deck: {
      heading: 'La configuración no es una ristra de formularios: es una baraja de tarjetas',
      lead: 'Pasa el cursor y se abren en abanico. Haz clic en una para sacarla.',
      hint: 'Pasa el cursor para abrir en abanico; clic para sacarla',
      close: 'Devolverla',
      cards: [
        { icon: 'profile', title: 'Cuenta y dispositivos', copy: 'Autorización oficial y Datos avanzados, cada uno en su fila: siempre se ve qué cuenta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronización y actualizaciones', copy: 'Sincroniza una vez al abrir y luego en silencio, con el intervalo que elijas.' },
        { icon: 'database', title: 'Archivo y almacenamiento', copy: 'Cuánto conservar lo decides tú. Las copias se restauran cuando quieras.' },
        { icon: 'structured-data', title: 'Salud de los datos', copy: 'Si cada flujo se descargó, se entendió y se guardó, dicho por separado.' },
        { icon: 'secure', title: 'Privacidad y seguridad', copy: 'La API local de solo lectura viene desactivada y solo escucha en 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arrastra a la IA los datos que quieras preguntarle',
      lead: 'Arrastra una métrica y los nodos vecinos se apartan. Suéltala en el centro y entra al paquete que va a la IA.',
      hint: 'Arrastra un nodo al centro',
      center: 'Pasar a la IA',
      nodes: ['Frecuencia cardíaca', 'Sueño', 'HRV', 'Pasos', 'Carga de entrenamiento', 'PAI', 'Peso', 'Estrés'],
      picked: '{n} seleccionados',
      reset: 'Empezar de nuevo',
    },
    privacy: {
      heading: 'Tus datos se quedan en tu equipo',
      lead: 'ZeppBridge no tiene ningún servidor que guarde tus datos de salud.',
      points: [
        { icon: 'secure', title: 'Tokens en el almacén de credenciales', copy: 'Por defecto van al Administrador de credenciales de Windows o al Llavero de macOS, no a la carpeta de datos.' },
        { icon: 'private', title: 'Sin telemetría', copy: 'Sin reportes de uso. No se recopila ningún dato de salud.' },
        { icon: 'database', title: 'Procedencia clara', copy: 'Cada registro sabe si vino de la autorización oficial o de Datos avanzados.' },
        { icon: 'ai-ready', title: 'Tú decides qué pasa a la IA', copy: 'Qué incluir, cuánto y cuándo. Todo en tu mano.' },
      ],
    },
    footer: {
      heading: 'Gratis, de código abierto, listo para instalar',
      tagline: 'Un puente local-first para datos de Amazfit y Zepp.',
      disclaimer: 'ZeppBridge es un proyecto independiente de código abierto, sin afiliación con Zepp Health ni Amazfit.',
      download: 'Descargar',
    },
  },
};

export default pack;
