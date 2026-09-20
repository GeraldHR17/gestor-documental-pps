// src/types/catalogo.types.ts

export type EstadoCatalogo = 'ACTIVO' | 'INACTIVO';

/**
 * Fila de los tres catálogos planos. El backend expone `id` a secas (y no
 * `idTipoDocumento` / `idDependencia` / `idEtiqueta`) justamente para que
 * una sola vista y un solo formulario puedan atender a los tres.
 */
export interface CatalogoDto {
  id: number;
  nombre: string;
  /** Siempre `null` en etiquetas: esa tabla no tiene la columna. */
  descripcion: string | null;
  estado: EstadoCatalogo;
}

export interface GuardarCatalogoDto {
  nombre: string;
  descripcion?: string;
}

export interface FiltrosCatalogoDto {
  nombre?: string;
  estado?: EstadoCatalogo;
}

// ---------- Categorías ITSP ----------

export interface CategoriaItspDto {
  id: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  /** 1 = categoría raíz, 2 = subsección. Lo deriva el backend del padre. */
  nivel: number;
  orden: number;
  estado: EstadoCatalogo;
  idCategoriaPadre: number | null;
  nombreCategoriaPadre: string | null;
}

/** Nodo de `GET /categorias-itsp/arbol`: raíces con sus subsecciones anidadas. */
export interface CategoriaItspNodoArbolDto {
  id: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  orden: number;
  estado: EstadoCatalogo;
  hijos: CategoriaItspNodoArbolDto[];
}

export interface GuardarCategoriaItspDto {
  nombre: string;
  codigo?: string;
  descripcion?: string;
  /** `null` = categoría raíz. */
  idCategoriaPadre?: number | null;
  orden?: number;
}
