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
// - Cualquier otro nivel: código de su padre en mayúsculas + `-MM` (D-3).
//   Desde spec-ajustes-niveles-y-estados el padre puede estar a cualquier
//   profundidad, no solo ser una raíz.
// - Dos dígitos como mínimo; desde 100 el número crece sin relleno (D-4).
// - Lo que no casa con el patrón (huecos, textos libres de antes) se
//   ignora: no rompe el cálculo ni se reescribe.

export const PREFIJO_CODIGO_RAIZ = 'ITSP';

const PATRON_RAIZ = /^IT(?:SP|PS)-(\d{2,})$/i;

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patronHija(codigoPadre: string): RegExp {
  return new RegExp(`^${escaparRegex(codigoPadre.trim())}-(\\d{2,})$`, 'i');
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
 * @param codigoPadre Código actual del padre, tal como está guardado.
 * @param codigosDeHijas Códigos de todas sus hijas, activas e inactivas.
 */
export function siguienteCodigoHija(
  codigoPadre: string,
  codigosDeHijas: ReadonlyArray<string | null>,
): string {
  const maximo = maximoReconocido(codigosDeHijas, patronHija(codigoPadre));
  return `${codigoPadre.trim().toUpperCase()}-${formatearNumero(maximo + 1)}`;
}

/** Descendiente de la categoría movida, tal como está antes de moverla. */
export interface DescendienteARecodificar {
  id: number;
  idPadre: number;
  codigo: string;
}

/**
 * Códigos nuevos del subárbol de una categoría movida
 * (spec-ajustes-niveles-y-estados, C-8).
 *
 * - Un descendiente REGULAR (su código es el de su padre + `-MM`) conserva
 *   su sufijo: `ITSP-01-02-03` bajo `ITSP-01-02`, movido este a
 *   `ITSP-04-05`, pasa a `ITSP-04-05-03`. Así cada hoja sigue siendo "la
 *   tercera" de su rama y la estructura se lee igual.
 * - Uno IRREGULAR toma el máximo + 1 bajo su padre ya recodificado,
 *   contando a sus hermanas regulares. Por eso, por cada padre, primero se
 *   resuelven las regulares y después las irregulares: si no, una
 *   irregular podría quedarse con un número que una regular conserva.
 *
 * @param idMovida Id de la categoría movida.
 * @param codigoAnterior Su código antes de moverla.
 * @param codigoNuevo El que acaba de recibir bajo su padre nuevo.
 * @param descendientes Su subárbol en preorden (cada padre antes que sus hijos).
 * @returns El código nuevo de cada descendiente, por id.
 */
export function recodificarSubarbol(
  idMovida: number,
  codigoAnterior: string,
  codigoNuevo: string,
  descendientes: readonly DescendienteARecodificar[],
): Map<number, string> {
  const anteriores = new Map<number, string>([
    [idMovida, codigoAnterior.trim()],
  ]);
  const nuevos = new Map<number, string>([[idMovida, codigoNuevo]]);
  const hijasPorPadre = new Map<number, DescendienteARecodificar[]>();
  for (const descendiente of descendientes) {
    anteriores.set(descendiente.id, descendiente.codigo.trim());
    const hermanas = hijasPorPadre.get(descendiente.idPadre) ?? [];
    hermanas.push(descendiente);
    hijasPorPadre.set(descendiente.idPadre, hermanas);
  }

  // Recorrido por niveles desde la movida: cuando se resuelven las hijas
  // de un padre, el código nuevo de ese padre ya se conoce.
  const pendientes = [idMovida];
  while (pendientes.length > 0) {
    const idPadre = pendientes.shift() as number;
    const hijas = hijasPorPadre.get(idPadre) ?? [];
    const padreAnterior = anteriores.get(idPadre) as string;
    const padreNuevo = (nuevos.get(idPadre) as string).toUpperCase();
    const patron = patronHija(padreAnterior);

    const irregulares: DescendienteARecodificar[] = [];
    const asignados: string[] = [];
    for (const hija of hijas) {
      const coincidencia = patron.exec(hija.codigo.trim());
      if (coincidencia) {
        const codigo = `${padreNuevo}-${coincidencia[1]}`;
        nuevos.set(hija.id, codigo);
        asignados.push(codigo);
      } else {
        irregulares.push(hija);
      }
    }
    for (const hija of irregulares) {
      const codigo = siguienteCodigoHija(padreNuevo, asignados);
      nuevos.set(hija.id, codigo);
      asignados.push(codigo);
    }

    pendientes.push(...hijas.map((hija) => hija.id));
  }

  nuevos.delete(idMovida);
  return nuevos;
}
