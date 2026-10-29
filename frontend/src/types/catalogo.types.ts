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
   * Lo asigna el backend (código del padre + "-MM") y forma parte de la URL
   * pública: `/vista/itsp-05`. No se edita; sólo cambia cuando la categoría
   * o una superior se mueve de lugar.
   */
  codigo: string;
  nombre: string;
  descripcion: string | null;
  /** 1 = categoría raíz, hasta PROFUNDIDAD_MAXIMA_CATEGORIAS. Lo deriva el backend del padre. */
  nivel: number;
  orden: number;
  estado: EstadoCatalogo;
  idCategoriaPadre: number | null;
  nombreCategoriaPadre: string | null;
}

/** Nodo de `GET /categorias-itsp/arbol`: raíces con sus subcategorías anidadas, a cualquier profundidad. */
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
   * Al crear, `null` = categoría raíz. Al editar sirve para mover una
   * subcategoría (con su subárbol) bajo otra categoría: una raíz no puede
   * pasar a subcategoría ni al revés.
   */
  idCategoriaPadre?: number | null;
  orden?: number;
}

/** Respuesta de `GET /categorias-itsp/siguiente-codigo`. */
export interface SiguienteCodigoCategoriaDto {
  codigo: string;
}
