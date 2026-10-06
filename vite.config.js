import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Escucha en la red local para poder probar la credencial desde el
    // celular, sin esto Vite solo acepta conexiones del mismo computador.
    host: true,
    proxy: {
      // El frontend llama a /api y Vite lo reenvia al servidor Node + SQLite
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // La pagina de la credencial (/cred/CODIGO) la arma el servidor, no
      // React. En produccion vive en el mismo origen, asi que el link de
      // WhatsApp sirve igual en los dos casos.
      //
      // OJO: la clave debe ser una expresion regular con /^ y barra al final.
      // Con '/cred' Vite hace prefijo y se tragaria tambien /credenciales,
      // que es una pagina del panel y no de la credencial.
      '^/cred/': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
