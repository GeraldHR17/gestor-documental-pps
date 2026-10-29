// src/lib/categorias.ts
//
// Jerarquía de categorías ITSP en el navegador: el espejo de
// backend/src/catalogos/jerarquia-categorias.ts. Desde
// spec-ajustes-niveles-y-estados las categorías admiten hasta
// PROFUNDIDAD_MAXIMA_CATEGORIAS niveles, y varias pantallas necesitan las
// mismas preguntas sobre el árbol: la ruta completa para mostrarla, los
// descendientes para no ofrecerlos como padre, el estado efectivo y si una
// rama pertenece a Participación ciudadana.
//
// Son funciones puras sobre una lista plana (decenas de filas). Las reglas
// las impone también el backend; aquí solo sirven para no ofrecer en
// pantalla lo que el servidor va a rechazar.

import { CODIGO_CATEGORIA_RAIZ_EXCLUIDA } from '@/lib/documentos.config';
import type { CategoriaItspNodoArbolDto } from '@/types/catalogo.types';

/** Lo mínimo que hace falta de una categoría para razonar sobre el árbol. */
export interface CategoriaEnJerarquia {
  id: number;
  idCategoriaPadre: number | null;
  codigo: string;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO';
  orden: number;
}

/** Separador de la ruta que se muestra: «Raíz › Subsección › Nodo». */
export const SEPARADOR_RUTA = ' › ';

/** Pasa el árbol de `GET /categorias-itsp/arbol` a lista plana con el padre de cada nodo. */
export function aplanarArbol(arbol: CategoriaItspNodoArbolDto[]): CategoriaEnJerarquia[] {
  const resultado: CategoriaEnJerarquia[] = [];
  const recorrer = (nodos: CategoriaItspNodoArbolDto[], idPadre: number | null): void => {
    for (const nodo of nodos) {
      resultado.push({
        id: nodo.id,
        idCategoriaPadre: idPadre,
        codigo: nodo.codigo,
        nombre: nodo.nombre,
        estado: nodo.estado,
        orden: nodo.orden,
      });
      recorrer(nodo.hijos, nodo.id);
    }
  };
  recorrer(arbol, null);
  return resultado;
}

export class JerarquiaCategorias<T extends CategoriaEnJerarquia> {
  private readonly porId: Map<number, T>;
  private readonly hijosPorPadre: Map<number | null, T[]>;

  constructor(private readonly categorias: readonly T[]) {
    this.porId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
    this.hijosPorPadre = new Map();
    for (const categoria of categorias) {
      const hermanas = this.hijosPorPadre.get(categoria.idCategoriaPadre) ?? [];
      hermanas.push(categoria);
      this.hijosPorPadre.set(categoria.idCategoriaPadre, hermanas);
    }
    for (const hermanas of this.hijosPorPadre.values()) {
      hermanas.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
    }
  }

  obtener(id: number | null | undefined): T | undefined {
    return id === null || id === undefined ? undefined : this.porId.get(id);
  }

  /** Raíces (sin padre), por `orden` y nombre. */
  raices(): T[] {
    return [...(this.hijosPorPadre.get(null) ?? [])];
  }

  hijos(id: number): T[] {
    return [...(this.hijosPorPadre.get(id) ?? [])];
  }

  tieneHijos(id: number): boolean {
    return (this.hijosPorPadre.get(id)?.length ?? 0) > 0;
  }

  /** Ancestros de la raíz al padre. El corte evita colgarse con un ciclo metido a mano. */
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

  /** 1 = raíz. */
  profundidad(id: number): number {
    return this.ancestros(id).length + 1;
  }

  /** Nombres de la raíz al propio nodo. */
  ruta(id: number): string[] {
    const nodo = this.porId.get(id);
    return nodo ? [...this.ancestros(id).map((a) => a.nombre), nodo.nombre] : [];
  }

  rutaComoTexto(id: number): string {
    return this.ruta(id).join(SEPARADOR_RUTA);
  }

  /** Descendientes en preorden, sin el propio nodo. */
  descendientes(id: number): T[] {
    const resultado: T[] = [];
    const visitados = new Set<number>([id]);
    const pendientes = [...this.hijos(id)].reverse();
    while (pendientes.length > 0) {
      const actual = pendientes.pop() as T;
      if (visitados.has(actual.id)) continue;
      visitados.add(actual.id);
      resultado.push(actual);
      pendientes.push(...[...this.hijos(actual.id)].reverse());
    }
    return resultado;
  }

  /** Niveles que ocupa el subárbol contando el propio nodo (una hoja = 1). */
  altura(id: number): number {
    const base = this.profundidad(id);
    return this.descendientes(id).reduce(
      (maxima, descendiente) => Math.max(maxima, this.profundidad(descendiente.id) - base + 1),
      1,
    );
  }

  /** ¿`posible` es `id` o está dentro de su subárbol? */
  estaEnSubarbol(posible: number, id: number): boolean {
    return posible === id || this.ancestros(posible).some((ancestro) => ancestro.id === id);
  }

  /** Activa ella y todas sus superiores (spec D-5). */
  efectivamenteActiva(id: number): boolean {
    const nodo = this.porId.get(id);
    if (!nodo || nodo.estado !== 'ACTIVO') return false;
    return this.ancestros(id).every((ancestro) => ancestro.estado === 'ACTIVO');
  }

  /** Activa ella misma, pero con alguna superior inactiva. */
  inactivaPorSuperior(id: number): boolean {
    return this.porId.get(id)?.estado === 'ACTIVO' && !this.efectivamenteActiva(id);
  }

  /** Su rama cuelga de Participación ciudadana (por ancestros, no por prefijo). */
  enSubarbolExcluido(id: number): boolean {
    const raiz = this.ancestros(id)[0] ?? this.porId.get(id);
    return raiz?.codigo.trim().toUpperCase() === CODIGO_CATEGORIA_RAIZ_EXCLUIDA;
  }

  /** Cada raíz seguida de su subárbol, y al final lo que no cuelga de ninguna raíz. */
  ordenDeDespliegue(): T[] {
    const ordenadas: T[] = [];
    for (const raiz of this.raices()) {
      ordenadas.push(raiz, ...this.descendientes(raiz.id));
    }
    const incluidas = new Set(ordenadas.map((categoria) => categoria.id));
    ordenadas.push(...this.categorias.filter((categoria) => !incluidas.has(categoria.id)));
    return ordenadas;
  }
}

/**
 * Compara sin distinguir mayúsculas ni tildes, para buscar «informacion» y
 * encontrar «Información».
 */
export function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
