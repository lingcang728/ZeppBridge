/** Spanish P4 copy. Same shape as zh in ../p4Copy.ts; only the strings differ. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Diseño', title: 'Amor a primera vista.', lead: 'Navegación de cristal, tarjetas que se transforman en páginas y días que barajas como cartas.', points: [
      { id: 'glass', title: 'Cristal', text: 'Presiona y desliza despacio por la barra de navegación; toca para cambiar. Los bordes refractan la luz con tu dedo.', scene: 'glass' },
      { id: 'morph', title: 'Transformación', text: 'Una tarjeta se despliega en una página entera y vuelve a su sitio al salir. Lo esencial al frente, todo lo demás se retira.', scene: 'morph' },
      { id: 'poker', title: 'Baraja', text: 'Pasa de un día a otro, despliega semanas o meses completos. Guarda los mejores momentos en la caja de recuerdos.', scene: 'poker' },
      { id: 'theme', title: 'Día y noche', text: 'Temas claro y oscuro. Un toque y la noche cae sobre la pantalla.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Conexión', title: 'Tus registros de la nube, de vuelta en tu escritorio.', lead: 'Conecta tu cuenta de Zepp y sincroniza tus datos con este ordenador. Elige la frecuencia y deja que la sincronización automática se encargue.', points: [
      { id: 'account', title: 'Inicio oficial', text: 'Inicia sesión en Zepp desde el navegador del sistema, así también funcionan las cuentas que entran con Google, Apple, Xiaomi o Facebook. Comprueba el estado de autorización cuando quieras.', scene: 'account' },
      { id: 'sync', title: 'Sincronización automática', text: 'Desactivado, 15, 30 o 60 minutos. Tú descansas; el sistema sincroniza.', scene: 'sync' },
      { id: 'devices', title: 'Reconoce tu reloj', text: 'Identifica tu modelo de forma automática. Y si se equivoca, señálalo tú mismo.', scene: 'devices' },
      { id: 'local', title: 'Solo en tu equipo', text: 'Los registros de salud sincronizados desde Zepp se guardan en tu equipo y jamás pasan por nuestros servidores. Tú decides qué compartes con la IA.', scene: 'local' },
    ] },
    { id: 'records', name: 'Claridad', title: 'Decenas de métricas, de un solo vistazo.', lead: 'Todas las tendencias en una sola pantalla para conocer tu estado físico al instante. Abre cualquier métrica para ver el historial completo.', points: [
      { id: 'overview', title: 'A tu gusto', text: 'Sueño o entrenamientos primero: la pantalla principal se ordena según tus prioridades. Explora y abre el detalle.', scene: 'overview' },
      { id: 'normal', title: 'Tu rango habitual', text: 'La línea bajo cada métrica es tu propio rango habitual, no el de otros. Pulsa «?» para ver de dónde sale.', scene: 'normal' },
      { id: 'workouts', title: 'Cada carrera tiene su eco', text: 'Compara cada sesión con entrenamientos previos de distancia similar y analiza pulso, ritmo y recorrido.', scene: 'workouts' },
      { id: 'gaps', title: 'Sin datos inventados', text: 'Si no se registró, se deja en blanco. Sin ceros falsos, valores repetidos ni estimaciones inventadas.', scene: 'gaps' },
    ] },
    { id: 'journal', name: 'Archivo', title: 'Cada entrenamiento cuenta.', lead: 'Anillos de crecimiento, tu historial, cómo te sentiste en cada sesión y las cartas del autor, todo guardado en este equipo.', points: [
      { id: 'rings', title: 'Anillos', text: 'Un anillo por año. Las semanas en que entrenaste más crecen más anchas.', scene: 'rings' },
      { id: 'journal', title: 'Historial', text: 'Mejores marcas, cuenta atrás para tus carreras y un muro de medallas. Las zapatillas te avisan cuando llegan a su kilometraje.', scene: 'journal' },
      { id: 'feel', title: 'Después de entrenar', text: 'Puntúa la sesión, marca dónde te duele y anota qué zapatillas llevabas.', scene: 'feel' },
      { id: 'import', title: 'Importar y ordenar', text: 'Importa archivos GPX, FIT y exportaciones de Strava. Selecciona varias sesiones para cambiar su tipo u ocultarlas de una vez.', scene: 'import' },
      { id: 'letters', title: 'Buzón', text: 'Una carta del autor con cada versión. Si respondes, el autor la lee y te contesta. Y cada semana, una carta sobre tus datos.', scene: 'letters' },
    ] },
    { id: 'ai', name: 'Enviar a la IA', title: 'Aprovecha tus suscripciones actuales. Sin coste adicional.', lead: 'Elige las fechas y tus registros se empaquetan en un único archivo. Compártelo con tu IA habitual, continúa la conversación y trae de vuelta el borrador.', points: [
      { id: 'providers', title: 'Siete modelos a elegir', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao y Grok. Usa tus cuentas y cuotas habituales.', scene: 'ai' },
      { id: 'prompt', title: 'Pregunta lo que quieras', text: 'Modifica la pregunta predefinida o escribe la tuya desde cero.', scene: 'prompt' },
      { id: 'events', title: 'El contexto importa', text: 'Apunta un resfriado, un viaje o una semana de trabajo intenso para que la IA comprenda mejor los altibajos.', scene: 'events' },
      { id: 'autopaste', title: 'Automático · Windows', text: 'Pega y envía por ti revisando la ventana en cada paso. Desactivado por defecto.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Plan de entrenamiento', title: 'Afina en el ordenador. Entrena en tu muñeca.', lead: 'Cuéntale a la IA cómo te sientes y organizará tu semana. Pégalo de vuelta, ajústalo a tu gusto y envíalo directo a tu reloj.', points: [
      { id: 'receive', title: 'Pega en un clic', text: 'De la conversación al borrador: copia y tendrás tu plan semanal listo.', scene: 'receive' },
      { id: 'edit', title: 'Tú mandas', text: 'Arrastra para intercambiar dos días, abre cada jornada y ajusta duración e intensidad paso a paso. Mantén pulsado para enviarlo al reloj.', scene: 'plan-edit' },
      { id: 'templates', title: 'Plantillas e importación', text: 'Guarda como plantilla para entrenar de nuevo. Compatible con archivos .zwo y entrenamientos .fit.', scene: 'templates' },
      { id: 'easy', title: 'Cansancio hoy', text: 'Si tocaban series pero tu descanso fue bajo, cambia a un rodaje suave con un toque. Tú confirmas antes de enviar.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sueño', text: 'Desde las fases de una noche hasta la evolución de los últimos siete días. Abre y explora.' },
    workouts: { title: 'Entrenamientos', text: 'Descubre la sesión al completo y compárala con las anteriores.' },
  },
  settings: {
    title: 'Ajustes',
    lead: 'Explora las tarjetas grandes una a una; las pequeñas se apilan como un tarjetero. Cuenta, sincronización, visualización y datos al alcance de un toque.',
    summaryTitle: 'Los detalles viven en Ajustes.',
    summaryLead: 'Quince ajustes esenciales, reunidos en una sola baraja.',
    items: [
      { id: 'sync', title: 'Sincronización automática', text: 'Desactivado, 15, 30 o 60 minutos. Elige el tuyo.', icon: 'auto-sync' },
      { id: 'retention', title: 'Diez años, aquí', text: 'Trae hasta diez años de historial a este equipo y consérvalo. No se pierde con la ventana de la nube.', icon: 'database' },
      { id: 'data', title: 'Cobertura de datos', text: 'Lo que se puede sincronizar y lo que no, con total transparencia.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Herramientas locales como Claude Code y Codex consultan directamente. Enviar planes requiere tu visto bueno.', icon: 'structured-data' },
      { id: 'formats', title: 'Cuatro formatos', text: 'JSON · CSV · GPX, además de FIT en la página de entrenamientos.', icon: 'document' },
      { id: 'units', title: 'Unidades', text: 'Kilómetros o millas. Distancia y ritmo cambian juntos.', icon: 'settings' },
      { id: 'time', title: 'Hora', text: 'Según tu región, o formato de 12 o 24 horas.', icon: 'auto-sync' },
      { id: 'date', title: 'Formato de fecha', text: 'Día, mes y año según tus costumbres.', icon: 'document' },
      { id: 'scale', title: 'Escala de la interfaz', text: 'Amplía o reduce la ventana a tu gusto.', icon: 'overview' },
      { id: 'backup', title: 'Instantáneas y restauración', text: 'Guarda copias de la base de datos y restaura cuando lo necesites.', icon: 'database' },
      { id: 'api', title: 'API local', text: 'Vinculada a 127.0.0.1. Solo lectura, protegida por token.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacidad y seguridad', text: 'Credenciales custodiadas por el sistema. Los tokens nunca se escriben en logs.', icon: 'browser-login' },
      { id: 'filename', title: 'Nombres de archivo', text: 'Tú decides cómo se nombran los archivos preparados para la IA.', icon: 'document' },
      { id: 'folder', title: 'Llévatelo', text: 'Tus datos están en una carpeta de este equipo, y todo lo que escribiste aquí —valoraciones, planes, tareas de IA— se exporta en un solo JSON.', icon: 'database' },
      { id: 'language', title: 'Trece idiomas', text: 'Chino simplificado y tradicional, inglés, español y más. Cámbialo cuando quieras.', icon: 'profile' },
    ],
  },
  nav: [
    { label: 'Conoce ZeppBridge', links: [{ id: 'motion', label: 'Diseño' }, { id: 'connection', label: 'Conexión' }, { id: 'records', label: 'Claridad' }, { id: 'journal', label: 'Archivo' }] },
    { label: 'De los datos a la acción', links: [{ id: 'ai', label: 'Enviar a la IA' }, { id: 'ai-plan', label: 'Plan de entrenamiento' }, { id: 'record-sleep', label: 'Sueño y entrenamientos' }] },
    { label: 'A tu manera', links: [{ id: 'connect', label: 'Ajustes' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'API local' }] },
  ],
  demoPrompt: 'El próximo miércoles no puedo. Deja una sesión de series y el resto rodajes suaves.',
};

export default pack;
