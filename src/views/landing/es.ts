import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Tus datos de Zepp, en tu equipo',
    description: 'ZeppBridge es un puente local y de código abierto para los datos de Amazfit y Zepp. Funciona en tu propio Windows, Mac o Linux.',
    ogTitle: 'ZeppBridge · Tus datos de Zepp, de vuelta en tus manos',
    ogDescription: 'Sincroniza, consulta y organiza tus datos de Amazfit en tu propio equipo. Pásalos a una IA con un clic.',
  },
  copy: {
    nav: { home: 'Inicio de ZeppBridge', site: 'Navegación del sitio', connect: 'Conectar', motion: 'Interfaz', handoff: 'Pasar a la IA', privacy: 'Privacidad', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Descargar para Windows', hint: 'Instalador x64', msi: 'Despliegue masivo: descarga el MSI' },
      macos: { label: 'Descargar para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'Los paquetes deb, rpm, AppImage y Flatpak salen de la CI, pero nadie ha probado todavía el inicio de sesión y el llavero de principio a fin en un escritorio Linux real. Si algo falla, abre un issue.' },
      status: { loading: 'Buscando el instalador más reciente', ready: 'Haz clic para descargar', fallback: 'Sin enlace directo ahora mismo; se abrirá la versión en GitHub' },
    },
    hero: {
      headlineLead: 'Tus datos de Zepp,',
      headlineAccent: 'de vuelta en tus manos.',
      lead: 'Sincroniza, consulta y organiza tus datos de Amazfit en tu propio equipo. Pásalos a una IA con un clic.',
      github: 'Ver en GitHub',
      starNudge: { title: 'La descarga ha empezado', copy: 'Si ZeppBridge te resulta útil, una estrella en GitHub ayuda a que otros usuarios de Amazfit lo encuentren.', action: 'Dar una estrella', dismiss: 'Ahora no' },
    },
    demo: {
      label: 'Demostración interactiva del resumen de ZeppBridge',
      sample: 'Datos de ejemplo',
      hint: 'Toca una tarjeta',
      back: 'Volver',
      greeting: 'Resumen',
      heart: { title: 'Frecuencia cardíaca', unit: 'ppm', detail: 'Minuto a minuto, todo el día. Los minutos sin reloj quedan vacíos en lugar de convertirse en ceros.' },
      steps: { title: 'Pasos de hoy', unit: 'pasos', detail: 'Los pasos por hora vienen de la autorización oficial de Zepp y se comparan solo con tu propio historial.' },
      sleep: { title: 'Anoche', hours: 'h', minutes: 'min', detail: 'Profundo, ligero, REM y despierto en orden. Manda el REM medido por Zepp.' },
    },
    devicesLabel: 'Dispositivos Amazfit compatibles',
    connect: {
      heading: 'Tres formas de entrar. Elige la sencilla.',
      lead: 'Empieza con la autorización oficial y añade datos avanzados para más métricas. Si ninguna funciona, queda la entrada manual.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorización oficial de Zepp', copy: 'Inicia sesión en Zepp desde tu navegador habitual y acepta.', detail: 'Funcionan las cuentas de Google, Xiaomi y Apple. Se sincronizan sueño, frecuencia cardíaca, pasos, entrenamientos, PAI y peso.' },
        { icon: 'zepp-cloud', title: 'Datos avanzados', copy: 'Añade VFC, oxígeno en sangre, estrés y preparación, que la API oficial no ofrece.', detail: 'Inicia sesión con correo o teléfono. El token se guarda solo en el almacén de credenciales del sistema.' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'Una alternativa cuando las otras dos no sirven.', detail: 'Pega tú mismo un token. Pensado para quien conoce la API.' },
      ],
    },
    deck: {
      heading: 'Ajustes como una baraja, no como un muro de formularios',
      lead: 'Pasa el ratón y se abren en abanico. Haz clic en una para sacarla.',
      hint: 'Pasa el ratón para abrir, haz clic para sacar',
      close: 'Devolver',
      cards: [
        { icon: 'profile', title: 'Cuenta y dispositivos', copy: 'La autorización oficial y los datos avanzados tienen cada uno su fila, así siempre sabes qué cuenta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronización y actualizaciones', copy: 'Sincroniza al abrir y luego en segundo plano con la frecuencia que elijas.' },
        { icon: 'database', title: 'Archivo y almacenamiento', copy: 'Tú decides cuánto tiempo guardar. Las instantáneas se restauran cuando quieras.' },
        { icon: 'structured-data', title: 'Salud de los datos', copy: 'Si cada flujo se descargó, se entendió y se guardó, por separado.' },
        { icon: 'secure', title: 'Privacidad y seguridad', copy: 'La API local de solo lectura viene apagada y solo escucha en 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arrastra hacia la IA lo que quieres preguntar',
      lead: 'Arrastra una métrica y sus vecinas se apartan. Suéltala en el centro y entra en el paquete que le pasas a la IA.',
      hint: 'Arrastra un nodo al centro',
      center: 'Pasar a la IA',
      nodes: ['Frecuencia', 'Sueño', 'VFC', 'Pasos', 'Carga', 'PAI', 'Peso', 'Estrés'],
      picked: '{n} elegidos',
      reset: 'Reiniciar',
    },
    privacy: {
      heading: 'Tus datos se quedan en tu equipo',
      lead: 'ZeppBridge no tiene un servidor propio que guarde tus datos de salud.',
      points: [
        { icon: 'secure', title: 'Tokens en el llavero del sistema', copy: 'Por defecto en el Administrador de credenciales de Windows o el Llavero de macOS, no en la carpeta de datos.' },
        { icon: 'private', title: 'Sin telemetría', copy: 'Sin informes de uso. No se recoge ningún dato de salud.' },
        { icon: 'database', title: 'Origen claro', copy: 'Cada registro sabe si viene de la autorización oficial o de los datos avanzados.' },
        { icon: 'ai-ready', title: 'Tú decides qué ve la IA', copy: 'Qué incluir, cuánto y cuándo. Todo depende de ti.' },
      ],
    },
    footer: {
      heading: 'Gratis, de código abierto y listo para instalar',
      tagline: 'Un puente local para los datos de Amazfit y Zepp.',
      disclaimer: 'ZeppBridge es un proyecto independiente de código abierto, sin relación con Zepp Health ni Amazfit.',
      download: 'Descargar',
    },
  },
};

export default pack;
