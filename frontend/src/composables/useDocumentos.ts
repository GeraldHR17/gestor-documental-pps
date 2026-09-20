// src/composables/useDocumentos.ts
//
// Mismo patrón que useUsuarios y useCatalogo: estado por instancia, sin
// Pinia. El listado sí se pagina, a diferencia de los catálogos: es la
// tabla que crece sin techo.

import { reactive, toRefs } from 'vue';
import documentosService from '@/services/documentos.service';
import type {
  DocumentoDto,
  FiltrosDocumentosDto,
  MetadatosDocumentoDto,
  OpcionesRegistroDocumento,
} from '@/types/documento.types';

interface EstadoListaDocumentos {
  documentos: DocumentoDto[];
  total: number;
  pagina: number;
  limite: number;
  cargando: boolean;
  error: string | null;
}

export function useDocumentos() {
  const estado = reactive<EstadoListaDocumentos>({
    documentos: [],
    total: 0,
    pagina: 1,
    limite: 10,
    cargando: false,
    error: null,
  });

  async function listar(filtros: FiltrosDocumentosDto = {}): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      const respuesta = await documentosService.listar(filtros);
      estado.documentos = respuesta.datos;
      estado.total = respuesta.total;
      estado.pagina = respuesta.pagina;
      estado.limite = respuesta.limite;
    } catch (error) {
      estado.error = 'No se pudo cargar el listado de documentos.';
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  async function registrar(
    datos: MetadatosDocumentoDto,
    archivo: File,
    opciones: OpcionesRegistroDocumento = {},
  ): Promise<DocumentoDto> {
    return documentosService.registrar(datos, archivo, opciones);
  }

  async function actualizar(id: number, datos: MetadatosDocumentoDto): Promise<DocumentoDto> {
    return documentosService.actualizar(id, datos);
  }

  async function cambiarEstado(
    id: number,
    accion: 'publicar' | 'despublicar' | 'inactivar',
  ): Promise<DocumentoDto> {
    const actualizado = await documentosService.cambiarEstado(id, accion);
    // Se refresca la fila en memoria en vez de recargar la página completa:
    // el cambio es de un solo documento y así la tabla no parpadea.
    const indice = estado.documentos.findIndex((documento) => documento.id === id);
    if (indice !== -1) estado.documentos[indice] = actualizado;
    return actualizado;
  }

  return { ...toRefs(estado), listar, registrar, actualizar, cambiarEstado };
}
