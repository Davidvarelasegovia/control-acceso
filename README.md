# Sistema de Control de Acceso

Aplicacion web para registrar ingresos mediante escaneo de identificacion (RUT, codigo de
barras o QR), con horarios/servicios que reinician los contadores, base de datos SQLite,
funcionamiento sin conexion y exportacion de informes a Excel.

## Requisitos

- Node.js 22.12 o superior (recomendado 22 LTS)
- npm 10 o superior

No hace falta instalar ningun motor de base de datos: SQLite va incluido en Node
mediante el modulo nativo `node:sqlite`.

## Puesta en marcha

```bash
npm install
npm run dev:full
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3001/api/estado>
- Base de datos: `data/control-acceso.db` (se crea sola al arrancar)

Para produccion:

```bash
npm run build      # genera dist/
npm start          # servidor + API + frontend en http://localhost:3001
```

## Pantallas de acceso

Cada puerta tiene su propia URL, configurable en **Configuracion > URLs de Acceso**:

| URL | Ejemplo de nombre |
| --- | --- |
| `/acceso-1` | Acceso 1 - Puerta Norte |
| `/acceso-2` | Acceso 2 - Puerta Sur |
| `/acceso-camiones` | Acceso 3 - Camiones |

Puedes crear las que necesites; la ruta se valida contra la base de datos. Si la URL no
existe o esta desactivada, redirige al panel principal.

**Estas pantallas NO piden credenciales**: son las que se usan en la puerta de entrada con
la pistola laser.

## Acceso con credenciales

El boton **Base de Datos** en el pie del menu lateral lleva al panel protegido.

| Ruta | Quien entra | Que puede hacer |
| --- | --- | --- |
| `/login` | Todos | Puerta de entrada |
| `/admin` | Solo admin | Panel de base de datos completo |
| `/agente` | Admin y agente | Solo horarios y servicios |

### Usuario inicial

```
usuario:     david
contraseña:  123456
```

Se crea automaticamente en el primer arranque. **Cambiala desde
`/admin` > Usuarios y Agentes.**

### Los dos roles

| | Administrador | Agente |
| --- | --- | --- |
| Personas (agregar/editar/eliminar) | Si | **No** |
| Horarios y servicios | Si | **Si** |
| Registros y reportes | Si | **No** |
| Base de datos y consola SQL | Si | **No** |
| Crear usuarios y agentes | Si | **No** |
| Bitacora de ingresos | Si | **No** |

Para darle acceso a alguien, entra como administrador y ve a **Usuarios y Agentes**:
eliges el nombre de usuario, la contraseña y el nivel de permisos.

### Bitacora de ingresos

En `/admin` > **Bitacora de Ingresos** el administrador ve cada evento del sistema:
ingresos correctos, intentos fallidos (incluida la contraseña incorrecta) y acciones
administrativas (crear usuarios, agregar personas, borrar historial).

Tambien queda en la tabla `accesos_log` de la base de datos.

Las contraseñas se guardan cifradas con **scrypt** (nativo de Node) y las sesiones
duran 12 horas.

## Horarios y servicios

La diferencia clave del sistema:

- **Horario**: plantilla de turno que se repite a diario (ej: Turno Manana 08:00-13:00).
- **Servicio**: la instancia real de un horario en una fecha concreta. Es el periodo
  donde viven los contadores.

Reglas:

1. Cuando la hora actual entra en la ventana de un horario, el servicio se abre solo
   (`origen = automatico`).
2. Puedes abrir un servicio manualmente con el boton **Generar Servicio**. Ese servicio
   permanece abierto hasta que lo cierres, aunque la hora se salga de su ventana.
3. **Al cambiar de servicio los contadores se reinician en cero. Los registros del
   servicio anterior no se borran**: quedan en el historial y se consultan desde
   **Registros**, seleccionando el periodo.
4. Los horarios que cruzan la medianoche (ej: 22:00 a 06:00) funcionan correctamente y
   pertenecen al dia en que empezo el turno.
5. Borrar un horario no elimina los servicios ni sus registros.

## Control de duplicados por servicio

La ventana anti-duplicado **se reinicia en cada servicio**. Si alguien entro por el
acceso norte durante el Turno Manana, puede volver a registrarse por el acceso sur
cuando empieza la Colacion.

Ademas, cada registro guarda **que punto de acceso** lo genero. Si alguien intenta
volver a entrar en el mismo servicio, la pantalla lo dice:

```
Se repite el ingreso, no puede pasar
Usted ya tiene registro en Acceso 1 - Puerta Norte durante este servicio
```

Los duplicados se guardan en la tabla `eventos`, no en `registros`: no son un ingreso,
son un intento rechazado. Asi el total de registros no se infla y el contador de
duplicados sigue siendo util.

## Identificadores: sin validacion

**No hay ninguna validacion de RUT.** El sistema acepta cualquier texto y lo busca
tal cual en la base de datos.

Se puede registrar una persona con:

```
id: 123                 nombre: David Varela
rut: 13874809-K         nombre: David Varela
rut: 13874809           nombre: David Varela
```

### Como se compara

Cada persona tiene internamente una **clave**: el identificador **antes del digito
verificador**. Todos estos textos encuentran a la misma persona:

```
13874809-K   13874809   138748095   13.874.809   13874809k   13-874-809-K
```

La `K` funciona en mayuscula y minuscula, y los puntos, guiones y espacios se
ignoran. Los identificadores cortos (`123`) se respetan intactos.

Un identificador que no existe en la base simply no encuentra a nadie: sale
*"Persona no encontrada"*, nunca *"RUT invalido"*.

### El campo de escaneo no se reformatea

Para las pistolas laser: **el input NO se reescribe mientras se escanea**. Un
autoformateo en cada tecla hacia correr los digitos cuando el lector tipeaba rapido.
El identificador crudo llega intacto al servidor.

La vista previa formateada (`13.874.809`) solo aparece en el modal de Ingreso Manual,
que es un teclado en pantalla.

## Ingreso Manual

Boton junto a **Escanear**, en la pantalla principal y en cada pantalla de acceso.

Modal pensado para celulares y pantallas tactiles:
- Teclado en pantalla con `1-9`, `0`, la tecla **`K`** y borrar.
- Sin validacion: se escribe y se registra.
- Botones grandes (minimo 44 px) y funciona con teclado fisico tambien: numeros, `K`,
  `Backspace` y `Enter`.
- Se cierra con `Escape` y no deja scrollear el fondo.

## Duplicados: se registran, pero no suman

Un reintento de ingreso **queda registrado** (tabla `eventos`, con el detalle de en
que acceso ya estaba la persona) pero **no incrementa el total**.

El **Total** cuenta **solo los ingresos autorizados**:

| Concepto | Donde vive | Cuenta en el total |
| --- | --- | --- |
| Autorizado | `registros` | **Si** |
| No encontrado | `registros` | No |
| **Duplicado** | `eventos` | No |

## Importar personas desde Excel

En `/admin` > **Importar desde Excel**. Acepta `.xlsx`, `.xls` y `.csv`, y permite
cargar cientos o miles de filas de una vez.

### Formato de la planilla

| nombres | apellidos | rut | empresa |
| --- | --- | --- | --- |
| Juan Carlos | Pérez González | 12345678 | TechCorp Ltda. |
| María Fernanda | López Martínez | 98765432 | Innovaciones SA |
| Carlos Alberto | Rodríguez Silva | 13874809-K | Construcciones XYZ |

Reglas:
- Las columnas se reconocen **por nombre, en cualquier orden y con o sin tildes**.
- `rut` es obligatoria. Tambien se acepta que se llame `id`, `cedula` o `documento`.
- `empresa` es opcional.
- Fila de encabezado obligatoria (se busca entre las 5 primeras).
- Se puede arrastrar el archivo o elegirlo con clic.

En la pantalla hay un boton para **descargar la plantilla de ejemplo**.

### Como funciona

1. El navegador lee la planilla y te muestra cuantas filas detecto y las primeras 6.
2. Al confirmar, el servidor las inserta en **una sola transaccion**.
3. Reporta cuantos quedaron guardados y cuales se omitieron, con el motivo y el numero
   de fila.

Los identificadores repetidos se omiten solos: tanto si ya existen en la base como si
se repiten dentro del mismo archivo. No se pisa nada.

Medido con 1000 filas: **0,02 segundos**.

## Credenciales virtuales

Panel independiente en **`/credenciales`**, con su boton en el menu lateral. Solo
se ocupa de emitir credenciales: nada mas.

Entra con credenciales de administrador, porque emite identificadores que se
envian por WhatsApp. La pagina que recibe el trabajador (`/cred/CODIGO`) si es
publica.

### El codigo de la credencial

Cada credencial tiene un codigo de **10 caracteres**, letras y numeros:

```
Z749E72726     una letra, 3 digitos, otra letra y 5 digitos
```

Se evitan las letras **O** e **I** y el digito **0**, que en una credencial
impresa se confunden entre si. Comprobado con 2000 codigos: ninguno se repite.

El codigo **esta ligado al RUT** de la persona. El escaneo de acceso acepta
cualquiera de los dos:

```
Z749E72726  ->  busca la credencial  ->  encuentra la persona  ->  autoriza
10.017.328-K -> busca el RUT directo ->  encuentra la persona  ->  autoriza
```

Si la credencial esta **anulada** o **sin persona asociada**, el escaneo lo dice
con precision en vez del generico "Persona no encontrada".

### Que se edita

| Dato | Donde |
| --- | --- |
| Nombre, apellidos, empresa, cargo | Formulario, se autocompletan al elegir la persona de la base |
| **Logo de la empresa** | PNG/JPG/SVG, se aplica a todas las credenciales |
| **URL del codigo QR** | Campo de texto, se guarda en la configuracion |
| **Foto del trabajador** | PNG/JPG, por credencial |
| Autorizaciones de ingreso | Casillas **y 3 campos libres** |
| Licencias de conducir | Casillas **y 3 campos libres** |
| Vehiculos que puede conducir | Casillas **y 3 campos libres** |
| Vigencia y observaciones | Formulario |

La tarjeta se ve en vivo, con el frente y el reverso, tal como se imprime.

### Borrar una credencial

Cada credencial de la lista trae su propio boton de papelera, a la derecha. No
hace falta abrirla primero: pide confirmacion con el nombre y el codigo, y
queda registrado en `accesos_log`:

```
Elimino la credencial N536X75243 de María Fernanda López Pérez
```

Tambien esta el **Eliminar** del formulario, que hace lo mismo para la
credencial abierta.

Para borrar credenciales de prueba desde la terminal, el script pide los
codigos explicitos: nunca borra todo por su cuenta.

```bash
node scripts/limpiar-credenciales.js --listar
node scripts/limpiar-credenciales.js N536X75243 S887K76526
node scripts/limpiar-credenciales.js --todas      # pide doble confirmacion
```

### Las casillas fijas

Las **licencias** van solo con la clase, sin descripcion:

```
A1   A2   A3   A4   A5   B   C   D   F
```

La credencial es chica y "A1 - Motocicleta" no cabe al lado de los demas. Las
credenciales emitidas con el formato antiguo se limpian solas: al leerlas (y al
guardarlas) `claseLicencia()` deja solo la clase, asi que "B - Automovil"
pasa a ser "B". Un texto escrito a mano ("Permiso especial interno") se
respeta tal cual.

### Los 3 campos libres de cada grupo

Autorizaciones, licencias y vehiculos tienen ademas **tres campos de texto**
con el placeholder "Otros", por si el trabajo necesita algo que no este en la
lista:

```
✓ Acceso general   ✓ Bodega
──────────── OTRAS AUTORIZACIONES ────────────
[ Acceso a casino ] [ Traslado nocturno ] [ Manejo de rienes ]

