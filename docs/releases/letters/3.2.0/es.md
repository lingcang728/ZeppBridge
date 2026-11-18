A todos los amigos de ZeppBridge:

Hola, soy Lingcang.

Esta es una actualización importante. Antes de empezar, quiero agradecer a tres colaboradores: felipepmdias, Jax Tsai y andrejd1.

Gracias al trabajo de felipepmdias descifrando los datos de entrenamiento de fuerza de Zepp, esta nueva versión por fin muestra el detalle serie por serie y un mapa muscular del cuerpo, haciendo que la experiencia de entrenamiento de fuerza en ZeppBridge sea realmente útil. Por su parte, Jax Tsai y andrejd1 me ayudaron a mejorar el rendimiento en Linux. Yo no tengo ningún equipo con Linux, así que cada una de estas mejoras fue probada poco a poco en sus propias computadoras. Sin ellos, hay muchas cosas que yo solo simplemente no habría podido lograr. Muchas gracias a ustedes, y gracias también a todos los usuarios de Linux que siguieron enviando comentarios con tanta paciencia.

En estas dos semanas sin publicar una nueva versión, recibí más cartas que nunca. Gracias a todos los que se tomaron el tiempo de escribirme para darme ánimos, alegrarme el día o compartir todo tipo de ideas ingeniosas. Nunca había tenido tantos amigos por correspondencia.

Algunos me comentaron que no encontraban el Buzón, así que añadí un botón de carta en la esquina superior derecha: tócalo para escribir, mantenlo presionado para abrir el Buzón, y cuando haya una nueva respuesta se encenderá un pequeño punto rojo. Si en algún momento notas algo en la aplicación que te resulte incómodo, por favor escríbeme y cuéntamelo sin miedo a molestar. Recibir sus cartas es, en sí mismo, algo que me hace muy feliz.

Ahora me gustaría hablarles de las tres cosas que más me importaron de esta actualización. Ocuparon la mayor parte de mis últimas dos semanas y algunas de ellas las pensé durante mucho tiempo, dudando una y otra vez.

**Sobre los Personal Agent en la nube**

Últimamente he estado probando asistentes personales en la nube como Muse y Hark. Cuanto más los uso, más siento que pueden cambiar nuestra forma de vivir, igual que un Coding Agent está cambiando el desarrollo de software.

Les cuento cómo fueron mis últimas dos semanas.

Conecté ZeppBridge a mi sitio web personal para que Hark pudiera recibir mis datos de salud de forma continua. Cada mañana al levantarme, solo abro Zepp para sincronizar el sueño de la noche anterior; para cuando termino de lavarme los dientes y la cara, Hark ya me resumió la calidad del sueño y mi recuperación, y me sugirió qué entrenar ese día.

Lo mismo pasa de regreso a casa después de correr. Sincronizo los datos y enseguida recibo un análisis de esa carrera larga que acabo de terminar: si la frecuencia cardíaca subió demasiado, si bajé el ritmo en la segunda mitad, si cambió mucho mi cadencia. Y si quiero ajustar más a fondo el plan de entrenamiento, al llegar a la computadora puedo usar «Pasar a la IA» de ZeppBridge y conversarlo con calma con GPT o Claude.

Todo esto ya se podía hacer antes, pero siempre requería acordarme de hacerlo, recopilar los datos por mi cuenta e iniciar la conversación yo mismo. Un Personal Agent se encarga del paso que más fácil se olvida: empezar.

Esa experiencia me convenció de traerlo a los usuarios de ZeppBridge. Al fin y al cabo, si a mí mismo me encanta tanto esta función, ¿por qué no dejar que todos la prueben?

Pero también dudé mucho. Desde el primer día, ZeppBridge se comprometió a mantener el almacenamiento local de datos como base, y permitir que un asistente en la nube lea tus datos de salud de manera continua exige claramente un cuidado especial.

Por eso, esta función viene desactivada por defecto. Mientras no la actives por tu cuenta, ZeppBridge nunca la usará para enviar tus datos a ningún servicio externo, y tu forma habitual de usar la app no cambiará en absoluto.

Incluso si decides activarla, necesitarás tu propio sitio, configurar una clave de acceso que puedas rotar y emparejarlo con tu asistente personal. Puede que no sea para todo el mundo, pero si te animas a probarlo, te lo recomiendo mucho.

Cada vez estoy más convencido de que este tipo de asistentes personales —que se preocupan por ti, te entienden y te echan una mano en el momento justo— formarán parte de nuestra vida cotidiana.

**Llevar el «Organizador visual» a los detalles del entrenamiento**

Este era un tema que me inquietaba desde la versión 3.0.0.

Rediseñé las tarjetas de casi todas las pantallas, pero la página de detalles del entrenamiento seguía esperando su turno. Los usuarios veteranos recordarán que prácticamente conservaba el diseño de la 1.0.0: tarjetas con posición y tamaño fijos, sin libertad para ajustarlas ni combinarlas.

Hasta que estas últimas dos semanas, probando iPadOS 27, abrí por casualidad el Organizador visual y se me encendió la idea.

Para mí, lo más interesante del Organizador visual es que le da a cada ventana un espacio propio. Puedes moverla, cambiar su tamaño y reorganizar cómo se relaciona con las demás. Así que me pregunté: ¿por qué las tarjetas de ZeppBridge no podían tener esa misma libertad?

