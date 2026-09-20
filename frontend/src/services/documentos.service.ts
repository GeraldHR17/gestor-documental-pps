// src/services/documentos.service.ts
//
// El registro y las nuevas versiones viajan como `multipart/form-data`
// porque llevan el PDF adjunto; la edición de metadatos es JSON, ya que no
// toca el archivo.
//
// El visor y la descarga NO usan un enlace directo al endpoint: la API
// exige la cabecera Authorization y un `<iframe src>` o un `<a href>` no la
// envían. Por eso ambos piden el archivo como blob a través del cliente
// HTTP —que sí adjunta el token y sabe renovarlo— y el blob resultante es
// lo que se muestra o se guarda.

import clienteHttp from '@/lib/http';
import type {
  DocumentoDto,
  EstadoDocumento,
  FiltrosDocumentosDto,
  ListaPaginadaDocumentos,
  MetadatosDocumentoDto,
  OpcionesRegistroDocumento,
  VersionDocumentoDto,
} from '@/types/documento.types';

/**
 * `multipart/form-data` no tiene tipos: todo se serializa como texto. Las
 * listas se envían como campo repetido, que es la forma que el DTO del
 * backend interpreta sin ambigüedad.
 */
function construirFormulario(
  datos: MetadatosDocumentoDto,
  archivo: File,
  opciones: OpcionesRegistroDocumento,
): FormData {
  const formulario = new FormData();
  formulario.append('titulo', datos.titulo);
  if (datos.descripcion) formulario.append('descripcion', datos.descripcion);
  formulario.append('anio', String(datos.anio));
  formulario.append('idCategoriaItsp', String(datos.idCategoriaItsp));
  formulario.append('idTipoDocumento', String(datos.idTipoDocumento));

  // Sólo se envía si hay valor: omitirla es lo que hace que el servidor
  // precargue la dependencia del usuario autenticado.
  if (datos.idDependencia !== null) {
    formulario.append('idDependencia', String(datos.idDependencia));
  }
  if (opciones.publicarInmediatamente) {
    formulario.append('publicarInmediatamente', 'true');
  }
  for (const idEtiqueta of datos.etiquetas) {
    formulario.append('etiquetas', String(idEtiqueta));
  }

  formulario.append('archivo', archivo);
  return formulario;
}

export default {
  async listar(filtros: FiltrosDocumentosDto = {}): Promise<ListaPaginadaDocumentos> {
    const { data } = await clienteHttp.get<ListaPaginadaDocumentos>('/documentos', {
      params: filtros,
    });
    return data;
  },

  async obtener(id: number): Promise<DocumentoDto> {
    const { data } = await clienteHttp.get<DocumentoDto>(`/documentos/${id}`);
    return data;
  },

  async registrar(
    datos: MetadatosDocumentoDto,
    archivo: File,
    opciones: OpcionesRegistroDocumento = {},
  ): Promise<DocumentoDto> {
    const { data } = await clienteHttp.post<DocumentoDto>(
      '/documentos',
      construirFormulario(datos, archivo, opciones),
    );
    return data;
  },

  async actualizar(id: number, datos: MetadatosDocumentoDto): Promise<DocumentoDto> {
    const { data } = await clienteHttp.patch<DocumentoDto>(`/documentos/${id}`, datos);
    return data;
  },

  async cambiarEstado(
    id: number,
    accion: 'publicar' | 'despublicar' | 'inactivar',
    motivo?: string,
  ): Promise<DocumentoDto> {
    const { data } = await clienteHttp.patch<DocumentoDto>(`/documentos/${id}/${accion}`, {
      ...(motivo ? { motivo } : {}),
    });
    return data;
  },

  async listarVersiones(id: number): Promise<VersionDocumentoDto[]> {
    const { data } = await clienteHttp.get<VersionDocumentoDto[]>(`/documentos/${id}/versiones`);
    return data;
  },

  async crearVersion(
    id: number,
    archivo: File,
    comentarioVersion?: string,
  ): Promise<DocumentoDto> {
    const formulario = new FormData();
    formulario.append('archivo', archivo);
    if (comentarioVersion) formulario.append('comentarioVersion', comentarioVersion);

    const { data } = await clienteHttp.post<DocumentoDto>(
      `/documentos/${id}/versiones`,
      formulario,
    );
    return data;
  },

  /** Blob del PDF para el visor embebido. `version` omitida = versión vigente. */
  async obtenerBlobVisualizacion(id: number, version?: number): Promise<Blob> {
    const { data } = await clienteHttp.get<Blob>(`/documentos/${id}/visualizar`, {
      params: version !== undefined ? { version } : {},
      responseType: 'blob',
    });
    return data;
  },

  /** Igual que el anterior, pero este sí queda registrado en la bitácora. */
  async obtenerBlobDescarga(id: number, version?: number): Promise<Blob> {
    const { data } = await clienteHttp.get<Blob>(`/documentos/${id}/descargar`, {
      params: version !== undefined ? { version } : {},
      responseType: 'blob',
    });
    return data;
  },
};

/** Estados que admiten cada transición, para habilitar o no los botones. */
export const TRANSICIONES_PERMITIDAS: Record<
  'publicar' | 'despublicar' | 'inactivar',
  EstadoDocumento[]
> = {
  publicar: ['BORRADOR'],
  despublicar: ['PUBLICADO'],
  inactivar: ['BORRADOR', 'PUBLICADO'],
};
