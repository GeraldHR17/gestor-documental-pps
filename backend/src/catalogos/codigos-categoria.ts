// src/catalogos/codigos-categoria.ts
//
// Cálculo del código de una categoría ITSP. El código ya no lo escribe la
// persona: lo asigna el sistema como "máximo + 1" dentro de su nivel
// (spec-ajustes-posdespliegue §7.1). Son funciones puras, sin acceso a la
// base, para poder probarlas aparte y para que la migración
// 10-codigos-categorias-autogenerados.sql replique exactamente la misma
// regla.
//
// - Raíz: `ITSP-NN`. Para el máximo se reconocen también los `ITPS-NN`
//   (la errata del encargo, D-2): si ya existiera `ITPS-05` y se ignorara,
//   la siguiente raíz sería `ITSP-05` y habría dos "secciones 05".
// - Subsección: código de su raíz en mayúsculas + `-MM` (D-3).
// - Dos dígitos como mínimo; desde 100 el número crece sin relleno (D-4).
// - Lo que no casa con el patrón (huecos, textos libres de antes) se
//   ignora: no rompe el cálculo ni se reescribe.

export const PREFIJO_CODIGO_RAIZ = 'ITSP';

const PATRON_RAIZ = /^IT(?:SP|PS)-(\d{2,})$/i;

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patronHija(codigoRaiz: string): RegExp {
  return new RegExp(`^${escaparRegex(codigoRaiz.trim())}-(\\d{2,})$`, 'i');
}

export function formatearNumero(numero: number): string {
  return String(numero).padStart(2, '0');
}

/** Mayor número reconocido por el patrón, o 0 si no hay ninguno. */
function maximoReconocido(
  codigos: ReadonlyArray<string | null>,
  patron: RegExp,
): number {
  let maximo = 0;
  for (const codigo of codigos) {
    const coincidencia = patron.exec((codigo ?? '').trim());
    if (coincidencia) {
      maximo = Math.max(maximo, Number(coincidencia[1]));
    }
  }
  return maximo;
}

/** @param codigosDeRaices Códigos de todas las raíces, activas e inactivas. */
export function siguienteCodigoRaiz(
  codigosDeRaices: ReadonlyArray<string | null>,
): string {
  const maximo = maximoReconocido(codigosDeRaices, PATRON_RAIZ);
  return `${PREFIJO_CODIGO_RAIZ}-${formatearNumero(maximo + 1)}`;
}

/**
 * @param codigoRaiz Código actual de la raíz, tal como está guardado.
 * @param codigosDeHijas Códigos de todas sus subsecciones, activas e inactivas.
 */
export function siguienteCodigoHija(
  codigoRaiz: string,
  codigosDeHijas: ReadonlyArray<string | null>,
): string {
  const maximo = maximoReconocido(codigosDeHijas, patronHija(codigoRaiz));
  return `${codigoRaiz.trim().toUpperCase()}-${formatearNumero(maximo + 1)}`;
}
