// src/lib/rutas.ts
//
// Construcción de URL del navegador que respetan la ruta base bajo la que
// se publica la aplicación.
//
// Hace falta porque en producción el frontend no vive en la raíz del host:
// Apache lo sirve bajo la ruta que indica `VITE_RUTA_BASE`, mientras que en
// desarrollo la base es `/`. Una ruta escrita a mano como `/login` funciona
// al desarrollar y apunta a una URL inexistente en producción, lo que se
// manifiesta como la página de error del servidor justo en el momento en
// que la sesión expira.
//
// El router no necesita esto: `createWebHistory(import.meta.env.BASE_URL)`
// ya le antepone la base a todas sus rutas. Esta función es para los casos
// en que hay que salir del router y hacer una navegación dura con
// `window.location`, que es lo que corresponde al abandonar la sesión:
// recarga la aplicación entera y descarta cualquier estado en memoria.

/**
 * Antepone la ruta base de la aplicación a una ruta interna.
 *
 * @param ruta Ruta sin la base, con o sin barra inicial. Puede incluir la
 *   cadena de consulta: `'login?motivo=sesion-expirada'`.
 * @returns Ruta absoluta desde la raíz del host:
 *   `/login?motivo=sesion-expirada` en desarrollo y
 *   `/munipalmares/wp-munidata/login?motivo=sesion-expirada` en producción.
 */
export function rutaConBase(ruta: string): string {
  // Vite garantiza que BASE_URL empieza y termina en '/', pero se
  // normalizan ambos extremos de todas formas: así el resultado sigue
  // siendo correcto aunque alguien escriba VITE_RUTA_BASE sin la barra
  // final, que es un error fácil de cometer y difícil de ver.
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/+$/, '')}/${ruta.replace(/^\/+/, '')}`;
}
