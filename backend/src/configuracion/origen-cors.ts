// src/configuracion/origen-cors.ts
//
// Derivación del origen permitido por CORS a partir de `FRONTEND_URL`.
//
// Vive en su propio archivo, y no dentro de main.ts, porque main.ts
// arranca el servidor como efecto de importarlo: una prueba que lo
// importara levantaría la aplicación.

/**
 * Devuelve esquema + host + puerto de `FRONTEND_URL`, descartando el
 * camino.
 *
 * En producción el frontend se publica bajo una subruta
 * (`https://<host>/munipalmares/wp-munidata`), pero la cabecera
 * `Access-Control-Allow-Origin` admite únicamente un origen: si se le pasa
 * la URL completa con la subruta, el navegador la descarta y todas las
 * peticiones del frontend fallan.
 *
 * Un valor que no sea una URL analizable se devuelve tal cual, en vez de
 * lanzar: así una variable mal escrita se manifiesta como un error de CORS
 * visible en el navegador, y no como un servicio que no arranca.
 */
export function derivarOrigenPermitido(frontendUrl: string | undefined): string {
  const valor = frontendUrl?.trim();
  if (!valor) {
    return 'http://localhost:5173';
  }

  try {
    return new URL(valor).origin;
  } catch {
    return valor;
  }
}