A1   B   C   D   F
──────────── OTRAS LICENCIAS ────────────
[ Permiso interno ] [         ] [         ]
```

Lo que se escriba ahi se suma a las casillas al guardar. Los vacios no se
imprimen, y los repetidos se eliminan solos. Al reabrir una credencial, cada
texto escrito vuelve a su casilla.

### Cuidado con los textos largos

El nombre de la empresa, arriba de la foto, entra en **2 lineas como maximo** y
la franja tiene alto fijo. Sin eso, un nombre largo estiraba la franja y tapaba
la foto.

Ahora esto lo resuelve solo `ajustarTexto()` (mas abajo): busca el tamano de
letra mas grande con el que el texto entra en dos lineas, asi que un nombre
corto sale con letra grande y uno largo con letra chica, pero ninguno se sale.

### Un solo dibujo para las tres pantallas

La credencial se dibuja **una sola vez**, en `shared/credencialSvg.js`, que
devuelve un SVG. Lo usan los tres lugares donde se ve o se entrega:

| Lugar | Como usa el SVG |
| --- | --- |
| Panel `/credenciales` | Lo muestra en un `<img>` |
| Descarga PNG | Lo rasteriza a la medida pedida |
| Pagina del celular `/cred/CODIGO` | Lo incrusta tal cual |

Antes cada uno tenia su propio dibujo y se terminaban desincronizando: **lo que
se veia en el panel no era lo que salia al imprimir**. Con un solo modulo es
imposible que se separen, y el panel es de verdad una vista previa de la
credencial que se emite.

El modulo no usa `canvas` ni el DOM, asi que corre igual en el navegador y en
Node (el servidor lo necesita para la pagina del celular, que tiene que
funcionar aunque el frontend este caido).

### Las medidas del texto no se miden con `canvas`

`ajustarTexto()` elige el tamano de letra que hace que el texto entre en un
ancho dado, en una o dos lineas. Para medir usa una **tabla de anchos de
caracter** (`medirTexto()`), no `canvas.measureText`, y a proposito: esa funcion
solo existe en el navegador. Si el servidor midiera distinto que el panel, las
tres pantallas se volverian a desincronizar. Con una tabla fija, las tres
coinciden siempre.

### La linea base y el alto del texto

En SVG, el `y` de un `<text>` marca la **linea base**, no el alto. Dibujando en
la linea base, todo el texto queda corrido hacia arriba y el nombre se monta
sobre la foto. Por eso internamente el alto se mide desde arriba y se convierte
a linea base con `ASCENTE = 0.76` al escribir.

### El frente

El frente es **el diseno original, tal cual**. En el modulo esta escrito con las
medidas originales en pixeles (frente de **340 x 660**, reverso de **340 x 640**)
y todo multiplicado por un solo factor de escala `u = ancho / 340`. No hay
fracciones redondeadas ni dos juegos de medidas: el resultado es el mismo
dibujo que se tenia, y sale igual a 340 px (panel) que a 1200 px (impresion).

| | Medida del diseño | A 1200 px |
| --- | --- | --- |
| Papel del frente | 340 x 660 | 1200 x 2329 |
| Papel del reverso | 340 x 640 | 1200 x 2259 |
| Franja superior | 104 de alto, fija | 367 |
| Logo | `h-10`, `max-w 130`, arriba a la izquierda | 141 de alto |
| "Credencial de" | 9 px | 32 |
| Nombre de la empresa | 14 px, hasta 2 lineas | 49 |
| Foto | `w-176 h-200`, radio 16, borde 4, montada 40 px sobre la franja | 621 x 706 |
| Nombre del trabajador | 20 px, centrado | 71 |
| Cargo | 14 px, cian | 49 |
| Codigo de barras | 276 px de ancho, con los parametros del diseño | 974 |
| Rotulos de abajo | 10 px (rotulo) y 14 px (valor) | 35 y 49 |
| Reverso: franja | 44 de alto | 155 |
| Reverso: pie | logo de 40, caja de 104, QR de 104 | 141 y 364 |

- El **logo** usa su ancho real (se lee el `IHDR` del PNG o el marcador del JPEG)
  y nunca se deforma: uno panoramico aprovecha todo, uno cuadrado se queda
  cuadrado.
- El **nombre de la empresa** se mide ya dibujado el logo, asi que va en lo que
  sobra a su derecha y nunca se pisan. Con `ajustarTexto()` la letra baja de 14
  px solo si el nombre no entra en dos lineas.
- La **foto** va montada sobre la franja (`-mt-10` del diseño original), con
  `preserveAspectRatio="slice"`, que es `object-fit: cover`: recorta lo que
  sobra y centra, sin deformarla, este chata, cuadrada o panoramica.
- El **codigo de barras** usa los parametros del diseño (`scale: 3`,
  `height: 14`) y su alto sale de la proporcion real que devuelve bwip-js, leida
  del `viewBox`. Por eso las barras no quedan ni achatadas ni estiradas.
- El bloque del codigo se arma **desde abajo hacia arriba**,Terminando en el
  `bottom-4` del diseño, asi que un nombre larguisimo no puede empujarlo fuera
  del papel.

#### Por que no estan las filas de identificador, empresa y vigencia

Se quitaron porque **los tres datos ya salen en otro lado**:

| Dato | Donde sale ahora |
| --- | --- |
| Identificador (RUT) | Bajo el codigo de barras, en color cian |
| Empresa | En la franja de arriba, junto al logo |
| Cargo | Debajo del nombre |

Tenerlos dos veces es redundante y hacia que el frente se viera apretado. Si
mas adelante se necesita la vigencia en el frente, se agrega **una sola vez**, y
el lugar es junto al codigo de barras, no en una fila propia.

El codigo de barras se genera con `includetext: false` a proposito: el texto que
dibuja la libreria sale comprimido y con los caracteres pegados, que era lo que
hacia que se viera raro. El rotulo se dibuja aparte.

### El reverso

Tambien es el diseno original: 340 x 640, con la franja azul de
"Autorizaciones de ingreso", las secciones y el pie.

- Autorizaciones de ingreso, con palomita verde.
- Licencias de conducir, en recuadros de seleccion, en dos columnas.
- Vehiculos autorizados, igual.
- Observaciones.
- Pie alineado por abajo: caja con el logo de la empresa a la izquierda, **QR de
  104 x 104** a la derecha con su marco blanco y aire de los bordes.

El unico cambio es que el codigo y la fecha de emision van **adentro** de la caja
del logo, como en el diseño original (antes quedaban debajo, en cian sobre el
fondo, y no se leian).

### El codigo QR

Es la URL del sistema de credenciales. Se edita en el panel y se guarda en la
tabla `config`, en la clave `qr_url`.

Mientras la aplicacion no este publicada en Internet queda una **URL de
prueba**:

```
https://ejemplo.com/control-acceso/credenciales
```

Cuando se publique, se cambia en **Credenciales > URL del codigo QR** y todas
las credenciales quedan con el QR nuevo. El boton **Prueba** vuelve a la URL de
prueba.

```bash
node scripts/restablecer-qr.js   # dejar la URL de prueba y quitar el logo
```

### El codigo de barras identifica a la persona

El codigo de barras lleva el **identificador de la credencial**, no el RUT. El
escaneo acepta los dos:

```
10.017.328-K  -> busca por RUT         -> persona #1022 -> autoriza
N714Q33779    -> busca la credencial   -> persona #1022 -> autoriza
```

Los dos caminos llegan a la misma persona. Si la credencial esta anulada o sin
persona asociada, el escaneo lo dice con precision en vez del generico
"Persona no encontrada".

### Descargar la credencial como imagen (PNG)

Ademas de imprimir desde el navegador, el panel baja las credenciales como
**PNG limpios**, listos para una prensa de sublimacion o una imprenta:

| Boton | Que baja |
| --- | --- |
| **Frente** | `credencial-CODIGO-frente.png` |
| **Reverso** | `credencial-CODIGO-reverso.png` |
| **Ambas** | Las dos, con una pausa en el medio porque el navegador a veces cancela la segunda descarga |

El selector de **Resolucion** cambia el tamano. Las medidas se calculan solas con
`altoDe()`, asi que no hay numeros escritos a mano que puedan quedar viejos:

| Opcion | Frente | Reverso | DPI (54 mm de ancho) |
| --- | --- | --- | --- |
| Media | 600 x 1164 px | 600 x 1130 px | 282 |
| **Alta** (por omision) | 1200 x 2329 px | 1200 x 2259 px | 564 |
| Maxima | 1800 x 3493 px | 1800 x 3389 px | 847 |

No es una captura de pantalla: `src/components/generarCredencialImagen.js` toma
el **mismo SVG que muestra el panel** y solo lo rasteriza. Por eso sale nitida a
miles de pixeles y los bordes quedan limpios, y por eso **el archivo descargado
es exactamente lo que se ve en pantalla**.

El SVG se arma a la medida final que se pide, no a una medida grande que despues
se achique: asi el texto sale nitido a cualquier resolucion, en vez de perder
detalle al reducir.

Para comprobarlo sin abrir el navegador:

```bash
npm run probar:imagen-credencial
```

Revisa el SVG en ocho casos (el peor y el minimo, con logo panoramico, logo alto
y angosto, foto panoramica, foto minuscula, sin logo y sin foto) y avisa si:

- el XML quedo mal formado, o la proporcion del papel no es la del diseño
- algo se sale del papel
- **la franja, la foto o el bloque del codigo no miden lo del diseño**
- la foto no quedo montada sobre la franja, o se monta sobre el codigo
- el bloque del codigo no cierra en el `bottom-4`
- el nombre de la empresa no se agranda con un nombre corto, o no recorta
- la letra del nombre no quedo en los 20 px del diseño
- dos textos quedan encimados

### Envio por WhatsApp

El boton **WhatsApp** abre `wa.me` con el mensaje ya escrito y un link:

```
Hola María, tu credencial de acceso esta lista.

