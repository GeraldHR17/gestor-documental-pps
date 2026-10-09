import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `loadEnv` con prefijo vacío lee el .env correspondiente al modo
  // (.env.production en el build de producción). Hace falta porque
  // `import.meta.env` no existe todavía cuando se evalúa esta
  // configuración: aquí sólo hay Node.
  const entorno = loadEnv(mode, process.cwd(), '')

  // Ruta pública bajo la que Apache sirve el frontend, por ejemplo
  // /munipalmares/wp-munidata/. Vite la usa para prefijar todas las URL
  // de los assets generados y para alimentar `import.meta.env.BASE_URL`,
  // que es lo que consume el router. En desarrollo queda en '/'.
  //
  // Nunca se escribe fija aquí: la carpeta de publicación la decide quien
  // administra el servidor, y en otro entorno será otra.
  const rutaBase = entorno.VITE_RUTA_BASE?.trim() || '/'

  return {
    base: rutaBase,
    plugins: [
      vue(),
      vueDevTools(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
