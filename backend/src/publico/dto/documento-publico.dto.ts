// src/publico/dto/documento-publico.dto.ts
//
// Forma de salida de un documento en el portal. Lista BLANCA declarada
// campo por campo (spec 8.4): NO se reutiliza DocumentoRespuestaDto
// quitándole propiedades, porque esa clase crece con la entidad y el día
// que alguien le agregue un campo interno aparecería aquí sin que nadie lo
// note.
//
// Lo que queda fuera a propósito, y por qué:
//
//   estado                         Si solo sale lo PUBLICADO, el campo sobra.
//   idUsuarioCreador / nombre...   Nombres de funcionarios: dato personal
//                                  innecesario para el ciudadano.
//   rutaArchivo, nombreArchivoSistema
//                                  Revelan la disposición del almacenamiento
//                                  y el UUID del archivo en disco.
//   hashArchivo, algoritmoHash     Dato de integridad interno. El hash sí
//                                  viaja en la cabecera ETag del PDF, que es
//                                  otra cosa y está razonado en 12.4.
//   idCategoriaItsp, idTipoDocumento, idDependencia
//                                  Identificadores internos: el público
//                                  recibe nombres.
//   fechaCreacion, fechaActualizacion
//                                  Revelan el ritmo de trabajo interno.
//   cantidadVersiones, versiones[], numeroVersion
//                                  El público ve un documento, no su
//                                  historial.
//   nombreArchivoOriginal          Puede arrastrar nombres internos del
//                                  estilo "borrador_final_v3.pdf".

export class DocumentoPublicoDto {
  /**
   * Identificador numérico del documento. Es interno, pero se expone porque
   * no hay otra clave estable publicable y hace falta para construir los
   * enlaces de ver y descargar. Que sea correlativo y enumerable está
   * aceptado y razonado en el spec 12.3: recorrerlo solo devuelve lo que ya
   * es público, y un 404 indistinguible para todo lo demás.
   */
  id: number;
  titulo: string;
  descripcion: string | null;
  anio: number;
  /** Serializa como ISO-8601. `null` solo si la fila se editó a mano. */
  fechaPublicacion: Date | null;
  /** Nombre del tipo documental, no su id. */
  tipoDocumento: string;
  /** Nombre de la dependencia; `null` cuando el documento no tiene. */
  dependencia: string | null;
  /** De la versión vigente. `null` si el PDF no se pudo interpretar al cargarlo. */
  numeroPaginas: number | null;
  /** De la versión vigente, como número: la columna es BIGINT y TypeORM la da como texto. */
  tamanoBytes: number;
  /** Solo los nombres: el público no necesita los identificadores. */
  etiquetas: string[];

  constructor(datos: DocumentoPublicoDto) {
    Object.assign(this, datos);
  }
}

/**
 * Misma envoltura de paginación que el listado interno
 * (`ListaPaginadaDocumentosRespuestaDto`), a propósito: no tiene sentido
 * que el proyecto tenga dos convenciones distintas para lo mismo.
 */
export class ListaPaginadaDocumentosPublicosDto {
  datos: DocumentoPublicoDto[];
  total: number;
  pagina: number;
  limite: number;

  constructor(datos: ListaPaginadaDocumentosPublicosDto) {
    Object.assign(this, datos);
  }
}