Descargala e instalala en tu celular:
http://localhost:5173/cred/Z749E72726

Presenta el codigo de barras en la entrada.
```

Si se escribe el celular del trabajador, el link abre el chat directo de esa
persona.

### Instalacion en el celular

El link abre una pagina que es una **aplicacion instalable** (PWA):

- **iPhone**: Safari → Compartir → **Anadir a pantalla de inicio**. Funciona
  incluso por HTTP.
- **Android**: Chrome exige **HTTPS** o `localhost`. Por red local hace falta
  un tunel (`npx cloudflared tunnel --url http://localhost:5173`) o el
  banderin `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

Queda como un icono en el escritorio y **funciona sin internet**, gracias al
service worker de `public/cred/sw.js`.

Los iconos los genera `node scripts/generar-iconos.js` (los dibuja a mano, sin
librerias de imagen).

La guia completa para probarlo en un telefono esta en **[GUIA-WIDGET.md](GUIA-WIDGET.md)**.

Para una demostracion lista:

```bash
node scripts/crear-demo-widget.js                          # credencial de prueba
node scripts/auditar-instalacion.js "http://localhost:5173/cred/CODIGO"
```

El servidor y Vite escuchan en la red local (`0.0.0.0` y `host: true`), asi que
el celular puede abrir el link por la IP del equipo.

### Nota sobre el proxy de Vite

En desarrollo, `/cred/` lo sirve el servidor Node, no Vite. Por eso en
`vite.config.js` el proxy usa la expresion regular `'^/cred/'`:

```js
'^/cred/': { target: 'http://localhost:3001', changeOrigin: true },
```

Con una clave normal (`'/cred'`) Vite hace coincidencia por prefijo y se
tragaria tambien `/credenciales`, que es el panel y no la credencial. El panel
terminaba sirviendo el build de produccion en vez del codigo fuente.

### Comprobaciones

```bash
node scripts/probar-credenciales.js      # logica: codigos, alta, edicion
node scripts/probar-credenciales-api.js  # API: permisos, escaneo, pagina
node scripts/probar-licencias.js          # "B - Automovil" -> "B"
node scripts/probar-credencial-svg.js   # el SVG: medidas, solapes, barcode
node scripts/probar-todo.js              # verificacion completa
node scripts/limpiar-credenciales.js     # borrar credenciales de prueba
```

`probar-todo.js` cubre lo importante de punta a punta: emite una credencial de
verdad, la escanea por su codigo de barras, confirma que resuelve a la persona
correcta de la base, abre la pagina publica, baja los iconos y despues limpia
todo.

## Codigos de barras para probar la pistola laser

Convierte una planilla de personas en codigos de barras imprimibles:

```bash
node scripts/generar-codigos.js "C:\ruta\plantilla_personas.xlsx"
```

Genera en `data/codigos/`:

| Archivo | Que es |
| --- | --- |
| `codigos-code128.pdf` | 53 codigos en Code 128, 5 hojas A4 |
| `codigos-code39.pdf` | Los mismos en Code 39 |
| `plantilla_personas-con-codigos.xlsx` | Copia con la hoja "Codigos de barras" |

### Por que dos PDF

Muchas pistolas laser baratas solo leen **uno** de los dos formatos. Con tener
los dos impresos se prueba cual usa la suya: si con el Code 128 no lee, capaz
con el Code 39 si.

### Que lleva el codigo

El identificador **completo, con su digito verificador**:

```
10.000.007-5   ->  100000075
13874809-K     ->  13874809K
12345678       ->  12345678
```

Funciona siempre porque el sistema compara con `clave()`, que le quita el
verificador a los dos lados:

```
clave("100000075")   = 10000007   <- lo que lee la pistola
clave("10.000.007-5") = 10000007   <- como esta guardado     coinciden
```

Imprimir SOLO el cuerpo daria `10000007` (8 digitos), que es justo el largo en
que el sistema **no** sabe si hay verificador o no. Codificar el identificador
completo evita esa ambiguedad y ademas es lo que la persona ya lleva impreso en
su credencial.

### Verificar antes de imprimir

```bash
node scripts/verificar-codigos.js "C:\ruta\plantilla_personas.xlsx"
```

Revisa, uno por uno, que el codigo impreso llegue a la misma persona que esta en
la planilla. Avisa si hay identificadores repetidos.

### Probar de verdad contra el servidor

```bash
node scripts/probar-escaneo-codigos.js "C:\ruta\plantilla_personas.xlsx"
```

Manda los 53 codigos a la API tal como los leeria la pistola, y confirma que
cada uno encuentra a su persona. Usa un servicio aparte, con nombre
`PRUEBA CODIGOS`, para **no tocar los contadores del servicio real**, y lo borra
al terminar.

Medido: **53 de 53** encontrados.

### Otras utiles

```bash
node scripts/ver-excel.js "ruta.xlsx"        # ver hojas y filas de un Excel
node scripts/ver-pdf.js "ruta.pdf"           # revisar un PDF generado
node scripts/limpiar-servicios-prueba.js     # borrar servicios de prueba
node scripts/limpiar-pruebas.js              # borrar personas de prueba
```

## Como levantar el sistema

```bash
npm run dev:full
```

Ese es **el comando para usar siempre**. Levanta las dos piezas:

| | Puerto | Que es |
| --- | --- | --- |
| Base de datos + API | 3001 | Node + SQLite, guarda todo |
| Frontend | 5173 | Vite, la pantalla |

### Ojo: `npm run dev` NO alcanza

`npm run dev` levanta **solo el frontend**. La web carga y navega, pero todos
los datos dan error, porque la base de datos no existe. Es la causa mas comun
de "no me funciona localhost".

Si la web sube pero la base no, la pantalla lo avisa en la parte de abajo con el
comando exacto que hay que ejecutar. Se recupera sola en cuanto la base vuelve.

### URLs

| Qué | Dónde |
| --- | --- |
| Escaneo (la puerta) | http://localhost:5173/ |
| Credenciales | http://localhost:5173/credenciales |
| Informes | http://localhost:5173/informes |
| Panel base de datos | http://localhost:5173/admin |
| API | http://localhost:3001/api/estado |

Credenciales del panel: `david` / `123456`.

### Si algo quedo a medias

```bash
# 1) Ver que hay corriendo
node scripts/estado.js

