// src/services/portalPublico.service.ts
//
// Acceso a las seis rutas de `/publico`. Mismo patrón que el resto de los
// servicios, con una diferencia: las dos últimas no hacen ninguna petición.

import clienteHttpPublico, { URL_BASE_API_PUBLICA } from '@/lib/httpPublico';
import type {
  DocumentoPublicoDto,
  FiltrosListadoPublico,
  ListaPaginadaDocumentosPublicosDto,
  SeccionPublicaDto,
} from '@/types/portalPublico.types';

const BASE = '/publico';

/**
 * URL de navegador hacia un PDF.
 *
 * Devuelve una cadena y no una promesa a propósito: los botones "Ver" y
 * "Descargar" son un `<a href>`, no una descarga por axios. Traer un PDF
 * de hasta 40 MiB a un blob en memoria, dentro de un iframe y en un móvil,
 * es la forma más rápida de que la pestaña se quede sin memoria; y además
 * perdería la descarga progresiva y el nombre que manda el servidor en
 * `Content-Disposition`.
 *
 * `URL_BASE_API_PUBLICA` es relativa en producción, así que el resultado
 * también lo es y el navegador lo resuelve contra el origen actual.
 */
function urlDeArchivo(idDocumento: number, accion: 'visualizar' | 'descargar'): string {
  return `${URL_BASE_API_PUBLICA}${BASE}/documentos/${idDocumento}/${accion}`;
}

export const portalPublicoService = {
  /** Las cuatro secciones activas con sus subsecciones. */
  async obtenerSecciones(): Promise<SeccionPublicaDto[]> {
    const { data } = await clienteHttpPublico.get<SeccionPublicaDto[]>(`${BASE}/secciones`);
    return data;
  },

  /** Una sección concreta. 404 si el código no existe o no es una raíz activa. */
  async obtenerSeccion(codigoSeccion: string): Promise<SeccionPublicaDto> {
    const { data } = await clienteHttpPublico.get<SeccionPublicaDto>(
      `${BASE}/secciones/${encodeURIComponent(codigoSeccion)}`,
    );
    return data;
  },

  /** Documentos de una subsección. */
  async listarDocumentos(
    codigoSeccion: string,
    codigoSubseccion: string,
    filtros: FiltrosListadoPublico = {},
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const { data } = await clienteHttpPublico.get<ListaPaginadaDocumentosPublicosDto>(
      `${BASE}/secciones/${encodeURIComponent(codigoSeccion)}/${encodeURIComponent(codigoSubseccion)}/documentos`,
      { params: filtros },
    );
    return data;
  },

  /**
   * Documentos colgados DIRECTAMENTE de una sección, no de sus
   * subsecciones. El backend expone esta ruta porque el modelo permite esa
   * clasificación; sin ella, esos documentos se contarían en el árbol y no
   * habría forma de abrirlos.
   */
  async listarDocumentosDeSeccion(
    codigoSeccion: string,
    filtros: FiltrosListadoPublico = {},
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const { data } = await clienteHttpPublico.get<ListaPaginadaDocumentosPublicosDto>(
      `${BASE}/secciones/${encodeURIComponent(codigoSeccion)}/documentos`,
      { params: filtros },
    );
    return data;
  },

  /** URL para abrir el PDF en una pestaña nueva (`Content-Disposition: inline`). */
  urlVisualizar(documento: Pick<DocumentoPublicoDto, 'id'>): string {
    return urlDeArchivo(documento.id, 'visualizar');
  },

  /** URL para descargarlo (`Content-Disposition: attachment`). */
  urlDescargar(documento: Pick<DocumentoPublicoDto, 'id'>): string {
    return urlDeArchivo(documento.id, 'descargar');
  },
};

export default portalPublicoService;
