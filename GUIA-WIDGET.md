# Probar la credencial como widget (aplicación) en el celular

La credencial es una **PWA**: se instala como una aplicación y queda en el
escritorio del teléfono, sin barra de navegador. Este documento es la guía para
probarla de verdad.

---

## 1. La demostración ya está creada

```
Código      : R293R59916
Persona     : María Fernanda López Pérez
RUT         : 10.017.328-K
```

Trae foto y logo de ejemplo, y el QR del reverso.

### Desde este computador

```
http://localhost:5173/cred/R293R59916
```

### Desde el celular (misma red Wi-Fi)

```
http://192.168.50.148:5173/cred/R293R59916
```

> El celular tiene que estar en la **misma red Wi-Fi** que el computador.
> Si no abre, casi siempre es que el firewall de Windows está bloqueando el
> puerto. Ver sección 5.

---

## 2. En iPhone (iOS) — funciona por HTTP

1. Abrir el link en **Safari** (no desde Chrome: en iOS solo Safari instala).
2. Tocar el botón **Compartir** (el cuadro con la flecha hacia arriba).
3. Bajar hasta **Añadir a pantalla de inicio**.
4. Tocar **Añadir**.

Queda un ícono con el logo de la empresa. Se abre como aplicación, a pantalla
completa, y **funciona sin internet**.

> iOS no tiene instalador automático: el botón "Instalar" de la página
> reemplaza el paso 2 por las instrucciones en pantalla.

---

## 3. En Android — necesita HTTPS (importante)

En Android, **Chrome no instala nada desde una dirección HTTP que no sea
localhost**. No es un error del sistema: es una regla del navegador que exige
un "contexto seguro" para registrar el service worker, que es lo que permite
que la credencial funcione sin internet.

Hay tres caminos:

### a) Con un túnel HTTPS (lo más fiel a la realidad)

Sirve la aplicación por un dominio HTTPS real. Sirve para probar exactamente
como se verá publicada.

```bash
# Con cloudflared (gratis, sin cuenta)
npx cloudflared tunnel --url http://localhost:5173

# O con ngrok
npx ngrok http 5173
```

Imprime una dirección tipo `https://algo-aleatorio.trycloudflare.com`. Esa es la
que se abre en el celular. Chrome这时 sí muestra el banner de instalación.

### b) Con el banderín de Chrome para desarrollo

Para probar rápido sin salir de la red local:

1. En el Chrome del Android abrir `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Agregar `http://192.168.50.148:5173` en el campo de arriba.
3. Cambiar a **Enabled**.
4. Cerrar y reabrir Chrome.

Con esto Chrome trata la IP como segura y muestra el banner de instalación.

### c) En Firefox para Android

Firefox no exige contexto seguro para instalar; puede servir como prueba
rápida, aunque el resultado final conviene validarlo en Chrome con HTTPS.

---

## 4. Qué mirar una vez instalada

| Prueba | Cómo se hace | Resultado esperado |
| --- | --- | --- |
| Se abre como aplicación | Tocar el ícono del escritorio | Pantalla completa, sin barra de direcciones |
| El ícono es el de la empresa | Mirar el escritorio | Logo de la empresa, no el ícono del navegador |
| **Funciona sin internet** | Poner modo avión y abrir el ícono | La credencial aparece igual, con foto, datos, código de barras y QR |
| El nombre del ícono es corto | Mirar el ícono | `R293R59916`, no la URL |
| El código de barras se lee | Pasarlo por la pistola | Dice `R293R59916` |
| El QR apunta al sitio | Escanear el QR del reverso | Abre la URL configurada en el panel |

---

## 5. Si el celular no abre el link

1. **Confirme la red**: el computador y el celular en el mismo Wi-Fi, no en
   datos móviles.
2. **Confirme la IP**: el link usa `192.168.50.148`. Si cambió, ver la IP
   actual con:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.*' }
   ```
3. **Firewall de Windows**: la primera vez suele pedir permiso. Si se cerró,
   allowing Node:
   - *Configuración de Windows → Firewall y protección de red → Permitir una
     aplicación a través del firewall* → agregar **Node.js**.
4. **Pruebe el puerto 3001** en vez del 5173:
   `http://192.168.50.148:3001/cred/R293R59916`
   Esa es la misma página, servida por el servidor de base de datos, y no pasa
   por el proxy de Vite.

---

## 6. Verificación automática

Sin celular, se puede revisar que la credencial cumple todo lo que exige el
navegador para poder instalarse:

```bash
node scripts/auditar-instalacion.js "http://localhost:5173/cred/R293R59916"
```

Revisa el manifiesto, los iconos, el service worker, las etiquetas de iPhone y
el requisito de contexto seguro.

La función que más importa se puede comprobar en el navegador: la credencial
completa queda guardada en la caché del service worker, así que abre sin red.

```js
// en la consola del navegador, con la credencial abierta
const c = await caches.open('credencial-v1')
const p = await c.match('/cred/R293R59916')
console.log('recuperable sin red:', (await p.text()).length > 1000)
```

---

## 7. Limpiar la demostración

```bash
node scripts/limpiar-credenciales.js R293R59916
node scripts/restablecer-qr.js
```