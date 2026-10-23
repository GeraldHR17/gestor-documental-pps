// src/lib/tema.ts
//
// Lectura y escritura del tema elegido (spec-ajustes-posdespliegue §9.3.4).
//
// Se guarda en localStorage, por navegador, con la clave `munidata-tema`, y
// solo con los valores 'claro' u 'oscuro'. Si la persona nunca eligió, no
// hay nada guardado y manda la preferencia del sistema operativo.
//
// Todo acceso a localStorage va en try/catch: con el almacenamiento
// bloqueado (navegación privada estricta, políticas de la institución)
// lanzar una excepción aquí dejaría la aplicación sin arrancar (R-9).
//
// index.html hace la misma lectura en un script en línea antes de cargar
// los estilos, para que la página no destelle en blanco al recargar; si se
// cambia la clave aquí, hay que cambiarla también allí.

import type { Tema } from '@/types/tema.types';

export const CLAVE_TEMA = 'munidata-tema';

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

function esTema(valor: unknown): valor is Tema {
  return valor === 'claro' || valor === 'oscuro';
}

/** El tema que eligió la persona en este navegador, o `null` si nunca eligió. */
export function leerTemaGuardado(): Tema | null {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    return esTema(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento la elección dura hasta recargar; no es un error.
  }
}

export function temaDelSistema(): Tema {
  return window.matchMedia?.(CONSULTA_OSCURO).matches ? 'oscuro' : 'claro';
}

/**
 * Avisa cuando cambia la preferencia del sistema operativo. Devuelve la
 * función para dejar de escuchar.
 */
export function escucharTemaDelSistema(alCambiar: (tema: Tema) => void): () => void {
  const consulta = window.matchMedia?.(CONSULTA_OSCURO);
  if (!consulta) return () => {};
  const manejador = (evento: MediaQueryListEvent): void => {
    alCambiar(evento.matches ? 'oscuro' : 'claro');
  };
  consulta.addEventListener('change', manejador);
  return () => consulta.removeEventListener('change', manejador);
}

/** Publica el tema en <html>; el CSS solo lo aplica en la superficie 'sistema'. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute('data-tema', tema);
}
