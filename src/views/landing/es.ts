import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · De tu muñeca a tu computadora, de tu computadora a la IA',
    description: 'ZeppBridge trae tus datos de Amazfit y Zepp desde la nube de Zepp a tu propia computadora y te los deja listos en un archivo para tu IA. Gratis y de código abierto.',
    ogTitle: 'ZeppBridge · De la muñeca al escritorio. Del escritorio a la IA.',
    ogDescription: 'Sincroniza y revisa en local tu frecuencia cardiaca, sueño y entrenamientos, y entrégalos con un clic a la IA que ya usas.',
  },
  copy: {
    nav: {
      home: 'Inicio de ZeppBridge',
      site: 'Navegación del sitio',
      demo: 'Demostración',
      ai: 'Para la IA',
      privacy: 'Privacidad',
      download: 'Descargar',
      github: 'GitHub',
      language: 'Idioma',
      toDark: 'Cambiar a oscuro',
      toLight: 'Cambiar a claro',
    },
    downloads: {
      windows: { label: 'Descargar para Windows', hint: 'Instalador x64', msi: 'MSI para instalaciones gestionadas' },
      macos: { label: 'Descargar para macOS', hint: 'Apple Silicon' },
      linux: {
        label: 'Linux',
        previewBadge: 'Experimental',
        note: 'La CI genera deb, rpm, AppImage y Flatpak, pero nadie ha probado todavía el inicio de sesión y el llavero de principio a fin en un escritorio Linux real. ¿Algún problema? Abre un issue.',
      },
      status: {
        loading: 'Buscando el instalador más reciente',
        ready: 'Haz clic para descargar directo',
        fallback: 'Se abre GitHub Releases, ahí eliges el instalador',
      },
    },
    sample: 'Ejemplo',
    hero: {
      eyebrow: 'Gratis · Código abierto · Tus datos se quedan en tu computadora',
      titleLead: 'Lo que registra tu reloj,',
      titleAccent: 'está en tu computadora.',
      lead: 'ZeppBridge trae desde la nube de Zepp la frecuencia cardiaca, el sueño y los entrenamientos que registra tu Amazfit y los guarda en tu propia computadora como un archivo que puedes leer y llevarte. Cuando quieras preguntarle algo a una IA, eliges el periodo y le entregas un solo archivo.',
      github: 'Ver el código en GitHub',
      meta: 'Gratis · Windows 10 / 11 · macOS (Apple Silicon) · Linux experimental',
      devices: 'Dispositivos Amazfit que ya reconoce',
      stage: {
        hint: 'Haz clic y pruébalo',
        note: 'A la derecha está el ZeppBridge de verdad, con datos de ejemplo.',
        loading: 'Abriendo la app…',
        exit: 'Salir de la demostración',
        unavailable: 'Este navegador no puede abrir la demostración. Descarga la app para verla.',
      },
      starNudge: {
        title: 'Tu descarga comenzó',
        copy: 'Si ZeppBridge te sirve, una estrella en GitHub ayuda a que otras personas con Amazfit lo encuentren.',
        action: 'Dar una estrella',
        dismiss: 'Más tarde',
      },
    },
    beats: [
      {
        kicker: '01 · Sincronizar',
        title: 'Trae a tu computadora lo que registra tu muñeca',
        body: 'Inicia sesión con tu propia cuenta de Zepp y la frecuencia cardiaca, el sueño y los entrenamientos se guardan día a día en una base de datos en este equipo. Se pueden leer, se pueden llevar y siguen ahí sin conexión.',
      },
      {
        kicker: '02 · Sin inventar',
        title: 'Si no se midió, no se midió',
        body: 'Mira la gráfica de la derecha: ayer por la tarde hay un hueco porque el reloj no estaba en la muñeca. ZeppBridge no rellena con 0 ni dibuja una línea inventada. Los días que faltan aparecen como rayitas grises alrededor de cada bloque de datos.',
      },
      {
        kicker: '03 · Para la IA',
        title: '¿Quieres preguntarle algo a una IA? Elige primero qué verá',
        body: 'Lo que está dentro del círculo se entrega y lo de fuera no, y las rayitas alrededor de cada nodo muestran en qué días hay datos. Pulsa el botón de enviar y el .md ya empaquetado queda listo para arrastrarlo a la conversación.',
      },
      {
        kicker: '04 · Plan',
        title: 'Un plan de entrenamiento de la IA que llega al reloj solo después de que lo revises',
        body: 'Pega de vuelta la respuesta completa de la IA: ves día por día qué cambia, con el rango de frecuencia cardiaca de cada paso dibujado en una gráfica. Las formas de escribir que aún no se han verificado en tu reloj quedan marcadas. Solo después de que lo confirmes se envía a Zepp, y puedes deshacerlo cuando quieras.',
      },
      {
        kicker: '05 · Tú decides',
        title: 'Están los ajustes que necesitas y nada más',
        body: 'Los ajustes son una pila de tarjetas: abre una y arrastra su encabezado hacia un lado para pasar a la siguiente. Cuánto se guardan los datos, cada cuánto se sincroniza y si la interfaz local está activada lo decides tú.',
      },
    ],
    flap: {
      tiles: [
        { value: '1096', label: 'noches de sueño' },
        { value: '742', label: 'entrenamientos con ruta' },
        { value: '1,5M', label: 'minutos de frecuencia cardiaca' },
        { value: '9,8M', label: 'pasos' },
      ],
    },
    handoff: {
      chat: 'Chat con la IA',
      you: 'Tú',
      file: 'ZeppBridge últimos 14 días.md',
      prompt: '¿Dormí peor esta semana que la anterior? ¿Qué podría explicarlo?',
      answer: 'Un poco peor: 38 minutos menos en promedio, sobre todo de sueño profundo. El martes y el jueves entrenaste de noche, y esas noches tu pulso tardó más en bajar. Prueba una semana entrenando por la tarde.',
      note: 'Sin IA integrada y sin otra cuenta. Qué se envía, cuánto y cuándo solo pasa cuando tú haces clic.',
      close: 'Cerrar',
    },
    privacy: {
      heading: 'Tus datos de salud viven en dos lugares',
      lead: 'La nube de Zepp y tu propia computadora. No hay un tercero.',
      nodes: { watch: 'Reloj', cloud: 'Nube de Zepp', computer: 'Tu computadora', server: 'Servidor de ZeppBridge', none: 'no existe' },
      points: [
        {
          title: 'Tokens en la bóveda del sistema',
          copy: 'Se guardan en el Administrador de credenciales de Windows o en el Llavero de macOS, nunca en la carpeta de datos.',
        },
        { title: 'Sin telemetría', copy: 'No medimos cómo la usas ni recopilamos datos de salud.' },
        {
          title: 'Origen claro',
          copy: 'Cada registro sabe si vino de la autorización oficial o de los datos avanzados.',
        },
      ],
    },
    connect: {
      heading: 'Tres formas de conectarte. Elige la más cómoda.',
      lead: 'Empieza con la autorización oficial. Agrega datos avanzados cuando quieras más métricas.',
      recommended: 'Recomendado',
      paths: [
        {
          title: 'Autorización oficial de Zepp',
          copy: 'Inicia sesión en Zepp desde tu navegador de siempre y acepta.',
          detail: 'Funcionan cuentas de Google, Xiaomi y Apple. Se sincronizan sueño, frecuencia cardiaca, pasos, entrenamientos, PAI y peso.',
        },
        {
          title: 'Datos avanzados',
          copy: 'Agrega HRV, oxígeno en sangre, estrés y disposición, que la API oficial no ofrece.',
          detail: 'Inicias sesión con correo o teléfono. El token solo vive en la bóveda de tu sistema.',
        },
        {
          title: 'Entrada manual',
          copy: 'El respaldo cuando las otras dos no funcionan.',
          detail: 'Pegas tú un token. Pensado para quien conoce la API.',
        },
      ],
      note: 'Lo que se sincroniza depende de lo que tu cuenta guarda en la nube de Zepp. Las métricas que ves dependen de tu dispositivo y de cómo te conectas.',
    },
    final: {
      heading: 'Instálalo y mira lo que tu reloj recuerda',
      lead: 'Gratis, de código abierto, sin registro.',
      facts: {
        channel: 'Canal estable, instaladores desde GitHub Releases',
        systems: 'Windows 10 / 11 (x64) y macOS (Apple Silicon). Linux es experimental.',
        ai: 'No necesitas otra cuenta. Para preguntar a una IA usas la que ya tienes.',
        windows: 'Windows: el instalador aún no está firmado. Si ves "Editor desconocido", elige "Más información" y luego "Ejecutar de todas formas".',
        macos: 'macOS: una compilación sin firmar, así que el primer arranque se bloquea. Los pasos para permitirlo están en el readme de GitHub.',
      },
    },
    footer: {
      tagline: 'Un puente local para los datos de Amazfit y Zepp.',
      disclaimer: 'ZeppBridge es un proyecto independiente de código abierto, sin relación con Zepp Health ni con Amazfit.',
      source: 'Código fuente',
    },
  },
};

export default pack;
