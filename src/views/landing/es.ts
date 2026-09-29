import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · Tus datos de Zepp, de vuelta en tus manos',
    description: 'ZeppBridge es un puente local y de código abierto para datos de Amazfit y Zepp. Funciona en tu equipo con Windows, macOS o Linux.',
    ogTitle: 'ZeppBridge · Tus datos de Zepp, de vuelta en tus manos',
    ogDescription: 'Sincroniza, consulta y organiza tus datos de Amazfit en tu equipo. Pásalos a la IA con un clic.',
  },
  copy: {
    nav: { home: 'Inicio de ZeppBridge', site: 'Navegación del sitio', connect: 'Conectar', motion: 'Interfaz', handoff: 'Pasar a la IA', privacy: 'Privacidad', star: 'GitHub', language: 'Idioma' },
    downloads: {
      windows: { label: 'Descargar para Windows', hint: 'Instalador x64', msi: 'Despliegue masivo: descarga el MSI' },
      macos: { label: 'Descargar para macOS', hint: 'Apple Silicon' },
      linux: { label: 'Linux', previewBadge: 'Experimental', note: 'Paquetes deb, rpm, AppImage y Flatpak generados por CI, pero nadie ha probado el inicio de sesión y el llavero en un escritorio Linux real. ¿Algún problema? Abre un issue.' },
      status: { loading: 'Buscando el instalador más reciente', ready: 'Clic para descargar directamente', fallback: 'Sin enlace directo; se abrirá GitHub Releases' },
    },
    hero: {
      headlineLead: 'Tus datos de Zepp,',
      headlineAccent: 'de vuelta en tus manos.',
      lead: 'Sincroniza, consulta y organiza tus datos de Amazfit en tu equipo. Pásalos a la IA con un clic.',
      github: 'Ver en GitHub',
      starNudge: { title: 'Descarga iniciada', copy: 'Si ZeppBridge te sirve, una estrella en GitHub ayuda a que otros usuarios de Amazfit lo encuentren.', action: 'Dar estrella en GitHub', dismiss: 'Ahora no' },
    },
    demo: {
      label: 'Demostración interactiva del resumen de ZeppBridge',
      sample: 'Datos de ejemplo',
      hint: 'Toca una tarjeta',
      back: 'Volver',
      greeting: 'Resumen',
      heart: { title: 'Frecuencia cardíaca', unit: 'lpm', detail: 'Todo el día, minuto a minuto. Minutos sin reloj quedan vacíos, nunca en cero.' },
      steps: { title: 'Pasos de hoy', unit: 'pasos', detail: 'Pasos por hora con autorización oficial de Zepp, comparados con tu historial.' },
      sleep: { title: 'Anoche', hours: 'h', minutes: 'min', detail: 'Profundo, ligero, REM y despierto en orden, priorizando el REM medido por Zepp.' },
    },
    devicesLabel: 'Dispositivos Amazfit compatibles',
    connect: {
      heading: 'Tres formas de conectar. Elige la más simple.',
      lead: 'Empieza con la autorización oficial y añade Datos avanzados para más métricas. Si ninguna sirve, ingresa el token a mano.',
      recommended: 'Recomendado',
      paths: [
        { icon: 'verified', title: 'Autorización oficial de Zepp', copy: 'Inicia sesión en Zepp en tu navegador habitual y acepta.', detail: 'Cuentas de Google, Xiaomi y Apple. Sincroniza sueño, frecuencia cardíaca, pasos, entrenamientos, PAI y peso.' },
        { icon: 'zepp-cloud', title: 'Datos avanzados', copy: 'Añade HRV, oxígeno en sangre, estrés y preparación, ausentes en la API oficial.', detail: 'Inicia sesión con correo o teléfono. El token se guarda solo en el almacén de credenciales del sistema.' },
        { icon: 'manual-entry', title: 'Entrada manual', copy: 'Alternativa cuando las otras dos no funcionan.', detail: 'Pega el token tú mismo. Para usuarios familiarizados con la API.' },
      ],
    },
    deck: {
      heading: 'Ajustes en baraja de tarjetas, no un formulario infinito',
      lead: 'Pasa el cursor para separarlas; haz clic en una para abrirla.',
      hint: 'Pasa el cursor para abrir en abanico; clic para ver',
      close: 'Guardar',
      cards: [
        { icon: 'profile', title: 'Cuenta y dispositivos', copy: 'Autorización oficial y Datos avanzados en filas separadas: siempre ves qué cuenta está conectada.' },
        { icon: 'auto-sync', title: 'Sincronización y actualizaciones', copy: 'Sincroniza al abrir y en segundo plano según el intervalo elegido.' },
        { icon: 'database', title: 'Archivo y almacenamiento', copy: 'Tú decides cuánto tiempo conservar. Restaura copias en cualquier momento.' },
        { icon: 'structured-data', title: 'Salud de los datos', copy: 'Estado claro de cada flujo: si se descargó, interpretó y guardó.' },
        { icon: 'secure', title: 'Privacidad y seguridad', copy: 'API local de solo lectura desactivada por defecto; solo escucha en 127.0.0.1.' },
      ],
    },
    handoff: {
      heading: 'Arrastra a la IA lo que quieras consultar',
      lead: 'Arrastra una métrica y los nodos vecinos se apartan. Suéltala al centro para incluirla en el paquete.',
      hint: 'Arrastra un nodo al centro',
      center: 'Pasar a la IA',
      nodes: ['Frecuencia cardíaca', 'Sueño', 'HRV', 'Pasos', 'Carga de entrenamiento', 'PAI', 'Peso', 'Estrés'],
      picked: '{n} seleccionados',
      reset: 'Reiniciar',
    },
    privacy: {
      heading: 'Tus datos se quedan en tu equipo',
      lead: 'ZeppBridge no tiene servidores para almacenar tus datos de salud.',
      points: [
        { icon: 'secure', title: 'Tokens en el almacén de credenciales', copy: 'Guardados en el Administrador de credenciales de Windows o el Llavero de macOS, nunca en la carpeta de datos.' },
        { icon: 'private', title: 'Sin telemetría', copy: 'Sin informes de uso ni recopilación de datos de salud.' },
        { icon: 'database', title: 'Origen transparente', copy: 'Cada registro sabe si viene de la autorización oficial o de Datos avanzados.' },
        { icon: 'ai-ready', title: 'Tú controlas qué ve la IA', copy: 'Qué datos incluir, cuántos y cuándo. Todo bajo tu control.' },
      ],
    },
    footer: {
      heading: 'Gratis, de código abierto y listo para instalar',
      tagline: 'Un puente local para datos de Amazfit y Zepp.',
      disclaimer: 'ZeppBridge es un proyecto independiente de código abierto, sin afiliación con Zepp Health ni Amazfit.',
      download: 'Descargar',
    },
  },
};

export default pack;
