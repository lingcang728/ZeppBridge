<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="ZeppBridge">
  <h1>ZeppBridge</h1>
  <p><strong>Tus datos de Zepp, de vuelta en tus manos.</strong></p>
  <p>Consulta, archiva y exporta tus registros de salud de Amazfit en tu propio equipo con Windows, macOS o Linux.</p>

  [![CI](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/lingcang728/ZeppBridge/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/github/license/lingcang728/ZeppBridge?color=69b48b)](LICENSE)
  [![Windows](https://img.shields.io/badge/Windows-supported-0078D4?logo=windows11&logoColor=white)](#descargar-e-instalar)
  [![macOS](https://img.shields.io/badge/macOS_Apple_Silicon-community_tested-999999?logo=apple&logoColor=white)](#descargar-e-instalar)
  [![Linux](https://img.shields.io/badge/Linux-builds_only-E95420?logo=linux&logoColor=white)](docs/guides/linux.md)
  [![Version](https://img.shields.io/github/v/release/lingcang728/ZeppBridge?color=8FB348&label=version)](https://github.com/lingcang728/ZeppBridge/releases)

  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>Español</strong> · <a href="README.nl.md">Nederlands</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.pt-PT.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.ru.md">Русский</a> · <a href="README.hi-IN.md">हिन्दी</a> · <a href="README.fr.md">Français</a></p>
</div>

> [!IMPORTANT]
> ZeppBridge es un proyecto independiente, no oficial y de código abierto. No está afiliado a Zepp Health, Huami ni Amazfit, y ninguna de ellas lo respalda. Úsalo solo con cuentas y datos a los que tengas derecho de acceso.

> La app está disponible en diez idiomas; en el primer arranque sigue el idioma del sistema y en Ajustes hay un selector. Esta página es una traducción de la [versión original en inglés](README.md); en caso de discrepancia, prevalece la versión inglesa. Las guías detalladas enlazadas más abajo solo están disponibles en inglés y chino por ahora.

## ¿Esto no está ya en la app de Zepp?

Sí — pero solo en tu teléfono, solo de la forma en que la app oficial decide mostrarlo, y vive en el servidor de otra persona. ZeppBridge resuelve algunas cosas concretas:

- **Verlo en una pantalla de verdad.** Tendencias a largo plazo de frecuencia cardíaca, sueño, entrenamientos, recuperación, estrés y SpO₂, a 7 días / 1 mes / 6 meses.
- **Los datos quedan en tu propio equipo.** Todo termina en un solo archivo en tu máquina. Sigue funcionando sin conexión, al cambiar de teléfono, si borras la cuenta o si la app cambia de diseño.
- **Puedes recuperar el historial previo a instalarla.** Mes a mes, con pausa y reanudación, y honesta sobre qué meses la nube realmente no tenía nada y cuáles simplemente aún no se han descargado.
- **Copias de seguridad que de verdad restauran.** Instantáneas de toda la base de datos con sumas de verificación y comprobaciones de integridad, y una comparación del número de registros antes de restaurar.
- **Exporta cuando quieras.** JSON, CSV y GPX — listos para Excel, Strava o tus propios scripts.
- **Pásalo a una IA en un solo paso.** Elige un rango de fechas y tipos de datos; la app lo empaqueta en un formato legible por modelos, elimina los datos identificativos y lo copia al portapapeles.
- **Funciona sin abrir una ventana.** Incluye una CLI no interactiva (programable con el Programador de tareas o cron) y un servidor MCP de solo lectura, para que un modelo consulte tus datos locales sin que salgan de tu equipo.

Una cosa que conviene decir claramente: **no va a embellecer tus datos.**

Si ese día no llevabas el reloj, el gráfico tiene un hueco. Si tu reloj nunca midió algo, la interfaz dice «Sin datos» — nunca `0`. Sin rastro GPS no hay mapa. En datos de salud, una curva suave inventada es peor que un hueco honesto.

Lo mismo ocurre con la palabra «completa»: la interfaz solo declara una **copia local completa** cuando el registro de cobertura muestra que todos los bloques mensuales han llegado a una conclusión. Hasta entonces dice «una copia local del rango que se sincronizó correctamente».

## Qué dispositivos son compatibles

**Si tu dispositivo se sincroniza con la app de Zepp, vale la pena probarlo.** ZeppBridge lee lo que tu cuenta guarda en la nube; no habla con el reloj, así que no depende de modelos concretos.

El catálogo incluido reconoce 52 productos Amazfit de las familias **GTR, GTS, T-Rex, Balance, Active, Bip, Cheetah, Falcon, Helio y Band** (relojes, correas, pulseras y anillos). Los dispositivos reconocidos muestran el nombre de modelo correcto y su imagen de producto; los no reconocidos se sincronizan igual — solo muestran un nombre genérico, y puedes identificar el tuyo a mano.

Qué métricas obtienes de verdad depende de lo que mide tu reloj. Tras conectar, la página de ajustes lo lista para tu cuenta, punto por punto.

## Descargar e instalar

Descarga la compilación más reciente desde [Releases](https://github.com/lingcang728/ZeppBridge/releases).

**Windows**

1. Descarga `ZeppBridge_<version>_x64-setup.exe` (o `.msi`) y ejecútalo.
2. Todavía no hay certificado de firma de código, así que Windows puede advertir sobre un editor desconocido. Elige **Más información → Ejecutar de todos modos**.
3. Las versiones posteriores se instalan encima; tus datos no se tocan.

**macOS (Apple Silicon)**

> **Esta compilación no está firmada.** No hay certificado de Apple Developer ID
> ni notarización, así que macOS se negará a abrirla hasta que quites tú mismo
> la marca de cuarentena. Los pasos siguientes son un rodeo deliberado, no una
> solución — consulta [#2](https://github.com/lingcang728/ZeppBridge/issues/2).

1. Descarga `ZeppBridge_<version>_aarch64.dmg` y arrastra `ZeppBridge.app` a Aplicaciones.
2. El primer arranque fallará. Qué mensaje aparece depende de tu versión de macOS:
   - **«desarrollador no identificado»** → **clic derecho en la app → Abrir → Abrir.**
   - **«ZeppBridge está dañado y no se puede abrir»** → el clic derecho *no*
     ayuda. Ejecuta esto en Terminal y luego abre la app con normalidad:

     ```bash
     xattr -dr com.apple.quarantine /Applications/ZeppBridge.app
     ```

   La app no está dañada de verdad. Ese mensaje es lo que Gatekeeper dice de
   cualquier paquete descargado que no esté notarizado. Solo ejecuta un comando
   así con software en el que hayas decidido confiar — de este puedes leer cada
   línea en GitHub y compilarlo tú mismo.
3. Las compilaciones de macOS están cubiertas por CI (compilación, clippy,
   pruebas) y una prueba de humo de un colaborador en Apple Silicon. El
   mantenedor no tiene Mac y no puede verificar por sí mismo la sincronización
   ni el llavero. Si eso te importa, quédate con Windows.

Por qué sigue así por ahora: la notarización en sí no necesita un Mac — CI ya
corre en runners de macOS y podría firmar y notarizar allí. Lo que falta es una
membresía del Apple Developer Program (99 USD/año), que el proyecto no ha
comprado. Si eso cambia, esta sección desaparece.

**Linux (x86_64)**

> **Compila, pero nadie lo ha ejecutado todavía.** CI lo compila, corre las
> pruebas y construye los paquetes en cada push. Lo que *no* ha ocurrido es un
> ciclo completo de inicio de sesión y sincronización en un escritorio Linux
> real — incluido si el token llega correctamente a tu llavero. Trátalo como
> una compilación que ayudas a probar, no como una versión publicada.

En la página de releases se publican Flatpak, `.deb`, `.rpm` y un AppImage.
Nada está firmado; verifica las descargas contra `SHA256SUMS.txt`.

```bash
sudo apt install ./ZeppBridge_<version>_amd64.deb      # Debian, Ubuntu
sudo dnf install ./ZeppBridge_<version>_x86_64.rpm     # Fedora, RHEL
flatpak install ./ZeppBridge_<version>_x86_64.flatpak  # cualquier distro
```

La [guía de Linux](docs/guides/linux.md) (en inglés) explica a dónde van los
datos, cómo se guarda el token cuando no hay llavero, y cómo compilar desde el
código fuente.

También hay una [imagen de contenedor sin interfaz](docs/guides/docker.md)
(en inglés) con solo la CLI y el servidor MCP, para mantener una biblioteca
sincronizada en un NAS o un servidor. No puede iniciar sesión — eso sigue
necesitando la app de escritorio una vez.

**No compatible**: Macs con Intel, móviles.

### Qué está verificado en cada plataforma

La misma app, la misma interfaz, las mismas funciones en las tres — lo que
cambia es cuánto de ello ha comprobado alguien de verdad. Preguntar aquí es
mejor que adivinar.

| | Windows 10/11 (x64) | macOS Apple Silicon | Linux x86_64 |
| --- | --- | --- | --- |
| Interfaz y funciones | idénticas | idénticas | idénticas |
| Compilado en CI | sí | sí | sí |
| Pruebas automatizadas en CI | sí | sí | sí |
| El instalador abre sin rodeos | sí (aviso de editor desconocido) | **no** — ver la nota sobre la compilación sin firmar | sí |
| Inicio de sesión, sincronización, exportación | verificado por el mantenedor en cada versión | solo prueba de humo de un colaborador | **nadie todavía** |
| Almacén de credenciales | Credential Manager, verificado | Llavero, sin verificación independiente | Secret Service, **nadie todavía** |
| Actualización automática | verificado | compilado, sin verificación independiente | n/a — tu gestor de paquetes |

El mantenedor desarrolla en Windows y no tiene Mac ni usa Linux en el
escritorio. Nada de lo anterior afirma que macOS o Linux estén rotos — es una
declaración sobre quién ha comprobado qué. Si usas alguna de las dos y algo
falla, un reporte es realmente útil.

**Desde la 1.0.0, el esquema de la base de datos local y su ruta de
actualización se tratan como algo a mantener a largo plazo**: cada migración
hace primero una copia de seguridad automática, y las instantáneas se pueden
verificar y restaurar. Tus datos permanecen locales — pero las instantáneas
viven en el mismo disco que la base de datos, así que **si te preocupa un fallo
de disco, copia una a otro lugar tú mismo.**

## Primera conexión

1. Abre ZeppBridge y ve a **Ajustes** en la barra lateral.
2. Pulsa conectar. Se abre la **página oficial de inicio de sesión de Zepp**
   en su propia ventana; entra con tus credenciales habituales.
3. Cuando indique conectado, la ventana se cierra y la app ejecuta su primera
   sincronización. Dale unos 40 segundos.

Funcionan tanto las cuentas de China continental como las internacionales; la
app detecta a qué servidor regional perteneces.

La primera sincronización descarga 30 días para que haya algo en pantalla
rápido, y luego sigue en segundo plano hasta tener 180 días. El progreso es
visible y puedes detenerla en cualquier momento. Las sincronizaciones
posteriores son incrementales.

Cada selector de «últimos N días» de la app — en las pantallas de entrenamiento
y cuerpo, y en la página de exportación — lee tu biblioteca **local**, no la
nube. Si eliges un rango que llega más atrás de lo que tiene este equipo, la
app lo dice y ofrece descargar el resto. Un tramo en blanco en un gráfico
significa *aún no descargado*, nunca *no registraste nada entonces*.

Para historial más antiguo de 180 días, usa **Archivo a largo plazo e historial
completo** en Ajustes: elige 1/2/3 años o un inicio personalizado, y descarga
mes a mes. Puedes parar en cualquier punto y continuar después. Antes de
empezar, estima el uso de disco a partir del ritmo real al que se acumulan tus
propios datos — no de una constante fija.

Si el rango supera tu ventana de retención local, la app te pide activar primero
el archivo a largo plazo; si no, el historial recién descargado se limpiaría
tras la siguiente sincronización correcta.

¿Se atasca el inicio de sesión? Consulta la [guía de conexión](docs/guides/connection.md)
(en inglés) para solucionar problemas y dos métodos alternativos.

## Qué obtienes

**Tendencias**

| Página | Qué muestra |
| --- | --- |
| **Resumen** | Frecuencia cardíaca de las últimas horas, pasos de hoy, estructura del sueño de anoche, esta semana frente a tus propios 28 días anteriores, y accesos al estado corporal y de entrenamiento. Cada tarjeta se abre |
| **Frecuencia cardíaca** | La curva completa de 24 horas, más tendencias diarias de frecuencia en reposo y HRV con dos definiciones |
| **Actividad diaria** | Tendencias diarias de pasos, distancia, calorías activas y minutos activos |
| **Estado corporal** | Recuperación, estrés, SpO₂, HRV, frecuencia respiratoria y frecuencia en reposo a lo largo del tiempo |
| **Estado de entrenamiento** | VO₂max, carga de entrenamiento, umbral de lactato, PAI, y si el volumen reciente es alto o bajo |
| **Registros recientes** | Cada sesión de sueño y cada entrenamiento, todos abribles en detalle |
| **Detalle de entrenamiento** | Distancia, ritmo, frecuencia cardíaca, parciales por kilómetro, rastro GPS; correr muestra además potencia y técnica de carrera |
| **Dispositivos** | De dónde salió el modelo de cada dispositivo (coincidencia del catálogo o asignación tuya), firmware, datos más recientes — reasignable en cualquier momento |
| **Salud de los datos** (Ajustes → Avanzado y mantenimiento) | Estado de descarga / análisis / escritura por flujo — si un hueco significa «no sincronizado» o «nunca se midió» |

Una métrica sin datos no se queda mostrando «—»; simplemente no aparece. Y una
curva se interrumpe donde hayan pasado más de 15 minutos sin una muestra, en
vez de trazar una línea recta entre los dos extremos.

**Análisis post-entrenamiento e informe semanal**

Tras un entrenamiento, la app lo compara con tu propio historial: carreras
recientes en la misma banda de distancia, y cómo difieren ritmo, frecuencia
cardíaca y carga — junto con en cuántas muestras se apoya y con qué confianza.
**La referencia eres tú, no una norma poblacional.** Cuando no hay muestras
suficientes lo dice, en vez de bajar el listón para producir una frase. Son
hechos y evidencia; la interpretación queda para una IA.

**Pásalo a una IA**

Hay varias plantillas de prompt integradas (resumen de rendimiento, análisis de
entrenamiento, evaluación de recuperación, análisis de sueño). Elige plantilla
y rango, y la app empaqueta los datos, elimina identificadores de dispositivo y
ubicaciones precisas, lo copia al portapapeles y abre el sitio de IA que
elegiste.

La página de detalle de un entrenamiento tiene su propio botón «pasar a IA»,
limitado a **ese único entrenamiento**: el entrenamiento en sí y las métricas
por punto registradas mientras ocurría. Los registros por día como sueño y
pasos no lo acompañan.

Los paquetes de más de 2 MB se escriben en su lugar en un archivo en tu
escritorio, listo para arrastrarlo a la conversación.

**Archivos de exportación**

- **JSON** — datos estructurados completos, para scripts o modelos
- **CSV** — resumen tabular para hojas de cálculo
- **GPX** — trazados estándar para Strava, Garmin y otros

Qué contiene una exportación: resúmenes de entrenamientos (tipo, inicio y fin,
distancia, calorías, frecuencia cardíaca media y máxima, carga de
entrenamiento), métricas diarias (pasos, frecuencia en reposo, HRV, SpO2,
estrés, frecuencia respiratoria, PAI, VO2max) y sesiones de sueño con su línea
temporal de fases. Elegir **Completa** en vez de **Resumida** añade series por
segundo de los entrenamientos y lecturas individuales de frecuencia cardíaca.

`.fit` es un formato de exportación propio, un archivo por entrenamiento,
escrito en la carpeta que elijas. Lleva las series por segundo que ZeppBridge
decodificó del detalle de entrenamiento de Zepp: rastro GPS, frecuencia
cardíaca, velocidad, altitud, potencia de carrera, tiempo de contacto con el
suelo y oscilación vertical, más vueltas por kilómetro y eventos de pausa. Los
campos que nunca se midieron simplemente están ausentes — nada se rellena para
que el archivo parezca completo. La cadencia se omite a propósito: su unidad no
se puede conciliar con ningún campo de resumen que tengamos, y una unidad
equivocada se leería silenciosamente como el doble.

Qué no contiene una exportación: `.tcx`, datos de la cuenta, tokens ni números
de serie de dispositivos. Los rastros GPS aparecen en GPX y FIT, y solo en
entrenamientos que realmente llevan trazado.

**No se hace más pesada con el tiempo**

Las cargas útiles crudas de la nube son lo más voluminoso de la base de datos
local. ZeppBridge las guarda comprimidas — todo lo recién sincronizado llega
comprimido, y el primer arranque tras una actualización compacta las existentes
en segundo plano y recupera el espacio, con un progreso arriba de la ventana
que desaparece al terminar.

Antes de reemplazar una carga útil la descomprime de nuevo y compara byte a
byte, saltándose cualquiera que no coincida: la carga cruda es la única base
para reanalizar en local, así que no comprimir es siempre mejor que comprimir
mal. Una base de datos medida de 211 MB quedó en 55 MB.

**Déjala corriendo**

Cerrar la ventana deja la app en la bandeja, sincronizando por su cuenta. Si no
quieres que siga, clic derecho en el icono de la bandeja y salir.

**Sin ventana**

Cada release también incluye `zeppbridge-tools-<version>-<platform>.zip` con
dos programas:

- `zeppbridge-cli` — no interactiva: `status`, `sync`, `export`. Los códigos de
  salida son un contrato estable, así que se programa limpio con el Programador
  de tareas o cron.
- `zeppbridge-mcp` — servidor MCP de solo lectura por stdio. Sin puertos, sin
  red. Permite a un modelo consultar tus datos locales sin que salgan de tu
  equipo.

Consulta [CLI y MCP](docs/reference/cli-and-mcp.md) (en inglés) para uso y
ejemplos de configuración. La sección MCP de Ajustes también ofrece un bloque
de texto que puedes pegar directamente a una IA, para que te guíe en
configurarlo en tu equipo.

**REST local de solo lectura**

Ajustes puede habilitar un endpoint de solo lectura ligado solo a `127.0.0.1`,
para tus propios scripts. Está apagado por defecto, exige un token al
activarlo, no devuelve credenciales y nunca escucha en la red local.

## Novedades

Los cambios por versión están en [CHANGELOG.md](CHANGELOG.md). Cuando Ajustes →
Actualización de software → Buscar actualizaciones encuentra una versión nueva,
también te muestra las notas directamente y reporta el progreso mientras
descarga.

## Preguntas frecuentes

**¿Mi equipo tiene que quedarse encendido?**
No. Cada arranque recupera el periodo que te perdiste.

**¿Puedo dejar de usar la app de Zepp del teléfono?**
No. La cadena es: reloj → app de Zepp en tu teléfono → nube de Zepp →
ZeppBridge. Tu reloj sigue necesitando la app del teléfono para subir los
datos. Ábrela de vez en cuando.

**¿Podrían bloquearme la cuenta por esto?**
ZeppBridge usa tus propias credenciales y **solo emite peticiones de lectura**
— no hay ni una sola petición de escritura en todo el proyecto; puedes
buscarlo con grep. En comportamiento es lo mismo que abrir la app oficial para
mirar tus datos. Sigue siendo un uso no oficial, y no podemos dar garantías en
nombre de Zepp.

**Una métrica volvió vacía.**
Primero comprueba si tu reloj la midió de verdad. Algunas métricas (umbral de
lactato, VO₂max) solo se actualizan tras entrenamientos concretos, unas pocas
veces al año. La página de ajustes informa de cada una para tu cuenta — ojo:
**«no recuperada» no es lo mismo que «tu reloj no la soporta»**: la API de Zepp
devuelve una respuesta vacía tanto para datos que no existen como para nombres
de flujo que nunca fueron válidos, así que el vacío por sí solo no prueba nada.

**¿Dónde están mis datos?**
- **Windows**: una carpeta `data` junto al directorio de instalación (no
  `%APPDATA%`). Ajustes → Avanzado tiene un botón para abrirla.
- **macOS**: `~/Library/Application Support/com.zeppbridge.ZeppBridge/data`
- **Linux**: `~/.local/share/zeppbridge/data` (Flatpak:
  `~/.var/app/com.zeppbridge.app/data/zeppbridge/data`). Un AppImage o un
  tarball desempaquetado mantiene `data/` junto al ejecutable — ver la
  [guía de Linux](docs/guides/linux.md) (en inglés).

**La app no arranca — nunca aparece una ventana.**
Dos cosas que mirar, en este orden:

1. **El diálogo de error.** Desde la v2.1.2, un fallo de arranque muestra un
   diálogo que nombra la carpeta exacta y el error del sistema en vez de salir
   en silencio. Las versiones anteriores salían sin decir nada, lo que parecía
   «el icono de la bandeja está, pero clic en Abrir no hace nada» — ese icono
   era el resto de un proceso que ya se había ido.
2. **El registro.** `logs/zeppbridge.log` dentro de la carpeta de datos (ver la
   pregunta anterior), más `logs/startup-error.log` si el último arranque
   falló antes de que existiera la ventana. Adjúntalos a un reporte de error;
   contienen rutas y números de versión, ningún dato de cuenta.

La causa más común en Windows es una carpeta de datos en la que la app no puede
escribir — el `.msi` instala en `Program Files`, donde un usuario estándar no
tiene permiso de escritura. Desde la v2.1.2 la app recurre a
`%APPDATA%\zeppbridge\ZeppBridge\data` cuando eso ocurre (salvo que ya haya una
base de datos en la carpeta bloqueada, en cuyo caso lo dice en vez de arrancar
calladamente con una vacía). También puedes apuntarla a cualquier lugar con la
variable de entorno `ZEPPBRIDGE_DATA_DIR`.

**¿Mis datos siguen ahí tras desinstalar?**
Sí. Desinstalar deja intactos la carpeta `data`, las copias de seguridad, el
registro de cobertura y los ajustes. Bórralo a mano si quieres que desaparezca.

**¿Puedo hacer copia de seguridad y restaurar la base de datos?**
Sí. Ajustes puede crear una instantánea de toda la base de datos en cualquier
momento, cada una con SHA-256 y una comprobación de integridad. Las
restauraciones se encolan y se aplican en el siguiente arranque — el único
momento en que un archivo puede intercambiarse atómicamente — y el paso de
encolado muestra primero una comparación del número de registros. Ver
[copia de seguridad y restauración](docs/guides/backup-and-restore.md)
(en inglés).

**Tengo más de un reloj — ¿se mezclan los datos?**
No. Cada registro lleva de qué dispositivo vino, y la interfaz los mantiene
separados.

**¿Se envía algo a vuestros servidores?**
Los datos de salud, los detalles de entrenamientos y las credenciales nunca
salen de tu equipo. Solo si confirmas expresamente «enviar un informe de
error» la app envía versiones de la app/parser, sistema operativo, pistas
seguras de modelo y estructura de campos para productos no reconocidos, versión
de firmware, códigos de entrenamiento desconocidos con sus conteos, y el código
de error numérico de la petición más reciente que la nube de Zepp rechazó (el
número, qué flujo de datos y cuándo — nunca texto que la nube devolviera).
Nunca envía cuentas, tokens, números de serie, identificadores de dispositivo,
GPS, valores de salud, respuestas crudas ni rutas locales. No hay telemetría
automática ni reporte de fallos en segundo plano.

## Privacidad

- **Las credenciales** usan por defecto el almacén de credenciales del SO
  (Windows Credential Manager / Llavero de macOS / Secret Service de Linux).
  Si tu llavero de macOS no se puede desbloquear, puedes elegir expresamente un
  archivo de texto plano privado; ver la
  [guía de credenciales en macOS](docs/guides/macos-credentials.md)
  (en inglés). Linux también admite almacenamiento en archivo y en variables de
  entorno; ver la [guía de Linux](docs/guides/linux.md) (en inglés). El
  almacenamiento en archivo protege menos que el del sistema y nunca se activa
  solo porque aquel falle.
- **Los datos de salud** son un archivo de base de datos sin cifrar en tu
  equipo. Si compartes la máquina, usa cuentas de SO separadas.
- **Los paquetes para IA se anonimizan primero**: se eliminan identificadores
  de dispositivo, direcciones MAC y GPS preciso, y el archivo lista lo que se
  quitó. Los trazados precisos solo se incluyen si lo activas tú.
- **Los mapas se renderizan en local.** Ninguna petición va a servicios de
  mapas de terceros.
- **Los informes de error requieren confirmación expresa**, usan una lista
  blanca fija, se construyen en local, no necesitan cuenta de GitHub y nunca se
  publican automáticamente como issues.
- Sincronizar contacta con los servidores de Zepp, así que no es una
  aplicación completamente offline.

Ver [seguridad y privacidad](docs/reference/security-and-privacy.md) (en
inglés). Reporta problemas de seguridad por el canal privado de
vulnerabilidades de GitHub, no en un issue público.

## Para desarrolladores

Tauri 2 + Vue 3 + Rust. El núcleo vive en el crate `zeppbridge-core`; la app de
escritorio, la CLI, el servidor MCP y el endpoint REST local son todos
adaptadores finos sobre él — SQL, conversión de unidades y reglas de valores
ausentes nunca se duplican.

```bash
npm ci
npm run tauri dev
```

- [Desarrollo](docs/development/development.md) (en inglés) — puertas de
  compilación, contratos de comandos, REST API local, orden de aceptación
- [Arquitectura](docs/reference/architecture.md) (en inglés) — límites del
  producto, mapeo de la API de Zepp, lista de verificado vs no verificado
- [CLI y MCP](docs/reference/cli-and-mcp.md) (en inglés) — contrato de códigos
  de salida, herramientas de solo lectura, ejemplos de programación
- [Copia de seguridad y restauración](docs/guides/backup-and-restore.md)
  (en inglés) — instantáneas, flujo de restauración, registro de cobertura
- [Linux](docs/guides/linux.md) (en inglés) — Flatpak, deb/rpm/AppImage,
  ubicaciones de datos, almacenes de credenciales
- [Credenciales en macOS](docs/guides/macos-credentials.md) (en inglés) — usar
  almacenamiento en archivo cuando el llavero de inicio no está disponible
- [Docker](docs/guides/docker.md) (en inglés) — imagen CLI/MCP sin interfaz,
  programación, compilaciones reproducibles
- [Guía de UI](docs/development/ui-guidelines.md) (en inglés) — tokens de
  diseño, estructura de páginas, componentes

La documentación enlazada está disponible en inglés y chino simplificado; cada
página enlaza a su contraparte. Issues y PRs son bienvenidos en cualquiera de
los diez idiomas. Antes de cambiar algo, lee la lista «unverified» del documento
de arquitectura — este proyecto tiene un estándar explícito de qué cuenta como
hecho establecido.

## Agradecimientos

La API de Zepp no está documentada; saber si un flujo de datos siquiera existe
solo es posible gracias a quienes ya lo hicieron funcionar. El mapeo de la API
se apoya en:

- [m4ary/zepp-health-cli](https://github.com/m4ary/zepp-health-cli) — partición
  de la superficie de eventos y valores de campos
- [Thejuampi/icu](https://github.com/Thejuampi/icu) — una reproducción
  independiente de las mismas APIs, útil como validación cruzada
- [H3llK33p3r/zepp-fit-extractor](https://github.com/H3llK33p3r/zepp-fit-extractor)
  (Apache-2.0) — decodificación del detalle de entrenamientos

Ninguno va incluido; ZeppBridge se apoya en los hechos de API que documentaron.

## Licencia

[Licencia MIT](LICENSE).

La distribución incluye recursos de terceros, atribuidos en [NOTICE](NOTICE):
MiSans (Xiaomi, requiere atribución — indicado en la página de ajustes), Inter
(SIL OFL 1.1) y el algoritmo de decodificación citado arriba (Apache-2.0).

Zepp, Amazfit y las marcas relacionadas pertenecen a sus respectivos
propietarios.
