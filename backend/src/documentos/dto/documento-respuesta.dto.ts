// src/documentos/dto/documento-respuesta.dto.ts
//
// Forma de salida de los documentos. Se aplana a propósito: la tabla del
// listado necesita el nombre de la categoría y del tipo, no sus entidades
// completas, y devolverlas enteras arrastraría columnas que la vista no usa
// (y, en el caso de `usuarios`, datos que no tiene por qué ver).

import type { EstadoDocumento } from './filtros-documentos.dto';

/** Par id/nombre de las etiquetas asociadas (N:M). */
export class ReferenciaCatalogoDto {
  id: number;
  nombre: string;

  constructor(datos: ReferenciaCatalogoDto) {
    Object.assign(this, datos);
  }
}

export class VersionDocumentoRespuestaDto {
  id: number;
  numeroVersion: number;
  /** El nombre que subió la persona. El de disco (UUID) nunca sale de la API. */
  nombreArchivoOriginal: string;
  hashArchivo: string;
  algoritmoHash: string;
  /** Se expone como número: la columna es BIGINT y TypeORM la entrega como string. */
  tamanoBytes: number;
  mimeType: string;
  /** `null` si el PDF no se pudo interpretar al cargarlo. */
  numeroPaginas: number | null;
  comentarioVersion: string | null;
  fechaCarga: Date;
  idUsuarioCarga: number;
  nombreUsuarioCarga: string | null;
  /** La de mayor `numeroVersion` es la vigente (VP-05). */
  esVigente: boolean;

  constructor(datos: VersionDocumentoRespuestaDto) {
    Object.assign(this, datos);
  }
}

export class DocumentoRespuestaDto {
  id: number;
  titulo: string;
  descripcion: string | null;
  anio: number;
  estado: EstadoDocumento;
  fechaPublicacion: Date | null;
  fechaCreacion: Date;
  fechaActualizacion: Date;

  idCategoriaItsp: number;
  nombreCategoriaItsp: string;
  /** Raíz de la categoría; `null` cuando la propia categoría ya es raíz. */
  nombreCategoriaRaiz: string | null;
  /**
   * Nombres de sus categorías superiores, de la raíz al padre; vacío si
   * la propia categoría es raíz. Con N niveles el detalle muestra la ruta
   * completa (spec-ajustes-niveles-y-estados D-8).
   */
  rutaCategoria: string[];

  idTipoDocumento: number;
  nombreTipoDocumento: string;

  /** Una sola dependencia (1:N desde el pulido de Fase 6); `null` = sin asignar. */
  idDependencia: number | null;
  nombreDependencia: string | null;

  idUsuarioCreador: number;
  nombreUsuarioCreador: string | null;

  etiquetas: ReferenciaCatalogoDto[];

  cantidadVersiones: number;
  versionVigente: VersionDocumentoRespuestaDto | null;

  /**
   * Sólo lo llena el detalle (`GET /documentos/:id`). En el listado queda
   * `undefined` para no traer el historial completo de cada fila.
   */
  versiones?: VersionDocumentoRespuestaDto[];

  constructor(datos: DocumentoRespuestaDto) {
    Object.assign(this, datos);
  }
}

export class ListaPaginadaDocumentosRespuestaDto {
  datos: DocumentoRespuestaDto[];
  total: number;
  pagina: number;
  limite: number;

  constructor(datos: ListaPaginadaDocumentosRespuestaDto) {
    Object.assign(this, datos);
  }
}