Siguiendo esa idea, rediseñé por completo la página de detalles del entrenamiento intentando llevarle la forma de interactuar del Organizador visual.

Ahora puedes poner la frecuencia cardíaca, el ritmo y la ruta de carrera lado a lado en la misma pantalla para analizar tu rendimiento punto por punto; también puedes elegir un instante en el gráfico y ver en el mapa dónde estabas en ese momento, entendiendo la relación entre tu rendimiento físico y el entorno. En los entrenamientos de fuerza, incluso puedes juntar el mapa muscular con las series para ver de un vistazo qué grupos musculares trabajó cada serie.

Espero que cada quien pueda organizar los datos que de verdad le importan según su propia costumbre.

En cuanto a qué otras combinaciones divertidas se pueden armar, eso se los dejo para que lo vayan descubriendo poco a poco.

**Pulir la ZeppBridge CLI**

Además de «Pasar a la IA», que ya conocen, ZeppBridge también incluye MCP y una CLI integrados para que las herramientas de IA accedan directamente a tus datos locales, sin tener que descargar ni instalar nada aparte.

Siendo sincero, esta parte antes estaba bastante verde. No fue sino hasta hace poco, cuando recibí la invitación del autor de SparkyFitness, que volví a mirar con atención todo lo que podía ofrecer.

Esta vez hice principalmente dos cosas.

Primero, que la IA pase de «solo mirar» a «ayudarte a anotar».

Ahora puedes pedirle a la IA conectada a ZeppBridge que registre lesiones, carreras, zapatillas y cómo te sentiste en un entrenamiento, o que corrija un tipo de entrenamiento mal reconocido. Por ejemplo, basta con decirle «ayer después de correr me dolía un poco la rodilla izquierda» y lo anotará por ti.

Como dejar que la IA modifique tus propios datos puede generar algo de recelo, todo lo que escriba la IA aparece en Ajustes dentro de «Cambios recientes de la IA» y puedes deshacerlo en cualquier momento. La IA no tiene permiso para borrar datos. Si prefieres que solo lea los datos que tú elijas, también puedes activar «Solo tareas compartidas», que limita el acceso al contenido compartido y desactiva por completo la escritura.

Además, puedes pedirle a la IA que sincronice tus datos o exporte archivos directamente. A las herramientas de conexión con un clic se sumaron OpenCode, Grok Build y Factory. Si hay alguna herramienta que te guste y todavía no sea compatible, escríbeme y cuéntamelo.

Segundo, que ZeppBridge pueda compartir datos con otras aplicaciones autoalojadas.

SparkyFitness es una aplicación de registro de salud de código abierto y autoalojada. Esta colaboración me hizo darme cuenta de que ZeppBridge podía convertirse en un puente entre los datos de Zepp y otras aplicaciones de salud.

Para eso, añadí un modo residente a la CLI. Puedes dejarla corriendo en tu NAS o en un pequeño servidor en casa para que otras aplicaciones lean tus datos de sueño, frecuencia cardíaca, entrenamientos, peso y más.

Este servicio ofrece acceso únicamente de lectura, requiere una clave para conectarse —que puedes revocar en cualquier momento—, por defecto solo acepta conexiones desde el mismo equipo y tampoco expone las rutas de entrenamiento por defecto. Nunca se inicia solo, así que si no lo necesitas, puedes ignorarlo por completo.

El trabajo del lado de ZeppBridge ya está listo, pero la adaptación en SparkyFitness todavía llevará algo de tiempo, así que la integración entre ambos aún no se puede usar directamente. Les pido un poco de paciencia.

Al llegar a este punto de la carta, vuelvo a preguntarme cómo será el futuro de ZeppBridge.

Quizás lo que mejor se me da siga siendo responder a lo que necesitan, resolver esos problemas pequeños pero reales y, de vez en cuando, añadir alguna animación curiosa para que usar el programa sea un poco más entretenido.

Pero ¿podremos ir un poco más lejos y crear cosas que hoy ni siquiera imaginamos?

No lo sé. Al menos por ahora, ya he logrado meter en esta aplicación muchas ideas que antes solo existían en mi cabeza. Lo demás quizá tome algo de tiempo, y también necesitaré seguir escuchando sus historias.

Esto es ZeppBridge 3.2.0.

El invierno no es igual en todas partes del mundo; tal vez cuando leas esta carta ya esté cayendo nieve al otro lado de tu ventana.

Crecí en el sur de China y casi nunca he visto nevar. Una vez vi unas fotos de Aomori, en Japón, tomadas por un fotógrafo: nieve espesa cubriendo las casas y altos muros de nieve a ambos lados del camino. Un invierno así se me hace muy lejano.

Tampoco he visto nunca una chimenea de verdad. A veces imagino que algún día podré sentarme junto a una chimenea cálida, con la nieve cayendo afuera, sus cartas al alcance de la mano, leyéndolas despacio mientras veo a un agente convertir poco a poco en realidad esas cosas con las que antes solo podía soñar.

Quizás esa sea la vida que tanto anhelo.

¡Les deseo mucha salud y un feliz invierno!

— Lingcang
