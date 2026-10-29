// src/catalogos/jerarquia-categorias.spec.ts
//
// Funciones puras de spec-ajustes-niveles-y-estados §7.4: ancestros,
// profundidad, altura, estado efectivo y exclusión por cadena de
// ancestros.

import {
  JerarquiaCategorias,
  type NodoCategoria,
} from './jerarquia-categorias';

function nodo(
  idCategoriaItsp: number,
  idCategoriaPadre: number | null,
  codigo: string,
  datos: Partial<NodoCategoria> = {},
): NodoCategoria {
  return {
    idCategoriaItsp,
    idCategoriaPadre,
    codigo,
    nombre: codigo,
    estado: 'ACTIVO',
    orden: 0,
    ...datos,
  };
}

// 1 ITSP-01 > 2 ITSP-01-01 > 3 ITSP-01-01-01 > 4 ITSP-01-01-01-01
//                         > 5 ITSP-01-01-02
// 9 ITSP-03 (Participación ciudadana) > 10 ITSP-03-01 > 11 ITSP-03-01-01
const ARBOL = [
  nodo(1, null, 'ITSP-01'),
  nodo(2, 1, 'ITSP-01-01'),
  nodo(3, 2, 'ITSP-01-01-01', { orden: 1 }),
  nodo(4, 3, 'ITSP-01-01-01-01'),
  nodo(5, 2, 'ITSP-01-01-02', { orden: 2 }),
  nodo(9, null, 'ITSP-03'),
  nodo(10, 9, 'ITSP-03-01'),
  nodo(11, 10, 'ITSP-03-01-01'),
];

describe('JerarquiaCategorias', () => {
  const jerarquia = new JerarquiaCategorias(ARBOL);

  it('ancestros: de la raíz al padre, sin el propio nodo', () => {
    expect(jerarquia.ancestros(4).map((n) => n.idCategoriaItsp)).toEqual([
      1, 2, 3,
    ]);
    expect(jerarquia.ancestros(1)).toEqual([]);
  });

  it('profundidad y raíz salen de la cadena de padres', () => {
    expect(jerarquia.profundidad(4)).toBe(4);
    expect(jerarquia.raizDe(4)?.idCategoriaItsp).toBe(1);
    expect(jerarquia.raizDe(1)?.idCategoriaItsp).toBe(1);
  });

  it('descendientes en preorden y altura del subárbol', () => {
    expect(jerarquia.descendientes(2).map((n) => n.idCategoriaItsp)).toEqual([
      3, 4, 5,
    ]);
    expect(jerarquia.altura(2)).toBe(3);
    expect(jerarquia.altura(4)).toBe(1);
  });

  it('estaEnSubarbol detecta el propio nodo y sus descendientes', () => {
    expect(jerarquia.estaEnSubarbol(4, 2)).toBe(true);
    expect(jerarquia.estaEnSubarbol(2, 2)).toBe(true);
    expect(jerarquia.estaEnSubarbol(1, 2)).toBe(false);
  });

  it('estado efectivo: un ancestro inactivo apaga todo lo que cuelga de él', () => {
    const conInactivo = new JerarquiaCategorias(
      ARBOL.map((n) =>
        n.idCategoriaItsp === 2 ? { ...n, estado: 'INACTIVO' } : n,
      ),
    );

    expect(conInactivo.efectivamenteActiva(4)).toBe(false);
    expect(conInactivo.efectivamenteActiva(2)).toBe(false);
    expect(conInactivo.efectivamenteActiva(1)).toBe(true);
  });

  it('exclusión de Participación ciudadana a cualquier profundidad, por ancestros', () => {
    expect(jerarquia.enSubarbolExcluido(9)).toBe(true);
    expect(jerarquia.enSubarbolExcluido(11)).toBe(true);
    expect(jerarquia.enSubarbolExcluido(4)).toBe(false);
  });

  it('la exclusión no depende del prefijo del código', () => {
    // Una subcategoría de ITSP-03 con un código irregular sigue excluida;
    // un código que empieza por ITSP-03 fuera de su rama, no.
    const irregulares = new JerarquiaCategorias([
      ...ARBOL,
      nodo(12, 10, 'SIN-PREFIJO'),
      nodo(13, 1, 'ITSP-03-99'),
    ]);

    expect(irregulares.enSubarbolExcluido(12)).toBe(true);
    expect(irregulares.enSubarbolExcluido(13)).toBe(false);
  });

  it('orden de despliegue: cada nodo seguido de su subárbol, y los huérfanos al final', () => {
    const conHuerfano = new JerarquiaCategorias([
      ...ARBOL,
      nodo(20, 999, 'HUERFANA'),
    ]);

    expect(
      conHuerfano.ordenDeDespliegue().map((n) => n.idCategoriaItsp),
    ).toEqual([1, 2, 3, 4, 5, 9, 10, 11, 20]);
  });

  it('un ciclo metido a mano en la base no cuelga los recorridos', () => {
    const conCiclo = new JerarquiaCategorias([
      nodo(1, 2, 'A'),
      nodo(2, 1, 'B'),
    ]);

    expect(conCiclo.ancestros(1).length).toBeLessThanOrEqual(2);
    expect(conCiclo.descendientes(1).length).toBeLessThanOrEqual(1);
    expect(conCiclo.ordenDeDespliegue()).toHaveLength(2);
  });
});