# 2) Reiniciar limpio
Get-Process -Name node | Stop-Process -Force
npm run dev:full
```

Para ver **por que** se cae la API, hay que mirar la consola donde corre
`npm run dev:full`: el watchdog anuncia cada reinicio (`[SYS] la API se detuvo
... Vuelvo a levantarla`).

### Compilar para produccion

Con el servidor **detenido**, porque `vite build` pisa el `index.html` de la
raiz si se corre en paralelo con el servidor de desarrollo:

```bash
# detener el servidor primero
Get-Process -Name node | Stop-Process -Force

npm run build
npm start
```

## Publicarlo en un dominio

### 1. Antes de nada: una revision automatica

```bash
npm run probar:despliegue
```

Revisa la version de Node, si el build esta al dia, las contrasenas debiles, la
URL del codigo QR, los service workers y que datos hay que respaldar. **No
cambia nada**, solo informa. Sale con codigo 1 si hay algo pendiente.

### 2. Que hay que cambiar SI O SI

| Que | Donde | Por que |
|---|---|---|
| La clave de `david` | Panel `/admin` | Es `123456`. Es la contrasena mas adivinada del mundo. |
| La URL del codigo QR | Panel de credenciales | Sale de prueba, `https://ejemplo.com/...`. Debe ser el dominio real, con `https`. |

