// src/catalogos/jerarquia-categorias.ts
//
// Funciones puras sobre la jerarquía de categorías ITSP, que desde
// spec-ajustes-niveles-y-estados admite hasta PROFUNDIDAD_MAXIMA_CATEGORIAS
// niveles (§7.4). Trabajan sobre la lista plana que devuelve un `find()`
// de la tabla completa: son decenas de filas, así que el árbol se arma en
// memoria y nunca con una consulta por nivel.
//
// Las usan CategoriasItspService (árbol, profundidad, ciclos), el servicio
// de documentos (exclusión y estado efectivo al clasificar), el portal
// público (visibilidad y conteos) y los reportes (raíz real).
//
// Todos los recorridos hacia arriba se cortan tras tantos pasos como
// categorías haya: un ciclo en `id_categoria_padre` metido a mano en la
// base no puede colgar el servidor (R-3). El servicio, por su parte,
// impide crear ciclos.

import { CODIGO_CATEGORIA_RAIZ_EXCLUIDA } from '../comun/constantes/categorias-itsp';

/** Lo mínimo que hace falta de una categoría para razonar sobre el árbol. */
export interface NodoCategoria {
  idCategoriaItsp: number;
  idCategoriaPadre: number | null;
  codigo: string;
  nombre: string;
  estado: string;
  orden: number;
}

const ESTADO_ACTIVO = 'ACTIVO';

/** Índice por id y lista de hijos por padre, para no recorrer la lista en cada paso. */
export class JerarquiaCategorias<T extends NodoCategoria> {
  private readonly porId: Map<number, T>;
  private readonly hijosPorPadre: Map<number | null, T[]>;

  constructor(private readonly categorias: readonly T[]) {
    this.porId = new Map(
      categorias.map((categoria) => [categoria.idCategoriaItsp, categoria]),
    );
    this.hijosPorPadre = new Map();
    for (const categoria of categorias) {
      const hermanas = this.hijosPorPadre.get(categoria.idCategoriaPadre) ?? [];
      hermanas.push(categoria);
      this.hijosPorPadre.set(categoria.idCategoriaPadre, hermanas);
    }
    for (const hermanas of this.hijosPorPadre.values()) {
      hermanas.sort(compararPorOrden);
    }
  }

  obtener(id: number | null | undefined): T | undefined {
    return id === null || id === undefined ? undefined : this.porId.get(id);
  }

  /** Raíces (sin padre), por `orden` y nombre. */
  raices(): T[] {
    return [...(this.hijosPorPadre.get(null) ?? [])];
  }

  /** Hijos directos, activos e inactivos, por `orden` y nombre. */
  hijos(id: number): T[] {
    return [...(this.hijosPorPadre.get(id) ?? [])];
  }

  /** Ancestros de la raíz al padre (sin el propio nodo). */
  ancestros(id: number): T[] {
    const cadena: T[] = [];
    let actual = this.porId.get(id);
    for (let pasos = 0; actual && pasos < this.categorias.length; pasos++) {
      const padre = this.obtener(actual.idCategoriaPadre);
      if (!padre) break;
      cadena.unshift(padre);
      actual = padre;
    }
    return cadena;
  }

  /** La raíz de su rama; el propio nodo si es raíz. */
  raizDe(id: number): T | undefined {
    return this.ancestros(id)[0] ?? this.porId.get(id);
  }

  /** Nivel calculado desde la cadena de padres (1 = raíz). */
  profundidad(id: number): number {
    return this.ancestros(id).length + 1;
  }

  /** Descendientes en preorden (cada padre antes que sus hijos), sin el propio nodo. */
  descendientes(id: number): T[] {
    const resultado: T[] = [];
    const visitados = new Set<number>([id]);
    const pendientes = [...this.hijos(id)].reverse();
    while (pendientes.length > 0) {
      const actual = pendientes.pop() as T;
      if (visitados.has(actual.idCategoriaItsp)) continue;
      visitados.add(actual.idCategoriaItsp);
      resultado.push(actual);
      pendientes.push(...[...this.hijos(actual.idCategoriaItsp)].reverse());
    }
    return resultado;
  }

  /** Niveles que ocupa el subárbol contando el propio nodo (una hoja = 1). */
  altura(id: number): number {
    const nodo = this.porId.get(id);
    if (!nodo) return 0;
    const base = this.profundidad(id);
    let maxima = base;
    for (const descendiente of this.descendientes(id)) {
      maxima = Math.max(maxima, this.profundidad(descendiente.idCategoriaItsp));
    }
    return maxima - base + 1;
  }

  /** ¿`posibleDescendiente` está dentro del subárbol de `id` (o es él mismo)? */
  estaEnSubarbol(posibleDescendiente: number, id: number): boolean {
    if (posibleDescendiente === id) return true;
    return this.ancestros(posibleDescendiente).some(
      (ancestro) => ancestro.idCategoriaItsp === id,
    );
  }

  /**
   * Activa ella y todos sus ancestros (spec D-5). Inactivar una categoría
   * no toca el estado guardado de sus descendientes: dejan de estar
   * disponibles por esto, y vuelven tal como estaban al reactivarla.
   */
  efectivamenteActiva(id: number): boolean {
    const nodo = this.porId.get(id);
    if (!nodo || nodo.estado !== ESTADO_ACTIVO) return false;
    return this.ancestros(id).every(
      (ancestro) => ancestro.estado === ESTADO_ACTIVO,
    );
  }

  /**
   * ¿Está en el subárbol de "Participación ciudadana"? Se decide por la
   * cadena de ancestros, no por el prefijo del código: a cualquier
   * profundidad, y aunque algún código sea irregular (C-11).
   */
  enSubarbolExcluido(id: number): boolean {
    return (
      this.raizDe(id)?.codigo.trim().toUpperCase() ===
      CODIGO_CATEGORIA_RAIZ_EXCLUIDA
    );
  }

  /**
   * Lista plana en orden de despliegue: cada nodo seguido de su subárbol.
   * Las categorías que no cuelgan de ninguna raíz alcanzable (padre borrado
   * a mano en la base) se agregan al final para que sigan siendo visibles y
   * corregibles desde la administración.
   */
  ordenDeDespliegue(): T[] {
    const ordenadas: T[] = [];
    for (const raiz of this.raices()) {
      ordenadas.push(raiz, ...this.descendientes(raiz.idCategoriaItsp));
    }
    const incluidas = new Set(
      ordenadas.map((categoria) => categoria.idCategoriaItsp),
    );
    ordenadas.push(
      ...[...this.categorias]
        .filter((categoria) => !incluidas.has(categoria.idCategoriaItsp))
        .sort(compararPorOrden),
    );
    return ordenadas;
  }
}

export function compararPorOrden(a: NodoCategoria, b: NodoCategoria): number {
  return a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');
}
