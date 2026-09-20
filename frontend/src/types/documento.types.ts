// src/types/documento.types.ts

export type EstadoDocumento = 'BORRADOR' | 'PUBLICADO' | 'INACTIVO';

/** Par id/nombre de las etiquetas asociadas a un documento. */
export interface ReferenciaCatalogoDto {
  id: number;
  nombre: string;
}

export interface VersionDocumentoDto {
  id: number;
  numeroVersion: number;
  /** El nombre con el que se subió; el nombre real en disco nunca sale de la API. */
  nombreArchivoOriginal: string;
  hashArchivo: string;
  algoritmoHash: string;
  tamanoBytes: number;
  mimeType: string;
  /** `null` si el servidor no pudo interpretar el PDF al cargarlo. */
  numeroPaginas: number | null;
  comentarioVersion: string | null;
  fechaCarga: string;
  idUsuarioCarga: number;
  nombreUsuarioCarga: string | null;
  esVigente: boolean;
}

export interface DocumentoDto {
  id: number;
  titulo: string;
  descripcion: string | null;
  anio: number;
  estado: EstadoDocumento;
  fechaPublicacion: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;

  idCategoriaItsp: number;
  nombreCategoriaItsp: string;
  /** Raíz de la categoría; `null` cuando la categoría ya es una raíz. */
  nombreCategoriaRaiz: string | null;

  idTipoDocumento: number;
  nombreTipoDocumento: string;

  /** Una sola dependencia (decisión del PO); `null` = sin asignar. */
  idDependencia: number | null;
  nombreDependencia: string | null;

  idUsuarioCreador: number;
  nombreUsuarioCreador: string | null;

  etiquetas: ReferenciaCatalogoDto[];

  cantidadVersiones: number;
  versionVigente: VersionDocumentoDto | null;
  /** Sólo lo trae el detalle (`GET /documentos/:id`), no el listado. */
  versiones?: VersionDocumentoDto[];
}

export interface FiltrosDocumentosDto {
  texto?: string;
  idCategoriaItsp?: number;
  idTipoDocumento?: number;
  idDependencia?: number;
  idEtiqueta?: number;
  anio?: number;
  estado?: EstadoDocumento;
  pagina?: number;
  limite?: number;
}

export interface ListaPaginadaDocumentos {
  datos: DocumentoDto[];
  total: number;
  pagina: number;
  limite: number;
}

/** Metadatos del formulario, sin el archivo: ese viaja aparte, como File. */
export interface MetadatosDocumentoDto {
  titulo: string;
  descripcion?: string;
  anio: number;
  idCategoriaItsp: number;
  idTipoDocumento: number;
  /** `null` = sin dependencia. Al registrar, omitirla precarga la del usuario. */
  idDependencia: number | null;
  etiquetas: number[];
}

/** Opciones del registro (asistente de 3 pasos). */
export interface OpcionesRegistroDocumento {
  /** "Confirmar y publicar": registra y publica en una sola operación. */
  publicarInmediatamente?: boolean;
}