La URL del QR es importante porque va **impresa en la credencial**: si queda la
de prueba, el QR impreso lleva a un sitio que no existe. Como el QR se graba en
la tarjeta, hay que cambiarla **antes** de imprimir, y si ya se imprimieron
credenciales, hay que reimprimir las que tengan el QR viejo.

### 3. Cambiar de equipo

Copia la **carpeta entera** por OneDrive, Drive o un pendrive. Lo imprescindible
es `data/control-acceso.db`, que lleva personas, ingresos, credenciales, usuarios
y el logo de la empresa. Las fotos van **dentro** de ese archivo, en base64, asi
que la copia lo incluye todo.

En el equipo nuevo:

```bash
npm install
npm run dev:full
```

Eso es todo. No hay que instalar base de datos: SQLite va incluido en Node.

Nunca copies el `.db` con el servidor corriendo. O usas el boton **Respaldar
base** del panel, o paras el servidor, copias y lo levantas de nuevo.

### 4. Compilar y arrancar en modo produccion

Con el servidor **detenido**:

```bash
npm run build
npm start
```

Ahora todo (frontend, API y credenciales) sale por un solo puerto, el `3001` por
omision. El servidor sirve `dist/` y manda cualquier ruta que no sea de la API al
`index.html`, que es lo que necesitan las pantallas `/credenciales`,
`/informes`, `/admin` y `/agente`.

