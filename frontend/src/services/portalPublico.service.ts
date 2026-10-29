// src/services/portalPublico.service.ts
//
// Acceso a las rutas de `/publico` que usa el portal. Mismo patrón que el
// resto de los servicios, con una diferencia: las dos últimas no hacen
// ninguna petición.
//
// Desde spec-ajustes-niveles-y-estados las páginas de sección y de
// subsección piden el nodo genérico (`/publico/categorias/:codigo`), que
// sirve a cualquier nivel. Los endpoints `/publico/secciones/...` siguen en
// el backend con el mismo contrato; aquí solo se usa el árbol de la portada.

import clienteHttpPublico, { URL_BASE_API_PUBLICA } from '@/lib/httpPublico';
import type {
  DocumentoPublicoDto,
  FiltrosListadoPublico,
  ListaPaginadaDocumentosPublicosDto,
  NodoPublicoDto,
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

  /**
   * Cualquier categoría visible, de cualquier nivel, por su código (sin
   * distinguir mayúsculas): sus hijas activas, la ruta de ancestros y los
   * conteos. 404 si no existe o no está efectivamente activa.
   */
  async obtenerNodo(codigo: string): Promise<NodoPublicoDto> {
    const { data } = await clienteHttpPublico.get<NodoPublicoDto>(
      `${BASE}/categorias/${encodeURIComponent(codigo)}`,
    );
    return data;
  },

  /** Documentos clasificados DIRECTAMENTE en ese nodo, no en sus descendientes. */
  async listarDocumentosDeNodo(
    codigo: string,
    filtros: FiltrosListadoPublico = {},
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const { data } = await clienteHttpPublico.get<ListaPaginadaDocumentosPublicosDto>(
      `${BASE}/categorias/${encodeURIComponent(codigo)}/documentos`,
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
