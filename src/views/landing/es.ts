import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  "meta": {
    "title": "ZeppBridge · Tu reloj registra. Tu propio archivo.",
    "description": "Archiva localmente los datos de Amazfit y Zepp. Explora el ejemplo sintético v3 o descarga la versión pública estable. Gratis y de código abierto.",
    "ogTitle": "ZeppBridge · Tu reloj registra. Tu propio archivo.",
    "ogDescription": "Archiva localmente los datos de Amazfit y Zepp. Explora el ejemplo sintético v3 o descarga la versión pública estable. Gratis y de código abierto."
  },
  "copy": {
    "nav": {
      "home": "Inicio de ZeppBridge",
      "site": "Navegación del sitio",
      "demo": "Demostración",
      "ai": "Para la IA",
      "privacy": "Privacidad",
      "download": "Descargar versión pública",
      "github": "GitHub",
      "language": "Idioma",
      "toDark": "Cambiar a oscuro",
      "toLight": "Cambiar a claro",
      "connect": "Conectar",
      "faq": "Preguntas frecuentes"
    },
    "downloads": {
      "windows": {
        "label": "Descargar para Windows",
        "hint": "Instalador x64",
        "msi": "MSI para instalaciones gestionadas"
      },
      "macos": {
        "label": "Descargar para macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Experimental",
        "note": "La CI genera deb, rpm, AppImage y Flatpak, pero nadie ha probado todavía el inicio de sesión y el llavero de principio a fin en un escritorio Linux real. ¿Algún problema? Abre un issue."
      },
      "status": {
        "loading": "Buscando el instalador más reciente",
        "ready": "Haz clic para descargar directo",
        "fallback": "Se abre GitHub Releases, ahí eliges el instalador"
      }
    },
    "sample": "Ejemplo",
    "hero": {
      "eyebrow": "Gratis · Código abierto · Archivo local de salud",
      "titleLead": "Tus datos de salud.",
      "titleAccent": "En tu propio ordenador.",
      "lead": "Guarda en tu computadora la frecuencia cardiaca, el sueño y los entrenamientos de Amazfit desde la nube de Zepp. Revisa tu historial, conserva los huecos y exporta lo que elijas.",
      "github": "Ver el código en GitHub",
      "meta": "Gratis · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Dispositivos Amazfit; las métricas varían según el modelo",
      "stage": {
        "hint": "Abrir el ejemplo",
        "note": "La aplicación real con datos sintéticos, sin conectar tu cuenta.",
        "loading": "Abriendo la app…",
        "exit": "Salir de la demostración",
        "unavailable": "La demostración no está disponible. Puedes leer las secciones o consultar el código."
      },
      "demo": "Ver el ejemplo",
      "edition": "v3 en desarrollo · Datos sintéticos. La descarga ofrece la versión pública estable; su interfaz y funciones pueden ser distintas."
    },
    "handoff": {
      "chat": "Chat con la IA",
      "you": "Tú",
      "file": "ZeppBridge últimos 14 días.md",
      "prompt": "Organiza este ejemplo sintético. Enumera fuentes, fechas y campos ausentes sin emitir juicios de salud.",
      "answer": "El archivo ordena sueño y entrenamientos por fecha. Los periodos sin medición permanecen vacíos. Antes de comparar, verifica fuentes y cobertura; los registros no explican las causas de un cambio.",
      "note": "Conversación sintética. Esta página no envía archivos ni conecta con una IA. En el uso real, tú decides si entregas contenido a un servicio externo.",
      "close": "Cerrar"
    },
    "privacy": {
      "kicker": "Datos y privacidad",
      "heading": "Tu archivo es local. Sus rutas, claras.",
      "lead": "La sincronización lee registros de Zepp y los guarda en tu computadora. La IA externa es otra ruta que eliges expresamente.",
      "nodes": {
        "watch": "Reloj y app Zepp",
        "cloud": "Nube de Zepp",
        "computer": "Archivo local de salud",
        "export": "La IA externa que elijas"
      },
      "flowNote": "El reloj sube los datos mediante la app móvil Zepp. El sitio web no almacena tu archivo de salud.",
      "exportNote": "Exportación opcional · Revisa y envía tú",
      "services": {
        "title": "Servicios web con funciones limitadas",
        "copy": "La autorización oficial y la renovación de tokens usan servicios web. Las actualizaciones consultan las versiones. Los informes de problemas envían diagnósticos limitados tras tu confirmación, sin lecturas de salud."
      },
      "docs": "Ver los límites de datos",
      "points": [
        {
          "title": "Credenciales en el sistema",
          "copy": "Por defecto se usa la bóveda del sistema. Algunas plataformas permiten elegir un archivo con otra protección."
        },
        {
          "title": "Local no significa cifrado",
          "copy": "La base de salud no está cifrada por defecto. Usa cuentas de sistema separadas y protege las copias."
        },
        {
          "title": "Tú inicias la exportación",
          "copy": "Los paquetes de IA se preparan y anonimizan localmente. Al enviarlos rigen las reglas del destinatario. Exportaciones y copias completas contienen información distinta."
        }
      ]
    },
    "connect": {
      "kicker": "Conecta tus registros",
      "heading": "Empieza por la autorización oficial",
      "lead": "Una ruta habitual. Las alternativas avanzadas añaden otros campos.",
      "recommended": "Inicio recomendado",
      "advanced": "Alternativas avanzadas",
      "edition": "Estas son las rutas de la v3 actual. Consulta las notas de la versión pública estable para conocer sus entradas y funciones.",
      "docs": "Guía de conexión",
      "paths": [
        {
          "title": "Autorización oficial de Zepp",
          "copy": "Abre la página de autorización de Zepp en tu navegador y usa tu acceso habitual.",
          "detail": "Lee sueño, frecuencia cardiaca, pasos, entrenamientos, PAI y peso disponibles en tu cuenta."
        },
        {
          "title": "Conexión de datos avanzados",
          "copy": "Añádela para HRV, oxígeno en sangre, estrés o disposición.",
          "detail": "Acceso por correo o teléfono. Los campos son distintos y no todos los dispositivos los miden o devuelven."
        },
        {
          "title": "Credenciales manuales",
          "copy": "Para quien conoce la API y obtuvo credenciales por una vía legítima bajo su control.",
          "detail": "Introduce token, ID de usuario y dirección regional. Nunca importes tokens de origen desconocido ni los publiques."
        }
      ],
      "note": "Los campos dependen del dispositivo, los registros en la nube y la conexión. Una respuesta vacía no demuestra falta de compatibilidad. Son alternativas, no tres pasos obligatorios."
    },
    "final": {
      "kicker": "Descarga · Versión pública estable",
      "heading": "Guarda una copia en tu computadora",
      "lead": "Gratis y de código abierto. Usa tu cuenta de Zepp; no necesitas otra de ZeppBridge.",
      "docs": "Instalación y notas de versión",
      "facts": {
        "channel": "La descarga es la versión pública estable. El ejemplo sintético es v3 en desarrollo; interfaz y funciones pueden variar.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Consultar y exportar no exige IA. El servicio externo y su cuenta los eliges tú.",
        "windows": "Windows: los instaladores aún no tienen firma de confianza. Puede aparecer un aviso de editor desconocido o SmartScreen. Verifica la fuente oficial.",
        "macos": "macOS: versiones sin firma ni notarización. El primer inicio puede bloquearse; sigue las instrucciones del proyecto."
      }
    },
    "footer": {
      "tagline": "Un puente local para los datos de Amazfit y Zepp.",
      "disclaimer": "ZeppBridge es un proyecto independiente de código abierto que participa en el programa Zepp Developer Partner, no un producto oficial de Zepp. Las marcas Zepp y Amazfit pertenecen a sus titulares.",
      "source": "Código fuente"
    },
    "faq": {
      "heading": "Antes de empezar",
      "lead": "Seis preguntas habituales. Los detalles y diferencias de versión están en la documentación.",
      "docs": "Documentación del proyecto",
      "items": [
        {
          "question": "¿Qué cuentas necesito?",
          "answer": "La sincronización requiere tu cuenta de Zepp y la app móvil Zepp. No hay cuenta adicional de ZeppBridge. El ejemplo no requiere acceso."
        },
        {
          "question": "¿Mi dispositivo y métricas son compatibles?",
          "answer": "Los campos dependen de lo medido, lo conservado en Zepp y la conexión. No se garantiza que cada modelo ofrezca todas las métricas."
        },
        {
          "question": "¿Puedo usarlo sin conexión?",
          "answer": "Puedes consultar y exportar registros guardados. Iniciar sesión, sincronizar y buscar actualizaciones requiere red. El reloj sigue usando la app Zepp."
        },
        {
          "question": "¿Un hueco significa cero?",
          "answer": "No. Sin muestra, sin sincronizar y sin decodificar son estados distintos. Nunca se completan con cero, una lectura anterior o una estimación."
        },
        {
          "question": "¿Tengo que usar una IA?",
          "answer": "No. La exportación se prepara localmente. La IA recibe contenido solo cuando lo pegas o subes. Revisa alcance, anonimización y privacidad."
        },
        {
          "question": "¿La descarga coincide con el ejemplo?",
          "answer": "El ejemplo muestra v3 en desarrollo con datos sintéticos. La descarga es estable. La revisión de planes y la nueva interfaz podrían no estar publicadas; consulta las notas."
        }
      ]
    },
    "rebuild": {
      "featuresHeading": "Tu tiempo, en los registros que conservas.",
      "featuresLead": "Sueño, frecuencia cardiaca, deporte y planes. Descubre tu archivo paso a paso.",
      "demoHeading": "Pruébalo antes de descargarlo",
      "demoLead": "La interfaz V3 real con ejemplos sintéticos. Sin iniciar sesión ni acceder a tus datos personales.",
      "mobileHint": "Es una aplicación de escritorio. En el móvil puedes verla a pantalla completa; usa un ordenador para interactuar.",
      "fullscreen": "Ver la demo de escritorio a pantalla completa",
      "retry": "Volver a cargar la demo",
      "play": "Reproducir demo",
      "pause": "Pausar demo",
      "mediaNote": "V3 · Ejemplo sintético · Grabado en modo oscuro",
      "moreConnections": "Más formas de conectar",
      "partner": "Programa Zepp Developer Partner",
      "disclaimer": "ZeppBridge es un proyecto independiente de código abierto que participa en el programa Zepp Developer Partner, no un producto oficial de Zepp. Las marcas Zepp y Amazfit pertenecen a sus titulares.",
      "docsHeading": "Empieza aquí.",
      "guide": "Instalación y guía",
      "versions": "Versiones y novedades",
      "community": "Código y comunidad",
      "privacyDoc": "Datos y privacidad",
      "star": "¿Te resulta útil? Una estrella en GitHub ayuda a que otros lo descubran.",
      "dismiss": "Cerrar",
      "nav": [
        "Funciones",
        "Datos y privacidad",
        "Probar",
        "Guía"
      ],
      "title": [
        "Tus datos de salud.",
        "En tu propio ordenador."
      ],
      "stories": [
        {
          "eyebrow": "Archivo local",
          "title": "Una copia local de tus registros",
          "body": "Conecta tu cuenta de Zepp y guarda los registros disponibles en la nube. Los datos sincronizados se pueden consultar sin conexión.",
          "bullets": [
            "Datos sincronizados sin conexión",
            "Consulta fuentes y cobertura"
          ]
        },
        {
          "eyebrow": "Historial del sueño",
          "title": "Un lugar para cada noche",
          "body": "Revisa la duración y las fases de cada noche. Las noches sin medición siguen ausentes; estos datos no sustituyen un diagnóstico médico.",
          "bullets": [
            "Historial nocturno y fases",
            "No se rellenan noches ausentes"
          ]
        },
        {
          "eyebrow": "Pulso y lagunas",
          "title": "Sin medición, sin valor",
          "body": "Nunca se rellenan muestras ausentes con cero, un valor anterior o una estimación. No sincronizado y no medido son estados distintos.",
          "bullets": [
            "Se conservan lagunas en las curvas",
            "No se inventan valores ni ceros"
          ]
        },
        {
          "eyebrow": "Deporte y entrenamiento",
          "title": "Conserva el recorrido de tus entrenamientos",
          "body": "Consulta actividades, detalles y tendencias. Las métricas dependen del dispositivo y los datos sincronizados; comprueba la cobertura antes de comparar.",
          "bullets": [
            "Detalles y tendencias deportivas",
            "Usa los registros disponibles"
          ]
        },
        {
          "eyebrow": "Entrega a la IA",
          "title": "Elige el alcance y el destinatario",
          "body": "En el ejemplo v3 eliges datos y fechas y revisas la exportación. Se prepara localmente; una IA externa solo recibe el contenido cuando tú lo envías.",
          "bullets": [
            "Elige fechas y datos",
            "Revisa antes de enviar tú mismo"
          ]
        },
        {
          "eyebrow": "Revisión de planes",
          "title": "Revisa antes de continuar",
          "body": "La v3 en desarrollo muestra la importación y revisión de planes. Enviarlos al reloj depende del dispositivo y de su validación; no es una promesa general de la versión estable.",
          "bullets": [
            "Vista semanal y revisión diaria",
            "Envío según dispositivo y validación"
          ]
        },
        {
          "eyebrow": "Ajustes",
          "title": "Decide el ritmo de tu archivo",
          "body": "Explora sincronización, conservación e interfaces locales. Los controles pueden variar entre versiones; comprueba su finalidad antes de activarlos.",
          "bullets": [
            "Sincronización y conservación",
            "Tú activas las interfaces locales"
          ]
        }
      ],
      "learnFeatures": "Ver funciones",
      "languageFallback": "No se pudo cargar el idioma. Se muestra inglés; selecciona el idioma otra vez."
    }
  }
};

export default pack;