Se cambia el puerto con la variable `PORT`:

```bash
# Windows PowerShell
$env:PORT = 8080
npm start
```

### 5. Detras de un dominio (HTTPS obligatorio)

Dos caminos. Los dos terminan con el sistema escuchando en un puerto y un
dominio apuntando ahi.

#### Opcion A: el mismo servidor Node, con un proxy inverso

Es la mas simple y la que mas se parece a como corre hoy. Nginx (o Caddy) delante,
con https, y reenvia todo al Node:

```nginx
# /etc/nginx/sites-available/control-acceso
server {
    listen 443 ssl http2;
    server_name acceso.miempresa.cl;

    ssl_certificate     /etc/letsencrypt/live/acceso.miempresa.cl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/acceso.miempresa.cl/privkey.pem;

    # La credencial va sin sesion pero tiene que pasar por https
    client_max_body_size 12M;   # para subir fotos y el Excel de 1000 personas

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name acceso.miempresa.cl;
    return 301 https://$host$request_uri;
}
```

El Node se deja escuchando solo en `127.0.0.1` para que no se entre por el
puerto suelto. Para eso hay que cambiar el `0.0.0.0` de `server/index.js` por
`127.0.0.1`, o dejarlo en `0.0.0.0` y cerrar el puerto 3001 en el firewall.

#### Opcion B: alojado en un servicio que ya da https

Si el hosting es un panel tipo cPanel o un servicio de Node (Railway, Render,
Fly, VPS con Dokku), se sube la carpeta, se corre `npm install && npm run build`,
y se arranca con `npm start`. Todos dan https por debajo, y la variable `PORT`
la define el servicio. Lo que hay que revisar en ese caso:

- Que corra **Node 22.12 o superior**. La base usa `node:sqlite`, y en versiones
  viejas el sistema no arranca. Esta declarado en `package.json`, asi que
  `npm install` avisa.
- Que `data/` sea un **disco persistente**, no una carpeta efimera. En un
  contenedor, `data/` se borra cada vez que se redeploya: perderias las personas
  y las credenciales. Si el servicio permite montar un volumen, apuntalo ahi.
- Si hay que compilar en el servidor, `npm run build` debe correr con el proceso
  **detenido**, porque pisa el `index.html` de la raiz.

### 6. Cosas que conviene tener presentes en produccion

**Sin https no se instala la credencial.** Chrome y Safari solo ofrecen
"Agregar a pantalla de inicio" cuando la pagina viene por https. Con `http://`
sirve para ver la credencial, pero no para instalarla como aplicacion. Si se
prueba en Android por IP local, o se usa `npx cloudflared tunnel --url
http://localhost:5173`, o Firefox con `about:config` -> `dom.security.https_first`
desactivado.

