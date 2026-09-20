// src/catalogos/dto/categoria-itsp-respuesta.dto.ts

/** Fila de la lista plana. Ya viene ordenada para pintarse con indentación. */
export class CategoriaItspRespuestaDto {
  id: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  orden: number;
  estado: 'ACTIVO' | 'INACTIVO';
  idCategoriaPadre: number | null;
  /** Nombre de la raíz a la que pertenece; `null` si la categoría es raíz. */
  nombreCategoriaPadre: string | null;

  constructor(datos: CategoriaItspRespuestaDto) {
    Object.assign(this, datos);
  }
}

/**
 * Nodo del árbol de `GET /categorias-itsp/arbol`: raíces con sus
 * subsecciones ya anidadas. Existe para que los selects en cascada del
 * formulario de documentos (Fase 6) consuman este endpoint tal cual, sin
 * tener que reagrupar una lista plana en el cliente.
 */
export class CategoriaItspNodoArbolDto {
  id: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  nivel: number;
  orden: number;
  estado: 'ACTIVO' | 'INACTIVO';
  hijos: CategoriaItspNodoArbolDto[];

  constructor(datos: CategoriaItspNodoArbolDto) {
    Object.assign(this, datos);
  }
}
