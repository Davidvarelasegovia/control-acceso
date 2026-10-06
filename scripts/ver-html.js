/**
 * Revisa que Vite sirva el HTML de desarrollo (no el de produccion).
 *   node scripts/ver-html.js [ruta]
 */
const rutas = process.argv.slice(2)
if (rutas.length === 0) rutas.push('/', '/credenciales', '/informes', '/admin')

for (const ruta of rutas) {
  const r = await fetch(`http://localhost:5173${ruta}`)
  const html = await r.text()

  const esDev = html.includes('@vite/client')
  const esBuild = /src="\/assets\/index-[A-Za-z0-9_-]+\.js"/.test(html)

  console.log(
    `${ruta.padEnd(16)} HTTP ${r.status} | ` +
      `${esDev ? 'DEV OK' : 'PROBLEMA'} | ` +
      `main.jsx: ${html.includes('/src/main.jsx') ? 'si' : 'NO'} | ` +
      `${esBuild ? 'sirve el BUILD (mal)' : ''}`
  )
}