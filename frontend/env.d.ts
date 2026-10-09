/// <reference types="vite/client" />

// Declaración explícita de las variables de entorno del proyecto. Sin
// esto `import.meta.env.VITE_*` queda tipado como `any` por la firma
// genérica de vite/client, y un nombre mal escrito no se detecta hasta
// que algo falla en el navegador.
interface ImportMetaEnv {
  /**
   * Ruta pública bajo la que Apache sirve el frontend, por ejemplo
   * `/munipalmares/wp-munidata/`. La consume vite.config.ts para fijar
   * `base`; el resto del código la lee ya resuelta en `BASE_URL`.
   */
  readonly VITE_RUTA_BASE?: string;

  /**
   * URL base de la API. En producción es relativa al mismo origen
   * (`/munipalmares/wp-munidata/api`), nunca con dominio ni IP.
   */
  readonly VITE_URL_API?: string;

  /** Nombre anterior de `VITE_URL_API`; se sigue aceptando. */
  readonly VITE_API_URL?: string;

  /**
   * Portal público de transparencia (WordPress), sistema externo. Si está
   * vacía, la pantalla de Inicio oculta el botón que enlaza hacia él.
   */
  readonly VITE_URL_PORTAL_PUBLICO?: string;

  /** Ruta base ya resuelta por Vite a partir de `base`. */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
