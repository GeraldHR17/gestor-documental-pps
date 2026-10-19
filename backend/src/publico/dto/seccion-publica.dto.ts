// src/publico/dto/seccion-publica.dto.ts
//
// Forma de salida del árbol ITSP en el portal. Lista BLANCA: los campos se
// declaran uno a uno y no se parte de CategoriaItspNodoArbolDto quitando
// propiedades. Una lista negra se rompe sola en cuanto alguien agrega una
// columna a la entidad, y aquí lo que se rompería es hacia Internet.
//
// Fuera quedan `id`, `nivel`, `estado`, `idCategoriaPadre`, `fechaCreacion`
// y `fechaActualizacion`: son internos y el público no los necesita para
// nada (spec 8.4).

/** Subsección: una hoja del árbol, sin hijos. */
export class SubseccionPublicaDto {
  /** El `codigo` de la base, siempre en minúsculas: es lo que va en la URL. */
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  /** Documentos en estado PUBLICADO que cuelgan de esta subsección. */
  cantidadDocumentos: number;

  constructor(datos: SubseccionPublicaDto) {
    Object.assign(this, datos);
  }
}

/** Sección: una de las cuatro raíces del índice ITSP. */
export class SeccionPublicaDto {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  /**
   * Suma de los documentos de sus subsecciones activas MÁS los que cuelgan
   * directamente de la raíz. Esto último no es defensivo: el modelo permite
   * clasificar en una raíz (ver el comentario de PortalPublicoService), y
   * esos documentos son alcanzables por
   * `GET /publico/secciones/:codigo/documentos`.
   */
  cantidadDocumentos: number;
  subsecciones: SubseccionPublicaDto[];

  constructor(datos: SeccionPublicaDto) {
    Object.assign(this, datos);
  }
}