**El service worker guarda la credencial en el telefono.** Por eso ahora la
pagina de la credencial usa *red primero*: si hay internet se ve siempre la
version al dia, y sin internet aparece la ultima guardada. Cuando se cambie el
diseno de la credencial hay que **subir el numero de cache** en
`public/cred/sw.js` (`credencial-v2` -> `v3`). Es lo unico que limpia lo que
tenian guardado los telefonos.

**La base es un archivo unico.** No hay motor de base de datos que respaldar: es
`data/control-acceso.db`. Si eso se pierde, se pierden las personas. Copiarlo con
el servidor detenido es el respaldo completo del sistema.

**El panel `/admin` es publico si el dominio lo es.** Con `david`/`123456` es un
problema serio; cambiada la clave, sigue siendo el punto mas sensible. Si el
dominio es publico de verdad, conviene ponerlo detras de un acceso de red o de
una capa de autenticacion del hosting.

**Los QR de las credenciales son publicos por diseño.** `/cred/CODIGO` no pide
sesion, porque lo abre el trabajador en la puerta. Quien tenga el codigo puede
ver los datos de esa persona. Si eso no es aceptable, hay que poner una clave en
la URL o limitar el acceso.

### 7. Ponerlo ahi por primera vez: una lista corta

```bash
# en el equipo destino
npm install
npm run probar:despliegue    # revisar lo que avise
npm run dev:full             # levantar y entrar a /admin
#   cambiar la clave de david
#   cambiar la URL del QR
npm run build                # con el servidor detenido
npm start
# abrir https://tu-dominio.cl/admin desde el celular
```

## Si se cae la base de datos, el sistema se recupera solo

Una base de datos local no se cae sola, pero un proceso de Node se puede caer
(errores, reinicio del equipo, un `Stop-Process` accidental). Con la
configuración anterior, la pantalla se quedaba **en rojo para siempre** aunque
el servidor volviera, porque el estado de conexión solo se revisaba al abrir la
aplicación o al cambiar la red. Eso dejaba el sistema de acceso inusable en la
puerta hasta que alguien recargara la página a mano.

Ahora hay dos mecanismos:

### 1. El servidor se relanza solo (`scripts/dev-full.js`)

Si el proceso de la API termina por cualquier motivo, `dev-full.js` lo vuelve a
levantar con una espera creciente (1s, 2s, 4s, 8s, hasta un máximo de 15s, para
no entrar en bucle si el problema es persistente). Al volver, el proceso se
anuncia estable en la consola:

```
[SYS] la API se detuvo (código 1). Vuelvo a levantarla…
[API] Control de Acceso - API y servidor
[API] BD:  data/control-acceso.db
[API] estable
```

Al cerrar el script se mata el **árbol** de procesos completo, no solo el hijo
directo. Antes, Vite quedaba vivo como proceso nieto: la web respondía pero sin
API detrás, que es la combinación más confusa para diagnosticar.

### 2. La pantalla detecta la caída y la recuperación (`src/utils/api.js`)

`iniciarVigilancia()` sondea `/api/estado` cada 10 segundos en operación normal
y cada 2,5 segundos cuando está caído, para reponerse rápido. Al volver a estar
disponible dispara el evento `servidorRestablecido`, que:

- pone el indicador en verde,
- reproduce el sonido de conexión,
- sube la cola de escaneos pendientes,
- recarga los datos en pantalla sin que el operador toque nada.

Un detalle importante: el sondeo **revisa el código HTTP**, no solo que la
promesa no reviente. Cuando el servidor está caído, el navegador y el proxy
responden con un `502` en lugar de dar error de red, así que un `fetch` que
"funciona" puede estar enmascarando una caída. Por eso `verificarServidor()`
lanza si `!res.ok`, y `pedir()` trata cualquier `5xx` o `408` como servidor no
disponible.

### Probarlo

```powershell
# Matar la API una vez y ver que se levanta sola
powershell -File scripts/probar-reinicio.ps1

# Provocar una caida larga y ver el ciclo ONLINE -> OFFLINE -> ONLINE
powershell -File scripts/probar-caida-larga.ps1
```

## Informes y estadisticas

Desde **Registros** hay un apartado **Informes y estadisticas** que lleva a la
pagina `/informes`. Ahi hay un dashboard con:

- **Tarjetas de resumen**: ingresos totales, autorizados, no encontrados y
  duplicados, con comparacion contra el periodo anterior.
- **Ingresos por servicio** (grafico de barras): desayuno, almuerzo, cena, cena
  noche… Los servicios que se llaman igual se suman entre si, asi que los 30
  "Cena" del mes aparecen en una sola barra.
- **Evolucion**: diaria, semanal o mensual (grafico de linea).
- **Control de flujo**: cuantos ingresos hubo en cada franja de 30 minutos,
  con la barra del pico destacada en naranja y una tabla al lado que responde
  exactamente lo que pregunta el jefe: *"entre las 13:30 y las 14:00
  ingresaron 420"*.
- **Informes por servicio**: tabla con todos los servicios y un boton
  **Ver personas** que abre el detalle de quien paso en ese servicio puntual.
- **Descargar Excel**: un archivo con 4 hojas (por servicio, flujo de 30
  minutos, evolucion y listado de servicios), mas una quinta con el detalle de
  personas si abriste un servicio.

### Filtros

- Periodo rapido: hoy, 7 dias, 30 dias, este mes — o fechas a mano.
- Servicio: todos, o uno puntual.
- Agrupar por: diario, semanal, mensual.

