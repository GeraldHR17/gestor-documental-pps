// src/lib/superficie.ts
//
// "Superficie" de la página: a qué parte de la aplicación pertenece la
// ruta actual. Se publica como atributo `data-superficie` en <html> para
// que el CSS pueda pintar el fondo de html y body sin depender de qué
// componente esté montado:
//
//   portal  -> /vista/...: siempre oscuro, estilo del Observatorio.
//   publica -> login, recuperar contraseña, verificar correo.
//   sistema -> el área autenticada.
//
// index.html la fija antes de montar Vue, leyendo la URL; el router la
// mantiene al navegar dentro de la aplicación (spec-ajustes-posdespliegue
// §9.2 y §9.3.4).

import type { RouteMeta } from 'vue-router';

export type Superficie = 'portal' | 'publica' | 'sistema';

export function superficieDeRuta(meta: RouteMeta): Superficie {
  if (meta.sinSesion) return 'portal';
  if (meta.publica) return 'publica';
  return 'sistema';
}

export function aplicarSuperficie(superficie: Superficie): void {
  document.documentElement.setAttribute('data-superficie', superficie);
}
