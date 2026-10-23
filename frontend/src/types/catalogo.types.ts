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
  /**
   * Lo asigna el backend (máximo + 1 de su nivel) y forma parte de la URL
   * pública: `/vista/itsp-05`. No se edita; sólo cambia cuando una
   * subsección se mueve a otra raíz.
   */
  codigo: string;
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
  codigo: string;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  orden: number;
  estado: EstadoCatalogo;
  hijos: CategoriaItspNodoArbolDto[];
}

/** Sin `codigo`: lo asigna el backend; si se enviara, lo descartaría. */
export interface GuardarCategoriaItspDto {
  nombre: string;
  descripcion?: string;
  /**
   * Al crear, `null` = categoría raíz. Al editar sólo sirve para mover una
   * subsección a otra raíz: una raíz no puede pasar a subsección ni al revés.
   */
  idCategoriaPadre?: number | null;
  orden?: number;
}

/** Respuesta de `GET /categorias-itsp/siguiente-codigo`. */
export interface SiguienteCodigoCategoriaDto {
  codigo: string;
}