### Los servicios nuevos aparecen solos

Todo se calcula con SQL sobre `registros`, `eventos` y `servicios` agrupados
por nombre. No hay nada que configurar: cuando generas un servicio nuevo, al
refrescar el informe ya aparece en el grafico y en la tabla.

### Las horas son hora local

Los registros guardan la hora en UTC (formato estandar), pero los informes la
convierten con `localtime` de SQLite. Por eso una persona escaneada a las
**19:30** aparece en la franja **19:00 - 19:30**, que es lo que ve el reloj de
la puerta.

### API de informes

Son de solo lectura, no piden credenciales (el jefe puede abrirlos desde el
mismo equipo de la puerta):

| Ruta | Que devuelve |
| --- | --- |
| `GET /api/informes?desde=&hasta=&granularidad=&servicio_id=` | Todo el dashboard en una llamada |
| `GET /api/informes/servicios` | Servicios con su total, para el selector |
| `GET /api/informes/personas?servicio_id=` | Quien paso en ese servicio |

Calculos en `server/informes.js`.

### Base de demostracion

Para ver los graficos con datos sin esperar a que se llene el mes:

```bash
node scripts/demo-datos.js                 # crea data/demo.db con 36.000 registros
DB_PATH=data/demo.db npm run dev:full      # levanta la app contra esa base
```

**Tus datos reales no se tocan**: la demostracion vive en `data/demo.db`, que
es un archivo aparte.

## Sonidos

| Estado | Sonido |
| --- | --- |
| Autorizado | Tres tonos ascendentes (C-E-G) |
| Duplicado | Dos tonos medios y uno grave |
| Persona no encontrada | Tres tonos descendentes |
| **Alarma negativa** | Sirena de 4 pulsos + remate grave |

La alarma negativa se dispara en toda negativa de acceso.

## Base de datos SQLite

**No tiene usuario ni contrasena.** SQLite es un archivo: `data/control-acceso.db`.
Quien tenga el archivo tiene todos los datos.

### Panel de administracion: `/admin`

Incluido en el proyecto, en <http://localhost:5173/admin>. Todo lo que haces ahi escribe
de verdad en SQLite, no en el navegador.

Pestanas:

| Pestana | Que permite |
| --- | --- |
| **Personas** | Agregar, editar, activar/desactivar y eliminar registros |
| **Registros** | Ingresos, con su servicio y punto de acceso |
| **Eventos** | Reintentos de ingreso rechazados |
| **Servicios** | Historial de periodos |
| **Horarios** | Plantillas de turnos |
| **Consola SQL** | Consultas `SELECT` / `PRAGMA` directas a la base |

La consola SQL es de **solo lectura**: cualquier `INSERT`, `UPDATE`, `DELETE`, `DROP`,
`ALTER` o `CREATE` se rechaza para no arriesgar los datos.

### Ver el archivo con DB Browser for SQLite

La base esta en modo `delete`, asi que **todo vive dentro del unico archivo**
`data/control-acceso.db` (no hay archivos `-wal` ni `-shm`).

Para verla con datos al dia:

1. **Cierra DB Browser** si la tiene abierta (bloquea el archivo).
2. En `/admin`, pulsa **Compactar base**.
3. Abre `data\control-acceso.db` en DB Browser.
4. Pestana **Explorar datos** → tabla `personas`.

Tambien sirve DBeaver (nueva conexion tipo SQLite) o `npm run db:verificar` desde la
terminal.

Si el boton **Compactar base** dice que la base esta bloqueada, es que otro programa
la tiene abierta: cierralo y vuelve a pulsar.

Esquema:

| Tabla | Contenido |
| --- | --- |
| `personas` | Maestro de personas, con `clave` de busqueda |
| `horarios` | Plantillas de turnos que se repiten |
| `servicios` | Periodos reales; cada registro apunta a uno |
| `registros` | Ingresos efectivos, con punto de acceso |
| `eventos` | Reintentos rechazados (duplicados) |
| `urls_acceso` | Pantallas de acceso diferenciadas |
| `usuarios` | Administradores y agentes (clave cifrada con scrypt) |
| `sesiones` | Tokens de ingreso, con vencimiento |
| `accesos_log` | Bitacora de ingresos al sistema |
| `config` | Ajustes sueltos (recinto, menu) |
| `sync_queue` | Operaciones pendientes de subir |

### Respaldo

**Configuracion > Exportar datos (JSON)** descarga personas, horarios, servicios,
registros y configuracion.

Para migrar datos de una version anterior (localStorage):

1. Exporta el JSON desde la app.
2. Colocalo en la carpeta `migracion/`.
3. Ejecuta `npm run migrate`.

## Funcionamiento sin conexion

- Si el servidor no responde, la app sigue escaneando: resuelve el RUT contra la cache
  del navegador y encola el registro.
- El indicador inferior izquierdo pasa a **Falta sincronizacion (n)**.
- Al recuperar la conexion, la cola se sube sola automaticamente.
- El service worker solo se activa en produccion y usa estrategia *network-first*, para
  no servir nunca una version obsoleta.

## Comandos

| Comando | Que hace |
| --- | --- |
| `npm run dev:full` | Levanta API + frontend juntos |
| `npm run dev` | Solo frontend (Vite) |
| `npm run server` | Solo API + SQLite |
| `npm run build` | Build de produccion en `dist/` |
| `npm start` | Produccion: sirve API y frontend |
| `npm run migrate` | Importa un JSON de respaldo a SQLite |
| `node scripts/verificar-db.js` | Muestra el estado de la base de datos |
