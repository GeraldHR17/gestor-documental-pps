import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

function leerVersionAplicacion(): string {
  try {
    const paquete = JSON.parse(
      readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
    ) as { version?: string }
    return paquete.version ?? 'sin-datos'
  } catch {
    return 'sin-datos'
  }
}

function leerCommitAplicacion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || 'sin-datos'
  } catch {
    return 'sin-datos'
  }
}

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
    define: {
      __VERSION_APLICACION__: JSON.stringify(leerVersionAplicacion()),
      __COMMIT_APLICACION__: JSON.stringify(leerCommitAplicacion()),
      __FECHA_COMPILACION__: JSON.stringify(new Date().toISOString()),
    },
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
